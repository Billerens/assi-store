// A pretend Assi engine for main.js under node: workspace files in memory, SQLite in memory
// (node:sqlite, Node 22.13+), jobs, events, notifications, a clock the test moves, and a pretend
// phone in place of android.js: the APIs answer with the saved answers from samples/, pictures
// are strings, the wallpaper calls are written down.
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var DatabaseSync = require('node:sqlite').DatabaseSync;

var ROOT = path.join(__dirname, '..');
var RealDate = Date;

function sample(name) { return JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', name + '.json'), 'utf8')); }

function plain(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function clockDate(clock) {
  function FakeDate(a, b, c, d, e, f, g) {
    if (!(this instanceof FakeDate)) return new RealDate(clock.now).toString();
    if (arguments.length === 0) return new RealDate(clock.now);
    if (arguments.length === 1) return new RealDate(a);
    return new RealDate(a, b, c === undefined ? 1 : c, d || 0, e || 0, f || 0, g || 0);
  }
  FakeDate.now = function () { return clock.now; };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;
  return FakeDate;
}

function jpegHead(width, height) {
  var bytes = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
  for (var i = 0; i < 14; i++) bytes.push(0);
  bytes.push(0xFF, 0xC0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 3);
  for (var j = 0; j < 12; j++) bytes.push(0);
  return bytes;
}

/**
 * options (all may change during a test through engine.options):
 *   now ('2026-11-14T07:00:00'), features ([] | null), network ({ online, wifi }), offline (true),
 *   location ({ latitude, longitude } | undefined), weatherCode (3), canSet ({ ok, … }),
 *   setFails (error text), brokenOriginals ([url part]), originalSize ({ width, height }),
 *   brightness (fn(url) → 0..1), model (fn(options) → answer | null: no model), vision (true),
 *   holidays ({ occasionToday } | undefined), granted (permission answer), onEmit (fn(name, data)),
 *   answers ({ source: fn(url) → { ok, status, json, text } }), health ({ today, goals } | undefined),
 *   achievements ({ grant } | undefined), unsplashCountry (the country on an Unsplash photo's own page),
 *   pet (data/pet/state.json of «Питомец» — { state, date } | undefined: no pet).
 */
exports.make = function (options) {
  options = options || {};
  var clock = { now: RealDate.parse(options.now || '2026-11-14T07:00:00') };
  var FakeDate = clockDate(clock);
  var disk = {};
  if (options.health) disk['modules/health/main.js'] = '// pretend';
  if (options.achievements) disk['modules/achievements/main.js'] = '// pretend';
  if (options.pet) {
    disk['modules/pet/main.js'] = '// pretend';
    disk['data/pet/state.json'] = JSON.stringify(options.pet);
  }
  var log = { notify: [], jobs: {}, on: {}, emits: [], requests: [], downloads: [], crops: [], sets: [], intents: [], flags: [], pings: [],
    memory: [], asks: [], widget: 0, opened: [], secrets: {} };

  // ---- the workspace -------------------------------------------------------------------------
  function under(p) { return Object.keys(disk).filter(function (key) { return key === p || key.indexOf(p + '/') === 0; }); }
  var files = {
    path: function (p) { return '/workspace/' + p; },
    read: function (p) { if (!(p in disk)) throw new Error('нет файла ' + p); return disk[p]; },
    write: function (p, text) { disk[p] = String(text); },
    exists: function (p) { return under(p).length > 0; },
    list: function (p) { return under(p).map(function (key) { return key.slice(p.length + 1).split('/')[0]; }); },
    remove: function (p) { var keys = under(p); keys.forEach(function (key) { delete disk[key]; }); return keys.length > 0; },
    readJson: function (p, fallback) { return p in disk ? JSON.parse(disk[p]) : fallback; },
    writeJson: function (p, value) { disk[p] = JSON.stringify(value, null, 1); }
  };

  // ---- SQLite with the engine's habit of passing query arguments as strings --------------------
  var databases = {};
  function database(name) {
    if (databases[name]) return databases[name];
    var sql = new DatabaseSync(':memory:');
    var handle = {
      exec: function (statement, args) {
        if (!args || !args.length) { sql.exec(statement); return; }
        var prepared = sql.prepare(statement);
        prepared.run.apply(prepared, args.map(function (v) {
          return v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v;
        }));
      },
      query: function (statement, args) {
        var prepared = sql.prepare(statement);
        return prepared.all.apply(prepared, (args || []).map(function (v) { return v === null || v === undefined ? null : String(v); }))
          .map(function (row) { return Object.assign({}, row); });
      },
      lastId: function () { return handle.query('select last_insert_rowid() as id')[0].id; }
    };
    databases[name] = handle;
    return handle;
  }

  var assi = {
    files: files,
    db: database,
    notify: function (o) { log.notify.push(plain(o)); return String(o.id || log.notify.length); },
    permission: function (names) { log.asks.push(names); return options.granted !== false; },
    openUrl: function (url) { log.opened.push(url); },
    widget: { refresh: function () { log.widget++; } },
    secret: {
      get: function (name) { return log.secrets[name] === undefined ? null : log.secrets[name]; },
      ask: function (name) { log.secrets[name] = 'typed-' + name; return true; },
      set: function (name, value) { log.secrets[name] = String(value); },
      remove: function (name) { delete log.secrets[name]; }
    }
  };

  // ---- the pretend phone (android.js) ------------------------------------------------------------
  function route(url) {
    if (/commons\.wikimedia\.org\/w\/api\.php/.test(url)) return 'commons';
    if (/api\.openverse\.org/.test(url)) return 'openverse';
    if (/images-api\.nasa\.gov/.test(url)) return 'nasa-images';
    if (/api\.nasa\.gov\/planetary\/apod/.test(url)) return 'apod';
    if (/artic\.edu\/iiif\/.+\/info\.json/.test(url)) return 'aic-info';
    if (/api\.artic\.edu/.test(url)) return 'aic';
    if (/api\.unsplash\.com\/photos\/[^/?]+$/.test(url)) return 'unsplash-photo';
    if (/api\.unsplash\.com/.test(url)) return 'unsplash';
    if (/api\.pexels\.com/.test(url)) return 'pexels';
    if (/geocoding-api\.open-meteo\.com/.test(url)) return 'geocoding';
    if (/api\.open-meteo\.com/.test(url)) return 'open-meteo';
    return 'unknown';
  }
  var SAMPLE = { apod: 'apod-placeholder' };
  var phone = {
    message: function (error) { return error && error.message ? String(error.message) : String(error); },
    features: function () { return options.features ? options.features.slice() : []; },
    has: function (name) { return phone.features().indexOf(name) >= 0; },
    getJson: function (url, headers) {
      var name = route(url);
      log.requests.push({ name: name, url: url, headers: headers });
      if (options.offline) return { ok: false, status: 0, text: '', json: null, error: 'нет связи: offline' };
      if (options.answers && options.answers[name]) return options.answers[name](url);
      if (name === 'unknown') return { ok: false, status: 404, text: 'нет', json: null };
      if (name === 'unsplash-photo') return { ok: true, status: 200, text: '{}', json: { location: { country: options.unsplashCountry || null } } };
      var json = sample(SAMPLE[name] || name);
      if (name === 'open-meteo' && options.weatherCode !== undefined) json.current.weather_code = options.weatherCode;
      return { ok: true, status: 200, text: JSON.stringify(json), json: json };
    },
    download: function (url, p) {
      log.downloads.push({ url: url, path: p });
      if (options.offline) throw new Error('нет связи');
      if ((options.brokenOriginals || []).some(function (part) { return url.indexOf(part) >= 0; })) throw new Error('файл не скачался: ответ 404');
      disk[p] = 'IMG ' + url;
      return { path: p, bytes: 1000, type: 'image/jpeg' };
    },
    headBytes: function () { var size = options.originalSize || { width: 4000, height: 6000 }; return jpegHead(size.width, size.height); },
    ping: function (url) { log.pings.push(url); return true; },
    network: function () { return options.network || { online: true, wifi: true }; },
    hasLocationPermission: function () { return Boolean(options.location); },
    lastLocation: function () { return options.location ? plain(options.location) : { error: 'нет разрешения на местоположение' }; },
    bounds: function (p) {
      if (!(p in disk)) return { width: -1, height: -1, mime: '' };
      var size = options.originalSize || { width: 4000, height: 6000 };
      return { width: size.width, height: size.height, mime: 'image/jpeg' };
    },
    analyze: function (p) {
      if (!(p in disk)) return null;
      var url = String(disk[p]).replace(/^IMG /, '');
      var hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
      var bright = options.brightness ? options.brightness(url) : 0.25 + parseInt(hash.slice(0, 2), 16) / 255 * 0.15;
      return { brightness: Math.round(bright * 1000) / 1000, contrast: 0.06, dhash: hash };
    },
    crop: function (source, rect, width, height, target) {
      if (!(source in disk)) throw new Error('нет оригинала');
      log.crops.push({ source: disk[source], rect: rect, width: width, height: height, target: target });
      disk[target] = 'CROP ' + width + 'x' + height + ' ' + disk[source];
      return { path: target, sample: 1 };
    },
    shrink: function (source, side, target) {
      if (!(source in disk)) throw new Error('картинка не читается: ' + source);
      disk[target] = 'SMALL ' + side + ' ' + disk[source];
      return target;
    },
    dataUrl: function (p) { if (!(p in disk)) throw new Error('нет ' + p); return 'data:image/jpeg;base64,QUJD'; },
    canSet: function () { return plain(options.canSet || { declared: true, granted: true, supported: true, allowed: true, ok: true }); },
    setWallpaper: function (plan, filesToSet, want) {
      log.sets.push({ plan: plain(plan), files: plain(filesToSet), want: plain(want), inner: disk[filesToSet.inner], cover: disk[filesToSet.cover] });
      if (options.setFails) return { ok: false, mode: plan.mode, screens: [], error: options.setFails, denied: true };
      var screens = [];
      if (want.inner) screens.push('inner');
      if (want.cover) screens.push('cover');
      if (want.lock) screens.push('lock');
      return { ok: true, mode: plan.mode, screens: screens };
    },
    openSetIntent: function (p, name, oldUri) {
      log.intents.push({ path: p, name: name, oldUri: oldUri, exists: p in disk });
      return { uri: 'content://media/external/images/media/' + log.intents.length, screen: 'crop' };
    },
    probeFold: function () {
      return {
        at: clock.now, sdk: 36, device: 'samsung SM-F966B', errors: [], shell: 'Shizuku не запущен — команда cmd wallpaper не проверялась',
        fields: [{ name: 'SEM_FLAG_SUB_DISPLAY', value: 16, isStatic: true }, { name: 'FLAG_SYSTEM', value: 1, isStatic: true }],
        methods: [{ name: 'setBitmapWithCrops', params: ['android.graphics.Bitmap', 'java.util.Map', 'boolean', 'int'] }]
      };
    },
    testFlag: function (p, which) { log.flags.push({ path: p, which: which }); return 1; },
    screenNow: function () { return { width: 1812, height: 2176 }; }
  };

  // ---- the engine globals ----------------------------------------------------------------------
  function native(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (method === 'models.resolve') {
      if (!options.model) throw new Error('Нет модели для роли ' + args[0]);
      return { provider: 'test', model: 'test-model', options: { vision: options.vision !== false } };
    }
    throw new Error('Нет операции ' + method);
  }

  var ai = {
    ask: function (o) {
      log.asks.push({ role: o.role, images: (o.images || []).length, prompt: o.prompt });
      var answer = options.model ? options.model(o) : null;
      if (answer instanceof Error) throw answer;
      return answer;
    }
  };

  function ReentrantLock() { this.held = false; }
  ReentrantLock.prototype.tryLock = function () { if (this.held) return false; this.held = true; return true; };
  ReentrantLock.prototype.unlock = function () { this.held = false; };
  ReentrantLock.prototype.isLocked = function () { return this.held; };

  var globals = {
    native: native,
    job: function (key, spec, fn) { log.jobs[key] = { spec: plain(spec), fn: fn }; },
    unjob: function (key) { delete log.jobs[key]; },
    on: function (name, fn, key) { log.on[name + ':' + (key || '')] = fn; },
    emit: function (name, data) { log.emits.push({ name: name, data: plain(data) }); if (options.onEmit) options.onEmit(name, data); },
    spawn: function (fn) { fn(); },
    sleep: function () {},
    java: { util: { concurrent: { locks: { ReentrantLock: ReentrantLock } } } },
    android: { app: { WallpaperManager: { FLAG_SYSTEM: 1, FLAG_LOCK: 2 } } },
    Date: FakeDate
  };

  var LOCAL = { './settings': 'settings.js', './context': 'context.js', './sources': 'sources.js', './select': 'select.js', './fold': 'fold.js' };
  function requireFor(name) {
    if (name === 'lib/assi') return assi;
    if (name === 'lib/ai') return ai;
    if (name === 'lib/memory') return { save: function (text, tags) { log.memory.push({ text: text, tags: tags }); return log.memory.length; } };
    if (name === './android') return phone;
    if (name === 'modules/health/main.js' && options.health) return options.health;
    if (name === 'modules/achievements/main.js' && options.achievements) return options.achievements;
    if (name === 'modules/holidays/main.js') {
      if (!options.holidays) throw new Error('Нет модуля modules/holidays/main.js');
      return options.holidays;
    }
    if (LOCAL[name]) return require(path.join(ROOT, LOCAL[name]));
    throw new Error('Нет модуля ' + name);
  }

  var source = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  var names = Object.keys(globals);
  var wrapped = new Function(['exports', 'module', 'require'].concat(names).join(', '), source);
  var mod = { exports: {} };
  wrapped.apply(null, [mod.exports, mod, requireFor].concat(names.map(function (n) { return globals[n]; })));

  return {
    main: mod.exports,
    log: log,
    disk: disk,
    options: options,
    db: database('wallpapers'),
    state: function () { return files.readJson('data/wallpapers/state.json', {}); },
    at: function (iso) { clock.now = RealDate.parse(iso); },
    later: function (ms) { clock.now += ms; },
    now: function () { return clock.now; }
  };
};
