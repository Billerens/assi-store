// What the shell of Axiko can do beyond the first version (docs/shell-changes.md in Axiko), and the
// way round when it cannot: notifications with buttons, screen time of apps. Engine code.
var axiko = require('lib/axiko');

var known = null;
var knownAt = 0;

/** The shell's extra operations: an array of names; empty on a shell without them. */
function features() {
  if (known && Date.now() - knownAt < 60000) return known;
  try {
    var list = native('shell.features');
    known = Array.isArray(list) ? list.map(String) : [];
  } catch (error) {
    known = [];
  }
  knownAt = Date.now();
  return known;
}

function has(name) {
  return features().indexOf(name) >= 0;
}

/**
 * A notification. With the shell's buttons (notify.actions) it gets `actions`, its own `id` and
 * `silent`; without them it is a plain one that opens `open` on tap (buttons are left out).
 */
function notify(options) {
  var plain = { title: options.title, text: options.text, open: options.open, silent: options.silent };
  if (has('notify.actions')) {
    if (options.id !== undefined) plain.id = String(options.id);
    if (options.actions && options.actions.length) plain.actions = options.actions.slice(0, 3);
    return axiko.notify(plain);
  }
  return axiko.notify(plain);
}

/**
 * How many times an app was opened since `since` (ms): through lib/usage.js when the shell has it,
 * otherwise straight from UsageStatsManager. null when there is no access to usage data.
 */
function opens(pkg, since, until) {
  until = until || Date.now();
  if (has('usage')) {
    try {
      var usage = require('lib/usage');
      if (usage.access && !usage.access()) return null;
      var day = (usage.daily(since, until) || []).filter(function (item) { return item.package === pkg; })[0];
      return day ? Number(day.opens || 0) : 0;
    } catch (error) {
      // fall through to the direct way
    }
  }
  try {
    var ops = context.getSystemService('appops');
    var mode = ops.unsafeCheckOpNoThrow('android:get_usage_stats', android.os.Process.myUid(), context.getPackageName());
    if (mode !== android.app.AppOpsManager.MODE_ALLOWED) return null;
    var manager = context.getSystemService('usagestats');
    var events = manager.queryEvents(since, until);
    var event = new android.app.usage.UsageEvents.Event();
    var count = 0;
    var lastAway = 0;
    var inFront = false;
    while (events.hasNextEvent()) {
      events.getNextEvent(event);
      if (String(event.getPackageName()) !== pkg) continue;
      var type = event.getEventType();
      if (type === 1) {
        // A new opening when the app was away for more than a minute.
        if (!inFront && event.getTimeStamp() - lastAway > 60000) count++;
        inFront = true;
      } else if (type === 2 || type === 23) {
        inFront = false;
        lastAway = event.getTimeStamp();
      }
    }
    return count;
  } catch (error) {
    return null;
  }
}

exports.features = features;
exports.has = has;
exports.notify = notify;
exports.opens = opens;
