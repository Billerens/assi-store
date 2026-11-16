// Screen and app events of the phone. Uses lib/usage.js of the shell when it is there
// (docs/shell-changes.md, item 17); otherwise reads UsageStatsManager itself. Either way the
// events come as [{ time, type, package }] with the types of lib/usage.js.
var TYPES = { 1: 'resumed', 2: 'paused', 23: 'stopped', 15: 'screen-on', 16: 'screen-off', 18: 'unlock', 26: 'screen-off' };

function shellUsage() {
  try {
    var features = native('shell.features');
    if (Array.isArray(features) && features.indexOf('usage') >= 0) return require('lib/usage');
  } catch (error) { /* an older shell */ }
  return null;
}

/** Has the owner given the app access to usage statistics. */
exports.access = function () {
  var lib = shellUsage();
  if (lib && typeof lib.access === 'function') {
    try { return Boolean(lib.access()); } catch (error) { /* fall through */ }
  }
  try {
    var ops = context.getSystemService('appops');
    var mode = ops.unsafeCheckOpNoThrow('android:get_usage_stats', android.os.Process.myUid(), context.getPackageName());
    return mode === android.app.AppOpsManager.MODE_ALLOWED;
  } catch (error) {
    return false;
  }
};

/** Events between two moments. */
exports.events = function (since, until) {
  var lib = shellUsage();
  if (lib && typeof lib.events === 'function') {
    // fg-start/fg-stop are foreground services and notification is a notice: not the owner's use.
    var KEEP = { resumed: true, paused: true, stopped: true, 'screen-on': true, 'screen-off': true, unlock: true };
    return (lib.events(since, until) || []).filter(function (e) { return KEEP[e.type]; }).map(function (e) {
      return { time: Number(e.time), type: String(e.type), package: e.package ? String(e.package) : null };
    });
  }
  var manager = context.getSystemService('usagestats');
  var events = manager.queryEvents(since, until);
  var event = new android.app.usage.UsageEvents.Event();
  var out = [];
  while (events.hasNextEvent()) {
    events.getNextEvent(event);
    var type = TYPES[event.getEventType()];
    if (!type) continue;
    out.push({ time: Number(event.getTimeStamp()), type: type, package: String(event.getPackageName()) });
  }
  return out;
};

var labels = {};

/** The app's name as the launcher shows it. */
exports.label = function (pkg) {
  if (labels[pkg]) return labels[pkg];
  try {
    var pm = context.getPackageManager();
    labels[pkg] = String(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)));
  } catch (error) {
    labels[pkg] = pkg;
  }
  return labels[pkg];
};

/** Installed apps of the "social" category (ApplicationInfo.CATEGORY_SOCIAL). */
exports.socialPackages = function () {
  var out = {};
  try {
    var apps = context.getPackageManager().getInstalledApplications(0);
    var it = apps.iterator();
    while (it.hasNext()) {
      var info = it.next();
      if (info.category === android.content.pm.ApplicationInfo.CATEGORY_SOCIAL) out[String(info.packageName)] = true;
    }
  } catch (error) { /* nothing */ }
  return out;
};
