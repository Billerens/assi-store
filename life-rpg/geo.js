// Cells of the map: geohash (precision 7 ≈ 150 × 150 m). Pure: the engine, the screen (as a
// plain script, window.Geo) and node run the same code.
(function (out) {
  var BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

  /** Latitude and longitude → a geohash of that precision. */
  out.encode = function (lat, lon, precision) {
    precision = precision || 7;
    var latRange = [-90, 90];
    var lonRange = [-180, 180];
    var hash = '';
    var bits = 0;
    var value = 0;
    var even = true;
    while (hash.length < precision) {
      var range = even ? lonRange : latRange;
      var coord = even ? lon : lat;
      var mid = (range[0] + range[1]) / 2;
      if (coord >= mid) {
        value = (value << 1) | 1;
        range[0] = mid;
      } else {
        value = value << 1;
        range[1] = mid;
      }
      even = !even;
      if (++bits === 5) {
        hash += BASE32.charAt(value);
        bits = 0;
        value = 0;
      }
    }
    return hash;
  };

  /** A geohash → its box { south, west, north, east } and center { lat, lon }. */
  out.decode = function (hash) {
    var latRange = [-90, 90];
    var lonRange = [-180, 180];
    var even = true;
    String(hash).toLowerCase().split('').forEach(function (ch) {
      var value = BASE32.indexOf(ch);
      if (value < 0) return;
      for (var bit = 4; bit >= 0; bit--) {
        var range = even ? lonRange : latRange;
        var mid = (range[0] + range[1]) / 2;
        if ((value >> bit) & 1) range[0] = mid; else range[1] = mid;
        even = !even;
      }
    });
    return {
      south: latRange[0], north: latRange[1], west: lonRange[0], east: lonRange[1],
      lat: (latRange[0] + latRange[1]) / 2, lon: (lonRange[0] + lonRange[1]) / 2
    };
  };

  /** Distance in km between two points. */
  out.distance = function (lat1, lon1, lat2, lon2) {
    var rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad;
    var dLon = (lon2 - lon1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  /** The box around many cells. */
  out.bounds = function (cells) {
    var box = null;
    cells.forEach(function (cell) {
      var b = out.decode(cell);
      if (!box) box = { south: b.south, west: b.west, north: b.north, east: b.east };
      else {
        box.south = Math.min(box.south, b.south);
        box.west = Math.min(box.west, b.west);
        box.north = Math.max(box.north, b.north);
        box.east = Math.max(box.east, b.east);
      }
    });
    return box;
  };
})(typeof exports !== 'undefined' ? exports : (window.Geo = {}));
