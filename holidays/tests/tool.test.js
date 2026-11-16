// node tests/tool.test.js — инструмент агента tools/holidays.js на поддельном телефоне (tests/engine.js):
// start() пишет его, stop() убирает; «выключи снег», «какие праздники на этой неделе», «напомни про
// день рождения Пети за три дня» и свой повод доходят до функций модуля.
var assert = require('assert');
var vm = require('vm');
var engine = require('./engine.js');
var t = require('./harness.js');

var CONTACTS = [
  { contact_id: 12, display_name: 'Аня Петрова', data1: '1996-11-15', data2: 3, starred: 1 },
  { contact_id: 31, display_name: 'Петя', data1: '--03-02', data2: 3, starred: 0 }
];

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** tools/holidays.js с диска поддельного телефона, каким его загрузит движок Assi. */
function loadTool(phone, installed) {
  var sandbox = { exports: {} };
  sandbox.require = function (name) {
    if (name === 'lib/assi') return { files: { exists: function (p) { return installed && p === 'modules/holidays/main.js'; } } };
    if (name === 'modules/holidays/main.js') return phone.main;
    throw new Error('нет модуля ' + name);
  };
  vm.createContext(sandbox);
  vm.runInContext(phone.disk['tools/holidays.js'], sandbox, { filename: 'tools/holidays.js' });
  return sandbox.exports;
}

t.test('start() пишет tools/holidays.js, повторный — чинит изменённый, stop() убирает', function () {
  var phone = engine.make({ now: '2026-11-14T12:00:00' });
  phone.main.start();
  var text = phone.disk['tools/holidays.js'];
  assert.ok(text && text.indexOf("exports.name = 'holidays';") > 0, 'инструмент записан');
  var tool = loadTool(phone, true);
  assert.strictEqual(tool.name, 'holidays');
  assert.deepStrictEqual(plain(tool.parameters.properties.action['enum']), ['decor_off', 'decor_on', 'upcoming', 'remind', 'add']);
  assert.ok(/Выключи снег/.test(tool.description) && /на этой неделе/.test(tool.description) && /за три дня/.test(tool.description));
  phone.disk['tools/holidays.js'] = '// старое';
  phone.main.start();
  assert.strictEqual(phone.disk['tools/holidays.js'], text);
  phone.main.stop();
  assert.ok(!('tools/holidays.js' in phone.disk), 'после stop() инструмента нет');
});

t.test('модуль удалён — инструмент так и отвечает; чужое действие — понятный ответ', function () {
  var phone = engine.make({ now: '2026-11-14T12:00:00' });
  phone.main.start();
  assert.strictEqual(loadTool(phone, false).run({ action: 'upcoming' }), 'Модуль «Праздники» не установлен');
  assert.strictEqual(phone.main.tool({ action: 'greet' }), 'Неизвестное действие: greet');
  assert.strictEqual(phone.main.tool({ action: 'remind' }), 'Нужно имя: who');
});

t.test('«выключи снег» — decor_off снимает оформление, decor_on возвращает', function () {
  var phone = engine.make({ now: '2026-12-22T12:00:00', features: ['theme.decor'] });
  phone.main.start();
  phone.drain();
  assert.ok(phone.disk['themes/_decor.css'], 'снег идёт');
  var tool = loadTool(phone, true);
  var off = tool.run({ action: 'decor_off' });
  assert.deepStrictEqual(plain(off), { off: true, title: 'Новый год' });
  assert.ok(!phone.disk['themes/_decor.css'], 'снег снят');
  assert.strictEqual(phone.main.status().off, true);
  var on = tool.run({ action: 'decor_on' });
  assert.deepStrictEqual(plain(on), { on: true, title: 'Новый год' });
  assert.ok(phone.disk['themes/_decor.css'], 'снег вернулся');
});

t.test('«какие праздники на этой неделе» — upcoming на 7 дней, коротко', function () {
  var phone = engine.make({ now: '2026-11-14T12:00:00', granted: ['READ_CONTACTS'], contacts: CONTACTS });
  phone.main.start();
  var week = plain(loadTool(phone, true).run({ action: 'upcoming', days: 7 }));
  var titles = week.map(function (item) { return item.title; });
  assert.ok(titles.indexOf('День рождения: Аня Петрова') >= 0, JSON.stringify(titles));
  assert.ok(titles.indexOf('Новый год') < 0, 'Новый год не на этой неделе');
  var anya = week.filter(function (item) { return item.title === 'День рождения: Аня Петрова'; })[0];
  assert.strictEqual(anya.inDays, 1);
  assert.strictEqual(anya.when, 'Завтра');
  assert.strictEqual(anya.age, 30);
  assert.strictEqual(anya.date, '2026-11-15');
  assert.ok(!('look' in anya) && !('accent' in anya), 'без подробностей оформления');
  var whole = phone.main.tool({ action: 'upcoming' });
  assert.ok(whole.length > week.length, 'без days — на срок из настроек');
});

t.test('«напомни про день рождения Пети за три дня» — remind; «не напоминай» — off', function () {
  var phone = engine.make({ now: '2026-02-27T12:00:00', granted: ['READ_CONTACTS'], contacts: CONTACTS });
  phone.main.start();
  var tool = loadTool(phone, true);
  var marked = plain(tool.run({ action: 'remind', who: 'Петя', days: 3 }));
  assert.deepStrictEqual([marked.id, marked.close, marked.days], ['31', true, 3]);
  var settings = JSON.parse(phone.disk['data/holidays/settings.json']);
  assert.deepStrictEqual([settings.people['31'].remind, settings.people['31'].days], [true, 3]);
  var off = plain(tool.run({ action: 'remind', who: 'Петя', off: true }));
  assert.strictEqual(off.close, false);
  var plainRemind = plain(tool.run({ action: 'remind', who: 'Петя' }));
  assert.strictEqual(plainRemind.close, true, 'без days — просто напоминать');
  assert.throws(function () { tool.run({ action: 'remind', who: 'Незнакомец', days: 1 }); }, /Не нашёл/);
});

t.test('свой повод: «годовщина свадьбы 14.06, напомни за три дня» — add', function () {
  var phone = engine.make({ now: '2026-11-14T12:00:00' });
  phone.main.start();
  var made = plain(loadTool(phone, true).run({ action: 'add', title: 'Годовщина свадьбы', date: '14.06', remind: 3 }));
  assert.strictEqual(made.title, 'Годовщина свадьбы');
  assert.deepStrictEqual(made.rule, { fixed: '06-14' });
  assert.strictEqual(made.remind, 3);
  assert.strictEqual(plain(phone.main.ownOccasions()).length, 1);
});

t.done('tool');
