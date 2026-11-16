// The game's own device checks (checks.js: the engine's standard ones and the game's) run as
// module_check runs them on the phone, in a node workspace of the Assi harness: the game is
// copied to modules/games/<id>/ next to the hub's engine. The screen check needs the phone
// (ui.openWait), so here it is expected to fail on that alone. node tests/checks.test.js
'use strict';
const assert = require('assert');
const E = require('./env.js');

const x = E.setup();
const check = x.env.require('lib/check.js');

E.test('проверки игры проходят (кроме экрана — он только на телефоне)', () => {
  const t0 = Date.now();
  const out = check.run('games/' + E.ID);
  assert.ok(!out.missing, 'нет checks.js');
  out.results.forEach((r) => console.log('  ' + (r.skipped ? 'пропущено' : r.ok ? 'да ' : 'НЕТ') + ' · ' + r.name + (r.error && !r.ok ? ' — ' + r.error : r.skipped ? ' — ' + r.error : '') + ' (' + r.ms + ' мс)'));
  const bad = out.results.filter((r) => !r.ok && !r.skipped && !/экран/.test(r.name));
  assert.deepStrictEqual(bad.map((r) => r.name + ': ' + r.error), []);
  const screen = out.results.find((r) => /экран/.test(r.name));
  assert.ok(screen && !screen.ok && /ui\.openWait/.test(screen.error), 'проверка экрана без телефона: ' + JSON.stringify(screen));
  console.log('  всего ' + out.results.length + ' проверок за ' + (Date.now() - t0) + ' мс');
});

E.done('checks ' + E.ID);
