// The game's checks.js as module_check runs them on the phone (lib/check.js over the harness):
// the engine's standard checks plus the game's own. The screen check needs the phone
// (ui.openWait), so here it may fail on that alone. node tests/standard.test.js
'use strict';
const assert = require('assert');
const { open, ID, test, done } = require('./env');

test('checks.js игры: всё, кроме экрана', () => {
  const x = open();
  const out = x.check.run('games/' + ID);
  assert.ok(!out.missing, 'нет checks.js');
  out.results.forEach((r) => console.log('  ' + (r.ok ? (r.skipped ? 'пропущено' : 'ок') : 'НЕТ') + ': ' + r.name + (r.error && !r.ok ? ' — ' + r.error : r.skipped ? ' — ' + r.error : '') + ' (' + r.ms + ' мс)'));
  const bad = out.results.filter((r) => !r.ok && !/экран/.test(r.name));
  assert.deepStrictEqual(bad.map((r) => r.name + ': ' + r.error), []);
});

done('standard');
