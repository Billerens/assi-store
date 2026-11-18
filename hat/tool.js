// Инструмент агента для Шляпы. Агент на телефоне не видит README модуля и комментариев main.js,
// поэтому про «Axiko, давай в шляпу» он узнаёт из инструмента tools/hat.js: main.js пишет его при
// запуске (module.json "autostart"), если файла нет или он другой.
// Здесь — текст этого файла и разбор аргументов в поля подготовки для open().
// Чистая логика: движок (require('./tool')) и node (tests/tool.test.js).
var FILE = 'tools/hat.js';

var SOURCE = [
  '// Written by modules/hat on start: the agents\' way to start Шляпа by voice.',
  "exports.name = 'hat';",
  "exports.description = 'Шляпа — игра для компании: объяснить слово, не называя его. «Давай в шляпу», «нас шестеро, тема — кино» — action open открывает экран подготовки с заполненными полями (что не сказано — не передавай, останется как было). Начинают игру сами игроки кнопкой «Начать».';",
  "exports.parameters = { type: 'object', properties: {",
  "  action: { type: 'string', enum: ['open'] },",
  "  count: { type: 'integer', description: 'сколько игроков, если имён не назвали' },",
  "  names: { type: 'array', items: { type: 'string' }, description: 'имена игроков' },",
  "  theme: { type: 'string', description: 'тема слов любой строкой: кино, еда, общее…' },",
  "  difficulty: { type: 'integer', description: 'сложность слов 1–5' },",
  "  mode: { type: 'string', enum: ['pairs', 'teams'], description: 'пары (классика) или команды' },",
  "  teamCount: { type: 'integer', description: 'команд 2–4 (для teams)' },",
  "  turnSeconds: { type: 'integer', description: 'время хода, с' },",
  "  rounds: { type: 'integer', description: 'раундов' }",
  "}, required: ['action'] };",
  'exports.run = function (args) {',
  "  if (!require('lib/axiko').files.exists('modules/hat/main.js')) return 'Модуль «Шляпа» не установлен';",
  "  return require('modules/hat/main.js').tool(args || {});",
  '};',
  ''
].join('\n');

function positive(value) {
  var number = Math.round(Number(value));
  return number > 0 ? number : null;
}

/**
 * Аргументы инструмента → поля подготовки для open(): players (имена или число), theme,
 * difficulty, mode, teamCount, turnSeconds, rounds. Пустое и непонятное не передаётся.
 */
exports.prefill = function (args) {
  args = args || {};
  var out = {};
  var names = Array.isArray(args.names) ? args.names.map(function (name) { return String(name).trim(); }).filter(Boolean) : [];
  if (names.length) out.players = names.slice(0, 12);
  else if (positive(args.count)) out.players = Math.min(12, positive(args.count));
  else if (Array.isArray(args.players) || positive(args.players)) out.players = args.players;
  if (typeof args.theme === 'string' && args.theme.trim()) out.theme = args.theme.trim().slice(0, 60);
  var level = positive(args.difficulty);
  if (level) out.difficulty = Math.max(1, Math.min(5, level));
  if (args.mode === 'pairs' || args.mode === 'teams') out.mode = args.mode;
  ['teamCount', 'turnSeconds', 'rounds'].forEach(function (key) {
    if (positive(args[key])) out[key] = positive(args[key]);
  });
  return out;
};

/** Записывает tools/hat.js, если его нет или он другой (files — axiko.files). → записан ли сейчас. */
exports.write = function (files) {
  try {
    if (files.exists(FILE) && files.read(FILE) === SOURCE) return false;
    files.write(FILE, SOURCE);
    return true;
  } catch (error) {
    console.warn('hat: инструмент агента: ' + error);
    return false;
  }
};

exports.FILE = FILE;
exports.SOURCE = SOURCE;
