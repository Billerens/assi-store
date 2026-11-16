// One location fix, cheaply: the network provider first, GPS only when the network is not precise
// enough. Needs ACCESS_COARSE/FINE_LOCATION, and ACCESS_BACKGROUND_LOCATION for jobs while the app
// is closed. Coordinates never leave the phone.

exports.granted = function () {
  return context.checkSelfPermission('android.permission.ACCESS_FINE_LOCATION') === 0 ||
    context.checkSelfPermission('android.permission.ACCESS_COARSE_LOCATION') === 0;
};

exports.background = function () {
  return context.checkSelfPermission('android.permission.ACCESS_BACKGROUND_LOCATION') === 0;
};

var executor = null;

/** { lat, lon, acc, at, provider } or null when the provider gave nothing within timeoutMs. */
exports.current = function (provider, timeoutMs) {
  var manager = context.getSystemService('location');
  if (!manager || !manager.isProviderEnabled(provider)) return null;
  if (!executor) executor = java.util.concurrent.Executors.newSingleThreadExecutor();
  var latch = new java.util.concurrent.CountDownLatch(1);
  var box = { value: null };
  var signal = new android.os.CancellationSignal();
  manager.getCurrentLocation(provider, signal, executor, new java.util.function.Consumer({
    accept: function (location) {
      if (location) {
        box.value = {
          lat: Number(location.getLatitude()),
          lon: Number(location.getLongitude()),
          acc: location.hasAccuracy() ? Number(location.getAccuracy()) : 9999,
          at: Number(location.getTime()) || Date.now(),
          provider: provider
        };
      }
      latch.countDown();
    }
  }));
  if (!latch.await(timeoutMs || 20000, java.util.concurrent.TimeUnit.MILLISECONDS)) signal.cancel();
  return box.value;
};

/** A short name for the point from the system geocoder (street and house, or the area), or null. */
exports.name = function (lat, lon) {
  try {
    if (!android.location.Geocoder.isPresent()) return null;
    var geocoder = new android.location.Geocoder(context, java.util.Locale.getDefault());
    var list = geocoder.getFromLocation(lat, lon, 1);
    if (!list || list.isEmpty()) return null;
    var a = list.get(0);
    var street = a.getThoroughfare();
    var house = a.getSubThoroughfare();
    if (street) return String(street) + (house ? ', ' + String(house) : '');
    var name = a.getFeatureName() || a.getSubLocality() || a.getLocality();
    return name ? String(name) : null;
  } catch (error) {
    return null;
  }
};
