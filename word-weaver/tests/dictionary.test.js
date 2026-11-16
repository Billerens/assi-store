'use strict';
const assert = require('assert');
const D = require('../dictionary.js');

async function run() {
  let reads = [];
  const legacy = { [D.legacy]: 'owner dictionary', [D.bundled]: 'bundled dictionary' };
  const files = { exists: path => Object.prototype.hasOwnProperty.call(legacy, path), read: path => { reads.push(path); if (!(path in legacy)) throw Error('missing'); return legacy[path]; } };
  assert.equal(D.read(files), 'owner dictionary'); assert.deepEqual(reads, [D.legacy]);
  delete legacy[D.legacy]; reads = []; assert.equal(D.read(files), 'bundled dictionary'); assert.deepEqual(reads, [D.bundled]);
  legacy[D.legacy] = ''; reads = []; assert.equal(D.read(files), ''); assert.deepEqual(reads, [D.legacy]);
  assert.throws(() => D.read({ exists: () => true, read: () => { throw Error('owner unreadable'); } }), /owner unreadable/);
  for (const [legacyStatus, expectedCalls, expectedText] of [[200, 1, 'owner dictionary'], [404, 2, 'bundled dictionary']]) {
    const calls = [];
    const text = await D.load(async path => { calls.push(path); const own = path === '/' + D.legacy; return { status: own ? legacyStatus : 200, ok: !own || legacyStatus === 200, text: async () => own ? 'owner dictionary' : 'bundled dictionary' }; });
    assert.equal(text, expectedText); assert.equal(calls.length, expectedCalls); assert.equal(calls[0], '/' + D.legacy);
  }
  let calls = 0;
  await assert.rejects(D.load(async () => { calls++; return { status: 500, ok: false }; }), /HTTP 500/);
  assert.equal(calls, 1, 'An existing but broken owner resource must not silently change to the bundled dictionary');
  await assert.rejects(D.load(async () => ({ status: 404, ok: false })), /HTTP 404/);
  const preserved = JSON.stringify(legacy); D.read(files); assert.equal(JSON.stringify(legacy), preserved);
  console.log('dictionary: 9 checks passed; legacy data preferred, bundled fallback is read-only');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
