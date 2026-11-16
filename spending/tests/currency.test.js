// Synthetic SQLite fixtures only. No device, account, network or personal financial records.
'use strict';
var assert = require('assert');
var path = require('path');
var sim = require('./sim.js');
var ROOT = path.resolve(__dirname, '..');
var T0 = new Date(2026, 10, 14, 12).getTime();
var DAY = 864e5;
var passed = 0, failed = 0;

if (!sim.realBase()) throw new Error('Assi lib/base.js is required for currency integration tests');

function day(at) {
  var d = new Date(at);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function check(name, fn) {
  var e = sim.create({ spending: ROOT });
  e.env.now = T0;
  try {
    var main = e.require('modules/spending/main.js');
    var assi = e.require('lib/assi');
    var base = e.require('lib/base');
    var db = assi.db('spending');
    main.start();
    fn({ main: main, env: e.env, files: assi.files, db: db, base: base });
    passed++;
  } catch (error) {
    failed++;
    console.log('FAIL ' + name + '\n' + (error.stack || error));
  } finally { e.close(); }
}
function cache(x, dates, rates) {
  var all = x.files.readJson('data/spending/rates.json', {});
  dates.forEach(function (at) { all[day(at)] = rates || { BYN: 25, USD: 100, EUR: 125 }; });
  x.files.writeJson('data/spending/rates.json', all);
}
function add(x, amount, currency, extra) {
  return x.main.addManual(Object.assign({ amount: amount, currency: currency, title: 'Synthetic fixture', category: 'Дом', at: T0 }, extra || {}));
}
function row(x, id) { return x.db.query('select * from tx where id = ?', [id])[0]; }
function originals(x) {
  return x.db.query('select id,at,amount,currency,type,merchantRaw,merchant,category,source,raw,rawHash,note,dupOf,internal,excluded from tx order by id');
}
function baseEntries(x) { return x.base.find({ kinds: ['expense', 'income'], limit: 1000 }).filter(function (r) { return r.source === 'spending'; }); }
function legacyTarget(x, currency) {
  var s = x.files.readJson('data/spending/settings.json', {});
  s.currency = currency;
  x.files.writeJson('data/spending/settings.json', s);
  x.db.exec('update tx set baseCurrency = null, bankAmount = null, bankCurrency = null');
}

check('RUB→BYN→USD→RUB always derives from original amounts without accumulated rounding', function (x) {
  cache(x, [T0]);
  var ids = [add(x, 123.45, 'RUB').id, add(x, 7.31, 'BYN').id, add(x, 3.17, 'USD').id];
  var source = originals(x);
  var baseIds = baseEntries(x).map(function (r) { return r.id; }).sort();
  [['BYN', [4.94, 7.31, 12.68]], ['USD', [1.23, 1.83, 3.17]], ['RUB', [123.45, 182.75, 317]]].forEach(function (step) {
    var result = x.main.saveSettings({ currency: step[0] });
    assert.strictEqual(result.conversion.currency, step[0]);
    assert.strictEqual(result.conversion.pending, 0);
    ids.forEach(function (id, i) {
      assert.strictEqual(row(x, id).amountBase, step[1][i]);
      assert.strictEqual(row(x, id).baseCurrency, step[0]);
    });
    assert.deepStrictEqual(originals(x), source);
    assert.ok(baseEntries(x).every(function (r) { return r.unit === step[0]; }));
    assert.deepStrictEqual(baseEntries(x).map(function (r) { return r.id; }).sort(), baseIds);
  });
  assert.strictEqual(x.main.repairCurrency({ fetchRates: false }).updated, 0);
  assert.strictEqual(x.main.saveSettings({ currency: 'RUB' }).conversion.updated, 0);
});

check('legacy already-BYN settings repair stale RUB cache without FX or relabeling original data', function (x) {
  cache(x, [T0]);
  var id = add(x, 8.12, 'BYN', { note: 'must survive repair' }).id;
  assert.strictEqual(row(x, id).amountBase, 203);
  legacyTarget(x, 'BYN');
  x.files.writeJson('data/spending/rates.json', {});
  var requests = 0;
  x.env.http = function () { requests++; throw new Error('offline fixture'); };
  var source = originals(x);
  var report = x.main.repairCurrency({ fetchRates: false });
  assert.strictEqual(report.pending, 0);
  assert.strictEqual(report.updated, 1);
  assert.strictEqual(row(x, id).amountBase, 8.12);
  assert.strictEqual(row(x, id).baseCurrency, 'BYN');
  assert.strictEqual(row(x, id).fx, null);
  assert.strictEqual(baseEntries(x)[0].amount, 8.12);
  assert.strictEqual(baseEntries(x)[0].unit, 'BYN');
  assert.deepStrictEqual(originals(x), source);
  assert.strictEqual(requests, 0);
  assert.strictEqual(x.main.repairCurrency({ fetchRates: false }).updated, 0);
});

check('module startup also repairs settings changed by the old implementation', function (x) {
  cache(x, [T0]);
  var id = add(x, 4.24, 'BYN').id;
  legacyTarget(x, 'BYN');
  x.files.writeJson('data/spending/rates.json', {});
  x.main.start();
  assert.strictEqual(row(x, id).amountBase, 4.24);
  assert.strictEqual(row(x, id).fx, null);
  assert.strictEqual(x.main.overview().summary.spent, 4.24);
  x.main.start();
  assert.strictEqual(baseEntries(x).length, 1);
});

check('missing FX marks the same shared-base record pending instead of keeping a stale amount', function (x) {
  var id = add(x, 125, 'RUB').id;
  var baseId = row(x, id).baseId;
  var source = originals(x);
  var requests = 0;
  x.env.http = function () { requests++; return { ok: false, status: 404, json: function () { return {}; } }; };
  var spawn = global.spawn;
  var queued = [];
  global.spawn = function (fn) { queued.push(fn); };
  var result;
  try { result = x.main.saveSettings({ currency: 'BYN' }); }
  finally { global.spawn = spawn; }
  assert.strictEqual(result.conversion.pending, 1);
  assert.strictEqual(row(x, id).amountBase, null);
  assert.strictEqual(row(x, id).fx, 'pending');
  assert.strictEqual(row(x, id).baseCurrency, 'BYN');
  assert.strictEqual(baseEntries(x).length, 1);
  assert.strictEqual(row(x, id).baseId, baseId);
  assert.strictEqual(x.base.get(baseId).amount, null);
  assert.strictEqual(x.base.get(baseId).unit, 'BYN');
  assert.strictEqual(x.main.overview().summary.spent, 0);
  assert.deepStrictEqual(originals(x), source);
  assert.strictEqual(requests, 0, 'saving a currency and reading it must not wait for network requests');
  queued.forEach(function (fn) { fn(); });
  assert.strictEqual(row(x, id).amountBase, null, 'an unavailable background rate must keep the original pending');
  cache(x, [T0]);
  x.main.retryRates();
  assert.strictEqual(row(x, id).amountBase, 5);
  assert.strictEqual(baseEntries(x).length, 1);
  assert.strictEqual(row(x, id).baseId, baseId);
  x.main.retryRates();
  assert.strictEqual(baseEntries(x).length, 1);
});

check('repair preserves extra shared-base metadata and resumes after a partial base-write failure', function (x) {
  cache(x, [T0]);
  var ids = [add(x, 125, 'RUB').id, add(x, 250, 'RUB').id];
  var links = ids.map(function (id) { return row(x, id).baseId; });
  var record = x.base.get(links[0]);
  x.base.update(links[0], { data: Object.assign({}, record.data, { custom: { label: 'retained' } }) });
  var source = originals(x);
  var update = x.base.update;
  var calls = 0;
  x.base.update = function (id, patch) {
    if (++calls === 2) throw new Error('synthetic shared-base write failure');
    return update(id, patch);
  };
  try { x.main.saveSettings({ currency: 'BYN' }); } catch (expected) { /* persisted repair is resumable */ }
  finally { x.base.update = update; }
  assert.strictEqual(calls, 2, 'the fixture interrupts the second shared-base update');
  var committedCurrency = x.main.settings().settings.currency;
  assert.ok(committedCurrency === 'RUB' || committedCurrency === 'BYN');

  x.main.repairCurrency({ fetchRates: false });

  assert.deepStrictEqual(originals(x), source);
  ids.forEach(function (id, index) {
    var expected = (index + 1) * (committedCurrency === 'BYN' ? 5 : 125);
    assert.strictEqual(row(x, id).amountBase, expected);
    assert.strictEqual(row(x, id).baseId, links[index]);
    assert.strictEqual(x.base.get(links[index]).amount, expected);
    assert.strictEqual(x.base.get(links[index]).unit, committedCurrency);
  });
  assert.deepStrictEqual(x.base.get(links[0]).data.custom, { label: 'retained' });
  assert.strictEqual(baseEntries(x).length, 2);
});

check('pending operations older than 30 days are retried using their historical date', function (x) {
  var old = T0 - 90 * DAY;
  var id = add(x, 120, 'RUB', { at: old }).id;
  x.main.saveSettings({ currency: 'BYN' });
  cache(x, [old], { BYN: 30, USD: 90 });
  cache(x, [T0], { BYN: 20, USD: 100 });
  x.main.retryRates();
  assert.strictEqual(row(x, id).amountBase, 4);
  assert.strictEqual(row(x, id).fx, 'cbr');
  assert.strictEqual(x.main.repairCurrency({ fetchRates: false }).updated, 0);
});

check('typed historical conversion survives rate-cache eviction until the target currency changes', function (x) {
  var old = T0 - 90 * DAY;
  cache(x, [old]);
  var id = add(x, 2, 'USD', { at: old }).id;
  var baseId = row(x, id).baseId;
  assert.strictEqual(row(x, id).amountBase, 200);
  assert.strictEqual(row(x, id).baseCurrency, 'RUB');
  x.files.writeJson('data/spending/rates.json', {});
  var requests = 0;
  x.env.http = function () { requests++; return { ok: false, status: 404, json: function () { return {}; } }; };

  assert.strictEqual(x.main.repairCurrency({ fetchRates: false }).pending, 0);
  x.main.start();
  assert.strictEqual(row(x, id).amountBase, 200);
  assert.strictEqual(row(x, id).fx, 'cbr');
  assert.strictEqual(x.base.get(baseId).amount, 200);
  assert.strictEqual(requests, 0);

  x.main.saveSettings({ currency: 'BYN' });
  assert.strictEqual(row(x, id).amountBase, null, 'a cache typed as RUB is not a bank debit or a BYN amount');
  assert.strictEqual(row(x, id).fx, 'pending');
  assert.strictEqual(row(x, id).amount, 2);
  assert.strictEqual(row(x, id).currency, 'USD');
  x.main.saveSettings({ currency: 'USD' });
  assert.strictEqual(row(x, id).amountBase, 2);
  assert.strictEqual(row(x, id).fx, null);
  assert.strictEqual(row(x, id).baseId, baseId);
});

check('one FX refresh repairs more historical days than fit in the persistent rate cache', function (x) {
  var ids = [];
  for (var i = 0; i < 65; i++) ids.push(add(x, 25 * (i + 1), 'RUB', { at: T0 - i * DAY }).id);
  var queued = [], spawn = global.spawn;
  global.spawn = function (fn) { queued.push(fn); };
  try { x.main.saveSettings({ currency: 'BYN' }); }
  finally { global.spawn = spawn; }
  x.env.http = function () {
    return { ok: true, status: 200, json: function () { return { Valute: { BYN: { Nominal: 1, Value: 25 } } }; } };
  };

  var result = x.main.repairCurrency({ fetchRates: true });

  assert.strictEqual(result.pending, 0, 'rates fetched earlier in the pass survive cache eviction until commit');
  ids.forEach(function (id, index) { assert.strictEqual(row(x, id).amountBase, index + 1); });
  assert.strictEqual(baseEntries(x).length, 65);
  queued.forEach(function (fn) { fn(); });
  x.files.writeJson('data/spending/rates.json', {});
  assert.strictEqual(x.main.repairCurrency({ fetchRates: false }).pending, 0);
});

check('currency repair respects the rate date of every operation', function (x) {
  var before = T0 - DAY;
  cache(x, [before], { BYN: 20 });
  cache(x, [T0], { BYN: 25 });
  var a = add(x, 100, 'RUB', { at: before }).id;
  var b = add(x, 100, 'RUB').id;
  x.main.saveSettings({ currency: 'BYN' });
  assert.strictEqual(row(x, a).amountBase, 5);
  assert.strictEqual(row(x, b).amountBase, 4);
});

function bankFixture(x) {
  cache(x, [T0]);
  var result = x.env.handlers.notification({ package: 'com.idamob.tinkoff.android', title: 'Покупка 15,50 €',
    text: '1 612,40 ₽ по курсу банка. BOLT.EU. Карта *1234. Доступно 9 720 ₽', time: T0, key: 'synthetic-bank-debit' });
  assert.strictEqual(result.status, 'ok');
  return result.id;
}
check('known bank debit survives base-currency cycles as separate original evidence', function (x) {
  var id = bankFixture(x);
  var source = originals(x);
  [['BYN', 64.5], ['USD', 16.12], ['EUR', 15.5], ['RUB', 1612.4]].forEach(function (step) {
    x.main.saveSettings({ currency: step[0] });
    var r = row(x, id);
    assert.strictEqual(r.amountBase, step[1]);
    assert.strictEqual(r.bankAmount, 1612.4);
    assert.strictEqual(r.bankCurrency, 'RUB');
    assert.deepStrictEqual(originals(x), source);
  });
  assert.strictEqual(row(x, id).fx, 'bank');
});

check('editing the original amount invalidates evidence for the previous bank debit', function (x) {
  var id = bankFixture(x);
  x.main.saveSettings({ currency: 'BYN' });
  x.main.setAmount(id, 16);
  x.main.saveSettings({ currency: 'RUB' });
  assert.strictEqual(row(x, id).amount, 16);
  assert.strictEqual(row(x, id).amountBase, 2000);
  assert.strictEqual(row(x, id).bankAmount, null);
  assert.strictEqual(row(x, id).bankCurrency, null);
});

check('repair preserves refund signs, income kinds, exclusions and transfers to self', function (x) {
  cache(x, [T0]);
  add(x, 100, 'RUB');
  add(x, 25, 'RUB', { type: 'refund' });
  add(x, 50, 'RUB', { type: 'income' });
  var excluded = add(x, 500, 'RUB').id;
  var internal = add(x, 750, 'RUB', { type: 'transfer_out' }).id;
  x.main.setExcluded(excluded, true);
  x.main.setInternal(internal, true);
  var before = originals(x);
  x.main.saveSettings({ currency: 'BYN' });
  assert.strictEqual(x.main.overview().summary.spent, 3);
  var entries = baseEntries(x);
  assert.strictEqual(entries.length, 3);
  assert.deepStrictEqual(entries.filter(function (r) { return r.kind === 'expense'; }).map(function (r) { return r.amount; }).sort(), [-1, 4]);
  assert.strictEqual(entries.filter(function (r) { return r.kind === 'income'; })[0].amount, 2);
  assert.deepStrictEqual(originals(x), before);
});

check('budget numbers and unrelated settings are preserved by changing the display currency', function (x) {
  x.main.saveSettings({ budget: 1000, categoryLimits: { 'Дом': 150 }, monthStartDay: 7, keepRaw: false });
  x.main.setMonthBudget('2026-11', { total: 1200, categories: { 'Дом': 175 } });
  var plans = x.files.readJson('data/spending/budget.json', {});
  var result = x.main.saveSettings({ currency: 'BYN' });
  assert.strictEqual(result.settings.budget, 1000);
  assert.deepStrictEqual(result.settings.categoryLimits, { 'Дом': 150 });
  assert.strictEqual(result.settings.monthStartDay, 7);
  assert.strictEqual(result.settings.keepRaw, false);
  assert.deepStrictEqual(x.files.readJson('data/spending/budget.json', {}), plans);
});

check('subscription totals convert original currencies and never reuse mixed cached yearly values', function (x) {
  cache(x, [T0]);
  [[250, 'RUB', 'month'], [2, 'USD', 'month'], [10, 'BYN', 'year'], [1, 'XYZ', 'month']].forEach(function (p, i) {
    x.db.exec('insert into subs (merchant,amount,currency,period,next,confirmed,remind,yearly,created,updated) values (?,?,?,?,?,1,1,999999,?,?)',
      ['Synthetic subscription ' + i, p[0], p[1], p[2], T0 + DAY, T0, T0]);
  });
  var before = x.db.query('select id,amount,currency,period from subs order by id');
  x.main.saveSettings({ currency: 'BYN' });
  var subscriptions = x.main.subscriptions();
  assert.strictEqual(subscriptions.perYear, 226);
  assert.strictEqual(subscriptions.perMonth, 19);
  assert.strictEqual(subscriptions.pendingRates, 1);
  assert.deepStrictEqual(x.db.query('select id,amount,currency,period from subs order by id'), before);
  assert.ok(subscriptions.confirmed.every(function (s) { return s.baseCurrency === 'BYN'; }));
});

check('subscription detection uses original currency despite FX fluctuations and does not mix currencies', function () {
  var subs = require('../logic/subs.js');
  var options = { minCount: 3, dayTol: 3, amountTolPct: 15, now: T0 };
  var usd = [0, 1, 2].map(function (index) {
    return { id: index + 1, at: new Date(2026, 7 + index, 14, 12).getTime(), type: 'purchase',
      amount: 5, currency: 'USD', amountBase: [400, 700, null][index], merchant: 'Synthetic service', key: 'service' };
  });
  var found = subs.detect(usd, options);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].amount, 5);
  assert.strictEqual(found[0].currency, 'USD');
  assert.strictEqual(found[0].yearly, 60);
  var mixed = usd.map(function (tx, index) { return Object.assign({}, tx, { amountBase: 500, currency: index === 1 ? 'BYN' : 'USD' }); });
  assert.strictEqual(subs.detect(mixed, options).length, 0, 'two USD charges plus one BYN charge are not three matching payments');
});

check('trial detection keeps the one-ruble threshold independent of display currency', function () {
  var subs = require('../logic/subs.js');
  var fixtures = [
    { amount: 1, currency: 'USD', amountBase: 0.01, baseCurrency: 'BYN' },
    { amount: 1, currency: 'BYN', amountBase: 1, baseCurrency: 'BYN' },
    { amount: 1, currency: 'RUB', amountBase: 0.01, baseCurrency: 'USD' },
    { amount: 0, currency: 'USD', amountBase: 0, baseCurrency: 'USD' },
    { amount: 0.25, currency: 'USD', bankAmount: 1, bankCurrency: 'RUB' },
    { amount: 0.25, currency: 'USD', bankAmount: 3, bankCurrency: 'RUB' },
    { amount: null, currency: 'RUB', amountBase: null }
  ].map(function (tx, index) {
    return Object.assign({ id: index + 1, at: T0, type: 'purchase', merchant: 'Synthetic trial ' + index, key: 'trial-' + index }, tx);
  });
  assert.deepStrictEqual(subs.trials(fixtures, 7).map(function (t) { return t.txId; }), [3, 4, 5]);
});

check('foreign shared-base records are converted for display without rewriting their originals', function (x) {
  cache(x, [T0]);
  var ids = [[100, 'RUB'], [2, 'USD'], [-1, 'EUR'], [5, 'XYZ']].map(function (p, i) {
    return x.base.add({ kind: 'expense', at: T0, title: 'Synthetic external ' + i, amount: p[0], unit: p[1], source: 'test-agent' });
  });
  var before = ids.map(function (id) { return x.base.get(id); });
  x.main.saveSettings({ currency: 'BYN' });
  assert.strictEqual(x.main.overview().summary.spent, 7);
  assert.strictEqual(x.main.tx('b' + ids[0]).amountBase, 4);
  assert.strictEqual(x.main.tx('b' + ids[3]).amountBase, null);
  assert.strictEqual(x.main.tx('b' + ids[3]).fx, 'pending');
  assert.deepStrictEqual(ids.map(function (id) { return x.base.get(id); }), before);
});

check('invalid exchange rates cannot create negative, infinite or NaN converted amounts', function () {
  var money = require('../logic/money.js');
  [0, -5, NaN, Infinity, 'broken'].forEach(function (rate) {
    assert.strictEqual(money.convert(10, 'USD', 'RUB', { USD: rate }), null);
    assert.strictEqual(money.convert(10, 'RUB', 'BYN', { BYN: rate }), null);
  });
});

console.log('currency: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
