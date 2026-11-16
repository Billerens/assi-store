// The Android side of «Обои дня»: downloads, reading pictures without filling the memory,
// crops, the wallpaper itself, the reflection probe of the Fold's screens, place and network.
// Engine only (Rhino): no class, no async, no f(...args).

var assi = require('lib/assi');
var select = require('./select');
var fold = require('./fold');

var BitmapFactory = android.graphics.BitmapFactory;
var Bitmap = android.graphics.Bitmap;
var WallpaperManager = android.app.WallpaperManager;
var TimeUnit = java.util.concurrent.TimeUnit;

function abs(path) { return String(assi.files.path(path)); }

function message(error) {
  if (!error) return 'неизвестная ошибка';
  var text = error.message ? String(error.message) : String(error);
  return text.replace(/^(java\.[a-z.]+\.|android\.[a-z.]+\.)/, '');
}

exports.message = message;

// ---- shell features (docs/shell-changes.md) -----------------------------------------------------

/** What the shell can do beyond the first version; nothing when it does not know the question. */
exports.features = function () {
  try {
    var list = native('shell.features');
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
};

exports.has = function (name) { return exports.features().indexOf(name) >= 0; };

// ---- network ----------------------------------------------------------------------------------

var client = null;

function http() {
  if (!client) {
    client = new okhttp3.OkHttpClient.Builder()
      .connectTimeout(20, TimeUnit.SECONDS).readTimeout(90, TimeUnit.SECONDS).followRedirects(true).build();
  }
  return client;
}

function request(url, headers) {
  var builder = new okhttp3.Request.Builder().url(String(url));
  Object.keys(headers || {}).forEach(function (name) { builder.header(name, String(headers[name])); });
  return builder;
}

/** GET → { ok, status, json, text, error }: never throws. */
exports.getJson = function (url, headers) {
  try {
    var response = assi.http.get(url, headers);
    var out = { ok: response.ok, status: response.status, text: response.text, json: null };
    if (response.ok) {
      try {
        out.json = response.json();
      } catch (parse) {
        out.ok = false;
        out.error = 'ответ не JSON';
      }
    }
    return out;
  } catch (error) {
    return { ok: false, status: 0, text: '', json: null, error: 'нет связи: ' + message(error) };
  }
};

/**
 * Saves a picture to a file; refuses what is not a picture or is bigger than maxBytes.
 * Returns { path, bytes, type }.
 */
exports.download = function (url, path, headers, maxBytes) {
  var response = http().newCall(request(url, headers).build()).execute();
  var file = new java.io.File(abs(path));
  try {
    if (!response.isSuccessful()) throw new Error('файл не скачался: ответ ' + response.code());
    var body = response.body();
    var type = String(body.contentType() || '');
    if (type && !/^image\//.test(type)) throw new Error('по ссылке не картинка (' + type + ')');
    var length = Number(body.contentLength());
    if (maxBytes && length > maxBytes) throw new Error('файл ' + Math.round(length / 1048576) + ' МБ — больше предела');
    file.getParentFile().mkdirs();
    var input = body.byteStream();
    var output = new java.io.FileOutputStream(file);
    var buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 65536);
    var total = 0;
    try {
      while (true) {
        var read = input.read(buffer);
        if (read < 0) break;
        output.write(buffer, 0, read);
        total += read;
        if (maxBytes && total > maxBytes) throw new Error('файл больше предела ' + Math.round(maxBytes / 1048576) + ' МБ');
      }
    } finally {
      output.close();
      input.close();
    }
    return { path: path, bytes: total, type: type };
  } catch (error) {
    try { file['delete'](); } catch (ignored) { /* nothing to remove */ }
    throw error;
  } finally {
    response.close();
  }
};

/** The first bytes of a file on the net (a Range request) as numbers 0..255: enough to read its size. */
exports.headBytes = function (url, count, headers) {
  var builder = request(url, headers).header('Range', 'bytes=0-' + (count - 1));
  var response = http().newCall(builder.build()).execute();
  try {
    if (!response.isSuccessful()) return null;
    var input = response.body().byteStream();
    var buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, count);
    var filled = 0;
    while (filled < count) {
      var read = input.read(buffer, filled, count - filled);
      if (read < 0) break;
      filled += read;
    }
    input.close();
    var out = [];
    for (var i = 0; i < filled; i++) out.push(buffer[i] & 255);
    return out;
  } finally {
    response.close();
  }
};

/** A GET that only has to happen (Unsplash asks to be told about each download). */
exports.ping = function (url, headers) {
  try {
    var response = http().newCall(request(url, headers).build()).execute();
    var ok = response.isSuccessful();
    response.close();
    return ok;
  } catch (error) {
    return false;
  }
};

/** { online, wifi } now. */
exports.network = function () {
  try {
    var manager = context.getSystemService('connectivity');
    var active = manager.getActiveNetwork();
    if (!active) return { online: false, wifi: false };
    var caps = manager.getNetworkCapabilities(active);
    if (!caps) return { online: false, wifi: false };
    return {
      online: caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET),
      wifi: caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET)
    };
  } catch (error) {
    return { online: true, wifi: false, error: message(error) };
  }
};

// ---- place ------------------------------------------------------------------------------------

exports.hasLocationPermission = function () {
  return context.checkSelfPermission('android.permission.ACCESS_COARSE_LOCATION') === 0 ||
    context.checkSelfPermission('android.permission.ACCESS_FINE_LOCATION') === 0;
};

/** The last place the phone knew (no new fix is asked for): { latitude, longitude, at } or { error }. */
exports.lastLocation = function () {
  if (!exports.hasLocationPermission()) return { error: 'нет разрешения на местоположение' };
  try {
    var manager = context.getSystemService('location');
    var providers = js(manager.getProviders(true)) || [];
    var best = null;
    providers.forEach(function (provider) {
      try {
        var seen = manager.getLastKnownLocation(provider);
        if (seen && (!best || seen.getTime() > best.getTime())) best = seen;
      } catch (ignored) { /* that provider is not allowed */ }
    });
    if (!best) return { error: 'телефон ещё не знает, где он' };
    return { latitude: Number(best.getLatitude()), longitude: Number(best.getLongitude()), at: Number(best.getTime()) };
  } catch (error) {
    return { error: message(error) };
  }
};

// ---- pictures ---------------------------------------------------------------------------------

/** Width, height and type of a picture file without reading it whole. */
exports.bounds = function (path) {
  var options = new BitmapFactory.Options();
  options.inJustDecodeBounds = true;
  BitmapFactory.decodeFile(abs(path), options);
  return { width: Number(options.outWidth), height: Number(options.outHeight), mime: String(options.outMimeType || '') };
};

function sampled(path, minSide) {
  var size = exports.bounds(path);
  if (size.width <= 0 || size.height <= 0) return null;
  var sample = 1;
  while (Math.min(size.width, size.height) / (sample * 2) >= minSide) sample *= 2;
  var options = new BitmapFactory.Options();
  options.inSampleSize = sample;
  return BitmapFactory.decodeFile(abs(path), options);
}

function grays(bitmap, width, height) {
  var pixels = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, width * height);
  bitmap.getPixels(pixels, 0, width, 0, 0, width, height);
  var out = [];
  for (var i = 0; i < width * height; i++) out.push(select.luma(pixels[i]));
  return out;
}

/** Brightness, sharpness of the middle and dHash of a picture (a thumbnail is enough). */
exports.analyze = function (path) {
  var bitmap = sampled(path, 64);
  if (!bitmap) return null;
  try {
    var square = Bitmap.createScaledBitmap(bitmap, 32, 32, true);
    var hash = Bitmap.createScaledBitmap(bitmap, 9, 8, true);
    var gray = grays(square, 32, 32);
    var out = {
      brightness: select.brightness(gray),
      contrast: select.centerContrast(gray, 32),
      dhash: select.dhash(grays(hash, 9, 8))
    };
    square.recycle();
    hash.recycle();
    return out;
  } finally {
    bitmap.recycle();
  }
};

function save(bitmap, path, quality, png) {
  var file = new java.io.File(abs(path));
  file.getParentFile().mkdirs();
  var output = new java.io.FileOutputStream(file);
  try {
    bitmap.compress(png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, Math.round(quality || 92), output);
  } finally {
    output.close();
  }
  return path;
}

/**
 * Cuts rect out of a big picture and scales it to width×height: only that part is read, with
 * inSampleSize, so a 8000-pixel original never sits in memory whole.
 */
exports.crop = function (source, rect, width, height, target, quality, maxPixels) {
  var sample = select.sampleSize(rect.width, rect.height, width, height, maxPixels);
  var options = new BitmapFactory.Options();
  options.inSampleSize = sample;
  options.inPreferredConfig = Bitmap.Config.ARGB_8888;
  var part = null;
  try {
    var decoder = android.graphics.BitmapRegionDecoder.newInstance(abs(source), false);
    try {
      part = decoder.decodeRegion(new android.graphics.Rect(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height), options);
    } finally {
      decoder.recycle();
    }
  } catch (regionError) {
    part = null;
  }
  if (!part) {
    // A format the region decoder does not take: read it sampled whole and cut.
    var whole = BitmapFactory.decodeFile(abs(source), options);
    if (!whole) throw new Error('картинка не читается');
    var x = Math.floor(rect.x / sample);
    var y = Math.floor(rect.y / sample);
    var w = Math.min(whole.getWidth() - x, Math.floor(rect.width / sample));
    var h = Math.min(whole.getHeight() - y, Math.floor(rect.height / sample));
    part = Bitmap.createBitmap(whole, x, y, w, h);
    if (part !== whole) whole.recycle();
  }
  var scaled = Bitmap.createScaledBitmap(part, Math.round(width), Math.round(height), true);
  if (scaled !== part) part.recycle();
  try {
    save(scaled, target, quality, false);
  } finally {
    scaled.recycle();
  }
  return { path: target, sample: sample };
};

/** A smaller copy (keeps proportions) of width `side`. */
exports.shrink = function (source, side, target, quality, png) {
  var bitmap = sampled(source, side);
  if (!bitmap) throw new Error('картинка не читается: ' + source);
  var height = Math.max(1, Math.round(bitmap.getHeight() * side / bitmap.getWidth()));
  var scaled = Bitmap.createScaledBitmap(bitmap, Math.round(side), height, true);
  if (scaled !== bitmap) bitmap.recycle();
  try {
    save(scaled, target, quality, png);
  } finally {
    scaled.recycle();
  }
  return target;
};

/** A thumbnail as a data: URL for a model that looks at pictures (its longer side = side). */
exports.dataUrl = function (path, side) {
  var bitmap = sampled(path, side);
  if (!bitmap) throw new Error('картинка не читается: ' + path);
  var scale = side / Math.max(bitmap.getWidth(), bitmap.getHeight());
  var scaled = scale < 1 ? Bitmap.createScaledBitmap(bitmap, Math.max(1, Math.round(bitmap.getWidth() * scale)), Math.max(1, Math.round(bitmap.getHeight() * scale)), true) : bitmap;
  var bytes = new java.io.ByteArrayOutputStream();
  scaled.compress(Bitmap.CompressFormat.JPEG, 82, bytes);
  if (scaled !== bitmap) scaled.recycle();
  bitmap.recycle();
  return 'data:image/jpeg;base64,' + String(android.util.Base64.encodeToString(bytes.toByteArray(), android.util.Base64.NO_WRAP));
};

// ---- the wallpaper ----------------------------------------------------------------------------

/** May the app set wallpapers at all: { declared, granted, supported, allowed }. */
exports.canSet = function () {
  var out = { declared: false, granted: false, supported: false, allowed: false };
  try {
    var info = context.getPackageManager().getPackageInfo(context.getPackageName(), android.content.pm.PackageManager.GET_PERMISSIONS);
    var asked = info.requestedPermissions || [];
    for (var i = 0; i < asked.length; i++) if (String(asked[i]) === 'android.permission.SET_WALLPAPER') out.declared = true;
  } catch (ignored) { /* unknown */ }
  out.granted = context.checkSelfPermission('android.permission.SET_WALLPAPER') === 0;
  try {
    var manager = WallpaperManager.getInstance(context);
    out.supported = Boolean(manager.isWallpaperSupported());
    out.allowed = Boolean(manager.isSetWallpaperAllowed());
  } catch (error) {
    out.error = message(error);
  }
  out.ok = out.granted && out.supported && out.allowed;
  return out;
};

function decode(path) {
  var bitmap = BitmapFactory.decodeFile(abs(path));
  if (!bitmap) throw new Error('не читается ' + path);
  return bitmap;
}

function setOne(manager, path, which) {
  var bitmap = decode(path);
  try {
    // Rhino unwraps Integer.valueOf into a JS number: calling .intValue() then fails.
    // Select the Rect overload explicitly; recent Android versions also expose crop-map overloads.
    var id = manager['setBitmap(android.graphics.Bitmap,android.graphics.Rect,boolean,int)'](bitmap, null, true, Number(which));
    if (!id) throw new Error('система не приняла обои');
    return Number(id);
  } finally {
    bitmap.recycle();
  }
}

function hasMethod(object, name) {
  var methods = object.getClass().getMethods();
  for (var i = 0; i < methods.length; i++) if (String(methods[i].getName()) === name) return true;
  return false;
}

/**
 * The orientation keys of the crops are hidden constants of WallpaperManager; read them when the
 * system lets reflection see them, else the AOSP values (to be confirmed on the phone by eye).
 */
function orientation(name, aosp) {
  try {
    var field = java.lang.Class.forName('android.app.WallpaperManager').getField(name);
    return Number(field.getInt(null));
  } catch (hidden) {
    return aosp;
  }
}

/**
 * One picture with a crop for every screen size (Android 15+): the two crops side by side in
 * one bitmap, and a map "screen size → its part". The system picks the part by the display.
 */
function setWithCrops(manager, files, sizes, which) {
  var inner = decode(files.inner);
  var cover = decode(files.cover);
  var width = inner.getWidth() + cover.getWidth();
  var height = Math.max(inner.getHeight(), cover.getHeight());
  var sheet = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
  try {
    var canvas = new android.graphics.Canvas(sheet);
    canvas.drawBitmap(inner, 0, 0, null);
    canvas.drawBitmap(cover, inner.getWidth(), 0, null);
    var innerRect = new android.graphics.Rect(0, 0, inner.getWidth(), inner.getHeight());
    var coverRect = new android.graphics.Rect(inner.getWidth(), 0, width, cover.getHeight());
    var flags = Number(which);
    var id;
    if (hasMethod(manager, 'setBitmapWithCrops')) {
      var crops = new java.util.HashMap();
      crops.put(new android.graphics.Point(sizes.innerWidth, sizes.innerHeight), innerRect);
      crops.put(new android.graphics.Point(sizes.coverWidth, sizes.coverHeight), coverRect);
      id = manager.setBitmapWithCrops(sheet, crops, true, flags);
    } else {
      // Keyed by orientation: the tall cover screen is "portrait", the near-square inner one
      // "square portrait" (and "square landscape" when turned).
      var byOrientation = new android.util.SparseArray();
      byOrientation.put(orientation('PORTRAIT', 0), coverRect);
      byOrientation.put(orientation('SQUARE_PORTRAIT', 2), innerRect);
      byOrientation.put(orientation('SQUARE_LANDSCAPE', 3), innerRect);
      var bytes = new java.io.ByteArrayOutputStream();
      sheet.compress(Bitmap.CompressFormat.PNG, 100, bytes);
      id = manager.setStreamWithCrops(new java.io.ByteArrayInputStream(bytes.toByteArray()), byOrientation, true, flags);
    }
    if (!id) throw new Error('система не приняла обои с кадрированиями');
    return Number(id);
  } finally {
    inner.recycle();
    cover.recycle();
    sheet.recycle();
  }
}

/**
 * Puts the crops on the screens: plan { mode: 'crops' | 'flag' | 'single', flag }, files
 * { inner, cover }, want { inner, cover, lock, lockShot: 'inner' | 'cover' }, sizes (settings).
 * Returns { ok, mode, screens: [...], error, fallback }.
 */
exports.setWallpaper = function (plan, files, want, sizes) {
  var manager = WallpaperManager.getInstance(context);
  var SYSTEM = WallpaperManager.FLAG_SYSTEM;
  var LOCK = WallpaperManager.FLAG_LOCK;
  var screens = [];
  var mode = plan.mode;
  try {
    if (mode === 'crops' && (want.inner || want.cover)) {
      try {
        setWithCrops(manager, files, sizes, SYSTEM | (want.lock ? LOCK : 0));
        if (want.inner) screens.push('inner');
        if (want.cover) screens.push('cover');
        if (want.lock) screens.push('lock');
        return { ok: true, mode: 'crops', screens: screens };
      } catch (cropsError) {
        // Not there or not working on this firmware: one shot on both screens instead.
        mode = 'single';
        screens = [];
        var failedCrops = message(cropsError);
      }
    }
    if (mode === 'flag' && plan.flag) {
      if (want.inner) {
        setOne(manager, files.inner, SYSTEM);
        screens.push('inner');
      }
      if (want.cover) {
        setOne(manager, files.cover, plan.flag.which || plan.flag.value);
        screens.push('cover');
      }
    } else if (want.inner || want.cover) {
      setOne(manager, want.inner ? files.inner : files.cover, SYSTEM);
      screens.push(want.inner ? 'inner' : 'cover');
      if (want.inner && want.cover) screens.push('cover');
    }
    if (want.lock) {
      setOne(manager, want.lockShot === 'cover' ? files.cover : files.inner, LOCK);
      screens.push('lock');
    }
    return { ok: true, mode: mode, screens: screens, cropsFailed: failedCrops || null };
  } catch (error) {
    var denied = error && /SecurityException|permission/i.test(String(error.message || error));
    return { ok: false, mode: mode, screens: screens, error: denied ? 'нет разрешения SET_WALLPAPER' : message(error), denied: denied, cropsFailed: failedCrops || null };
  }
};

/**
 * The way without the permission: the picture goes to the phone's gallery (Pictures/Assi), and
 * the system's own "set as wallpaper" screen opens — the owner taps «Установить» himself.
 * Needs the app in front (Android does not open screens from the background).
 */
exports.openSetIntent = function (path, name, oldUri) {
  var resolver = context.getContentResolver();
  var MediaStore = android.provider.MediaStore;
  if (oldUri) {
    try { resolver['delete'](android.net.Uri.parse(oldUri), null, null); } catch (ignored) { /* gone already */ }
  }
  var values = new android.content.ContentValues();
  values.put(MediaStore.MediaColumns.DISPLAY_NAME, String(name));
  values.put(MediaStore.MediaColumns.MIME_TYPE, 'image/jpeg');
  values.put(MediaStore.MediaColumns.RELATIVE_PATH, 'Pictures/Assi');
  var uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
  if (!uri) throw new Error('не удалось положить картинку в галерею');
  var output = resolver.openOutputStream(uri);
  try {
    java.nio.file.Files.copy(new java.io.File(abs(path)).toPath(), output);
  } finally {
    output.close();
  }
  var Intent = android.content.Intent;
  var flags = Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION;
  var starter = host.activity || context;
  try {
    var intent = WallpaperManager.getInstance(context).getCropAndSetWallpaperIntent(uri);
    intent.addFlags(flags);
    starter.startActivity(intent);
    return { uri: String(uri), screen: 'crop' };
  } catch (error) {
    var attach = new Intent(Intent.ACTION_ATTACH_DATA);
    attach.setDataAndType(uri, 'image/jpeg');
    attach.putExtra('mimeType', 'image/jpeg');
    attach.addFlags(flags);
    var chooser = Intent.createChooser(attach, 'Установить как обои');
    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    starter.startActivity(chooser);
    return { uri: String(uri), screen: 'attach' };
  }
};

// ---- the Fold's screens -----------------------------------------------------------------------

/**
 * Looks inside WallpaperManager by reflection for anything that sets a wallpaper on one
 * display (Samsung adds hidden flags and "sem" methods). Hidden members the system does not
 * let apps see are simply absent from the lists — that is a finding too.
 */
exports.probeFold = function () {
  var out = {
    at: Date.now(),
    sdk: Number(android.os.Build.VERSION.SDK_INT),
    device: String(android.os.Build.MANUFACTURER) + ' ' + String(android.os.Build.MODEL),
    fields: [], methods: [], errors: [], shell: null
  };
  var Modifier = java.lang.reflect.Modifier;
  try {
    var type = java.lang.Class.forName('android.app.WallpaperManager');
    var fields = type.getDeclaredFields();
    for (var i = 0; i < fields.length; i++) {
      var name = String(fields[i].getName());
      if (!fold.interesting(name)) continue;
      var isStatic = Modifier.isStatic(fields[i].getModifiers());
      var value = null;
      if (isStatic) {
        try {
          fields[i].setAccessible(true);
          var raw = fields[i].get(null);
          // Field.get gives boxed Java values: an Integer must become a JS number for fold.summarize.
          if (raw === null || raw === undefined) value = null;
          else if (typeof raw === 'number' || raw instanceof java.lang.Number) value = Number(String(raw));
          else if (typeof raw === 'boolean' || raw instanceof java.lang.Boolean) value = String(raw) === 'true';
          else value = String(raw).slice(0, 200);
        } catch (denied) {
          value = null;
        }
      }
      out.fields.push({ name: name, value: value, isStatic: Boolean(isStatic), type: String(fields[i].getType().getName()) });
    }
    var methods = type.getDeclaredMethods();
    for (var j = 0; j < methods.length; j++) {
      var methodName = String(methods[j].getName());
      if (!fold.interesting(methodName)) continue;
      var params = methods[j].getParameterTypes();
      var names = [];
      for (var k = 0; k < params.length; k++) names.push(String(params[k].getName()));
      out.methods.push({ name: methodName, params: names, isPublic: Modifier.isPublic(methods[j].getModifiers()) });
    }
  } catch (error) {
    out.errors.push('отражение: ' + message(error));
  }
  // The description asks to look for a shell command that sets a wallpaper (needs Shizuku).
  try {
    var shizuku = native('shizuku.status');
    if (shizuku && shizuku.running && shizuku.granted) {
      var result = assi.shell('cmd wallpaper help 2>&1 | head -40', { privileged: true, timeout: 15 });
      out.shell = String(result.out || '').slice(0, 3000);
    } else {
      out.shell = 'Shizuku не запущен — команда cmd wallpaper не проверялась';
    }
  } catch (shellError) {
    out.shell = 'cmd wallpaper: ' + message(shellError);
  }
  return out;
};

/** Sets the outer-screen crop with a found flag, so the owner can look at the folded phone. */
exports.testFlag = function (path, which) {
  var manager = WallpaperManager.getInstance(context);
  return setOne(manager, path, which);
};

/** The size of the screen in front now, in pixels: { width, height }. */
exports.screenNow = function () {
  var activity = host.activity;
  var manager = activity ? activity.getWindowManager() : context.getSystemService('window');
  var bounds = manager.getMaximumWindowMetrics().getBounds();
  return { width: Number(bounds.width()), height: Number(bounds.height()) };
};
