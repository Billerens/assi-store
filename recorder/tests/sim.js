// A stand-in for the engine of Axiko under node, so that main.js runs its whole way here: SQLite
// (node:sqlite, with fts4), files in a temporary folder, the real lib/base.js of Axiko when the Axiko
// repository stands next to this one, and fake Android pieces (a lock, files). android.js is put
// aside by `overrides` (a fake microphone and cutter from the test). spawn() puts work into a
// queue that the test runs with drain(); sleep() moves the fake clock. It checks the module's own
// flow, not Android: what touches the phone is checked by checks.js on the phone.
var fs = require('fs');
var path = require('path');
var os = require('os');
var vm = require('vm');
var crypto = require('crypto');

process.removeAllListeners('warning');
var DatabaseSync = require('node:sqlite').DatabaseSync;

var AXIKO_LIB = path.resolve(__dirname, '../../../Axiko/app/src/main/assets/factory/lib');

function realBase() {
  var file = path.join(AXIKO_LIB, 'base.js');
  return fs.existsSync(file) ? file : null;
}

function makeDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  var d = new DatabaseSync(file);
  var bind = function (args) {
    return (args || []).map(function (v) { return v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v; });
  };
  return {
    exec: function (sql, args) {
      var statement = d.prepare(sql);
      statement.run.apply(statement, bind(args));
    },
    // Like the shell: every argument of a select goes in as a string.
    query: function (sql, args) {
      var statement = d.prepare(sql);
      var rows = statement.all.apply(statement, (args || []).map(function (v) { return v === null || v === undefined ? null : String(v); }));
      return rows.map(function (row) { return Object.assign({}, row); });
    },
    lastId: function () { return Number(d.prepare('select last_insert_rowid() as id').get().id); },
    close: function () { d.close(); }
  };
}

/**
 * A fresh engine: { env, require }. env holds what the module did (notifications, events, jobs,
 * handlers) and what the test sets (features, models, answer(role, options), sms rows, now…).
 */
function create(modules, overrides) {
  overrides = overrides || {};
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiko-sim-'));
  var env = {
    dir: dir, notifications: [], cancelled: [], emitted: [], jobs: {}, handlers: {}, widget: 0, features: [], models: {},
    answer: function () { throw new Error('нет модели'); }, asked: [], sms: [], now: null, permission: true, installed: [],
    usage: null, http: function () { return { ok: false, status: 404, text: '', json: function () { return {}; } }; }, clipboard: '', log: [],
    spawned: [], errors: [], slept: 0, sleepBudget: 0, transcribe: function () { return ''; }, shared: [], speechReady: true,
    wake: { on: false, name: 'Асси' }, wakeSets: [], embed: null, said: []
  };
  var dbs = {};
  var full = function (p) { return path.join(dir, String(p)).split(path.sep).join('/'); };
  var files = {
    path: full,
    read: function (p) { return fs.readFileSync(full(p), 'utf8'); },
    write: function (p, text) { fs.mkdirSync(path.dirname(full(p)), { recursive: true }); fs.writeFileSync(full(p), String(text)); },
    exists: function (p) { return fs.existsSync(full(p)); },
    list: function (p) { return fs.existsSync(full(p)) ? fs.readdirSync(full(p)) : []; },
    remove: function (p) { if (fs.existsSync(full(p))) fs.rmSync(full(p), { recursive: true }); return true; },
    readJson: function (p, fallback) { return fs.existsSync(full(p)) ? JSON.parse(fs.readFileSync(full(p), 'utf8')) : fallback; },
    writeJson: function (p, value) { files.write(p, JSON.stringify(value, null, 1)); }
  };
  var axiko = {
    files: files,
    db: function (name) { return dbs[name] || (dbs[name] = makeDb(full('data/' + name + '.db'))); },
    notify: function (options) { env.notifications.push(options); return 'n' + env.notifications.length; },
    http: {
      get: function (url) { return env.http(url); },
      request: function (o) { return env.http(o.url, o); },
      download: function () { throw new Error('нет сети'); }
    },
    permission: function () { return env.permission; },
    rows: function (uri, columns, where, args, order, limit) {
      var since = args && args.length ? Number(args[0]) : 0;
      return env.sms.filter(function (row) { return row.date > since; }).sort(function (a, b) { return a.date - b.date; }).slice(0, limit || 1e9);
    },
    widget: { refresh: function () { env.widget++; } },
    toast: function (text) { env.log.push('toast ' + text); },
    clipboard: { get: function () { return env.clipboard; }, set: function (text) { env.clipboard = String(text); } },
    share: function (t) { env.shared.push(t); },
    openUrl: function () {},
    speech: {
      transcribe: function (p, options) { return env.transcribe(String(p), options); }
    },
    linux: function () { throw new Error('нет Linux'); }
  };
  axiko.notify.cancel = function (id) { env.cancelled.push(String(id)); return true; };
  var ai = {
    ask: function (options) {
      if (typeof options === 'string') options = { prompt: options };
      env.asked.push(options);
      return env.answer(options.role || 'main', options);
    },
    run: function () { throw new Error('нет агентов'); }
  };
  var usage = {
    access: function () { return Boolean(env.usage); },
    daily: function () { return env.usage || []; },
    events: function () { return []; },
    sessions: function () { return []; }
  };
  var memory = {
    items: [],
    next: 0,
    save: function (text, tags) { memory.next++; memory.items.push({ id: memory.next, text: text, tags: tags }); return memory.next; },
    search: function (q) { return memory.items.filter(function (m) { return m.text.indexOf(q) >= 0; }); },
    remove: function (id) { memory.items = memory.items.filter(function (m) { return m.id !== id; }); },
    recent: function () { return memory.items.slice(-10); }
  };
  env.memory = memory;
  var mocks = { 'lib/axiko': axiko, 'lib/ai': ai, 'lib/usage': usage, 'lib/memory': memory };
  var cache = {};

  function resolve(from, p) {
    if (mocks[p]) return p;
    if (overrides[p]) return p;
    if (p === 'lib/base') {
      var b = realBase();
      if (!b) throw new Error('нужен lib/base.js из репозитория Axiko рядом');
      return b;
    }
    var file;
    if (p.indexOf('./') === 0 || p.indexOf('../') === 0) file = path.resolve(path.dirname(from), p);
    else if (p.indexOf('modules/') === 0) {
      var rest = p.slice(8);
      var id = rest.split('/')[0];
      // A module of the store under test, or one the test put into the fake workspace.
      file = modules[id] ? path.join(modules[id], rest.slice(id.length + 1)) : full(p);
    } else file = full(p);
    if (!/\.(js|json)$/.test(file) && fs.existsSync(file + '.js')) file += '.js';
    return file;
  }

  function makeRequire(from) {
    return function (p) {
      var file = resolve(from, p);
      if (mocks[file]) return mocks[file];
      if (overrides[file]) return overrides[file];
      var base = path.basename(file);
      if (overrides[base] && path.dirname(file) === modules.recorder) return overrides[base];
      if (cache[file]) return cache[file].exports;
      var module = { exports: {} };
      cache[file] = module;
      if (/\.json$/.test(file)) {
        module.exports = JSON.parse(fs.readFileSync(file, 'utf8'));
        return module.exports;
      }
      var source = fs.readFileSync(file, 'utf8');
      var fn = vm.runInThisContext('(function (exports, require, module, __filename, __dirname) {' + source + '\n})', { filename: file });
      fn.call(module.exports, module.exports, makeRequire(file), module, file, path.dirname(file));
      return module.exports;
    };
  }

  var realNow = Date.now.bind(Date);
  Date.now = function () { return env.now === null ? realNow() : env.now; };

  Object.keys(global).filter(function (k) { return /^__.*Live$/.test(k); }).forEach(function (k) { delete global[k]; });
  global.java = {
    util: { concurrent: { locks: { ReentrantLock: function () { this.lock = function () {}; this.unlock = function () {}; } } } },
    security: {
      MessageDigest: {
        getInstance: function () {
          return { digest: function (buf) { return Array.from(crypto.createHash('sha1').update(buf).digest()).map(function (b) { return b > 127 ? b - 256 : b; }); } };
        }
      }
    },
    lang: {
      String: function (s) { this.getBytes = function () { return Buffer.from(String(s), 'utf8'); }; },
      Thread: { sleep: function () {} }
    },
    io: {
      File: function (p) {
        var at = String(p);
        this.lastModified = function () { try { return fs.statSync(at).mtimeMs; } catch (e) { return 0; } };
        this.exists = function () { return fs.existsSync(at); };
        this.length = function () { try { return fs.statSync(at).size; } catch (e) { return 0; } };
        this.getPath = function () { return at; };
        this.delete = function () { try { fs.rmSync(at); return true; } catch (e) { return false; } };
        this.mkdirs = function () { fs.mkdirSync(at, { recursive: true }); return true; };
        this.list = function () { return fs.existsSync(at) ? fs.readdirSync(at) : null; };
        this.renameTo = function (other) { fs.renameSync(at, other.getPath()); return true; };
        this.getUsableSpace = function () { return 1e12; };
      }
    }
  };
  global.android = { os: { Process: { myUid: function () { return 1; } } } };
  global.host = {
    path: function (p) { return full(p); },
    activity: null,
    dataDir: full('data'),
    readText: function (p) { return files.read(p); },
    writeText: function (p, t) { files.write(p, t); },
    exists: function (p) { return files.exists(p); },
    list: function (p) { return files.list(p); }
  };
  global.context = {
    getPackageName: function () { return 'app.axiko'; },
    checkSelfPermission: function () { return env.permission ? 0 : -1; },
    getPackageManager: function () {
      return { getLaunchIntentForPackage: function (pkg) { return env.installed.indexOf(pkg) >= 0 ? {} : null; } };
    },
    getSystemService: function () { throw new Error('нет службы'); }
  };
  global.java.util.concurrent.locks.ReentrantLock = function () { this.lock = function () {}; this.unlock = function () {}; };
  global.native = function (method) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (method === 'shell.features') {
      if (env.features === null) throw new Error('нет операции');
      return env.features;
    }
    if (method === 'speech.status') return { ready: env.speechReady, engine: 'gigaam', live: { active: Boolean(env.liveActive) }, stream: false, listening: false };
    if (method === 'wake.status') return { on: env.wake.on, name: env.wake.name };
    if (method === 'wake.set') { env.wake.on = Boolean(args[0]); env.wakeSets.push(Boolean(args[0])); return true; }
    if (method === 'speech.say') { env.said.push(args[0]); return true; }
    if (method === 'models.embed') {
      if (!env.embed) throw new Error('Для роли «embed» не выбрана модель');
      return args[0].map(env.embed);
    }
    if (method === 'models.resolve') {
      if (args[1] === false && !env.models[args[0]]) throw new Error('Для роли не выбрана модель');
      var m = env.models[args[0]] || env.models.main;
      if (!m) throw new Error('Не выбрана основная модель');
      return m;
    }
    if (env.native && env.native[method]) return env.native[method].apply(null, args);
    throw new Error('native ' + method + ' нет в подставном движке');
  };
  global.on = function (name, fn, key) { env.handlers[name] = fn; };
  global.off = function (name) { delete env.handlers[name]; };
  global.job = function (key, spec, fn) { env.jobs[key] = { spec: spec, fn: fn }; };
  global.unjob = function (key) { delete env.jobs[key]; };
  global.spawn = function (fn) { env.spawned.push(fn); };
  // The fake clock moves by what is slept; past the budget the sleeping work is cut off (a ticker).
  global.sleep = function (ms) {
    if (env.slept + ms > env.sleepBudget) throw new Error('sim: sleep budget');
    if (env.now !== null) env.now += ms;
    env.slept += ms;
  };
  // Runs what was spawned, one after another (and what they spawn), like the engine's threads would.
  env.drain = function (limit) {
    var n = 0;
    while (env.spawned.length && n++ < (limit || 1000)) {
      var fn = env.spawned.shift();
      env.slept = 0;
      try { fn(); } catch (e) { if (!/sleep budget/.test(String(e && e.message))) env.errors.push(e); }
    }
    return n;
  };
  global.emit = function (name, data) { env.emitted.push({ name: name, data: data }); };
  global.js = function (x) { return x; };
  global.ui = function (fn) { return fn(); };

  return { env: env, require: makeRequire(path.join(dir, 'index.js')), close: function () { Object.keys(dbs).forEach(function (k) { dbs[k].close(); }); } };
}

exports.create = create;
exports.realBase = realBase;
