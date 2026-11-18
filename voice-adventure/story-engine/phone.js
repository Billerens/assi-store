// The phone around a story: network, charging, which shell operations exist, whether the owner
// is on a trip («Пассажир» of the game hub), whether a model for a role can answer now.
// Engine only (Rhino).
var axiko = require('lib/axiko');

var cache = { features: null, at: 0 };

/** The shell operations added for the store modules (docs/shell-changes.md): ['speech.render', …]. */
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

function capabilities() {
  var manager = context.getSystemService('connectivity');
  var network = manager.getActiveNetwork();
  if (!network) return null;
  return manager.getNetworkCapabilities(network);
}

/** The internet answers (the network is validated by the system). */
function online() {
  try {
    var caps = capabilities();
    return !!caps && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED);
  } catch (error) {
    return false;
  }
}

/** Online and not metered: Wi-Fi at home rather than the mobile network. */
function unmetered() {
  try {
    var caps = capabilities();
    return !!caps && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED) &&
      caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_METERED);
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

/** The game hub's «Пассажир» sees a trip now (data/games/links/passenger.json). */
function inTrip() {
  try {
    var state = axiko.files.readJson('data/games/links/passenger.json', null);
    return !!state && state.state === 'trip';
  } catch (error) {
    return false;
  }
}

/**
 * Can the model of this role answer now? {ok, local, why}. A model on the phone works without
 * the network once downloaded; any other needs the network.
 */
function model(role) {
  var target;
  try {
    target = native('models.resolve', role, false);
  } catch (error) {
    return { ok: false, local: false, why: 'для роли не выбрана модель' };
  }
  if (!target || !target.model) return { ok: false, local: false, why: 'для роли не выбрана модель' };
  var local = String(target.baseUrl || '').indexOf('local:') === 0;
  if (!local) return { ok: online(), local: false, why: online() ? '' : 'нет сети' };
  try {
    var installed = (native('local.status') || []).some(function (entry) {
      return entry.id === target.model && entry.installed;
    });
    return { ok: installed, local: true, why: installed ? '' : 'модель на телефоне не скачана' };
  } catch (error) {
    return { ok: false, local: true, why: 'модели на телефоне недоступны' };
  }
}

/** Speech recognition is downloaded and the voice can be heard. */
function speech() {
  try {
    var status = native('speech.status') || {};
    return { ready: !!(status.ready || status.system), speaking: !!status.speaking, listening: !!status.listening };
  } catch (error) {
    return { ready: false, speaking: false, listening: false };
  }
}

/** Headphones of any kind are connected. */
function headphones() {
  try {
    var manager = context.getSystemService('audio');
    var devices = manager.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS);
    var kinds = [3, 4, 7, 8, 22, 26, 27];   // wired headset/headphones, BT SCO/A2DP, USB headset, BLE headset/speaker
    for (var i = 0; i < devices.length; i++) {
      if (kinds.indexOf(Number(devices[i].getType())) >= 0) return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

/** Today as «2026-11-14» in the phone's time zone. */
function today(time) {
  var d = time ? new Date(time) : new Date();
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

exports.features = features;
exports.has = has;
exports.online = online;
exports.unmetered = unmetered;
exports.charging = charging;
exports.inTrip = inTrip;
exports.model = model;
exports.speech = speech;
exports.headphones = headphones;
exports.today = today;
