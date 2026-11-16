// The phone around «Игра дня»: which shell operations exist, the network, charging. Engine only
// (Rhino); tests put a stand-in in its place.
var cache = { features: null, at: 0 };

/** The shell operations added for the store modules (docs/shell-changes.md): ['notify.actions', …]. */
function features() {
  if (cache.features && Date.now() - cache.at < 60000) return cache.features;
  var list = [];
  try {
    var got = native('shell.features');
    list = Array.isArray(got) ? got.map(String) : [];
  } catch (error) {
    list = [];
  }
  cache.features = list;
  cache.at = Date.now();
  return list;
}

function has(feature) {
  return features().indexOf(feature) >= 0;
}

/** The internet answers (the network is validated by the system). */
function online() {
  try {
    var manager = context.getSystemService('connectivity');
    var network = manager.getActiveNetwork();
    if (!network) return false;
    var caps = manager.getNetworkCapabilities(network);
    return !!caps && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED);
  } catch (error) {
    return false;
  }
}

function charging() {
  try {
    return !!context.getSystemService('batterymanager').isCharging();
  } catch (error) {
    return false;
  }
}

/** Moves a folder of the workspace in one step (the same disk); false when it did not move. */
function moveDir(files, from, to) {
  var source = new java.io.File(files.path(from));
  var target = new java.io.File(files.path(to));
  if (!source.isDirectory() || target.exists()) return false;
  target.getParentFile().mkdirs();
  return !!source.renameTo(target);
}

exports.features = features;
exports.has = has;
exports.online = online;
exports.charging = charging;
exports.moveDir = moveDir;
