// Places: visits from location fixes, map cells, home and work. Pure.
// Coordinates stay on the phone: nothing here leaves the module except names and counts.
var T = require('./time.js');

var BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Geohash of a point; precision 7 is a cell about 150 × 150 m. */
exports.geohash = function (lat, lon, precision) {
  var latRange = [-90, 90];
  var lonRange = [-180, 180];
  var hash = '';
  var bits = 0;
  var bit = 0;
  var even = true;
  var length = precision || 7;
  while (hash.length < length) {
    var range = even ? lonRange : latRange;
    var value = even ? lon : lat;
    var mid = (range[0] + range[1]) / 2;
    if (value >= mid) {
      bits = bits * 2 + 1;
      range[0] = mid;
    } else {
      bits = bits * 2;
      range[1] = mid;
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32.charAt(bits);
      bits = 0;
      bit = 0;
    }
  }
  return hash;
};

/** The centre of a geohash cell: { lat, lon }. */
exports.decode = function (hash) {
  var latRange = [-90, 90];
  var lonRange = [-180, 180];
  var even = true;
  for (var i = 0; i < hash.length; i++) {
    var n = BASE32.indexOf(hash.charAt(i));
    for (var b = 4; b >= 0; b--) {
      var range = even ? lonRange : latRange;
      var mid = (range[0] + range[1]) / 2;
      if ((n >> b) & 1) range[0] = mid; else range[1] = mid;
      even = !even;
    }
  }
  return { lat: (latRange[0] + latRange[1]) / 2, lon: (lonRange[0] + lonRange[1]) / 2 };
};

/** Distance in kilometres. */
exports.distance = function (lat1, lon1, lat2, lon2) {
  var rad = Math.PI / 180;
  var dLat = (lat2 - lat1) * rad;
  var dLon = (lon2 - lon1) * rad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * One more fix into the tracker. cluster: { lat, lon, start, last, n, visit, baseId, place } or
 * null; fix: { lat, lon, at, acc }; opts: { radius (m), minStay (min) }.
 * → { cluster (the open one now), closed (the cluster that ended, or null), started (true when
 *     the open cluster just became a visit) }
 */
exports.track = function (cluster, fix, opts) {
  var radiusKm = (opts.radius || 150) / 1000;
  var minStay = (opts.minStay || 10) * 60000;
  if (cluster && exports.distance(cluster.lat, cluster.lon, fix.lat, fix.lon) <= radiusKm) {
    var n = cluster.n + 1;
    var next = {};
    Object.keys(cluster).forEach(function (key) { next[key] = cluster[key]; });
    next.lat = cluster.lat + (fix.lat - cluster.lat) / n;
    next.lon = cluster.lon + (fix.lon - cluster.lon) / n;
    next.n = n;
    next.last = Math.max(cluster.last, fix.at);
    var started = !cluster.visit && next.last - next.start >= minStay;
    if (started) next.visit = true;
    return { cluster: next, closed: null, started: started };
  }
  var fresh = { lat: fix.lat, lon: fix.lon, start: fix.at, last: fix.at, n: 1, visit: false, baseId: null, place: null };
  return { cluster: fresh, closed: cluster || null, started: false };
};

/** The known place nearest to the point within its radius, or null. places: [{ id, lat, lon, radius }]. */
exports.match = function (places, lat, lon, radiusM) {
  var best = null;
  var bestKm = Infinity;
  (places || []).forEach(function (place) {
    var km = exports.distance(place.lat, place.lon, lat, lon);
    var limit = (place.radius || radiusM || 150) / 1000;
    if (km <= limit && km < bestKm) {
      best = place;
      bestKm = km;
    }
  });
  return best;
};

/**
 * Home and work from visits: home — the place with the most night hours (00:00–06:00), work —
 * the most weekday daytime hours (10:00–17:00), not home. visits: [{ place, start, end }].
 * → { home: placeId | null, work: placeId | null, hours: { placeId: { night, work } } }
 */
exports.guess = function (visits, opts) {
  var nightFrom = (opts && opts.nightFrom) || '00:00';
  var nightTo = (opts && opts.nightTo) || '06:00';
  var workFrom = (opts && opts.workFrom) || '10:00';
  var workTo = (opts && opts.workTo) || '17:00';
  var minHours = (opts && opts.minHours) || 3;
  var hours = {};
  (visits || []).forEach(function (visit) {
    if (!visit.place || !(visit.end > visit.start)) return;
    var h = hours[visit.place] || (hours[visit.place] = { night: 0, work: 0 });
    var date = T.ymd(visit.start);
    var last = T.ymd(visit.end);
    for (var guard = 0; date <= last && guard < 60; guard++, date = T.addDays(date, 1)) {
      h.night += T.overlap(visit.start, visit.end, T.at(date, nightFrom), T.at(date, nightTo)) / 3600000;
      if (T.weekday(date) <= 5) h.work += T.overlap(visit.start, visit.end, T.at(date, workFrom), T.at(date, workTo)) / 3600000;
    }
  });
  var home = null;
  var work = null;
  Object.keys(hours).forEach(function (id) {
    if (hours[id].night >= minHours && (!home || hours[id].night > hours[home].night)) home = id;
  });
  Object.keys(hours).forEach(function (id) {
    if (id === home) return;
    if (hours[id].work >= minHours && (!work || hours[id].work > hours[work].work)) work = id;
  });
  return { home: home, work: work, hours: hours };
};
