// checks.js of the game through the hub's lib/check.js, as module_check runs it on the phone.
// Everything passes except the screen check: there is no WebView in node (ui.openWait).
const assert = require('assert');
const E = require('./env.js');
const { env, ID } = E.setup();

E.test('checks.js игры проходят (кроме экрана — в node его нет)', () => {
  const out = env.require('lib/check.js').run('games/' + ID);
  assert.ok(!out.missing, 'нет checks.js');
  out.results.forEach((r) => console.log('  ' + (r.ok ? 'ок ' : 'нет') + ' — ' + r.name + (r.ok ? '' : ': ' + String(r.error).slice(0, 140))));
  assert.ok(out.results.length >= 10, 'проверок: ' + out.results.length);
  const bad = out.results.filter((r) => !r.ok && !/экран/.test(r.name));
  assert.deepStrictEqual(bad.map((r) => r.name + ': ' + r.error), []);
  const screen = out.results.find((r) => /экран/.test(r.name));
  assert.ok(screen && !screen.ok && /ui\.openWait/.test(screen.error), 'проверка экрана без телефона: ' + JSON.stringify(screen));
});

E.done('checks.js ' + ID);
