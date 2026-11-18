// node tests/tool.test.js — инструмент агента tools/hat.js: текст файла собирается в настоящий
// инструмент, «давай в шляпу» доходит до open() с заполненными полями, запись не повторяется.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var h = require('./harness.js');
var T = require('../tool.js');

var ROOT = path.join(__dirname, '..');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Файлы рабочей папки в памяти — то, чем пользуются tool.js и main.js. */
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

/** main.js Шляпы в песочнице: движок подменён, свои файлы модуля — настоящие. */
function loadMain(disk, opened) {
  var sandbox = {
    console: console,
    Date: Date,
    JSON: JSON,
    Math: Math,
    native: function (method, arg) {
      if (method === 'ui.open') opened.push(arg);
      return null;
    }
  };
  sandbox.require = function (name) {
    if (name === 'lib/axiko') return { files: memoryFiles(disk) };
    if (name === 'lib/ai') return {};
    if (/^\.\//.test(name)) return require(path.join(ROOT, name.slice(2) + (/\.js(on)?$/.test(name) ? '' : '.js')));
    throw new Error('нет модуля ' + name);
  };
  sandbox.exports = {};
  sandbox.module = { exports: sandbox.exports };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8'), sandbox, { filename: 'main.js' });
  return sandbox.exports;
}

/** tools/hat.js, каким его загрузит движок Axiko. */
function loadTool(source, installed, main) {
  var sandbox = { exports: {} };
  sandbox.require = function (name) {
    if (name === 'lib/axiko') return { files: { exists: function (p) { return installed && p === 'modules/hat/main.js'; } } };
    if (name === 'modules/hat/main.js') return main;
    throw new Error('нет модуля ' + name);
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'tools/hat.js' });
  return sandbox.exports;
}

h.test('текст tools/hat.js — инструмент hat с действием open', function () {
  var tool = loadTool(T.SOURCE, true, null);
  assert.strictEqual(tool.name, 'hat');
  assert.ok(/давай в шляпу/i.test(tool.description), tool.description);
  assert.deepStrictEqual(plain(tool.parameters.properties.action['enum']), ['open']);
  assert.deepStrictEqual(plain(tool.parameters.required), ['action']);
  assert.strictEqual(typeof tool.run, 'function');
});

h.test('модуль удалён — инструмент так и отвечает', function () {
  var tool = loadTool(T.SOURCE, false, null);
  assert.strictEqual(tool.run({ action: 'open' }), 'Модуль «Шляпа» не установлен');
});

h.test('аргументы → поля подготовки: число игроков, имена, тема, пределы', function () {
  assert.deepStrictEqual(T.prefill({ action: 'open', count: 6, theme: ' кино ' }), { players: 6, theme: 'кино' });
  assert.deepStrictEqual(T.prefill({ names: ['Маша', ' ', 'Петя'], count: 6 }), { players: ['Маша', 'Петя'] });
  assert.deepStrictEqual(T.prefill({ difficulty: 9, mode: 'teams', teamCount: 3, turnSeconds: 45, rounds: 2 }),
    { difficulty: 5, mode: 'teams', teamCount: 3, turnSeconds: 45, rounds: 2 });
  assert.deepStrictEqual(T.prefill({ count: 40 }), { players: 12 });
  assert.deepStrictEqual(T.prefill({ count: 0, theme: '', mode: 'solo', rounds: -1 }), {});
  assert.deepStrictEqual(T.prefill(null), {});
});

h.test('«давай в шляпу, нас шестеро, тема — кино» → экран подготовки с полями', function () {
  var disk = {};
  var opened = [];
  var main = loadMain(disk, opened);
  var tool = loadTool(T.SOURCE, true, main);
  var answer = tool.run({ action: 'open', count: 6, theme: 'кино' });
  assert.strictEqual(answer, 'Открыта подготовка Шляпы');
  assert.deepStrictEqual(opened, ['modules/hat/ui/index.html']);
  var prefill = JSON.parse(disk['data/hat/prefill.json']);
  assert.strictEqual(prefill.players, 6);
  assert.strictEqual(prefill.theme, 'кино');
  assert.ok(prefill.at > 0);
  assert.strictEqual(main.tool({ action: 'stats' }), 'Неизвестное действие: stats');
  assert.deepStrictEqual(opened.length, 1, 'чужое действие экран не открывает');
});

h.test('start() пишет tools/hat.js один раз и чинит изменённый', function () {
  var disk = {};
  var main = loadMain(disk, []);
  assert.strictEqual(main.start(), true);
  assert.strictEqual(disk['tools/hat.js'], T.SOURCE);
  var files = memoryFiles(disk);
  assert.strictEqual(T.write(files), false, 'тот же текст не переписывается');
  disk['tools/hat.js'] = '// старое';
  assert.strictEqual(T.write(files), true);
  assert.strictEqual(disk['tools/hat.js'], T.SOURCE);
});
