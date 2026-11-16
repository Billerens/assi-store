// What Focus does with Android itself: "do not disturb" by one of four ways, the notification of
// a session with its countdown and buttons, vibration, contacts, the accessibility service and the
// usage events. Engine only. Every addition of the shell (docs/shell-changes.md) is checked
// with native('shell.features') first, and each has its way without it.
var assi = require('lib/assi');
var dnd = require('./logic/dnd.js');

var G = typeof global !== 'undefined' ? global : {};
// Kept while the process lives: the receiver of the buttons of our own notifications.
var LIVE = G.__focusAndroid || (G.__focusAndroid = { receiver: null, features: null, featuresAt: 0, launcher: null });

var SESSION_ID = 'focus:session';
var SESSION_NUMBER = 41001;
var END_NUMBER = 41002;
var CHANNEL_SESSION = 'focus-session';
var CHANNEL_END = 'focus-end';
var ACTION = 'app.assi.focus.BUTTON';

function message(error) {
  var text = String(error && error.message ? error.message : error);
  return text.replace(/^[\w.$]+(Exception|Error):\s*/, '').slice(0, 200);
}

/** The shell's additions that are there: ['dnd', 'notify.actions', ...]. */
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

exports.has = function (feature) {
  return exports.features().indexOf(feature) >= 0;
};

/** The notification listener service of Assi, or null when notification access is off. */
function service() {
  try {
    var found = Packages.app.assi.sense.NoticeService.Companion.getInstance();
    if (found) return found;
  } catch (error) { /* try the field */ }
  try {
    var field = Packages.app.assi.sense.NoticeService.instance;
    if (field) return field;
  } catch (error) { /* none */ }
  return null;
}

exports.service = service;

function manager() {
  return context.getSystemService('notification');
}

// ---- "do not disturb" -------------------------------------------------------------------------

/** The phone's filter now: 'all' | 'priority' | 'alarms' | 'none'. */
exports.filter = function () {
  if (exports.has('dnd')) {
    try {
      var state = native('dnd.get');
      if (state && state.filter) return String(state.filter);
    } catch (error) { /* read it directly */ }
  }
  try {
    return dnd.name(Number(manager().getCurrentInterruptionFilter()));
  } catch (error) {
    return 'all';
  }
};

function shizukuReady() {
  try {
    var status = native('shizuku.status');
    return Boolean(status && status.running && status.granted);
  } catch (error) {
    return false;
  }
}

/** Which ways are open now: { shell, listener, manager, shizuku }. */
exports.ways = function () {
  var policy = false;
  try { policy = Boolean(manager().isNotificationPolicyAccessGranted()); } catch (error) { policy = false; }
  return { shell: exports.has('dnd'), listener: Boolean(service()), manager: policy, shizuku: shizukuReady() };
};

/** Waits until the filter is what is wanted ('silent' — any silent one), up to ms. */
function waitFor(wanted, ms) {
  var until = Date.now() + ms;
  var now = exports.filter();
  while (true) {
    if (wanted === 'silent' ? dnd.silent(now) : now === wanted) return now;
    if (Date.now() >= until) return now;
    sleep(100);
    now = exports.filter();
  }
}

/** One way to put the filter: throws when it cannot. */
function put(way, name) {
  var code = dnd.code(name);
  if (way === 'shell') {
    native('dnd.set', name);
    return;
  }
  if (way === 'listener') {
    var svc = service();
    if (!svc) throw new Error('нет доступа к уведомлениям');
    svc.requestInterruptionFilter(code);
    return;
  }
  if (way === 'manager') {
    var nm = manager();
    if (!nm.isNotificationPolicyAccessGranted()) throw new Error('нет доступа к режиму «Не беспокоить»');
    nm.setInterruptionFilter(code);
    return;
  }
  if (way === 'shizuku') {
    if (!shizukuReady()) throw new Error('Shizuku не запущен');
    var out = assi.shell('cmd notification set_dnd ' + dnd.shizukuArg(name), { privileged: true });
    if (out && out.code !== 0) throw new Error('Shizuku: ' + String(out.out || out.code).slice(0, 120));
    return;
  }
  throw new Error('нет такого способа: ' + way);
}

function ordered(first, s) {
  var list = [];
  if (first) list.push(first);
  dnd.ORDER.forEach(function (way) {
    if (list.indexOf(way) >= 0) return;
    if (way === 'shizuku' && s && !s.shizuku) return;
    list.push(way);
  });
  // The shell's dnd.set already tries the listener and the manager.
  if (list[0] === 'shell') list = list.filter(function (way) { return way !== 'listener' && way !== 'manager'; });
  return list;
}

/**
 * Silence for a session: tries the ways in order until the phone is silent.
 * Returns { ok, by, filter, tried: [why each way failed] }.
 */
exports.silence = function (mode, s) {
  var ways = exports.ways();
  var tried = [];
  var list = ordered(ways.shell ? 'shell' : null, s);
  for (var i = 0; i < list.length; i++) {
    var way = list[i];
    if (way === 'shell' && !ways.shell) continue;
    try {
      put(way, mode);
    } catch (error) {
      tried.push(message(error));
      continue;
    }
    var after = waitFor('silent', s.dndWaitMs);
    if (dnd.worked(after)) return { ok: true, by: way, filter: after, tried: tried };
    tried.push(way === 'listener' ? 'служба уведомлений не переключила режим' : 'режим не сменился');
  }
  return { ok: false, by: null, filter: exports.filter(), tried: tried };
};

/** Puts the filter back the way it was switched on (then the other ways). { ok, by, filter }. */
exports.unsilence = function (to, by, s) {
  var list = ordered(by, s).filter(function (way) { return way !== 'shell' || exports.has('dnd'); });
  for (var i = 0; i < list.length; i++) {
    try {
      put(list[i], to);
    } catch (error) {
      continue;
    }
    var after = waitFor(to, s.dndWaitMs);
    if (after === to) return { ok: true, by: list[i], filter: after };
  }
  return { ok: false, by: null, filter: exports.filter() };
};

/** The system screen that gives Assi access to "do not disturb". */
exports.askPolicy = function () {
  if (exports.has('dnd')) {
    try {
      return native('dnd.request');
    } catch (error) { /* open it directly */ }
  }
  var intent = new android.content.Intent(android.provider.Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
  intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
  context.startActivity(intent);
  return true;
};

// ---- notifications ------------------------------------------------------------------------------

function icon() {
  return context.getResources().getIdentifier('ic_spark', 'drawable', context.getPackageName());
}

function openIntent(open, number) {
  var launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
  launch.putExtra('open', String(open));
  return android.app.PendingIntent.getActivity(context, number, launch,
    android.app.PendingIntent.FLAG_IMMUTABLE | android.app.PendingIntent.FLAG_UPDATE_CURRENT);
}

/** The receiver of the buttons of the notifications built here: registered once per process. */
function receiver() {
  if (LIVE.receiver) return;
  var handler = extend(android.content.BroadcastReceiver, {
    onReceive: function (ctx, intent) {
      var act = String(intent.getStringExtra('act') || '');
      spawn(function () {
        try {
          require('modules/focus/main.js').fromNotice({ act: act });
        } catch (error) {
          console.error('focus: notification button: ' + error);
        }
      });
    }
  });
  var filter = new android.content.IntentFilter();
  filter.addAction(ACTION);
  var flags = android.os.Build.VERSION.SDK_INT >= 33 ? 4 : 0;   // RECEIVER_NOT_EXPORTED
  context.registerReceiver(handler, filter, flags);
  LIVE.receiver = handler;
}

function channel(id, title, importance) {
  var made = new android.app.NotificationChannel(id, title, importance);
  manager().createNotificationChannel(made);
  return id;
}

function build(options, channelId, number) {
  var text = String(options.text || '');
  var builder = new android.app.Notification.Builder(context, channelId)
    .setSmallIcon(icon())
    .setContentTitle(String(options.title || 'Фокус'))
    .setContentText(text)
    .setStyle(new android.app.Notification.BigTextStyle().bigText(text))
    .setContentIntent(openIntent(options.open || 'modules/focus/ui/index.html', number))
    .setAutoCancel(!options.ongoing)
    .setOngoing(Boolean(options.ongoing))
    .setOnlyAlertOnce(Boolean(options.ongoing));
  if (options.when) {
    builder.setWhen(options.when).setShowWhen(true);
    if (options.countdown) builder.setUsesChronometer(true).setChronometerCountDown(true);
  }
  try {
    if ((options.actions || []).length) receiver();
    (options.actions || []).slice(0, 3).forEach(function (action, index) {
      var intent = new android.content.Intent(ACTION).setPackage(context.getPackageName()).putExtra('act', String(action.args.act));
      var pending = android.app.PendingIntent.getBroadcast(context, number * 10 + index, intent,
        android.app.PendingIntent.FLAG_IMMUTABLE | android.app.PendingIntent.FLAG_UPDATE_CURRENT);
      builder.addAction(new android.app.Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(context, icon()), String(action.title), pending).build());
    });
  } catch (error) {
    console.warn('focus: buttons in the notification: ' + error);
  }
  return builder.build();
}

function actions(list) {
  return (list || []).map(function (item) {
    return { title: item.title, call: 'modules/focus/main.js', fn: 'fromNotice', args: { act: item.act } };
  });
}

/**
 * The notification of a running session: "Фокус · Отчёт" with the system countdown to `when`
 * and the buttons [{ title, act }]. Through the shell when it has buttons, otherwise built here.
 */
exports.showSession = function (options) {
  if (exports.has('notify.actions')) {
    return assi.notify({
      id: SESSION_ID, title: options.title, text: options.text, open: options.open, ongoing: true, silent: true,
      channel: 'quiet', when: options.when, countdown: Boolean(options.when), actions: actions(options.buttons)
    });
  }
  channel(CHANNEL_SESSION, 'Фокус: идёт сессия', android.app.NotificationManager.IMPORTANCE_LOW);
  manager().notify(SESSION_NUMBER, build({
    title: options.title, text: options.text, open: options.open, ongoing: true, when: options.when, countdown: Boolean(options.when),
    actions: (options.buttons || []).map(function (item) { return { title: item.title, args: { act: item.act } }; })
  }, CHANNEL_SESSION, SESSION_NUMBER));
  return SESSION_NUMBER;
};

exports.hideSession = function () {
  if (exports.has('notify.actions')) {
    try { assi.notify.cancel(SESSION_ID); } catch (error) { /* gone */ }
  }
  try { manager().cancel(SESSION_NUMBER); } catch (error) { /* gone */ }
};

/** The notification at the end (with sound): "Фокус окончен: …", buttons [{ title, act }]. */
exports.notifyEnd = function (options) {
  var buttons = options.buttons || [];
  if (exports.has('notify.actions')) {
    return assi.notify({ id: 'focus:end', title: options.title, text: options.text, open: options.open, channel: 'normal', actions: actions(buttons) });
  }
  if (!buttons.length) return assi.notify({ title: options.title, text: options.text, open: options.open });
  channel(CHANNEL_END, 'Фокус: конец сессии', android.app.NotificationManager.IMPORTANCE_DEFAULT);
  manager().notify(END_NUMBER, build({
    title: options.title, text: options.text, open: options.open,
    actions: buttons.map(function (item) { return { title: item.title, args: { act: item.act } }; })
  }, CHANNEL_END, END_NUMBER));
  return END_NUMBER;
};

exports.hideEnd = function () {
  if (exports.has('notify.actions')) {
    try { assi.notify.cancel('focus:end'); } catch (error) { /* gone */ }
  }
  try { manager().cancel(END_NUMBER); } catch (error) { /* gone */ }
};

/**
 * A message that breaks through the silence (the people of the list, without the inbox): the
 * shell's alarm channel, or a channel of our own allowed to bypass "do not disturb" (that needs
 * access to the notification policy; without it the system keeps the channel quiet).
 */
exports.notifyThrough = function (options) {
  if (exports.has('notify.actions')) {
    return assi.notify({ title: options.title, text: options.text, open: options.open, channel: 'alarm' });
  }
  var made = new android.app.NotificationChannel('focus-through', 'Фокус: сквозь тишину', android.app.NotificationManager.IMPORTANCE_HIGH);
  try { made.setBypassDnd(true); } catch (error) { /* needs access to the policy */ }
  manager().createNotificationChannel(made);
  var number = 41100 + Math.abs(String(options.title).split('').reduce(function (h, c) { return (h * 31 + c.charCodeAt(0)) | 0; }, 7)) % 800;
  manager().notify(number, build({ title: options.title, text: options.text, open: options.open }, 'focus-through', number));
  return number;
};

/** A vibration by a pattern [pause, buzz, pause, …]. */
exports.vibrate = function (pattern) {
  if (exports.has('vibrate.pattern')) {
    assi.vibrate(pattern);
    return;
  }
  var timings = java.lang.reflect.Array.newInstance(java.lang.Long.TYPE, pattern.length);
  pattern.forEach(function (ms, i) { timings[i] = Math.max(0, Math.round(ms)); });
  context.getSystemService('vibrator').vibrate(android.os.VibrationEffect.createWaveform(timings, -1));
};

exports.toast = function (text) {
  assi.toast(text);
};

// ---- other apps ----------------------------------------------------------------------------------

/** Is the accessibility service of Assi on (on('screen.app') works, the home button can be pressed)? */
exports.screenOn = function () {
  try {
    var status = native('sense.status');
    return Boolean(status && status.screen);
  } catch (error) {
    return false;
  }
};

exports.noticesOn = function () {
  try {
    var status = native('sense.status');
    return Boolean(status && status.notices);
  } catch (error) {
    return Boolean(service());
  }
};

exports.home = function () {
  return native('screen.global', 'home');
};

/** Assi and the launcher: going there ends a permission to a distracting app. */
exports.ownPackages = function () {
  var list = [String(context.getPackageName())];
  if (!LIVE.launcher) {
    try {
      var intent = new android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_HOME);
      var found = context.getPackageManager().resolveActivity(intent, 0);
      LIVE.launcher = found && found.activityInfo ? String(found.activityInfo.packageName) : '';
    } catch (error) {
      LIVE.launcher = '';
    }
  }
  if (LIVE.launcher) list.push(LIVE.launcher);
  return list;
};

exports.label = function (pkg) {
  try {
    var pm = context.getPackageManager();
    return String(pm.getApplicationLabel(pm.getApplicationInfo(String(pkg), 0)));
  } catch (error) {
    return '';
  }
};

/** Apps with a launcher icon, for choosing the distracting ones: [{ package, app }]. */
exports.launchable = function () {
  var pm = context.getPackageManager();
  var intent = new android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_LAUNCHER);
  var found = pm.queryIntentActivities(intent, 0);
  var own = String(context.getPackageName());
  var seen = {};
  var out = [];
  for (var i = 0; i < found.size(); i++) {
    var info = found.get(i).activityInfo;
    var pkg = String(info.packageName);
    if (pkg === own || seen[pkg]) continue;
    seen[pkg] = true;
    out.push({ package: pkg, app: String(found.get(i).loadLabel(pm)) });
  }
  return out.sort(function (a, b) { return a.app.localeCompare(b.app); });
};

/** The usage events of a period (lib/usage.js), or null when there is no such library or access. */
exports.usageEvents = function (from, to) {
  if (!exports.has('usage') && !assi.files.exists('lib/usage.js')) return null;
  try {
    var usage = require('lib/usage');
    if (!usage.access()) return null;
    return usage.events(from, to);
  } catch (error) {
    return null;
  }
};

function canReadContacts() {
  try {
    return context.checkSelfPermission('android.permission.READ_CONTACTS') === 0;
  } catch (error) {
    return false;
  }
}

/** The contact's name for a phone number, or ''. Never asks for the permission. */
exports.contactName = function (number) {
  var value = String(number || '').trim();
  if (!/^[+\d][\d\s()-]{4,}$/.test(value) || !canReadContacts()) return '';
  try {
    var uri = android.net.Uri.withAppendedPath(android.provider.ContactsContract.PhoneLookup.CONTENT_FILTER_URI, android.net.Uri.encode(value));
    var rows = assi.rows(String(uri), ['display_name'], null, null, null, 1);
    return rows.length && rows[0].display_name ? String(rows[0].display_name) : '';
  } catch (error) {
    return '';
  }
};

exports.ownPackage = function () {
  return String(context.getPackageName());
};
