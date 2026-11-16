'use strict';
const assert = require('assert');
const { H, open, ID } = require('./env');
const { env } = open();

H.test('device checks pass except preview requiring the Android host', () => {
  const out = env.require('lib/check.js').run('games/' + ID);
  assert.ok(!out.missing, 'checks.js missing');
  for (const r of out.results) {
    const hostPreview = /экран/.test(r.name) && !r.ok && /ui\.openWait/.test(r.error || '');
    console.log('  ' + (r.skipped || hostPreview ? 'SKIP' : r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (hostPreview ? ': requires Android host; desktop coverage is browser-smoke.cjs' : r.error ? ': ' + r.error : ''));
  }
  const bad = out.results.filter((r) => !r.ok && !/экран/.test(r.name));
  assert.deepStrictEqual(bad.map((r) => r.name + ': ' + r.error), []);
  const preview = out.results.find((r) => /экран/.test(r.name));
  assert.ok(preview && !preview.ok && /ui\.openWait/.test(preview.error), 'unexpected preview result ' + JSON.stringify(preview));
});

H.done(ID + ': checks');

