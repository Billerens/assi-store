// The checks of «Подземка» (checks.js: the kit's standard ones and the game's own) run by lib/check.js
// as module_check runs them on the phone. The screen check needs the phone (ui.openWait), so here
// it is expected to fail on that alone. node tests/checks.test.js
'use strict';
const path = require('node:path');
const assert = require('assert');
const { setup } = require('./env');
const { test, done } = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));

const x = setup();
const check = x.env.require('lib/check.js');

test('все проверки checks.js, кроме экрана без телефона', () => {
  const t0 = Date.now();
  const out = check.run('games/subway');
  assert.ok(!out.missing, 'нет checks.js');
  out.results.forEach((r) => console.log('  ' + (r.ok ? 'ok ' : 'НЕТ') + ' ' + r.name + (r.ok ? '' : ': ' + r.error)));
  console.log('  ' + out.results.length + ' проверок за ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
  const bad = out.results.filter((r) => !r.ok && !/экран/.test(r.name));
  assert.deepStrictEqual(bad.map((r) => r.name + ': ' + r.error), []);
  const screen = out.results.find((r) => /экран/.test(r.name));
  assert.ok(screen && !screen.ok && /ui\.openWait/.test(screen.error), 'проверка экрана без телефона: ' + JSON.stringify(screen));
  const own = ['темп: бот из «Темпа»', 'офлайн 8 ч', 'ночь и час пик', 'офлайн 30 суток', 'большие числа', 'переезд', 'сундук'];
  own.forEach((name) => assert.ok(out.results.some((r) => r.name.indexOf(name) === 0 && r.ok), 'своя проверка «' + name + '»'));
});

done('Подземка, checks.js');
