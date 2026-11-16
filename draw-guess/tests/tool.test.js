// node tests/tool.test.js — инструмент агента tools/draw-guess.js: текст файла собирается в настоящий
// инструмент, «давай порисуем» доходит до open() с заполненными полями, запись не повторяется.
var assert = require('assert');
var h = require('./harness.js');
var S = require('./sandbox.js');
var T = require('../tool.js');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

h.test('текст tools/draw-guess.js — инструмент draw_guess с действием open', function () {
  var tool = S.loadTool(T.SOURCE, true, null);
  assert.strictEqual(tool.name, 'draw_guess');
  assert.ok(/давай порисуем/i.test(tool.description) && /нарисуй что-нибудь, а я угадаю/i.test(tool.description), tool.description);
  assert.deepStrictEqual(plain(tool.parameters.properties.action['enum']), ['open']);
  assert.deepStrictEqual(plain(tool.parameters.properties.mode['enum']), ['human', 'model']);
  assert.strictEqual(typeof tool.run, 'function');
});

h.test('модуль удалён — инструмент так и отвечает', function () {
  var tool = S.loadTool(T.SOURCE, false, null);
  assert.strictEqual(tool.run({ action: 'open' }), 'Модуль «Рисуй — угадаю» не установлен');
});

h.test('аргументы → поля подготовки', function () {
  assert.deepStrictEqual(T.prefill({ action: 'open', mode: 'human' }), { mode: 'human' });
  assert.deepStrictEqual(T.prefill({ mode: 'model', start: true, theme: ' животные ' }), { mode: 'model', start: true, theme: 'животные' });
  assert.deepStrictEqual(T.prefill({ start: true }), {}, 'без режима сразу не начинаем');
  assert.deepStrictEqual(T.prefill({ difficulty: 0, players: ['Маша', '', 'Петя'], teams: true, drawSeconds: 60, rounds: 3 }),
    { players: ['Маша', 'Петя'], teams: true, drawSeconds: 60, rounds: 3 });
  assert.deepStrictEqual(T.prefill({ difficulty: 8, mode: 'solo' }), { difficulty: 5 });
  assert.deepStrictEqual(T.prefill(null), {});
});

h.test('«давай порисуем» и «нарисуй что-нибудь, а я угадаю» → экран игры с полями', function () {
  var phone = S.make();
  var tool = S.loadTool(T.SOURCE, true, phone.main);
  assert.strictEqual(tool.run({ action: 'open', mode: 'human' }), 'Открыта игра «Рисуй — угадаю»');
  assert.deepStrictEqual(phone.opened, ['modules/draw-guess/ui/index.html']);
  var prefill = JSON.parse(phone.disk['data/draw-guess/prefill.json']);
  assert.strictEqual(prefill.mode, 'human');
  assert.ok(!prefill.start);
  tool.run({ action: 'open', mode: 'model', start: true });
  prefill = JSON.parse(phone.disk['data/draw-guess/prefill.json']);
  assert.strictEqual(prefill.mode, 'model');
  assert.strictEqual(prefill.start, true);
  assert.strictEqual(phone.main.tool({ action: 'stats' }), 'Неизвестное действие: stats');
  assert.strictEqual(phone.opened.length, 2, 'чужое действие экран не открывает');
});

h.test('start() пишет tools/draw-guess.js один раз и чинит изменённый', function () {
  var phone = S.make();
  assert.strictEqual(phone.main.start(), true);
  assert.strictEqual(phone.disk['tools/draw-guess.js'], T.SOURCE);
  assert.strictEqual(T.write(phone.files), false, 'тот же текст не переписывается');
  phone.disk['tools/draw-guess.js'] = '// старое';
  assert.strictEqual(T.write(phone.files), true);
  assert.strictEqual(phone.disk['tools/draw-guess.js'], T.SOURCE);
});
