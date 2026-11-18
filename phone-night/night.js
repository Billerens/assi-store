// The night itself: its window, the facts gathered from every source, the template report, the
// honesty check of the model's story, repeat offenders and trends.
// Pure: no Android, no native — tested under node (tests/night.test.js). Times are ms, local time.
var parse = require('./parse');

// ---- time and words -------------------------------------------------------------------------------

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function minutesOf(hhmm) {
  var parts = String(hhmm || '00:00').split(':');
  return Number(parts[0]) * 60 + Number(parts[1] || 0);
}

function dayKey(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function parseDay(key) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!match) throw new Error('Не дата ночи: ' + key);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

exports.dayKey = function (ts) { return dayKey(new Date(ts)); };

/** The night a moment belongs to: from the day boundary (14:00) of day D to the boundary of D+1 is night D. */
exports.nightKey = function (ts, boundary) {
  var date = new Date(ts);
  if (date.getHours() * 60 + date.getMinutes() < minutesOf(boundary)) {
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  }
  return dayKey(date);
};

/** The night after this one: '2026-11-13' -> '2026-11-14'. */
exports.nextNight = function (night) {
  var date = parseDay(night);
  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
};

exports.prevNight = function (night) {
  var date = parseDay(night);
  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1));
};

/** A clock time within night D: times from the boundary on are on day D, earlier ones on D+1. */
function at(night, hhmm, boundary) {
  var date = parseDay(night);
  var minutes = minutesOf(hhmm);
  var plus = minutes < minutesOf(boundary) ? 1 : 0;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + plus, Math.floor(minutes / 60), minutes % 60).getTime();
}

exports.at = at;

exports.nominal = function (night, s) {
  return { from: at(night, s.nightStart, s.dayBoundary), to: at(night, s.nightEnd, s.dayBoundary) };
};

/** From when the live journal writes for this night. */
exports.logFrom = function (night, s) {
  return Math.min(at(night, s.screenOffAfter, s.dayBoundary), at(night, s.nightStart, s.dayBoundary));
};

/** Local midnight of the day the night is named by: '2026-11-13' -> 13 November 00:00. */
exports.dayStart = function (night) {
  return parseDay(night).getTime();
};

/** The end of night D's day: the boundary on D+1. */
exports.dayEnd = function (night, s) {
  return at(exports.nextNight(night), s.dayBoundary, s.dayBoundary);
};

/** From when an unlock may bring the report: after 05:00 and not earlier than the window's end minus 2 h. */
exports.morningFrom = function (night, s) {
  return Math.max(at(night, s.morningAfter, s.dayBoundary), at(night, s.nightEnd, s.dayBoundary) - s.notBeforeHours * 36e5);
};

exports.mayReport = function (now, night, s) {
  return now >= exports.morningFrom(night, s) && now < exports.dayEnd(night, s);
};

/** The live journal writes now (between the evening and the day boundary). */
exports.logging = function (now, s) {
  var night = exports.nightKey(now, s.dayBoundary);
  return now >= exports.logFrom(night, s) && now < exports.dayEnd(night, s);
};

exports.hhmm = function (ts) {
  var date = new Date(ts);
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
};

/** 7 ч 10 мин, 45 мин, меньше минуты. */
exports.duration = function (ms) {
  var total = Math.round(Math.max(0, ms) / 60000);
  if (total < 1) return 'меньше минуты';
  var hours = Math.floor(total / 60);
  var minutes = total % 60;
  if (!hours) return minutes + ' мин';
  return minutes ? hours + ' ч ' + minutes + ' мин' : hours + ' ч';
};

var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** 'Ночь с 13 на 14 ноября', 'Ночь с 31 октября на 1 ноября'. */
exports.nightTitle = function (night) {
  var first = parseDay(night);
  var second = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 1);
  if (first.getMonth() === second.getMonth()) {
    return 'Ночь с ' + first.getDate() + ' на ' + second.getDate() + ' ' + MONTHS[second.getMonth()];
  }
  return 'Ночь с ' + first.getDate() + ' ' + MONTHS[first.getMonth()] + ' на ' + second.getDate() + ' ' + MONTHS[second.getMonth()];
};

/** plural(5, 'раз', 'раза', 'раз') -> 'раз'. */
function plural(n, one, few, many) {
  var a = Math.abs(Math.round(n)) % 100;
  var b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

exports.plural = plural;

/** Megabytes as said: 3,4 under ten, whole above. */
function mbText(mb) {
  if (mb < 10) return String(Math.round(mb * 10) / 10).replace('.', ',');
  return String(Math.round(mb));
}

exports.mbText = mbText;

function roundMb(bytes) {
  var mb = bytes / 1048576;
  return mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb);
}

function quote(name) {
  return '«' + name + '»';
}

// ---- events -------------------------------------------------------------------------------------

var MERGED = { screen_on: 1, screen_off: 1, unlock: 1, shutdown: 1, startup: 1 };

/**
 * Events of several sources in one time line. The same screen switch seen by the live journal,
 * the usage statistics and the battery history is one event when they are closer than mergeMs.
 */
exports.mergeEvents = function (lists, mergeMs) {
  var all = [];
  lists.forEach(function (list) {
    (list || []).forEach(function (event) {
      if (event && typeof event.at === 'number' && event.kind) all.push(event);
    });
  });
  all.sort(function (a, b) { return a.at - b.at; });
  var last = {};
  var out = [];
  all.forEach(function (event) {
    if (MERGED[event.kind]) {
      var previous = last[event.kind];
      if (previous !== undefined && event.at - previous <= mergeMs) return;
      last[event.kind] = event.at;
    }
    out.push(event);
  });
  return out;
};

/**
 * The night's window. By the screen: the longest dark stretch after 22:00, joined with the dark
 * stretches before it while the lit gaps between them are short (a wake-up at 02:40 is still the
 * night, an evening with the phone is not); the end is the first unlock after 05:00.
 * Otherwise — or when the screen says nothing — the nominal 23:00–07:00.
 * `end` is the moment the data ends (the morning snapshot). -> { from, to, how, note }
 */
exports.detectWindow = function (events, night, s, end) {
  var nominal = exports.nominal(night, s);
  var limit = end || nominal.to;
  var out = { from: nominal.from, to: Math.min(nominal.to, limit), how: 'nominal', note: '' };
  if (!s.byScreen) return out;
  var start = at(night, s.screenOffAfter, s.dayBoundary);
  var morning = at(night, s.morningAfter, s.dayBoundary);
  var screen = (events || []).filter(function (event) {
    return (event.kind === 'screen_on' || event.kind === 'screen_off' || event.kind === 'unlock') && event.at <= limit;
  });
  if (!screen.length) {
    out.note = 'нет событий экрана — окно по настройке';
    return out;
  }
  var stop = limit;
  for (var i = 0; i < screen.length; i++) {
    if (screen[i].kind === 'unlock' && screen[i].at >= morning && screen[i].at >= start) { stop = screen[i].at; break; }
  }
  // Dark stretches: from a screen-off to the next screen-on.
  var darks = [];
  var dark = null;
  var before = screen.filter(function (event) { return event.at < start && event.kind !== 'unlock'; });
  if (before.length && before[before.length - 1].kind === 'screen_off') dark = start;
  screen.forEach(function (event) {
    if (event.at < start || event.at > stop) return;
    if (event.kind === 'screen_off' && dark === null) dark = event.at;
    if ((event.kind === 'screen_on' || event.kind === 'unlock') && dark !== null) {
      if (event.at > dark) darks.push({ from: dark, to: event.at });
      dark = null;
    }
  });
  if (dark !== null && stop > dark) darks.push({ from: dark, to: stop });
  var minDark = s.darkMinutes * 60000;
  var longest = -1;
  darks.forEach(function (stretch, index) {
    var length = stretch.to - stretch.from;
    if (length >= minDark && (longest < 0 || length > darks[longest].to - darks[longest].from)) longest = index;
  });
  if (longest < 0) {
    out.note = 'экран не был тёмным ' + s.darkMinutes + ' мин подряд — окно по настройке';
    return out;
  }
  var first = longest;
  var maxGap = s.wakeMaxMinutes * 60000;
  while (first > 0 && darks[first].from - darks[first - 1].to < maxGap) first--;
  return { from: darks[first].from, to: stop, how: 'screen', note: '' };
};

/**
 * The owner's own sessions: from an unlock to the screen going off, with the apps in front.
 * -> [{ from, to, ms, minutes, pkg, apps: [{ pkg, ms }] }]
 */
exports.ownerSessions = function (events, window, launchers) {
  var skip = {};
  (launchers || []).forEach(function (pkg) { skip[pkg] = true; });
  var sessions = [];
  var current = null;
  var front = null;
  function closeFront(time) {
    if (front && current) current.apps[front.pkg] = (current.apps[front.pkg] || 0) + Math.max(0, time - front.since);
    front = null;
  }
  function finish(time) {
    closeFront(time);
    current.to = time;
    var apps = Object.keys(current.apps).map(function (pkg) { return { pkg: pkg, ms: current.apps[pkg] }; })
      .sort(function (a, b) { return b.ms - a.ms; });
    var main = apps.filter(function (app) { return !skip[app.pkg]; })[0];
    sessions.push({
      from: current.from, to: time, ms: time - current.from, minutes: Math.round((time - current.from) / 60000),
      pkg: main ? main.pkg : null, apps: apps
    });
    current = null;
  }
  (events || []).forEach(function (event) {
    if (event.at < window.from || event.at >= window.to) return;
    if (event.kind === 'unlock') {
      if (!current) current = { from: event.at, apps: {} };
    } else if (event.kind === 'screen_off') {
      if (current) finish(event.at);
      front = null;
    } else if (event.kind === 'resumed') {
      if (current) {
        closeFront(event.at);
        front = { pkg: event.package, since: event.at };
      }
    } else if (event.kind === 'paused') {
      if (front && front.pkg === event.package) closeFront(event.at);
    }
  });
  if (current) finish(window.to);
  return sessions;
};

/** Minutes of foreground services per package: [{ pkg, ms, starts }]. */
exports.foregroundServices = function (events, window) {
  var open = {};
  var total = {};
  (events || []).forEach(function (event) {
    if (event.kind !== 'fg_start' && event.kind !== 'fg_stop') return;
    var pkg = event.package;
    total[pkg] = total[pkg] || { pkg: pkg, ms: 0, starts: 0 };
    if (event.kind === 'fg_start') {
      if (open[pkg] === undefined) open[pkg] = event.at;
      if (event.at >= window.from && event.at < window.to) total[pkg].starts++;
    } else {
      var since = open[pkg] === undefined ? window.from : open[pkg];
      var a = Math.max(since, window.from);
      var b = Math.min(event.at, window.to);
      if (b > a) total[pkg].ms += b - a;
      delete open[pkg];
    }
  });
  Object.keys(open).forEach(function (pkg) {
    var a = Math.max(open[pkg], window.from);
    if (window.to > a) total[pkg].ms += window.to - a;
  });
  return Object.keys(total).map(function (pkg) { return total[pkg]; })
    .filter(function (row) { return row.ms > 0 || row.starts > 0; })
    .sort(function (a, b) { return b.ms - a.ms; });
};

/** Which app a uid is: the apps map from the engine, else the system / tethering / removed groups. */
function appOfUid(uid, apps) {
  var known = apps && apps.byUid ? apps.byUid[uid] : null;
  var app = uid % 100000;
  if (uid === -5) return { key: 'tethering', app: 'Раздача интернета', pkg: null };
  if (uid === -4) return { key: 'removed', app: 'Удалённые приложения', pkg: null };
  if (uid < 0 || app < 10000) return { key: 'system', app: 'Система', pkg: null };
  if (app >= 99000) return { key: 'isolated', app: 'Изолированные процессы', pkg: null };
  if (known && known.pkg) return { key: known.pkg, app: known.app || known.pkg, pkg: known.pkg };
  return { key: 'uid' + uid, app: 'uid ' + uid, pkg: null };
}

exports.appOfUid = appOfUid;

function appOfPkg(pkg, uid, apps) {
  if (pkg === 'android' || (uid !== null && uid !== undefined && uid >= 0 && uid % 100000 < 10000)) {
    return { key: 'system', app: 'Система', pkg: null };
  }
  var label = apps && apps.byPkg && apps.byPkg[pkg];
  return { key: pkg, app: label || pkg, pkg: pkg };
}

exports.appOfPkg = appOfPkg;

/** Rows grouped by app key, numbers summed. */
function group(rows, fields) {
  var by = {};
  var order = [];
  rows.forEach(function (row) {
    var key = row.key;
    if (!by[key]) {
      by[key] = { key: key, app: row.app, pkg: row.pkg };
      fields.forEach(function (field) { by[key][field] = 0; });
      order.push(key);
    }
    fields.forEach(function (field) { by[key][field] += row[field] || 0; });
  });
  return order.map(function (key) { return by[key]; });
}

// The top of the wakers: the system's own row (it is told apart, not ranked) and the first n apps.
function topWakers(rows, n) {
  var apps = 0;
  return rows.filter(function (row) {
    if (row.wakeups <= 0) return false;
    if (row.key === 'system') return true;
    apps++;
    return apps <= n;
  });
}

function levelAt(history, time) {
  if (!history || !history.ok) return null;
  var level = history.levelAtFrom;
  (history.points || []).forEach(function (point) { if (point.at <= time) level = point.level; });
  return level;
}

// ---- the facts ------------------------------------------------------------------------------------

/**
 * Everything the report may say, from what the engine gathered:
 * input = { night, now, events (merged), live: { ok, note, gaps }, usage: { ok, note },
 *   evening, morning (snapshots: { at, uptime, battery, charging, temp, alarm, checkin, extra }),
 *   history (parsed), alarmDiff, checkinDiff, traffic: { ok, note, rows: { uid: { wifi, mobile } } },
 *   jobs (parsed), deviceIdle (parsed), boot: { reason, autoRestart }, apps: { byPkg, byUid }, sources }
 */
exports.buildFacts = function (input, s) {
  var hidden = {};
  (s.hidden || []).forEach(function (pkg) { hidden[pkg] = true; });
  var visible = function (row) { return !row.pkg || !hidden[row.pkg]; };
  var top = s.topCount;
  var events = (input.events || []).filter(function (event) { return !event.package || !hidden[event.package]; });
  var window = exports.detectWindow(events, input.night, s, input.morning ? input.morning.at : input.now);
  var inside = function (time) { return time >= window.from && time < window.to; };
  var apps = input.apps || { byPkg: {}, byUid: {} };
  var history = input.history && input.history.ok ? input.history : null;
  var facts = {
    version: 1,
    night: input.night,
    title: exports.nightTitle(input.night),
    window: { from: window.from, to: window.to, how: window.how, note: window.note, minutes: Math.round((window.to - window.from) / 60000) },
    sources: input.sources || []
  };

  // Battery: the history's levels at the window's edges, otherwise the snapshots.
  var evening = input.evening || null;
  var morning = input.morning || null;
  var battery = null;
  var hStart = levelAt(history, window.from);
  var hEnd = levelAt(history, window.to);
  if (hStart !== null && hEnd !== null) {
    battery = { start: hStart, end: hEnd, source: 'history', from: window.from, to: window.to };
  } else if (evening && morning && evening.battery !== null && evening.battery !== undefined && morning.battery !== null && morning.battery !== undefined) {
    battery = { start: evening.battery, end: morning.battery, source: 'battery', from: evening.at, to: morning.at };
  }
  if (battery) {
    battery.drop = battery.start - battery.end;
    var plugged = [];
    if (history) {
      (history.plugged || []).forEach(function (part) {
        var a = Math.max(part.from, window.from);
        var b = Math.min(part.to, window.to);
        if (b > a) plugged.push({ from: a, to: b });
      });
    } else {
      var on = evening && evening.charging ? window.from : null;
      events.forEach(function (event) {
        if (event.kind !== 'power' || !inside(event.at)) return;
        var charging = event.extra && event.extra.charging;
        if (charging && on === null) on = event.at;
        if (!charging && on !== null) { plugged.push({ from: on, to: event.at }); on = null; }
      });
      if (on !== null) plugged.push({ from: on, to: window.to });
    }
    var full = null;
    if (history) {
      (history.points || []).some(function (point) {
        if (point.level < 100 || !inside(point.at)) return false;
        var during = plugged.some(function (part) { return point.at >= part.from && point.at <= part.to; });
        if (during) full = point.at;
        return during;
      });
    }
    var pluggedMs = plugged.reduce(function (sum, part) { return sum + part.to - part.from; }, 0);
    battery.charging = {
      evening: evening ? Boolean(evening.charging) : null,
      morning: morning ? Boolean(morning.charging) : null,
      parts: plugged,
      whole: plugged.length > 0 && pluggedMs >= (window.to - window.from) - 60000,
      any: plugged.length > 0,
      fullAt: full
    };
    battery.temp = { start: evening ? evening.temp : null, end: morning ? morning.temp : null };
  }
  facts.battery = battery;
  facts.batteryPoints = [];
  if (battery && battery.source === 'history') {
    facts.batteryPoints.push({ at: window.from, level: hStart });
    (history.points || []).forEach(function (point) { if (point.at > window.from && point.at < window.to) facts.batteryPoints.push(point); });
    facts.batteryPoints.push({ at: window.to, level: hEnd });
  }

  // Screen and unlocks.
  var screens = events.filter(function (event) { return event.kind === 'screen_on' && inside(event.at); });
  var unlocks = events.filter(function (event) { return event.kind === 'unlock' && inside(event.at); });
  facts.screen = { on: screens.length, unlocks: unlocks.length };

  // The owner's sessions.
  var sessions = exports.ownerSessions(events, window, s.launchers).map(function (session) {
    var named = session.pkg ? appOfPkg(session.pkg, null, apps) : null;
    return {
      from: session.from, to: session.to, ms: session.ms, minutes: session.minutes,
      app: named ? named.app : null, pkg: session.pkg,
      apps: session.apps.filter(function (row) { return !hidden[row.pkg]; }).slice(0, top).map(function (row) {
        return { app: appOfPkg(row.pkg, null, apps).app, pkg: row.pkg, minutes: Math.round(row.ms / 60000) };
      })
    };
  });
  facts.owner = {
    sessions: sessions,
    count: sessions.length,
    minutes: sessions.reduce(function (sum, session) { return sum + session.minutes; }, 0)
  };

  // Reboots: Axiko's own journal (kind 'reboot', written at the first start after a boot), the usage
  // journal, the battery history, the uptime of the snapshots.
  var signs = [];
  events.forEach(function (event) {
    if ((event.kind === 'shutdown' || event.kind === 'startup') && inside(event.at)) signs.push({ at: event.at, kind: event.kind });
    if (event.kind === 'reboot' && inside(event.at)) signs.push({ at: event.at, kind: 'startup' });
  });
  if (history) {
    (history.boots || []).forEach(function (boot) {
      if (inside(boot.at)) signs.push({ at: boot.at, kind: boot.kind === 'shutdown' ? 'shutdown' : 'startup' });
    });
  }
  if (evening && morning && morning.uptime !== null && morning.uptime !== undefined && morning.at - morning.uptime > evening.at) {
    var boot = morning.at - morning.uptime;
    if (boot >= window.from - 36e5 && boot <= window.to) signs.push({ at: boot, kind: 'startup', uptime: true });
  }
  signs.sort(function (a, b) { return a.at - b.at; });
  var reboots = [];
  signs.forEach(function (sign) {
    var last = reboots[reboots.length - 1];
    if (last && sign.at - last.last <= s.rebootMergeMinutes * 60000) {
      last.last = sign.at;
      if (sign.kind === 'shutdown') last.clean = true;
      if (sign.kind === 'startup' && !sign.uptime) last.startAt = sign.at;
      return;
    }
    reboots.push({ at: sign.at, last: sign.at, clean: sign.kind === 'shutdown', startAt: sign.kind === 'startup' ? sign.at : null });
  });
  var bootInfo = input.boot || {};
  facts.reboots = reboots.map(function (reboot, index) {
    var latest = index === reboots.length - 1;
    var reason = latest ? bootInfo.reason || null : null;
    var auto = bootInfo.autoRestart || null;
    return {
      at: reboot.at, clean: reboot.clean, reason: reason,
      kind: parse.classifyBoot(reason, reboot.clean, auto && auto.on),
      autoRestart: auto ? auto.on : null
    };
  });

  // Who woke the phone: dumpsys alarm evening–morning, otherwise the history's alarm events.
  var diff = input.alarmDiff;
  if (diff && diff.ok) {
    var rows = diff.packages.map(function (row) {
      var named = appOfPkg(row.pkg, row.uid, apps);
      return { key: named.key, app: named.app, pkg: named.pkg, wakeups: row.wakeups, alarms: row.alarms };
    }).filter(visible);
    var grouped = group(rows, ['wakeups', 'alarms']).sort(function (a, b) { return b.wakeups - a.wakeups || b.alarms - a.alarms; });
    facts.wakers = {
      ok: true, source: 'alarm', note: diff.note || '', from: evening ? evening.at : null, to: morning ? morning.at : null,
      total: grouped.reduce(function (sum, row) { return sum + row.wakeups; }, 0),
      top: topWakers(grouped, top),
      list: grouped.filter(function (row) { return row.wakeups > 0; }).slice(0, 50)
    };
  } else if (history && history.alarms && history.alarms.length) {
    var counted = {};
    history.alarms.forEach(function (alarm) {
      if (!inside(alarm.at)) return;
      counted[alarm.uid] = (counted[alarm.uid] || 0) + 1;
    });
    var fromHistory = group(Object.keys(counted).map(function (uid) {
      var named = appOfUid(Number(uid), apps);
      return { key: named.key, app: named.app, pkg: named.pkg, wakeups: counted[uid], alarms: counted[uid] };
    }).filter(visible), ['wakeups', 'alarms']).sort(function (a, b) { return b.wakeups - a.wakeups; });
    facts.wakers = {
      ok: true, source: 'history', note: 'по будильникам в ленте батареи' + (diff && diff.note ? '; ' + diff.note : ''),
      from: window.from, to: window.to,
      total: fromHistory.reduce(function (sum, row) { return sum + row.wakeups; }, 0),
      top: topWakers(fromHistory, top), list: fromHistory.slice(0, 50)
    };
  } else {
    facts.wakers = { ok: false, source: 'alarm', note: diff && diff.note ? diff.note : 'нет данных о будильниках', top: [], list: [], total: 0 };
  }

  // Traffic by uid.
  var traffic = input.traffic;
  if (traffic && traffic.ok) {
    var trafficRows = Object.keys(traffic.rows || {}).map(function (uid) {
      var named = appOfUid(Number(uid), apps);
      var row = traffic.rows[uid];
      return { key: named.key, app: named.app, pkg: named.pkg, wifi: row.wifi || 0, mobile: row.mobile || 0, bytes: (row.wifi || 0) + (row.mobile || 0) };
    }).filter(visible);
    var byApp = group(trafficRows, ['wifi', 'mobile', 'bytes']).sort(function (a, b) { return b.bytes - a.bytes; })
      .filter(function (row) { return row.bytes > 0; })
      .map(function (row) { return { app: row.app, pkg: row.pkg, mb: roundMb(row.bytes), wifiMb: roundMb(row.wifi), mobileMb: roundMb(row.mobile) }; });
    var bytes = trafficRows.reduce(function (sum, row) { return sum + row.bytes; }, 0);
    facts.traffic = { ok: true, note: traffic.note || '', top: byApp.slice(0, top), totalMb: roundMb(bytes) };
  } else {
    facts.traffic = { ok: false, note: traffic && traffic.note ? traffic.note : 'нет данных о трафике', top: [], totalMb: null };
  }

  // Who held the processor: partial wake locks from batterystats --checkin, evening–morning.
  var checkin = input.checkinDiff;
  if (checkin && checkin.ok) {
    var cpuRows = group(checkin.uids.map(function (row) {
      var named = appOfUid(row.uid, apps);
      return { key: named.key, app: named.app, pkg: named.pkg, wlMs: row.wlMs, cpuMs: row.cpuMs, mah: row.mah, wua: row.wua };
    }).filter(visible), ['wlMs', 'cpuMs', 'mah', 'wua']);
    facts.cpu = {
      ok: true, note: '', from: evening ? evening.at : null, to: morning ? morning.at : null,
      top: cpuRows.filter(function (row) { return row.wlMs >= 60000; }).sort(function (a, b) { return b.wlMs - a.wlMs; }).slice(0, top)
        .map(function (row) { return { app: row.app, pkg: row.pkg, minutes: Math.round(row.wlMs / 60000), cpuMinutes: Math.round(row.cpuMs / 60000) }; }),
      power: cpuRows.filter(function (row) { return row.mah >= 0.5; }).sort(function (a, b) { return b.mah - a.mah; }).slice(0, top)
        .map(function (row) { return { app: row.app, pkg: row.pkg, mah: Math.round(row.mah) }; })
    };
  } else {
    facts.cpu = { ok: false, note: checkin && checkin.note ? checkin.note : 'нет данных batterystats', top: [], power: [] };
  }

  // Notifications: the live journal; the usage journal when the live one has none.
  var liveNotes = events.filter(function (event) { return event.kind === 'notification' && event.src !== 'usage' && inside(event.at); });
  var usageNotes = events.filter(function (event) { return event.kind === 'notification' && event.src === 'usage' && inside(event.at); });
  var notes = liveNotes.length ? liveNotes : usageNotes;
  var noteSource = liveNotes.length ? 'live' : usageNotes.length ? 'usage' : null;
  var byPkg = {};
  notes.forEach(function (event) {
    var row = byPkg[event.package] = byPkg[event.package] || { pkg: event.package, count: 0, first: event.at, last: event.at };
    row.count++;
    row.last = event.at;
  });
  var noteRows = Object.keys(byPkg).map(function (pkg) {
    var row = byPkg[pkg];
    return { app: appOfPkg(pkg, null, apps).app, pkg: pkg, count: row.count, first: row.first, last: row.last };
  }).sort(function (a, b) { return b.count - a.count; });
  var liveOk = input.live ? input.live.ok : true;
  facts.notifications = {
    ok: Boolean(noteSource) || liveOk, source: noteSource || 'live',
    note: noteSource === 'usage' ? 'по статистике Android: журнал Axiko уведомлений не видел' : (input.live && input.live.note) || '',
    total: notes.length, top: noteRows.slice(0, top)
  };

  // Background jobs: dumpsys jobscheduler, otherwise the history's job starts.
  var jobs = input.jobs;
  var jobRows = [];
  var jobSource = null;
  if (jobs && jobs.ok) {
    jobSource = 'jobscheduler';
    jobs.jobs.forEach(function (job) {
      if (!inside(job.at)) return;
      var named = job.pkg ? appOfPkg(job.pkg, job.uid, apps) : appOfUid(job.uid, apps);
      jobRows.push({ key: named.key, app: named.app, pkg: named.pkg, count: 1 });
    });
  } else if (history && history.jobs && Object.keys(history.jobs).length) {
    jobSource = 'history';
    Object.keys(history.jobs).forEach(function (uid) {
      var named = appOfUid(Number(uid), apps);
      jobRows.push({ key: named.key, app: named.app, pkg: named.pkg, count: history.jobs[uid] });
    });
  }
  var jobGroups = group(jobRows.filter(visible), ['count']).sort(function (a, b) { return b.count - a.count; });
  facts.jobs = jobSource ? {
    ok: true, source: jobSource,
    note: jobSource === 'jobscheduler' ? 'dumpsys помнит только последние задания — ночью их могло быть больше' : 'по ленте батареи',
    total: jobGroups.reduce(function (sum, row) { return sum + row.count; }, 0), top: jobGroups.slice(0, top)
  } : { ok: false, note: jobs && jobs.note ? jobs.note : 'нет данных о фоновых заданиях', total: 0, top: [] };

  // Doze from the history.
  if (history) {
    var segments = (history.doze || []).map(function (part) {
      return { from: Math.max(part.from, window.from), to: Math.min(part.to, window.to), mode: part.mode };
    }).filter(function (part) { return part.to > part.from; });
    var deep = segments.filter(function (part) { return part.mode === 'full'; });
    var light = segments.filter(function (part) { return part.mode === 'light'; });
    var sum = function (list) { return list.reduce(function (total, part) { return total + part.to - part.from; }, 0); };
    facts.doze = {
      ok: true, note: '', segments: segments,
      fullMinutes: Math.round(sum(deep) / 60000), lightMinutes: Math.round(sum(light) / 60000),
      first: deep.length ? deep[0].from : null, last: deep.length ? deep[deep.length - 1].to : null
    };
    var reasons = {};
    Object.keys(history.wakeReasons || {}).forEach(function (reason) { reasons[reason] = history.wakeReasons[reason]; });
    facts.wakeReasons = {
      ok: true, total: history.wakeups || 0,
      top: Object.keys(reasons).map(function (reason) { return { reason: reason, count: reasons[reason] }; })
        .sort(function (a, b) { return b.count - a.count; }).slice(0, top)
    };
  } else {
    var why = input.historyNote || 'нет ленты батареи';
    facts.doze = { ok: false, note: why, segments: [], fullMinutes: null, lightMinutes: null, first: null, last: null };
    facts.wakeReasons = { ok: false, note: why, total: null, top: [] };
  }

  // Exempt from Doze.
  var idle = input.deviceIdle;
  facts.exempt = idle && idle.ok ? {
    ok: true, state: idle.state,
    apps: idle.user.filter(function (pkg) { return !hidden[pkg]; }).map(function (pkg) { return { app: appOfPkg(pkg, null, apps).app, pkg: pkg }; })
  } : { ok: false, note: idle && idle.note ? idle.note : 'нет данных deviceidle', apps: [] };

  // Foreground services and the network.
  facts.foreground = exports.foregroundServices(events, window).filter(function (row) { return !hidden[row.pkg]; }).slice(0, top)
    .map(function (row) { return { app: appOfPkg(row.pkg, null, apps).app, pkg: row.pkg, minutes: Math.round(row.ms / 60000), starts: row.starts }; })
    .filter(function (row) { return row.minutes > 0 || row.starts > 0; });
  var offline = events.filter(function (event) { return event.kind === 'network' && inside(event.at) && event.extra && event.extra.online === false; });
  facts.network = { offline: offline.length };

  // Gaps of the live journal (Axiko was restarted during the night).
  facts.gaps = events.filter(function (event) { return event.kind === 'axiko_start' && inside(event.at); }).map(function (event) { return event.at; });

  // What the neighbours recorded (each part is null when there is nothing to tell).
  var linked = exports.linkFacts(input.links || null, window, events, input.night, s);
  facts.asleep = linked.asleep;
  facts.play = linked.play;
  facts.purchases = linked.purchases;
  facts.quiet = linked.quiet;
  facts.dayFocus = linked.dayFocus;

  facts.marks = exports.marks(events, history, facts, apps, s);
  return facts;
};

// ---- the neighbours ---------------------------------------------------------------------------------

var MONEY = { RUB: '₽', RUR: '₽', USD: '$', EUR: '€' };

/** The currency as said: RUB -> ₽; an unknown code stays as it is. */
function moneyUnit(unit) {
  var code = String(unit || '').toUpperCase();
  return MONEY[code] || (unit ? String(unit) : '');
}

exports.moneyUnit = moneyUnit;

function overlapMs(a, b, from, to) {
  return Math.max(0, Math.min(b, to) - Math.max(a, from));
}

/**
 * The night as other modules saw it, from what main.js read (records of lib/base.js and the
 * focus sessions): links = {
 *   stories: base records `story` (Сериал на ночь: data.asleep, at — when the owner fell asleep),
 *   plays: base records `play` (Игротека: at — the end, amount — minutes),
 *   purchases: base records `expense` (Траты and anyone else: at, amount, unit, title),
 *   focus: [{ at, from, to, minutes, attempts, dnd }] (Фокус: dnd — «не беспокоить» was on, null — unknown) }.
 * Every part is optional. -> { asleep, play, purchases, quiet, dayFocus } — null where nothing.
 */
exports.linkFacts = function (links, window, events, night, s) {
  var out = { asleep: null, play: null, purchases: null, quiet: null, dayFocus: null };
  if (!links) return out;
  var minMs = Math.max(1, s.linkMinMinutes || 1) * 60000;
  var inside = function (time) { return time >= window.from && time < window.to; };

  // Fell asleep under a story: the last such record from the evening to the window's end.
  var asleepFrom = Math.min(exports.logFrom(night, s), window.from);
  (links.stories || []).forEach(function (record) {
    if (!record || !record.data || record.data.asleep !== true || typeof record.at !== 'number') return;
    if (record.at < asleepFrom || record.at >= window.to) return;
    if (!out.asleep || record.at > out.asleep.at) {
      out.asleep = { at: record.at, title: record.title || 'Сериал на ночь', minutes: Math.round(Number(record.amount) || 0), source: record.source || null };
    }
  });

  // Games: the part of each session inside the window.
  var games = {};
  var order = [];
  (links.plays || []).forEach(function (record) {
    var minutes = Number(record && record.amount);
    if (!record || typeof record.at !== 'number' || !(minutes > 0)) return;
    var ms = overlapMs(record.at - minutes * 60000, record.at, window.from, window.to);
    if (ms <= 0) return;
    var name = record.title || (record.data && record.data.game) || 'игра';
    if (!games[name]) {
      games[name] = { game: name, ms: 0, sessions: 0 };
      order.push(name);
    }
    games[name].ms += ms;
    games[name].sessions++;
  });
  var played = order.map(function (name) { return games[name]; }).filter(function (row) { return row.ms >= minMs; })
    .map(function (row) { return { game: row.game, minutes: Math.round(row.ms / 60000), sessions: row.sessions }; })
    .sort(function (a, b) { return b.minutes - a.minutes; });
  if (played.length) {
    out.play = {
      minutes: played.reduce(function (sum, row) { return sum + row.minutes; }, 0),
      sessions: played.reduce(function (sum, row) { return sum + row.sessions; }, 0),
      games: played.slice(0, s.topCount)
    };
  }

  // Purchases inside the window; refunds (negative amounts) are not purchases.
  var buys = (links.purchases || []).filter(function (record) {
    return record && typeof record.at === 'number' && inside(record.at) && Number(record.amount) > 0;
  }).sort(function (a, b) { return a.at - b.at; });
  if (buys.length) {
    var totals = {};
    var units = [];
    buys.forEach(function (record) {
      var unit = record.unit || '';
      if (totals[unit] === undefined) {
        totals[unit] = 0;
        units.push(unit);
      }
      totals[unit] += Number(record.amount);
    });
    var top = buys.slice().sort(function (a, b) { return Number(b.amount) - Number(a.amount); })[0];
    out.purchases = {
      count: buys.length,
      totals: units.map(function (unit) { return { unit: unit, amount: Math.round(totals[unit]) }; }).sort(function (a, b) { return b.amount - a.amount; }),
      top: { merchant: top.title || 'покупка', amount: Math.round(Number(top.amount)), unit: top.unit || '', at: top.at },
      first: buys[0].at, last: buys[buys.length - 1].at
    };
  }

  // Focus with «do not disturb» during the night: how long, and what came meanwhile (the journal).
  var parts = [];
  (links.focus || []).forEach(function (session) {
    if (!session || session.dnd !== true || typeof session.from !== 'number' || typeof session.to !== 'number') return;
    var a = Math.max(session.from, window.from);
    var b = Math.min(session.to, window.to);
    if (b - a >= minMs) parts.push({ from: a, to: b });
  });
  if (parts.length) {
    var quietMs = parts.reduce(function (sum, part) { return sum + part.to - part.from; }, 0);
    var hidden = (events || []).filter(function (event) {
      return event.kind === 'notification' && event.src !== 'usage' && parts.some(function (part) { return event.at >= part.from && event.at < part.to; });
    }).length;
    out.quiet = { minutes: Math.round(quietMs / 60000), hidden: hidden, parts: parts };
  }

  // The day before the night: focus sessions and the attempts to open what distracts.
  var dayFrom = parseDay(night).getTime();
  var day = (links.focus || []).filter(function (session) {
    return session && typeof session.at === 'number' && session.at >= dayFrom && session.at < window.from;
  });
  if (day.length) {
    out.dayFocus = {
      sessions: day.length,
      minutes: day.reduce(function (sum, session) { return sum + Math.round(Number(session.minutes) || 0); }, 0),
      attempts: day.reduce(function (sum, session) { return sum + (Number(session.attempts) || 0); }, 0)
    };
  }
  return out;
};

var BOOT_WORDS = {
  failure: 'сбой', update: 'обновление системы', manual: 'перезагрузка вручную',
  planned: 'похоже на автоперезагрузку Samsung', clean: 'штатное выключение и включение', unknown: 'причина неизвестна'
};

exports.bootWord = function (kind) { return BOOT_WORDS[kind] || BOOT_WORDS.unknown; };

/** Marks of the time line: screen, unlocks, notifications, app alarms, reboots (capped). */
exports.marks = function (events, history, facts, apps, s) {
  var window = facts.window;
  var inside = function (time) { return time >= window.from && time < window.to; };
  var out = [];
  events.forEach(function (event) {
    if (!inside(event.at)) return;
    if (event.kind === 'screen_on') out.push({ at: event.at, kind: 'screen_on', label: 'экран включился' });
    else if (event.kind === 'unlock') out.push({ at: event.at, kind: 'unlock', label: 'разблокировка' });
    else if (event.kind === 'notification' && event.src !== 'usage') {
      out.push({ at: event.at, kind: 'notification', label: 'уведомление ' + quote(appOfPkg(event.package, null, apps).app) });
    }
  });
  if (history) {
    (history.alarms || []).forEach(function (alarm) {
      if (!inside(alarm.at)) return;
      var named = appOfUid(alarm.uid, apps);
      if (named.pkg && (s.hidden || []).indexOf(named.pkg) >= 0) return;
      out.push({ at: alarm.at, kind: 'alarm', label: 'будильник ' + quote(named.app) });
    });
  }
  facts.reboots.forEach(function (reboot) {
    out.push({ at: reboot.at, kind: 'reboot', label: 'перезагрузка — ' + exports.bootWord(reboot.kind) });
  });
  var rank = { reboot: 0, unlock: 1, screen_on: 2, notification: 3, alarm: 4 };
  if (out.length > s.timelineMarks) {
    out.sort(function (a, b) { return rank[a.kind] - rank[b.kind] || a.at - b.at; });
    out = out.slice(0, s.timelineMarks);
  }
  out.sort(function (a, b) { return a.at - b.at; });
  return out;
};

// ---- the template report --------------------------------------------------------------------------

/**
 * The report without a model: true sentences straight from the facts.
 * -> { headline, lines: [{ key, text, source }], tip }
 */
exports.templateReport = function (facts, s) {
  var hhmm = exports.hhmm;
  var lines = [];
  var add = function (key, text, source) { lines.push({ key: key, text: text, source: source }); };
  var b = facts.battery;
  if (b) {
    var c = b.charging || {};
    var length = exports.duration(b.to - b.from);
    if (c.whole) {
      add('battery', 'Всю ночь на зарядке: ' + b.start + '% → ' + b.end + '%' + (c.fullAt ? ', полный к ' + hhmm(c.fullAt) : '') + '.', b.source);
    } else if (c.any) {
      var parts = c.parts.map(function (part) { return hhmm(part.from) + '–' + hhmm(part.to); }).join(', ');
      add('battery', 'Батарея: ' + b.start + '% → ' + b.end + '% за ' + length + '; на зарядке ' + parts +
        (c.fullAt ? ', полный к ' + hhmm(c.fullAt) : '') + '.', b.source);
    } else {
      add('battery', 'Батарея: ' + b.start + '% → ' + b.end + '% за ' + length + '.', b.source);
    }
  } else {
    add('battery', 'Батарея: нет данных — не было вечернего или утреннего снимка.', 'battery');
  }
  facts.reboots.forEach(function (reboot) {
    add('reboot', 'Перезагрузка в ' + hhmm(reboot.at) + ' — ' + exports.bootWord(reboot.kind) +
      (reboot.reason ? ' (причина загрузки: ' + reboot.reason + ')' : '') + '.', 'boot');
  });
  var w = facts.wakers;
  if (w.ok && w.top.length) {
    // Apps first: the system's own alarms are told apart, they are not a «sleepless app».
    var system = w.top.filter(function (row) { return row.key === 'system'; })[0];
    var wakerApps = w.top.filter(function (row) { return row.key !== 'system'; });
    var times = function (n) { return n + ' ' + plural(n, 'пробуждение', 'пробуждения', 'пробуждений'); };
    if (wakerApps.length) {
      var first = wakerApps[0];
      add('wakers', 'Будил чаще всех: ' + quote(first.app) + ' — ' + times(first.wakeups) + ' будильниками' +
        (wakerApps.length > 1 ? '; следом ' + wakerApps.slice(1).map(function (row) { return quote(row.app) + ' (' + row.wakeups + ')'; }).join(', ') : '') +
        (system ? '; сама система — ' + system.wakeups : '') + '.', w.source);
    } else if (system) {
      add('wakers', 'Будила только сама система: ' + times(system.wakeups) + ' будильниками.', w.source);
    }
  }
  var sc = facts.screen;
  var screenText = 'Экран включался ' + sc.on + ' ' + plural(sc.on, 'раз', 'раза', 'раз') + ', разблокировок ' + sc.unlocks;
  var owner = facts.owner;
  if (owner.sessions.length) {
    var sessions = owner.sessions.slice(0, s.topCount).map(function (session) {
      return hhmm(session.from) + (session.app ? ', ' + session.app : '') + ', ' + exports.duration(session.ms);
    });
    add('owner', screenText + '. Вы брали телефон: ' + sessions.join('; ') + '.', 'screen');
  } else {
    add('owner', screenText + (sc.unlocks === 0 ? ' — вы телефон не брали.' : '.'), 'screen');
  }
  if (facts.asleep) {
    add('asleep', 'Уснули под ' + quote(facts.asleep.title) + ' около ' + hhmm(facts.asleep.at) + '.', 'series');
  }
  if (facts.play) {
    add('play', 'Ночью играли: ' + facts.play.games.map(function (row) {
      return quote(row.game) + ' — ' + exports.duration(row.minutes * 60000);
    }).join(', ') + '.', 'games');
  }
  var buys = facts.purchases;
  if (buys) {
    var money = function (amount, unit) { return amount + (moneyUnit(unit) ? ' ' + moneyUnit(unit) : ''); };
    var sums = buys.totals.map(function (row) { return money(row.amount, row.unit); }).join(' и ');
    add('purchases', 'Ночью ' + buys.count + ' ' + plural(buys.count, 'покупка', 'покупки', 'покупок') + ' на ' + sums +
      (buys.count > 1 ? ', самая крупная — ' + quote(buys.top.merchant) + ' (' + money(buys.top.amount, buys.top.unit) + ')'
        : ' — ' + quote(buys.top.merchant) + ' в ' + hhmm(buys.top.at)) + '.', 'spending');
  }
  if (facts.dayFocus) {
    var df = facts.dayFocus;
    add('focusDay', 'Днём в Фокусе: ' + df.sessions + ' ' + plural(df.sessions, 'сессия', 'сессии', 'сессий') + ', ' + exports.duration(df.minutes * 60000) +
      '; попыток открыть отвлекающее — ' + df.attempts + '.', 'focusDay');
  }
  var n = facts.notifications;
  if (n.top.length && n.top[0].count >= s.noticeMin) {
    var note = n.top[0];
    add('notifications', 'Больше всего уведомлений: ' + quote(note.app) + ' — ' + note.count + ', с ' + hhmm(note.first) + ' до ' + hhmm(note.last) +
      '. Всего за ночь: ' + n.total + '.', n.source === 'usage' ? 'usage' : 'live');
  }
  if (facts.quiet) {
    var q = facts.quiet;
    add('quiet', '«Не беспокоить» Фокуса ночью: ' + exports.duration(q.minutes * 60000) + (q.hidden
      ? '; за это время пришло ' + q.hidden + ' ' + plural(q.hidden, 'уведомление', 'уведомления', 'уведомлений') + ' — режим их скрыл.'
      : '; уведомлений за это время не было.'), 'focus');
  }
  var t = facts.traffic;
  if (t.ok && t.top.length && t.top[0].mb >= s.trafficMb) {
    add('traffic', 'Больше всего трафика: ' + quote(t.top[0].app) + ' — около ' + mbText(t.top[0].mb) + ' МБ (всего ' + mbText(t.totalMb) + ' МБ).', 'netstats');
  }
  var d = facts.doze;
  if (d.ok && d.fullMinutes > 0) {
    add('doze', 'Глубокий сон Doze: ' + exports.duration(d.fullMinutes * 60000) + ', с ' + hhmm(d.first) + ' до ' + hhmm(d.last) + '.', 'history');
  } else if (d.ok) {
    add('doze', 'Глубокого сна Doze за ночь не было.', 'history');
  }
  var j = facts.jobs;
  if (j.ok && j.total > 0) {
    add('jobs', 'Фоновых заданий: ' + j.total + (j.top.length ? ', из них ' + j.top[0].count + ' — ' + quote(j.top[0].app) : '') + '.', j.source);
  }
  var cpu = facts.cpu;
  if (cpu.ok && cpu.top.length) {
    add('cpu', 'Дольше всех держал процессор: ' + quote(cpu.top[0].app) + ' — ' + exports.duration(cpu.top[0].minutes * 60000) + '.', 'checkin');
  }
  if (cpu.ok && cpu.power && cpu.power.length) {
    // The power estimate of batterystats is Android's own model: approximate, and the report says so.
    add('power', 'Больше всего батареи, по оценке самого Android: ' + quote(cpu.power[0].app) + ' — около ' + cpu.power[0].mah + ' мА·ч' +
      (cpu.power.length > 1 ? '; следом ' + cpu.power.slice(1).map(function (row) { return quote(row.app) + ' (' + row.mah + ')'; }).join(', ') : '') +
      '. Оценка приблизительная, не замер.', 'checkin');
  }
  if (facts.exempt.ok && facts.exempt.apps.length) {
    add('exempt', 'Освобождены от сна: ' + facts.exempt.apps.map(function (row) { return row.app; }).join(', ') + '.', 'deviceidle');
  }
  if (facts.network.offline > 0) {
    add('network', 'Сеть пропадала ' + facts.network.offline + ' ' + plural(facts.network.offline, 'раз', 'раза', 'раз') + '.', 'live');
  }
  if (facts.habit && facts.habit.marked) {
    add('habit', 'Ночь без телефона — отмечена привычка ' + quote(facts.habit.title) + ' в Здоровье.', 'health');
  }
  var tip = facts.tip ? exports.tipText(facts.tip, s) : '';
  return { headline: facts.title, lines: lines, tip: tip };
};

var SOURCE_TEXT = {
  battery: 'снимки батареи вечером и утром (ACTION_BATTERY_CHANGED)',
  history: 'лента батареи: dumpsys batterystats --history',
  alarm: 'dumpsys alarm, разница вечер–утро',
  screen: 'журнал экрана Axiko и UsageStatsManager',
  live: 'журнал уведомлений и сети Axiko',
  usage: 'UsageStatsManager',
  netstats: 'NetworkStatsManager — примерно, корзинами по ~2 ч',
  checkin: 'dumpsys batterystats --checkin, разница вечер–утро — оценка самого Android',
  jobscheduler: 'dumpsys jobscheduler — только последние задания',
  deviceidle: 'dumpsys deviceidle',
  boot: 'причина загрузки (getprop) и журнал UsageStats',
  series: 'общая база: «Сериал на ночь» (запись story — во сколько уснули)',
  games: 'общая база: сессии Игротеки (play), часть внутри окна ночи',
  spending: 'общая база: траты (expense) за окно ночи',
  focus: 'Фокус: время «не беспокоить» и журнал уведомлений Axiko',
  focusDay: 'общая база: сессии Фокуса (focus) и попытки отвлечься',
  health: 'Здоровье: отметка привычки'
};

exports.SOURCE_TEXT = SOURCE_TEXT;

/**
 * «Откуда цифры»: each line of the report with where its numbers come from, each line of the story
 * (the model's or the template's) with its sources, and what was missing.
 * -> { lines: [{ key, text, from }], story: [{ text, keys, from }], missing: [{ id, label, note }] }
 */
exports.whence = function (template, facts, story) {
  var lines = (template && template.lines || []).map(function (line) {
    return { key: line.key, text: line.text, from: SOURCE_TEXT[line.source] || line.source || 'нет данных' };
  });
  var missing = (facts && facts.sources || []).filter(function (source) { return !source.ok; }).map(function (source) {
    return { id: source.id, label: source.label, note: source.note || 'нет данных' };
  });
  var told = [];
  try {
    told = exports.storySources(story, template, facts);
  } catch (error) {
    told = [];
  }
  return { lines: lines, story: told, missing: missing };
};

// The model's facts by the line of the report they belong to.
var MF_KEYS = {
  battery: 'battery', reboots: 'reboot', wakers: 'wakers', tip: 'wakers', screen: 'owner', ownerSessions: 'owner',
  notifications: 'notifications', notificationsTotal: 'notifications', traffic: 'traffic', trafficTotalMb: 'traffic',
  doze: 'doze', jobs: 'jobs', cpu: 'cpu', powerEstimate: 'power', exemptFromDoze: 'exempt', networkLost: 'network',
  fellAsleep: 'asleep', nightPlay: 'play', nightPurchases: 'purchases', focusQuiet: 'quiet', dayFocus: 'focusDay', habitMarked: 'habit'
};
// Words that name a kind of fact, for lines with no app name or clock time of their own.
var KEY_WORDS = [
  [/батаре|заряд|%/i, 'battery'], [/перезагру/i, 'reboot'], [/будил|пробужд|будильник/i, 'wakers'],
  [/экран|разблок|брали телефон/i, 'owner'], [/уведомлен/i, 'notifications'], [/трафик|\d\s*мб|мегабайт|в сеть/i, 'traffic'],
  [/doze|спячк|глубок/i, 'doze'], [/фонов\S* задан/i, 'jobs'], [/процессор|wakelock/i, 'cpu'], [/ма·?ч|оценк\S* расход/i, 'power'],
  [/освобожд/i, 'exempt'], [/сеть пропада|без сети/i, 'network'], [/уснул|засыпа|засну/i, 'asleep'], [/играл|игр[аеуы](?![а-яё])|игрой/i, 'play'],
  [/покупк|купил|потрат/i, 'purchases'], [/не беспокоить/i, 'quiet'], [/отвлека|отвлечь|днём в фокусе/i, 'focusDay'], [/привычк/i, 'habit']
];

/**
 * The sources of each line of a story. A template line knows its own; a model's line gets the
 * sources of the facts it uses: the app names and clock times found in it, and the words that
 * name a kind of fact («батарея», «уведомления»…). -> [{ text, keys, from }]
 */
exports.storySources = function (story, template, facts) {
  if (!story || !story.lines || !facts) return [];
  var byKey = {};
  var byText = {};
  (template && template.lines || []).forEach(function (line) {
    byKey[line.key] = line.source;
    byText[line.text] = line;
  });
  var fallback = {
    battery: facts.battery && facts.battery.source ? facts.battery.source : 'battery', reboot: 'boot',
    wakers: facts.wakers && facts.wakers.source ? facts.wakers.source : 'alarm', owner: 'screen',
    notifications: facts.notifications && facts.notifications.source === 'usage' ? 'usage' : 'live', traffic: 'netstats',
    doze: 'history', jobs: facts.jobs && facts.jobs.source ? facts.jobs.source : 'jobscheduler', cpu: 'checkin', power: 'checkin',
    exempt: 'deviceidle', network: 'live', asleep: 'series', play: 'games', purchases: 'spending', quiet: 'focus',
    focusDay: 'focusDay', habit: 'health'
  };
  function fromOf(keys) {
    var texts = [];
    keys.forEach(function (key) {
      var text = SOURCE_TEXT[byKey[key] || fallback[key]];
      if (text && texts.indexOf(text) < 0) texts.push(text);
    });
    return texts.length ? texts.join('; ') : 'факты ночи: каждое число сверено со всеми источниками';
  }
  if (story.by !== 'model') {
    return story.lines.map(function (text) {
      var line = byText[text];
      return { text: text, keys: line ? [line.key] : [], from: line ? SOURCE_TEXT[line.source] || line.source : fromOf([]) };
    });
  }
  var mf = exports.modelFacts(facts);
  var perKey = {};
  Object.keys(mf).forEach(function (name) {
    var key = MF_KEYS[name];
    if (!key) return;
    var part = {};
    part[name] = mf[name];
    var allowed = allowedOf(part);
    var into = perKey[key] = perKey[key] || { names: [], times: [], numbers: [] };
    into.names = into.names.concat(allowed.names);
    into.times = into.times.concat(allowed.times);
    into.numbers = into.numbers.concat(allowed.numbers);
  });
  return story.lines.map(function (text) {
    var line = String(text || '');
    var low = line.toLowerCase();
    var times = (line.match(/\b\d{1,2}:\d{2}\b/g) || []).map(minutesOf);
    var numbers = (line.replace(/\b\d{1,2}:\d{2}\b/g, ' ').match(/\d+(?:[.,]\d+)?/g) || []).map(function (n) { return Number(n.replace(',', '.')); });
    // The words and clock times of a line say best which facts it tells; an app's name alone is in
    // many facts, so it counts only together with a number of the same facts.
    var keys = [];
    var named = [];
    var counted = [];
    KEY_WORDS.forEach(function (pair) {
      if (pair[0].test(line) && keys.indexOf(pair[1]) < 0) keys.push(pair[1]);
    });
    Object.keys(perKey).forEach(function (key) {
      var part = perKey[key];
      if (times.some(function (time) { return part.times.indexOf(time) >= 0; }) && keys.indexOf(key) < 0) keys.push(key);
      if (part.names.some(function (name) { return name && low.indexOf(String(name).toLowerCase()) >= 0; })) named.push(key);
      if (numbers.some(function (n) { return numberOk(n, part); })) counted.push(key);
    });
    if (!keys.length) {
      var both = named.filter(function (key) { return counted.indexOf(key) >= 0; });
      keys = both.length ? both : named.length ? named : counted.length <= 2 ? counted : [];
    }
    return { text: line, keys: keys, from: fromOf(keys) };
  });
};

exports.tipText = function (tip, s) {
  return quote(tip.app) + ' будил телефон не меньше ' + s.wakeupThreshold + ' раз ' + tip.nights + ' ' +
    plural(tip.nights, 'ночь', 'ночи', 'ночей') + ' подряд. Ограничить ему фоновую работу?';
};

var NOTICE_ORDER = ['battery', 'reboot', 'wakers', 'owner', 'notifications', 'traffic', 'cpu', 'power', 'doze', 'jobs', 'network',
  'quiet', 'asleep', 'play', 'purchases', 'habit'];
// The owner's own life: not in a notification others may see, unless ownerInNotice.
var OWNER_KEYS = ['asleep', 'play', 'purchases', 'habit'];

/** The text of the morning notification: the most telling lines. */
exports.noticeText = function (report, story, facts, s) {
  if (story && story.by === 'model' && story.lines && story.lines.length && s.ownerInNotice) {
    return story.lines.slice(0, s.notifyLines).join(' ');
  }
  var lines = report.lines.filter(function (line) {
    return NOTICE_ORDER.indexOf(line.key) >= 0 && (s.ownerInNotice || OWNER_KEYS.indexOf(line.key) < 0);
  });
  lines.sort(function (a, b) { return NOTICE_ORDER.indexOf(a.key) - NOTICE_ORDER.indexOf(b.key); });
  return lines.slice(0, s.notifyLines).map(function (line) {
    if (line.key === 'owner' && !s.ownerInNotice) {
      var sc = facts.screen;
      return 'Экран включался ' + sc.on + ' ' + plural(sc.on, 'раз', 'раза', 'раз') + ', разблокировок ' + sc.unlocks + '.';
    }
    return line.text;
  }).join(' ');
};

// ---- the model's story and its check --------------------------------------------------------------

/** The facts as the model gets them: names, numbers and clock times only — what the story may use. */
exports.modelFacts = function (facts) {
  var hhmm = exports.hhmm;
  var b = facts.battery;
  var out = {
    night: facts.title,
    window: { from: hhmm(facts.window.from), to: hhmm(facts.window.to), length: exports.duration(facts.window.to - facts.window.from), minutes: facts.window.minutes }
  };
  if (b) {
    var c = b.charging || {};
    out.battery = {
      start: b.start, end: b.end, drop: b.drop, from: hhmm(b.from), to: hhmm(b.to), period: exports.duration(b.to - b.from),
      charging: c.whole ? 'всю ночь' : c.any ? 'часть ночи' : 'нет'
    };
    if (c.any) out.battery.chargingParts = c.parts.map(function (part) { return { from: hhmm(part.from), to: hhmm(part.to) }; });
    if (c.fullAt) out.battery.fullAt = hhmm(c.fullAt);
  } else out.battery = 'нет данных';
  out.screen = { screenOns: facts.screen.on, unlocks: facts.screen.unlocks };
  out.ownerSessions = facts.owner.sessions.map(function (session) {
    return { from: hhmm(session.from), to: hhmm(session.to), app: session.app || 'рабочий стол', minutes: session.minutes, length: exports.duration(session.ms) };
  });
  out.wakers = facts.wakers.ok ? facts.wakers.top.map(function (row) { return { app: row.app, wakeups: row.wakeups, alarms: row.alarms }; }) : 'нет данных';
  out.traffic = facts.traffic.ok ? facts.traffic.top.map(function (row) { return { app: row.app, mb: row.mb }; }) : 'нет данных';
  if (facts.traffic.ok) out.trafficTotalMb = facts.traffic.totalMb;
  out.notifications = facts.notifications.top.map(function (row) { return { app: row.app, count: row.count, from: hhmm(row.first), to: hhmm(row.last) }; });
  out.notificationsTotal = facts.notifications.total;
  if (facts.doze.ok) {
    out.doze = { deepMinutes: facts.doze.fullMinutes, deep: exports.duration(facts.doze.fullMinutes * 60000), lightMinutes: facts.doze.lightMinutes };
    if (facts.doze.first) { out.doze.firstDeep = hhmm(facts.doze.first); out.doze.lastDeep = hhmm(facts.doze.last); }
  }
  if (facts.jobs.ok) out.jobs = { total: facts.jobs.total, top: facts.jobs.top.map(function (row) { return { app: row.app, count: row.count }; }) };
  if (facts.cpu.ok && facts.cpu.top.length) {
    out.cpu = facts.cpu.top.map(function (row) { return { app: row.app, wakelockMinutes: row.minutes, length: exports.duration(row.minutes * 60000) }; });
  }
  if (facts.cpu.ok && facts.cpu.power && facts.cpu.power.length) {
    out.powerEstimate = {
      note: 'приблизительная оценка расхода батареи самим Android по batterystats, не замер',
      apps: facts.cpu.power.map(function (row) { return { app: row.app, mah: row.mah }; })
    };
  }
  if (facts.reboots.length) {
    out.reboots = facts.reboots.map(function (reboot) {
      var row = { at: hhmm(reboot.at), kind: exports.bootWord(reboot.kind) };
      if (reboot.reason) row.reason = reboot.reason;
      return row;
    });
  }
  if (facts.exempt.ok && facts.exempt.apps.length) out.exemptFromDoze = facts.exempt.apps.map(function (row) { return row.app; });
  if (facts.network.offline) out.networkLost = facts.network.offline;
  if (facts.tip) out.tip = { app: facts.tip.app, nights: facts.tip.nights, wakeups: facts.tip.wakeups };
  // The neighbours' part (old reports have none of it).
  if (facts.asleep) out.fellAsleep = { at: hhmm(facts.asleep.at), title: facts.asleep.title };
  if (facts.play) {
    out.nightPlay = {
      minutes: facts.play.minutes, length: exports.duration(facts.play.minutes * 60000),
      games: facts.play.games.map(function (row) { return { game: row.game, minutes: row.minutes, length: exports.duration(row.minutes * 60000) }; })
    };
  }
  if (facts.purchases) {
    var buys = facts.purchases;
    out.nightPurchases = {
      count: buys.count,
      totals: buys.totals.map(function (row) { return { amount: row.amount, unit: moneyUnit(row.unit) }; }),
      top: { merchant: buys.top.merchant, amount: buys.top.amount, unit: moneyUnit(buys.top.unit), at: hhmm(buys.top.at) }
    };
  }
  if (facts.quiet) {
    out.focusQuiet = { minutes: facts.quiet.minutes, length: exports.duration(facts.quiet.minutes * 60000), hiddenNotifications: facts.quiet.hidden };
  }
  if (facts.dayFocus) {
    out.dayFocus = {
      sessions: facts.dayFocus.sessions, minutes: facts.dayFocus.minutes, length: exports.duration(facts.dayFocus.minutes * 60000),
      distractionAttempts: facts.dayFocus.attempts
    };
  }
  if (facts.habit && facts.habit.marked) out.habitMarked = { title: facts.habit.title };
  var missing = [];
  (facts.sources || []).forEach(function (source) { if (!source.ok) missing.push(source.label + ': ' + (source.note || 'нет данных')); });
  if (missing.length) out.missing = missing;
  return out;
};

var STYLES = {
  nature: 'документальный фильм о природе: приложения — звери и птицы, ночь — дикая природа, голос рассказчика спокойный и восхищённый',
  detective: 'детектив: телефон — место происшествия, приложения — подозреваемые, цифры — улики',
  gossip: 'сплетни: соседи по телефону по-доброму обсуждают, кто чем занимался ночью',
  dry: 'сухой деловой отчёт'
};

exports.storyPrompt = function (mf, style, s, errors) {
  var system = 'Ты пишешь утренний отчёт о том, что телефон делал ночью, пока владелец спал. Стиль — ' + (STYLES[style] || STYLES.nature) + '.\n' +
    'Строгие правила:\n' +
    '- Используй только числа, время и названия приложений из фактов. Не считай новых чисел: никаких сумм, разниц, «вдвое», процентов от процентов.\n' +
    '- Названия приложений пиши ровно как в фактах, в кавычках-ёлочках.\n' +
    '- Не делай выводов о причинах, которых нет в фактах. Если данных нет — так и скажи, без догадок.\n' +
    '- Во всём рассказе не больше ' + s.storySentences + ' предложений. Без эмодзи. По-русски.\n' +
    '- Если говоришь о расходе батареи приложениями (powerEstimate, мА·ч) — прямо скажи, что это приблизительная оценка самого Android.\n' +
    'Ответ — только JSON: {"headline": "короткий заголовок", "lines": ["предложение", "…"], "tip": "совет или пустая строка"}. ' +
    'Совет — только если в фактах есть tip: предложи ограничить фоновую работу этого приложения.';
  var prompt = 'Факты о ночи (JSON):\n' + JSON.stringify(mf, null, 1);
  if (errors && errors.length) {
    prompt += '\n\nПрошлый ответ не прошёл проверку: ' + errors.join('; ') + '. Напиши заново, только по фактам.';
  }
  return { system: system, prompt: prompt };
};

var LATIN_OK = ['doze', 'wi-fi', 'wifi', 'android', 'axiko', 'shizuku', 'samsung', 'json'];
var WORD_NUMBERS = {
  'один': 1, 'одна': 1, 'одно': 1, 'однажды': 1, 'два': 2, 'две': 2, 'дважды': 2, 'три': 3, 'трижды': 3, 'четыре': 4,
  'пять': 5, 'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10
};

// Keys of the model's facts whose strings are names the story may quote.
var NAME_KEYS = { app: true, exemptFromDoze: true, game: true, merchant: true, title: true };

/** What the story may say: numbers, clock times, names and Latin words found in the model's facts. */
function allowedOf(mf) {
  var allowed = { numbers: [], times: [], names: [], words: {} };
  LATIN_OK.forEach(function (word) { allowed.words[word] = true; });
  function text(value, key) {
    var times = value.match(/\b\d{1,2}:\d{2}\b/g) || [];
    times.forEach(function (time) { allowed.times.push(minutesOf(time)); });
    var rest = value.replace(/\b\d{1,2}:\d{2}\b/g, ' ');
    (rest.match(/\d+(?:[.,]\d+)?/g) || []).forEach(function (number) { allowed.numbers.push(Number(number.replace(',', '.'))); });
    (value.match(/[A-Za-z][A-Za-z0-9'’-]*/g) || []).forEach(function (word) { allowed.words[word.toLowerCase()] = true; });
    if (NAME_KEYS[key]) allowed.names.push(value);
  }
  function walk(value, key) {
    if (value === null || value === undefined) return;
    if (typeof value === 'number') allowed.numbers.push(value);
    else if (typeof value === 'string') text(value, key);
    else if (Array.isArray(value)) value.forEach(function (item) { walk(item, key); });
    else if (typeof value === 'object') Object.keys(value).forEach(function (inner) { walk(value[inner], inner); });
  }
  walk(mf, '');
  allowed.names.sort(function (a, b) { return b.length - a.length; });
  return allowed;
}

exports.allowedOf = allowedOf;

function numberOk(n, allowed) {
  return allowed.numbers.some(function (value) {
    return Math.abs(n - value) < 0.051 || n === Math.round(value);
  });
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkText(raw, allowed, errors) {
  var text = String(raw);
  if (/[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿]/.test(text)) errors.push('в тексте эмодзи');
  // Quoted names must be apps of the facts.
  var quoted = /[«"“]([^»"”]+)[»"”]/g;
  var match;
  while ((match = quoted.exec(text)) !== null) {
    var said = match[1].trim().toLowerCase();
    var known = allowed.names.some(function (name) {
      var lower = name.toLowerCase();
      return lower === said || lower.indexOf(said) >= 0 || said.indexOf(lower) >= 0;
    });
    if (!known) errors.push('название «' + match[1].trim() + '» не из фактов');
  }
  // Names out, then the rest is checked word by word.
  allowed.names.forEach(function (name) {
    if (name) text = text.replace(new RegExp(escapeRegex(name), 'gi'), ' ');
  });
  var times = text.match(/\b\d{1,2}:\d{2}\b/g) || [];
  times.forEach(function (time) {
    var minutes = minutesOf(time);
    var ok = allowed.times.some(function (value) { return Math.abs(value - minutes) <= 1 || Math.abs(value - minutes) >= 1439; });
    if (!ok) errors.push('времени ' + time + ' нет в фактах');
  });
  text = text.replace(/\b\d{1,2}:\d{2}\b/g, ' ');
  (text.match(/[A-Za-z][A-Za-z0-9'’-]*/g) || []).forEach(function (word) {
    if (!allowed.words[word.toLowerCase()]) errors.push('слово «' + word + '» не из фактов');
  });
  (text.match(/\d+(?:[.,]\d+)?/g) || []).forEach(function (number) {
    var n = Number(number.replace(',', '.'));
    if (!numberOk(n, allowed)) errors.push('числа ' + number + ' нет в фактах');
  });
  var words = /(^|[^а-яё])(один|одна|одно|однажды|два|две|дважды|три|трижды|четыре|пять|шесть|семь|восемь|девять|десять)(?=\s+(раз|раза|минут|минуты|минуту|час|часа|часов|приложени|уведомлен|пробужден|будильник|заданий|задания)|[^а-яё]|$)/gi;
  while ((match = words.exec(text)) !== null) {
    var word = match[2].toLowerCase();
    var standalone = word === 'дважды' || word === 'трижды' || word === 'однажды';
    var followed = /^\s+(раз|раза|минут|минуты|минуту|час|часа|часов|приложени|уведомлен|пробужден|будильник|заданий|задания)/i.test(text.slice(match.index + match[0].length));
    if (!standalone && !followed) continue;
    if (!numberOk(WORD_NUMBERS[word], allowed)) errors.push('«' + match[2] + '» — такого числа нет в фактах');
  }
}

/** Is the model's story true to the facts? -> { ok, errors, story: { headline, lines, tip } } */
exports.checkStory = function (story, mf, s) {
  var errors = [];
  if (!story || typeof story !== 'object') return { ok: false, errors: ['ответ — не объект JSON'], story: null };
  var headline = typeof story.headline === 'string' ? story.headline.trim() : '';
  var lines = Array.isArray(story.lines) ? story.lines.filter(function (line) { return typeof line === 'string' && line.trim(); })
    .map(function (line) { return line.trim(); }) : [];
  var tip = typeof story.tip === 'string' ? story.tip.trim() : '';
  if (!headline) errors.push('нет заголовка headline');
  if (!lines.length) errors.push('нет строк lines');
  var sentences = lines.join(' ').split(/[.!?…]+(?=\s|$)/).filter(function (part) { return part.trim().length > 1; }).length;
  if (sentences > s.storySentences) errors.push('предложений ' + sentences + ', а можно не больше ' + s.storySentences);
  if (tip && !mf.tip) errors.push('совет без повода: в фактах нет tip');
  var allowed = allowedOf(mf);
  [headline].concat(lines, tip ? [tip] : []).forEach(function (text) { checkText(text, allowed, errors); });
  var unique = [];
  errors.forEach(function (error) { if (unique.indexOf(error) < 0) unique.push(error); });
  return { ok: !unique.length, errors: unique, story: { headline: headline, lines: lines, tip: tip } };
};

// ---- repeat offenders and trends ------------------------------------------------------------------

/**
 * Apps that woke the phone at least `wakeupThreshold` times every night of the last `tipNights`
 * nights in a row. reports: [{ night, facts }] in any order. -> [{ pkg, app, nights, wakeups }]
 */
exports.offenders = function (reports, s) {
  var sorted = (reports || []).filter(function (report) { return report && report.facts; })
    .sort(function (a, b) { return a.night < b.night ? 1 : a.night > b.night ? -1 : 0; });
  if (!sorted.length) return [];
  var latest = sorted[0];
  var wakers = latest.facts.wakers;
  if (!wakers || !wakers.ok) return [];
  var out = [];
  (wakers.list || wakers.top || []).forEach(function (row) {
    if (!row.pkg || row.wakeups < s.wakeupThreshold) return;
    var streak = 1;
    var expected = exports.prevNight(latest.night);
    for (var i = 1; i < sorted.length; i++) {
      var report = sorted[i];
      if (report.night !== expected) break;
      var other = report.facts.wakers;
      if (!other || !other.ok) break;
      var found = (other.list || other.top || []).filter(function (item) { return item.pkg === row.pkg; })[0];
      if (!found || found.wakeups < s.wakeupThreshold) break;
      streak++;
      expected = exports.prevNight(report.night);
    }
    if (streak >= s.tipNights) out.push({ pkg: row.pkg, app: row.app, nights: streak, wakeups: row.wakeups });
  });
  return out.sort(function (a, b) { return b.wakeups - a.wakeups; });
};

/** Nights of the last `trendDays` and the frequent offenders. reports: [{ night, facts }]. */
exports.trendsOf = function (reports, s, now) {
  var since = exports.dayKey((now || Date.now()) - s.trendDays * 864e5);
  var list = (reports || []).filter(function (report) { return report && report.facts && report.night >= since; })
    .sort(function (a, b) { return a.night < b.night ? -1 : a.night > b.night ? 1 : 0; });
  var nights = list.map(function (report) {
    var f = report.facts;
    var b = f.battery;
    var wakers = f.wakers && f.wakers.ok ? f.wakers.top : [];
    var top = wakers.filter(function (row) { return row.key !== 'system'; })[0] || null;
    var system = wakers.filter(function (row) { return row.key === 'system'; })[0] || null;
    return {
      night: report.night, label: report.night.slice(8, 10) + '.' + report.night.slice(5, 7),
      start: b ? b.start : null, end: b ? b.end : null, drop: b ? b.drop : null,
      charging: Boolean(b && b.charging && b.charging.any), hours: Math.round(f.window.minutes / 6) / 10,
      screens: f.screen.on, unlocks: f.screen.unlocks, ownerMinutes: f.owner.minutes,
      topWaker: top ? { app: top.app, pkg: top.pkg, wakeups: top.wakeups } : null,
      systemWakeups: system ? system.wakeups : null
    };
  });
  var drops = nights.filter(function (row) { return row.drop !== null && !row.charging; });
  var offenders = {};
  list.forEach(function (report) {
    var w = report.facts.wakers;
    if (!w || !w.ok) return;
    (w.list || w.top || []).forEach(function (row) {
      // The system itself cannot be restricted: it is not an offender.
      if (!row.pkg || row.wakeups < s.wakeupThreshold) return;
      var key = row.pkg;
      var item = offenders[key] = offenders[key] || { app: row.app, pkg: row.pkg, nights: 0, total: 0, max: 0 };
      item.nights++;
      item.total += row.wakeups;
      item.max = Math.max(item.max, row.wakeups);
    });
  });
  return {
    days: s.trendDays,
    nights: nights,
    avgDrop: drops.length ? Math.round(drops.reduce(function (sum, row) { return sum + row.drop; }, 0) / drops.length * 10) / 10 : null,
    unlockNights: nights.filter(function (row) { return row.unlocks > 0; }).length,
    quietNights: nights.filter(function (row) { return row.unlocks === 0; }).length,
    offenders: Object.keys(offenders).map(function (key) { return offenders[key]; })
      .sort(function (a, b) { return b.nights - a.nights || b.total - a.total; }).slice(0, 10)
  };
};

// ---- the time line on the screen ------------------------------------------------------------------

/** What the screen draws: the axis, the battery line (thinned), marks, Doze and charging bands. */
exports.timeline = function (facts, s) {
  var nominal = exports.nominal(facts.night, s);
  var from = Math.min(facts.window.from, nominal.from);
  var to = Math.max(facts.window.to, nominal.to);
  var points = [];
  var b = facts.battery;
  if (facts.batteryPoints && facts.batteryPoints.length) points = facts.batteryPoints.slice();
  else if (b) points = [{ at: facts.window.from, level: b.start }, { at: facts.window.to, level: b.end }];
  if (points.length > s.batteryPoints) {
    var step = Math.ceil(points.length / s.batteryPoints);
    var last = points[points.length - 1];
    points = points.filter(function (point, index) { return index % step === 0; });
    if (points[points.length - 1] !== last) points.push(last);
  }
  return {
    from: from, to: to, window: { from: facts.window.from, to: facts.window.to },
    battery: points, marks: facts.marks || [], doze: facts.doze.segments || [],
    charging: b && b.charging ? b.charging.parts : []
  };
};
