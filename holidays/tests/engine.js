// A pretend Axiko engine for main.js under node: the workspace files in memory, themes, notifications,
// jobs and a clock that the test moves. Only what main.js touches is here.
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');

function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * options: features ([] or null — null: the shell does not know the question), now ('2026-12-20T12:00'),
 * granted (permissions), contacts (rows), profile (rows), weatherCode, powerSave, inbox (true),
 * model (text the model answers, or null — no model).
 */
exports.make = function (options) {
  options = options || {};
  var now = Date.parse(options.now || '2026-11-14T12:00:00');
  var disk = {};
  disk['modules/holidays/occasions.json'] = fs.readFileSync(path.join(ROOT, 'occasions.json'), 'utf8');
  fs.readdirSync(path.join(ROOT, 'decor')).forEach(function (name) {
    disk['modules/holidays/decor/' + name] = fs.readFileSync(path.join(ROOT, 'decor', name), 'utf8');
  });
  var themes = { midnight: { name: 'Полночь', tokens: { bg: '#000000', surface: '#0E0E0E', accent: '#8B7CFF' }, css: '.card { border-radius: 4px; }' } };
  var active = 'midnight';
  var queue = [];
  var log = { notify: [], native: [], jobs: {}, on: {}, emits: [], base: [], clip: null, opened: null, said: [], inbox: [], granted: [] };

  function native(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    log.native.push([method].concat(args));
    switch (method) {
      case 'shell.features':
        if (!options.features) throw new Error('Нет операции shell.features');
        return plain(options.features);
      case 'theme.list':
        return plain(Object.keys(themes).map(function (id) {
          return { id: id, name: themes[id].name, tokens: themes[id].tokens, css: themes[id].css, active: id === active };
        }));
      case 'theme.set':
        active = args[0] || '';
        return true;
      case 'theme.save':
        themes[args[0]] = plain(args[1]);
        disk['themes/' + args[0] + '.json'] = JSON.stringify(args[1]);
        return true;
      case 'theme.remove':
        delete themes[args[0]];
        delete disk['themes/' + args[0] + '.json'];
        if (active === args[0]) active = '';
        return true;
      case 'theme.decor':
        if (args[0]) disk['themes/_decor.css'] = String(args[0]);
        else delete disk['themes/_decor.css'];
        return true;
      case 'modules.list':
        return [{ id: 'holidays' }, { id: 'inbox' }, { id: 'notes' }];
      case 'snap.list':
        return [{ time: now - 86400000, label: 'Модуль' }, { time: now - 2 * 86400000, label: 'Перед откатом: x' }];
      case 'speech.say':
        log.said.push(args[0]);
        return true;
      default:
        throw new Error('Нет операции ' + method);
    }
  }

  var files = {
    read: function (p) {
      if (!(p in disk)) throw new Error('нет файла ' + p);
      return disk[p];
    },
    write: function (p, text) { disk[p] = String(text); },
    exists: function (p) {
      return p in disk || Object.keys(disk).some(function (key) { return key.indexOf(p + '/') === 0; });
    },
    list: function (p) {
      return Object.keys(disk).filter(function (key) { return key.indexOf(p + '/') === 0; })
        .map(function (key) { return key.slice(p.length + 1); }).filter(function (name) { return name.indexOf('/') < 0; });
    },
    remove: function (p) {
      delete disk[p];
      return true;
    },
    readJson: function (p, fallback) { return p in disk ? JSON.parse(disk[p]) : fallback; },
    writeJson: function (p, value) { disk[p] = JSON.stringify(value, null, 2); }
  };

  var mocks = {
    'lib/axiko': {
      files: files,
      rows: function (uri) {
        if (uri.indexOf('profile') >= 0) return plain(options.profile || []);
        if (uri.indexOf('contacts/data') >= 0) return plain(options.contacts || []);
        return [];
      },
      permission: function () { return true; },
      notify: function (payload) {
        log.notify.push(plain(payload));
        return log.notify.length;
      },
      clipboard: { set: function (text) { log.clip = String(text); } },
      openUrl: function (url) { log.opened = url; },
      http: {
        get: function () {
          return { ok: true, json: function () { return { current: { weather_code: options.weatherCode || 0, temperature_2m: -2, is_day: 1 } }; } };
        }
      },
      widget: { refresh: function () {} }
    },
    'lib/ai': {
      ask: function () {
        if (options.model === null) throw new Error('нет модели');
        return options.model || '«С днём рождения!»';
      }
    },
    'lib/memory': { search: function () { return []; } },
    'lib/base': {
      add: function (record) { log.base.push(plain(record)); },
      kinds: function () { return [{ kind: 'sleep', count: 120 }]; },
      sql: function () { return [{ n: 340 }]; }
    }
  };
  if (options.inbox) {
    mocks['modules/inbox/main.js'] = {
      draftFor: function (name, text, source) {
        log.inbox.push({ name: name, text: text, source: source });
        return { ok: true, title: name };
      }
    };
  }

  if (options.achievements) {
    // «Ачивки за жизнь» installed: achieve.js finds main.js on the disk and calls its grant().
    disk['modules/achievements/main.js'] = '// Ачивки';
    mocks['modules/achievements/main.js'] = {
      grant: function (item) {
        log.granted.push(plain(item));
        return { ok: true };
      }
    };
  }

  function FakeDate() {
    var args = Array.prototype.slice.call(arguments);
    if (!args.length) return new Date(now);
    return new (Function.prototype.bind.apply(Date, [null].concat(args)))();
  }
  FakeDate.now = function () { return now; };
  FakeDate.parse = Date.parse;
  FakeDate.UTC = Date.UTC;
  FakeDate.prototype = Date.prototype;

  var granted = options.granted || [];
  var context = {
    checkSelfPermission: function (name) { return granted.indexOf(name.replace('android.permission.', '')) >= 0 ? 0 : -1; },
    getSystemService: function (name) {
      if (name === 'power') return { isPowerSaveMode: function () { return Boolean(options.powerSave); } };
      if (name === 'location') return { getLastKnownLocation: function () { return { getTime: function () { return now; }, getLatitude: function () { return 55.75; }, getLongitude: function () { return 37.62; } }; } };
      return null;
    },
    getPackageManager: function () {
      return { getPackageInfo: function () { return { firstInstallTime: Date.parse(options.installed || '2025-11-10T10:00:00') }; } };
    },
    getPackageName: function () { return 'app.axiko'; }
  };

  var sandbox = {
    console: { log: function () {}, warn: function () {}, error: function (text) { log.errors = (log.errors || []).concat([String(text)]); } },
    Date: FakeDate,
    JSON: JSON,
    Math: Math,
    native: native,
    context: context,
    host: { activity: {} },
    java: { util: { concurrent: { locks: { ReentrantLock: function () { this.lock = function () {}; this.unlock = function () {}; } } } } },
    job: function (key, when, fn) { log.jobs[key] = { when: when, fn: fn }; },
    unjob: function (key) { delete log.jobs[key]; },
    on: function (name, fn) { log.on[name] = fn; },
    spawn: function (fn) { queue.push(fn); },
    sleep: function () {},
    emit: function (name, data) { log.emits.push([name, data]); }
  };
  sandbox.require = function (name) {
    if (mocks[name]) return mocks[name];
    if (/^\.\//.test(name)) return require(path.join(ROOT, name.slice(2) + (/\.js(on)?$/.test(name) ? '' : '.js')));
    throw new Error('нет модуля ' + name);
  };
  sandbox.exports = {};
  sandbox.module = { exports: sandbox.exports };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8'), sandbox, { filename: 'main.js' });

  return {
    main: sandbox.exports,
    disk: disk,
    files: files,
    themes: themes,
    log: log,
    active: function () { return active; },
    setTheme: function (id) { active = id; },
    at: function (iso) { now = Date.parse(iso); },
    /** Runs what was spawned, as the engine's threads would. */
    drain: function () {
      for (var i = 0; i < 50 && queue.length; i++) queue.shift()();
    },
    state: function () { return files.readJson('data/holidays/state.json', {}); },
    settings: function (values) { disk['data/holidays/settings.json'] = JSON.stringify(values); }
  };
};
