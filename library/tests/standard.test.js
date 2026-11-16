// The engine's standard checks of the game (engine/checks-kit.js, run by lib/check.js as
// module_check runs them on the phone) plus the game's own checks.js. The screen check needs the
// phone (ui.openWait), so here it is expected to fail on that alone.  node tests/standard.test.js
'use strict';
const assert = require('assert');
const { H, open } = require('./env');

const w = open();
const check = w.env.require('lib/check.js');

H.test('checks.js: стандартные и свои проверки', () => {
  const out = check.run('games/' + w.id);
  assert.ok(!out.missing, 'нет checks.js');
  out.results.forEach((r) => console.log('  ' + (r.ok ? (r.skipped ? 'пропущено' : 'да') : 'НЕТ') + ': ' + r.name + (r.error ? ' — ' + r.error : '') + ' (' + r.ms + ' мс)'));
  const bad = out.results.filter((r) => !r.ok && !/экран/.test(r.name));
  assert.deepStrictEqual(bad.map((r) => r.name + ': ' + r.error), []);
  const screen = out.results.find((r) => /экран/.test(r.name));
  assert.ok(screen && /ui\.openWait/.test(String(screen.error)), 'проверка экрана без телефона: ' + JSON.stringify(screen));
});

H.done(w.id + ': стандартные проверки');
