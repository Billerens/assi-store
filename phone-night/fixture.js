// A made-up but realistic night built from the bundled samples (samples/*.txt): the same scenario
// for the node tests and for the checks on the phone. Any night date works — the battery history
// is shifted to it. Pure: no Android, no native.
var parse = require('./parse');
var night = require('./night');

exports.FILES = ['alarm-evening', 'alarm-morning', 'history', 'checkin-evening', 'checkin-morning', 'deviceidle', 'jobscheduler'];

exports.APPS = {
  byPkg: {
    'org.telegram.messenger': 'Telegram', 'com.google.android.gms': 'Сервисы Google Play', 'ru.marketplace.app': 'Маркетплейс',
    'app.assi': 'Assi', 'com.whatsapp': 'WhatsApp', 'com.sec.android.app.launcher': 'One UI Home'
  },
  byUid: {
    10160: { pkg: 'com.google.android.gms', app: 'Сервисы Google Play' },
    10199: { pkg: 'app.assi', app: 'Assi' },
    10245: { pkg: 'ru.marketplace.app', app: 'Маркетплейс' },
    10280: { pkg: 'com.whatsapp', app: 'WhatsApp' },
    10301: { pkg: 'org.telegram.messenger', app: 'Telegram' }
  }
};

/**
 * texts: { 'alarm-evening': '…', … } — the samples' contents. -> { live, usage, evening, morning,
 * input (for night.buildFacts), raw (the texts with the history moved to this night) }
 */
exports.scenario = function (key, texts, s) {
  var t = function (hhmm, seconds) { return night.at(key, hhmm, s.dayBoundary) + (seconds || 0) * 1000; };
  var history = String(texts.history).replace(/RESET:TIME: \d{4}-\d{2}-\d{2}-/, 'RESET:TIME: ' + key + '-');
  var live = [
    { at: t('23:20', 5), kind: 'screen_on' },
    { at: t('23:39', 40), kind: 'screen_off' },
    { at: t('00:45'), kind: 'notification', package: 'org.telegram.messenger', extra: { app: 'Telegram', len: 40 } },
    { at: t('01:00'), kind: 'notification', package: 'ru.marketplace.app', extra: { app: 'Маркетплейс', len: 61 } },
    { at: t('01:12'), kind: 'notification', package: 'ru.marketplace.app', extra: { app: 'Маркетплейс', len: 58 } },
    { at: t('02:05'), kind: 'notification', package: 'ru.marketplace.app', extra: { app: 'Маркетплейс', len: 70 } },
    { at: t('02:39', 58), kind: 'screen_on' },
    { at: t('02:40', 10), kind: 'unlock' },
    { at: t('02:46', 20), kind: 'screen_off' },
    { at: t('02:58'), kind: 'notification', package: 'ru.marketplace.app', extra: { app: 'Маркетплейс', len: 44 } },
    { at: t('03:30'), kind: 'network', extra: { online: false, wifi: false } },
    { at: t('03:31'), kind: 'network', extra: { online: true, wifi: true } },
    { at: t('03:40'), kind: 'notification', package: 'ru.marketplace.app', extra: { app: 'Маркетплейс', len: 52 } },
    { at: t('04:22'), kind: 'notification', package: 'ru.marketplace.app', extra: { app: 'Маркетплейс', len: 49 } },
    { at: t('05:00'), kind: 'notification', package: 'ru.marketplace.app', extra: { app: 'Маркетплейс', len: 66 } },
    { at: t('06:30'), kind: 'notification', package: 'org.telegram.messenger', extra: { app: 'Telegram', len: 22 } },
    { at: t('07:05'), kind: 'screen_on' },
    { at: t('07:12'), kind: 'unlock' }
  ];
  var usage = [
    { at: t('23:20', 6), kind: 'screen_on' },
    { at: t('23:39', 41), kind: 'screen_off' },
    { at: t('23:50'), kind: 'fg_start', package: 'org.telegram.messenger' },
    { at: t('00:20'), kind: 'fg_stop', package: 'org.telegram.messenger' },
    { at: t('02:40'), kind: 'screen_on' },
    { at: t('02:40', 11), kind: 'unlock' },
    { at: t('02:40', 12), kind: 'resumed', package: 'org.telegram.messenger' },
    { at: t('02:46'), kind: 'paused', package: 'org.telegram.messenger' },
    { at: t('02:46', 21), kind: 'screen_off' },
    { at: t('07:05', 1), kind: 'screen_on' },
    { at: t('07:12', 1), kind: 'unlock' }
  ];
  var evening = { at: t('23:00'), uptime: 3600000, battery: 92, charging: false, temp: 26.5 };
  var morning = { at: t('07:12', 30), uptime: 33150000, battery: 81, charging: false, temp: 25.1 };
  evening.alarm = parse.parseAlarm(texts['alarm-evening']);
  morning.alarm = parse.parseAlarm(texts['alarm-morning']);
  evening.checkin = parse.parseCheckin(texts['checkin-evening']);
  morning.checkin = parse.parseCheckin(texts['checkin-morning']);
  var parsedHistory = parse.parseHistory(history, { from: night.logFrom(key, s), to: morning.at });
  var MB = 1048576;
  var traffic = {
    ok: true, note: 'примерно: сеть считается корзинами по ~2 ч',
    rows: {
      10301: { wifi: 38 * MB + 400000, mobile: 0 }, 10160: { wifi: Math.round(6.5 * MB), mobile: 0 },
      10245: { wifi: Math.round(2.2 * MB), mobile: 0 }, 1000: { wifi: Math.round(1.5 * MB), mobile: 0 },
      1001: { wifi: 0, mobile: Math.round(0.3 * MB) }
    }
  };
  var liveTagged = live.map(function (event) { var copy = JSON.parse(JSON.stringify(event)); copy.src = 'live'; return copy; });
  var usageTagged = usage.map(function (event) { var copy = JSON.parse(JSON.stringify(event)); copy.src = 'usage'; return copy; });
  var historyScreen = (parsedHistory.screen || []).map(function (event) {
    return { at: event.at, kind: event.on ? 'screen_on' : 'screen_off', src: 'history' };
  });
  var sources = [
    { id: 'live', label: 'Журнал Assi', ok: true, via: 'подписки', note: '' },
    { id: 'usage', label: 'UsageStatsManager', ok: true, via: 'статистика Android', note: '' },
    { id: 'netstats', label: 'NetworkStatsManager', ok: true, via: 'статистика Android', note: '' },
    { id: 'battery', label: 'Батарея', ok: true, via: 'ACTION_BATTERY_CHANGED', note: '' },
    { id: 'alarm', label: 'dumpsys alarm', ok: true, via: 'Shizuku', note: '' },
    { id: 'history', label: 'dumpsys batterystats --history', ok: true, via: 'Shizuku', note: '' },
    { id: 'checkin', label: 'dumpsys batterystats --checkin', ok: true, via: 'Shizuku', note: '' },
    { id: 'deviceidle', label: 'dumpsys deviceidle', ok: true, via: 'Shizuku', note: '' },
    { id: 'jobscheduler', label: 'dumpsys jobscheduler', ok: true, via: 'Shizuku', note: '' },
    { id: 'boot', label: 'Причина загрузки', ok: true, via: 'getprop', note: '' }
  ];
  return {
    live: live, usage: usage, evening: evening, morning: morning,
    raw: { history: history },
    input: {
      night: key, now: morning.at,
      events: night.mergeEvents([liveTagged, usageTagged, historyScreen], s.mergeSeconds * 1000),
      live: { ok: true, note: '' }, usage: { ok: true, note: '' },
      evening: evening, morning: morning,
      history: parsedHistory,
      alarmDiff: parse.alarmDiff(evening.alarm, morning.alarm),
      checkinDiff: parse.checkinDiff(evening.checkin, morning.checkin),
      traffic: traffic,
      jobs: parse.parseJobs(texts.jobscheduler, morning.at),
      deviceIdle: parse.parseDeviceIdle(texts.deviceidle),
      boot: { reason: null, autoRestart: null },
      apps: exports.APPS,
      sources: sources
    }
  };
};
