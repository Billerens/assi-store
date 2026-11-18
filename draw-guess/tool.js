// Инструмент агента для «Рисуй — угадаю». Агент на телефоне не видит README модуля и комментариев
// main.js, поэтому про «давай порисуем» он узнаёт из инструмента tools/draw-guess.js: main.js пишет
// его при запуске (module.json "autostart"), если файла нет или он другой.
// Здесь — текст этого файла и разбор аргументов в поля подготовки для open().
// Чистая логика: движок (require('./tool')) и node (tests/tool.test.js).
var FILE = 'tools/draw-guess.js';

var SOURCE = [
  '// Written by modules/draw-guess on start: the agents\' way to start «Рисуй — угадаю» by voice.',
  "exports.name = 'draw_guess';",
  "exports.description = 'Рисуй — угадаю: игра с рисунками. action open открывает игру. «Давай порисуем» — mode human (владелец рисует, модель угадывает вслух); «нарисуй что-нибудь, а я угадаю» — mode model и start true (модель рисует штрихами, люди угадывают голосом). Что не сказано — не передавай, останется как было.';",
  "exports.parameters = { type: 'object', properties: {",
  "  action: { type: 'string', enum: ['open'] },",
  "  mode: { type: 'string', enum: ['human', 'model'], description: 'human — рисует владелец, model — рисует Axiko' },",
  "  start: { type: 'boolean', description: 'сразу начать партию, без экрана подготовки' },",
  "  theme: { type: 'string', description: 'тема слов любой строкой: животные, еда, транспорт…' },",
  "  difficulty: { type: 'integer', description: 'сложность слов 1–5' },",
  "  players: { type: 'array', items: { type: 'string' }, description: 'имена игроков или команд' },",
  "  teams: { type: 'boolean', description: 'играть командами' },",
  "  drawSeconds: { type: 'integer', description: 'время на рисунок, с' },",
  "  rounds: { type: 'integer', description: 'рисунков в партии' }",
  "}, required: ['action'] };",
  'exports.run = function (args) {',
  "  if (!require('lib/axiko').files.exists('modules/draw-guess/main.js')) return 'Модуль «Рисуй — угадаю» не установлен';",
  "  return require('modules/draw-guess/main.js').tool(args || {});",
  '};',
  ''
].join('\n');

function positive(value) {
  var number = Math.round(Number(value));
  return number > 0 ? number : null;
}

/**
 * Аргументы инструмента → поля подготовки для open(): mode, start, theme, difficulty, players,
 * teams, drawSeconds, rounds. Пустое и непонятное не передаётся.
 */
exports.prefill = function (args) {
  args = args || {};
  var out = {};
  if (args.mode === 'human' || args.mode === 'model') out.mode = args.mode;
  if (args.start === true && out.mode) out.start = true;
  if (typeof args.theme === 'string' && args.theme.trim()) out.theme = args.theme.trim().slice(0, 60);
  var level = positive(args.difficulty);
  if (level) out.difficulty = Math.max(1, Math.min(5, level));
  if (Array.isArray(args.players)) {
    var names = args.players.map(function (name) { return String(name).trim(); }).filter(Boolean);
    if (names.length) out.players = names.slice(0, 12);
  }
  if (args.teams === true || args.teams === false) out.teams = args.teams;
  if (positive(args.drawSeconds)) out.drawSeconds = positive(args.drawSeconds);
  if (positive(args.rounds)) out.rounds = positive(args.rounds);
  return out;
};

/** Записывает tools/draw-guess.js, если его нет или он другой (files — axiko.files). → записан ли сейчас. */
exports.write = function (files) {
  try {
    if (files.exists(FILE) && files.read(FILE) === SOURCE) return false;
    files.write(FILE, SOURCE);
    return true;
  } catch (error) {
    console.warn('draw-guess: инструмент агента: ' + error);
    return false;
  }
};

exports.FILE = FILE;
exports.SOURCE = SOURCE;
