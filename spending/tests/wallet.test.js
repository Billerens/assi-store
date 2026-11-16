// Invented Wallet receipts. No private messages, card numbers or amounts from a device.
const assert = require('assert');
const path = require('path');
const parser = require('../logic/parse');
const rules = require('../logic/rules');
const sim = require('./sim');
const text = 'Mastercard Demo Bank. ООО "ТЕСТОВЫЙ МАГАЗИН" 12,34 BYN';
const sender = 'com.samsung.android.spay';
const input = { text, sender };
let parsed = parser.parse(input, rules);
assert.strictEqual(parsed.status, 'ok');
assert.strictEqual(parsed.via, 'samsung-wallet-receipt');
assert.strictEqual(parsed.tx.amount, 12.34);
assert.strictEqual(parsed.tx.currency, 'BYN');
assert.strictEqual(parsed.tx.merchant, 'ООО "ТЕСТОВЫЙ МАГАЗИН"');
assert.notStrictEqual(parser.parse({ text, sender: 'untrusted.app' }, rules).status, 'ok');
assert.notStrictEqual(parser.parse({ text: 'Mastercard Demo Bank. МАГАЗИН 12 BYN 14 USD', sender }, rules).status, 'ok');
assert.notStrictEqual(parser.parse({ text: 'Mastercard Demo Bank. Возврат МАГАЗИН 12 BYN', sender }, rules).via, 'samsung-wallet-receipt');
assert.notStrictEqual(parser.parse({ text: 'Mastercard Demo Bank. Доступно на карте 120 BYN', sender }, rules).status, 'ok');
assert.strictEqual(parser.parse({ text: 'Mastercard Demo Bank. Оформите кредит до 120 BYN', sender }, rules).status, 'skip');

const engine = sim.create({ spending: path.resolve(__dirname, '..') });
try {
  const main = engine.require('modules/spending/main.js');
  const assi = engine.require('lib/assi');
  const db = assi.db('spending');
  engine.env.now = Date.now();
  main.saveSettings({ currency: 'BYN' });
  assi.files.writeJson('data/spending/state.json', { imported: engine.env.now, parserRevision: 1 });
  function pending(at) {
    db.exec('insert into unparsed (at, sender, app, source, text, shape, hash) values (?, ?, ?, ?, ?, ?, ?)',
      [at, sender, 'Samsung Wallet', 'wallet', text, parser.shape(text), main.sha1(text)]);
  }
  pending(engine.env.now);
  main.start(); // The new parser repairs already queued receipts on module start.
  assert.strictEqual(main.last(10).length, 1);
  assert.strictEqual(main.overview().summary.spent, 12.34);
  assert.strictEqual(main.sources().unparsed.length, 0);
  assert.strictEqual(engine.env.asked.length, 0, 'no model receives receipt text');
  main.start();
  assert.strictEqual(main.last(10).length, 1, 'startup is idempotent');

  // A crash between saving a transaction and removing the queue row cannot create a duplicate.
  pending(engine.env.now);
  assert.strictEqual(main.reparse().ok, 1);
  assert.strictEqual(main.last(10).length, 1);
  assert.strictEqual(main.sources().unparsed.length, 0);

  // Storage failure must retain the only saved copy for retry.
  pending(engine.env.now + 60000);
  const exec = db.exec;
  db.exec = function (sql, args) {
    if (/^insert into tx /.test(sql)) throw new Error('simulated disk full');
    return exec(sql, args);
  };
  const result = main.reparse();
  assert.strictEqual(result.failed, 1);
  assert.strictEqual(main.sources().unparsed.length, 1);
  db.exec = exec;
  assert.strictEqual(main.reparse().ok, 1);
  assert.strictEqual(main.sources().unparsed.length, 0);
  console.log('wallet receipt and migration: 9 passed');
} finally { engine.close(); }
