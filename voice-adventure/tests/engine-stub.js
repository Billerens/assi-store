// A stand-in for the Assi engine under node, so that main.js files can be tested on the computer:
// the workspace is kept in memory, the phone (network, voice, models) is played by the test.
// Not installed on the phone. Used by the tests of voice-adventure, bedtime-series and game-of-the-day.
//
//   var env = require('../../voice-adventure/tests/engine-stub.js').install({
//     mounts: { 'modules/voice-adventure': '<folder of the project>' }
//   });
//   env.ai = function (role, body) { return '{"…": …}'; };      // what the models answer
//   var main = env.require('modules/voice-adventure/main.js');
var Module = require('module');
var path = require('path');
var fs = require('fs');

var STORE_ROOT = path.resolve(__dirname, '..', '..');
var ENGINE_DIR = path.resolve(__dirname, '..', 'story-engine');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function Lock() {
  this.lock = function () {};
  this.unlock = function () {};
  this.tryLock = function () { return true; };
}

function install(options) {
  options = options || {};
  var env = {
    files: {},
    mounts: Object.assign({}, options.mounts || {}),
    online: true, unmetered: true, charging: false, trip: false, speechReady: true,
    features: ['speech.render', 'notify.actions', 'app.visible', 'job.once', 'speech.stream'],
    models: {}, base: [], memory: [], notices: [], cancelled: [], events: [], jobs: {}, unjobs: [], subscriptions: {},
    spawned: [], voiceRuns: [], voiceCommands: [], rendered: [], agentRuns: [], nativeCalls: [], toasts: [],
    now: null,
    ai: function () { throw new Error('модель в тесте не задана'); },
    agent: function () { return 'готово'; },
    native: {}
  };

  // ---- the workspace in memory, module folders from the disk -----------------------------------
  function norm(p) {
    return String(p).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  }

  function disk(p) {
    p = norm(p);
    var keys = Object.keys(env.mounts).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      var mount = norm(keys[i]);
      if (p === mount || p.indexOf(mount + '/') === 0) return path.join(env.mounts[keys[i]], p.slice(mount.length));
    }
    return null;
  }

  var files = {
    path: function (p) { return '/workspace/' + norm(p); },
    exists: function (p) {
      p = norm(p);
      if (env.files[p] !== undefined) return true;
      if (Object.keys(env.files).some(function (key) { return key.indexOf(p + '/') === 0; })) return true;
      var real = disk(p);
      return !!real && fs.existsSync(real);
    },
    read: function (p) {
      p = norm(p);
      if (env.files[p] !== undefined) return env.files[p];
      var real = disk(p);
      if (real && fs.existsSync(real)) return fs.readFileSync(real, 'utf8');
      throw new Error('Нет файла ' + p);
    },
    write: function (p, text) { env.files[norm(p)] = String(text); },
    remove: function (p) {
      p = norm(p);
      var gone = false;
      Object.keys(env.files).forEach(function (key) {
        if (key === p || key.indexOf(p + '/') === 0) {
          delete env.files[key];
          gone = true;
        }
      });
      return gone;
    },
    list: function (p) {
      p = norm(p);
      var out = {};
      Object.keys(env.files).forEach(function (key) {
        if (key.indexOf(p + '/') !== 0) return;
        var rest = key.slice(p.length + 1);
        var slash = rest.indexOf('/');
        out[slash < 0 ? rest : rest.slice(0, slash + 1)] = true;
      });
      var real = disk(p);
      if (real && fs.existsSync(real) && fs.statSync(real).isDirectory()) {
        fs.readdirSync(real).forEach(function (name) {
          out[fs.statSync(path.join(real, name)).isDirectory() ? name + '/' : name] = true;
        });
      }
      return Object.keys(out).sort();
    },
    readJson: function (p, fallback) {
      try {
        return JSON.parse(files.read(p));
      } catch (error) {
        return fallback === undefined ? null : fallback;
      }
    },
    writeJson: function (p, value) { files.write(p, JSON.stringify(value, null, 1)); }
  };
  env.fs = files;

  function notify(options) {
    env.notices.push(clone(options));
    return options && options.id ? options.id : 'n' + env.notices.length;
  }
  notify.cancel = function (id) { env.cancelled.push(id); };

  function fakeDb(name) {
    env.dbs = env.dbs || {};
    var db = env.dbs[name] || (env.dbs[name] = { calls: [], rows: {} });
    return {
      exec: function (sql, args) { db.calls.push({ sql: sql, args: args || [] }); return 0; },
      query: function (sql, args) {
        db.calls.push({ sql: sql, args: args || [] });
        return env.query ? env.query(name, sql, args || []) || [] : [];
      },
      lastId: function () { return db.calls.length; }
    };
  }

  var assi = {
    files: files, notify: notify, db: fakeDb,
    permission: function () { return true; },
    toast: function (text) { env.toasts.push(text); },
    widget: { refresh: function () {} },
    store: function () { return { get: function (k, f) { return f; }, set: function () {}, all: function () { return {}; } }; },
    pref: function () { return null; },
    vibrate: function () {},
    http: { get: function () { throw new Error('нет сети в тесте'); }, post: function () { throw new Error('нет сети в тесте'); } }
  };

  var base = {
    add: function (record) {
      var copy = clone(record);
      copy.id = env.base.length + 1;
      copy.at = copy.at || Date.now();
      env.base.push(copy);
      return copy.id;
    },
    find: function (query) {
      query = query || {};
      return env.base.filter(function (record) {
        if (query.kind && record.kind !== query.kind) return false;
        if (query.kinds && query.kinds.indexOf(record.kind) < 0) return false;
        if (query.since && record.at < query.since) return false;
        if (query.until && record.at >= query.until) return false;
        if (query.source && record.source !== query.source) return false;
        if (query.tag && (record.tags || []).indexOf(query.tag) < 0) return false;
        return true;
      }).sort(function (a, b) { return b.at - a.at; }).slice(0, query.limit || 100);
    },
    update: function (id, fields) {
      env.base.forEach(function (record) { if (record.id === id) Object.assign(record, fields); });
    },
    remove: function (id) { env.base = env.base.filter(function (record) { return record.id !== id; }); }
  };

  function answerOf(text) {
    return { choices: [{ message: { content: String(text) } }] };
  }

  var ai = {
    complete: function (role, body) { return answerOf(env.ai(role, clone(body))); },
    ask: function (opts) {
      if (typeof opts === 'string') opts = { prompt: opts };
      var messages = (opts.messages || []).slice();
      if (opts.system) messages.unshift({ role: 'system', content: opts.system });
      if (opts.prompt !== undefined) messages.push({ role: 'user', content: opts.prompt });
      var text = String(env.ai(opts.role || 'main', { messages: messages }));
      if (!opts.json) return text;
      return JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
    },
    run: function (agent, task) {
      env.agentRuns.push({ agent: agent, task: task });
      return env.agent(agent, task);
    }
  };

  var memory = {
    save: function (text, tags) { env.memory.push({ text: text, tags: tags || [] }); return env.memory.length; },
    search: function (query) {
      return env.memory.filter(function (entry) { return String(entry.text).indexOf(query) >= 0 || (entry.tags || []).indexOf(query) >= 0; });
    },
    recent: function (limit) { return env.memory.slice(-(limit || 10)); }
  };

  // ---- the parts of the story engine that need a phone ------------------------------------------
  function prevOf(p) {
    var dot = p.lastIndexOf('.');
    return dot > p.lastIndexOf('/') ? p.slice(0, dot) + '.prev' + p.slice(dot) : p + '.prev';
  }

  var store = {
    writeJson: function (p, value) {
      p = norm(p);
      if (env.files[p] !== undefined) env.files[prevOf(p)] = env.files[p];
      env.files[p] = JSON.stringify(value, null, 1);
    },
    readJson: function (p, fallback) {
      p = norm(p);
      var candidates = [p, prevOf(p)];
      for (var i = 0; i < candidates.length; i++) {
        var text = env.files[candidates[i]];
        if (text === undefined) {
          var real = disk(candidates[i]);
          if (real && fs.existsSync(real)) text = fs.readFileSync(real, 'utf8');
        }
        if (text === undefined) continue;
        try { return JSON.parse(text); } catch (error) { /* the previous version */ }
      }
      return fallback === undefined ? null : fallback;
    },
    saveState: function (dir, state) {
      state.savedAt = env.now || Date.now();
      store.writeJson(dir + '/state.json', state);
      return state.savedAt;
    },
    loadState: function (dir) { return store.readJson(dir + '/state.json', null); },
    removeDir: function (p) { files.remove(p); return true; },
    folders: function (p) {
      return files.list(p).filter(function (name) { return /\/$/.test(name); }).map(function (name) { return name.slice(0, -1); });
    },
    file: function (p) {
      return { getPath: function () { return '/workspace/' + norm(p); }, exists: function () { return files.exists(p); } };
    }
  };

  var phone = {
    features: function () { return env.features.slice(); },
    has: function (name) { return env.features.indexOf(name) >= 0; },
    online: function () { return env.online; },
    unmetered: function () { return env.online && env.unmetered; },
    charging: function () { return env.charging; },
    inTrip: function () { return env.trip; },
    model: function (role) {
      if (env.models[role]) return env.models[role];
      return { ok: env.online, local: false, why: env.online ? '' : 'нет сети' };
    },
    speech: function () { return { ready: env.speechReady, speaking: false, listening: false }; },
    headphones: function () { return false; },
    today: function (time) {
      var d = time ? new Date(time) : new Date();
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
  };

  var audio = {
    find: function (dir, node) { return env.files[norm(dir) + '/audio/' + node + '.wav'] !== undefined ? norm(dir) + '/audio/' + node + '.wav' : null; },
    known: function (dir, items) {
      return (items || []).map(function (item) {
        var found = audio.find(dir, item.node);
        return found ? { text: item.text, audio: found } : null;
      }).filter(Boolean);
    },
    render: function (dir, node, text, opts) {
      env.rendered.push({ dir: dir, node: node, text: text, options: clone(opts || {}) });
      env.files[norm(dir) + '/audio/' + node + '.wav'] = 'RIFF';
      return norm(dir) + '/audio/' + node + '.wav';
    },
    prerender: function (dir, items, opts) {
      var out = { done: 0, skipped: 0, failed: 0, error: null };
      (items || []).forEach(function (item) {
        if (audio.find(dir, item.node)) { out.skipped++; return; }
        audio.render(dir, item.node, item.text, opts);
        out.done++;
      });
      return out;
    },
    trim: function () { return 0; },
    usage: function () { return 0; },
    play: function () { return 'done'; },
    safe: function (node) { return String(node).replace(/[^a-zA-Z0-9_-]+/g, '_'); }
  };

  var voice = {
    DEFAULTS: {},
    running: null,
    run: function (driver, opts) {
      env.voiceRuns.push({ driver: driver, options: clone(opts) });
      voice.running = driver;
      return { id: driver.id, running: true, phase: 'starting' };
    },
    command: function (id, cmd, text) {
      env.voiceCommands.push({ id: id, cmd: cmd, text: text });
      return !!voice.running && (!id || voice.running.id === id);
    },
    action: function (args) { return voice.command(null, args && args.cmd); },
    state: function (id) {
      if (!voice.running || (id && voice.running.id !== id)) return { running: false, phase: 'idle', id: id || null };
      return { running: true, phase: 'listening', id: voice.running.id, info: voice.running.info ? voice.running.info() : {} };
    },
    stop: function (id) {
      var was = !!voice.running && (!id || voice.running.id === id);
      if (was) voice.running = null;
      return was;
    },
    speak: function (text) { env.nativeCalls.push({ method: 'speech.say', args: [text] }); }
  };

  var controls = { notice: function () {}, headset: function () {}, release: function () {}, buttons: function () { return []; } };

  var fakes = { 'lib/assi': assi, 'lib/assi.js': assi, 'lib/base': base, 'lib/base.js': base, 'lib/ai': ai, 'lib/ai.js': ai, 'lib/memory': memory, 'lib/memory.js': memory };
  var byFile = {};
  byFile[path.join(ENGINE_DIR, 'store.js')] = store;
  byFile[path.join(ENGINE_DIR, 'phone.js')] = phone;
  byFile[path.join(ENGINE_DIR, 'audio.js')] = audio;
  byFile[path.join(ENGINE_DIR, 'voice.js')] = voice;
  byFile[path.join(ENGINE_DIR, 'controls.js')] = controls;
  Object.keys(options.fakes || {}).forEach(function (key) { fakes[key] = options.fakes[key]; });

  var original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(fakes, request)) return fakes[request];
    var target = request;
    if (/^(modules|lib|agents|tools)\//.test(request)) {
      var real = disk(request);
      if (!real) throw new Error('Не установлено в тесте: ' + request);
      target = real;
    }
    var resolved = null;
    try { resolved = Module._resolveFilename(target, parent, isMain); } catch (error) { resolved = null; }
    if (resolved && byFile[resolved]) return byFile[resolved];
    return original.call(this, target, parent, isMain);
  };

  // ---- the globals of the engine ------------------------------------------------------------------
  global.java = {
    util: { concurrent: { locks: { ReentrantLock: Lock }, TimeUnit: { MILLISECONDS: 'ms' } } },
    lang: { System: { currentTimeMillis: function () { return Date.now(); } } }
  };
  global.native = function (method) {
    var args = Array.prototype.slice.call(arguments, 1);
    env.nativeCalls.push({ method: method, args: clone(args) });
    var handler = env.native[method];
    if (typeof handler === 'function') return handler.apply(null, args);
    if (handler !== undefined) return clone(handler);
    if (method === 'shell.features') return env.features.slice();
    return null;
  };
  global.spawn = function (fn) { env.spawned.push(fn); };
  global.sleep = function () {};
  global.emit = function (name, data) { env.events.push({ name: name, data: clone(data) }); };
  global.on = function (name, fn, key) {
    env.subscriptions[name + ':' + (key || '')] = fn;
    return function () { delete env.subscriptions[name + ':' + (key || '')]; };
  };
  global.off = function (name, key) { delete env.subscriptions[name + ':' + (key || '')]; };
  global.job = function (key, when, fn) { env.jobs[key] = { when: clone(when), fn: fn }; };
  global.unjob = function (key) {
    env.unjobs.push(key);
    delete env.jobs[key];
  };
  global.js = function (value) { return value; };

  env.require = function (p) {
    var real = disk(p);
    if (!real) throw new Error('Не установлено в тесте: ' + p);
    return require(real);
  };

  /** Runs what was spawned (in order, including what those spawn in turn). */
  env.runSpawned = function () {
    var count = 0;
    while (env.spawned.length && count < 100) {
      var fn = env.spawned.shift();
      fn();
      count++;
    }
    return count;
  };

  /** A clean workspace and phone between tests; the modules stay loaded. */
  env.reset = function () {
    env.files = {};
    env.base = [];
    env.memory = [];
    env.notices = [];
    env.cancelled = [];
    env.events = [];
    env.jobs = {};
    env.unjobs = [];
    env.spawned = [];
    env.voiceRuns = [];
    env.voiceCommands = [];
    env.rendered = [];
    env.agentRuns = [];
    env.nativeCalls = [];
    env.native = {};
    env.models = {};
    env.online = true;
    env.unmetered = true;
    env.charging = false;
    env.trip = false;
    env.speechReady = true;
    env.now = null;
    env.query = null;
    env.dbs = {};
    voice.running = null;
    Object.keys(global).forEach(function (key) {
      if (/^__(voiceAdventure|bedtimeSeries|gameOfTheDay|storyVoice)$/.test(key)) delete global[key];
    });
  };

  env.voice = voice;
  env.STORE_ROOT = STORE_ROOT;
  return env;
}

exports.install = install;
exports.STORE_ROOT = STORE_ROOT;
