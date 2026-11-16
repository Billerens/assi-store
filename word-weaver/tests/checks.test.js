const T = require('./env.js');
const x = T.open();
T.test('checks.js игры на «телефоне» (кроме экрана)', () => {
  const out = x.check.run('games/' + x.id);
  const bad = out.results.filter((r) => !r.ok && !/экран/.test(r.name));
  if (bad.length) throw new Error(bad.map((r) => r.name + ': ' + r.error).join('\n'));
  console.log('  ' + out.results.map((r) => (r.ok ? '+ ' : '- ') + r.name).join('\n  '));
});
T.done('checks');
