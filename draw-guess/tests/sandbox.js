// main.js «Рисуй — угадаю» под node: движок Axiko подменён (файлы в памяти, база отвечает на
// нужные запросы, другие модули — по списку), свои файлы модуля — настоящие.
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');

/** Файлы рабочей папки в памяти. */
function memoryFiles(disk) {
  return {
    exists: function (p) { return p in disk; },
    read: function (p) {
      if (!(p in disk)) throw new Error('нет файла ' + p);
      return disk[p];
    },
    write: function (p, text) { disk[p] = String(text); },
    remove: function (p) { delete disk[p]; },
    readJson: function (p, fallback) { return p in disk ? JSON.parse(disk[p]) : fallback; },
    writeJson: function (p, value) { disk[p] = JSON.stringify(value); }
  };
}

/**
 * options: disk ({ путь: текст }), rounds (исходы раундов «Я рисую», новые первыми),
 * modules ({ 'modules/x/main.js': объект }). → { main, disk, opened, sql, base }.
 */
exports.make = function (options) {
  options = options || {};
  var disk = options.disk || {};
  var opened = [];
  var sql = [];
  var base = [];
  var modules = options.modules || {};
  // Запас рисунков (options.drawings: [{ id, word, strokes, used_at }]) — для рисунка дня.
  var drawings = options.drawings || [];
  var db = {
    exec: function (text, args) {
      sql.push([text, args || []]);
      if (/^update drawings set used_at = \? where id = \?/.test(text)) {
        drawings.forEach(function (row) { if (row.id === args[1]) row.used_at = args[0]; });
      }
      if (/^insert into drawings/.test(text)) drawings.push({ id: drawings.length + 100, word: args[0], strokes: args[1], used_at: null });
    },
    lastId: function () { return drawings.length ? drawings[drawings.length - 1].id : 1; },
    query: function (text, args) {
      sql.push([text, args || []]);
      if (/^select result from rounds/.test(text)) {
        return (options.rounds || []).slice(0, args[1]).map(function (result) { return { result: result }; });
      }
      if (/count\(\*\) as genius/.test(text)) return [{ genius: options.genius || 0 }];
      if (/count\(\*\) as n/.test(text)) return [{ n: 0 }];
      if (/from drawings where used_at is null/.test(text)) {
        var skip = args && args.length ? args[0] : null;
        return drawings.filter(function (row) { return row.used_at === null && row.id !== skip; }).slice(0, 1);
      }
      if (/from drawings where id = \?/.test(text)) {
        return drawings.filter(function (row) { return row.id === args[0] && (!/used_at is null/.test(text) || row.used_at === null); });
      }
      return [];
    }
  };
  var sandbox = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    Date: Date,
    JSON: JSON,
    Math: Math,
    spawn: function () {},
    sleep: function () {},
    native: function (method, arg) {
      if (method === 'ui.open') opened.push(arg);
      return null;
    }
  };
  sandbox.require = function (name) {
    if (name === 'lib/axiko') return { files: memoryFiles(disk), db: function () { return db; } };
    if (name === 'lib/ai') return options.ai || {};
    if (name === 'lib/base') return { add: function (record) { base.push(record); return base.length; } };
    if (modules[name]) return modules[name];
    if (/^\.\//.test(name)) return require(path.join(ROOT, name.slice(2) + (/\.js(on)?$/.test(name) ? '' : '.js')));
    throw new Error('нет модуля ' + name);
  };
  sandbox.exports = {};
  sandbox.module = { exports: sandbox.exports };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8'), sandbox, { filename: 'main.js' });
  return { main: sandbox.exports, disk: disk, opened: opened, sql: sql, base: base, files: memoryFiles(disk) };
};

/** Текст tools/*.js, каким его загрузит движок Axiko: installed — есть ли modules/draw-guess/main.js. */
exports.loadTool = function (source, installed, main) {
  var sandbox = { exports: {} };
  sandbox.require = function (name) {
    if (name === 'lib/axiko') return { files: { exists: function (p) { return installed && p === 'modules/draw-guess/main.js'; } } };
    if (name === 'modules/draw-guess/main.js') return main;
    throw new Error('нет модуля ' + name);
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'tool' });
  return sandbox.exports;
};

exports.memoryFiles = memoryFiles;
