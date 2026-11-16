// The probe below is the shape android.js probeFold() writes. Its members are plausible, not read
// from a Fold: AOSP 15 has setBitmapWithCrops(Bitmap, Map, boolean, int) public; the Samsung
// field is a made-up candidate of the kind the probe looks for.
var assert = require('assert');
var h = require('./harness');
var fold = require('../fold');

var PROBE = {
  sdk: 36,
  device: 'samsung SM-F966B',
  fields: [
    { name: 'FLAG_SYSTEM', value: 1, isStatic: true },
    { name: 'FLAG_LOCK', value: 2, isStatic: true },
    { name: 'SEM_FLAG_SUB_DISPLAY', value: 16, isStatic: true },
    { name: 'WHICH_COVER', value: '8', isStatic: true },
    { name: 'mDisplayContext', value: null, isStatic: false },
    { name: 'ORIENTATION_PORTRAIT', value: 1, isStatic: true }
  ],
  methods: [
    { name: 'setBitmapWithCrops', params: ['android.graphics.Bitmap', 'java.util.Map', 'boolean', 'int'] },
    { name: 'semSetWallpaper', params: ['android.graphics.Bitmap', 'int'] },
    { name: 'getWallpaperFile', params: ['int'] }
  ],
  errors: []
};

h.test('что искать отражением', function () {
  ['SEM_FLAG_SUB_DISPLAY', 'semSetWallpaper', 'setBitmapWithCrops', 'WHICH_COVER', 'FLAG_FOLD'].forEach(function (name) {
    assert.ok(fold.interesting(name), name);
  });
  ['FLAG_LOCK', 'getWallpaperFile', 'mContext'].forEach(function (name) { assert.ok(!fold.interesting(name), name); });
});

h.test('разбор разведки: кадрирования и флаги-кандидаты', function () {
  var summary = fold.summarize(PROBE);
  assert.strictEqual(summary.sdk, 36);
  assert.deepStrictEqual(summary.crops, { name: 'setBitmapWithCrops', params: ['android.graphics.Bitmap', 'java.util.Map', 'boolean', 'int'], kind: 'map' });
  // What an Android 16 build exposes publicly (seen on the emulator): crops keyed by orientation.
  var stream = fold.summarize({ sdk: 37, fields: [], methods: [{ name: 'setStreamWithCrops', params: ['java.io.InputStream', 'android.util.SparseArray', 'boolean', 'int'] }] });
  assert.strictEqual(stream.crops.kind, 'orientations');
  assert.strictEqual(fold.plan(stream, 'auto', null, {}).mode, 'crops');
  // A string value is not a flag; FLAG_SYSTEM says nothing about another display.
  assert.deepStrictEqual(summary.flags, [{ name: 'SEM_FLAG_SUB_DISPLAY', value: 16 }]);
  assert.ok(summary.methods.indexOf('semSetWallpaper(Bitmap, int)') >= 0);
  assert.ok(summary.fields.indexOf('SEM_FLAG_SUB_DISPLAY = 16') >= 0);
  var empty = fold.summarize({ sdk: 34, fields: [], methods: [{ name: 'setBitmapWithCrops', params: ['android.graphics.Bitmap'] }] });
  assert.strictEqual(empty.crops, null);
  assert.deepStrictEqual(fold.summarize(null).flags, []);
});

h.test('способ: проверенный флаг, кадрирования, один кадр', function () {
  var summary = fold.summarize(PROBE);
  var confirmed = { name: 'SEM_FLAG_SUB_DISPLAY', value: 16 };
  assert.strictEqual(fold.plan(summary, 'auto', confirmed, {}).mode, 'flag');
  assert.strictEqual(fold.plan(summary, 'auto', null, {}).mode, 'crops');
  assert.strictEqual(fold.plan(summary, 'auto', null, { crops: 'не вышло' }).mode, 'single');
  assert.strictEqual(fold.plan(summary, 'auto', confirmed, { flag: 'бросил' }).mode, 'crops');
  assert.strictEqual(fold.plan(summary, 'crops', confirmed, {}).mode, 'crops');
  var flagNotChecked = fold.plan(summary, 'flag', null, {});
  assert.strictEqual(flagNotChecked.mode, 'single');
  assert.ok(/не проверен/.test(flagNotChecked.why));
  assert.ok(/нет обоев с кадрированиями/.test(fold.plan(fold.summarize({ sdk: 34 }), 'crops', null, {}).why));
  assert.ok(/так выбрано/.test(fold.plan(summary, 'single', confirmed, {}).why));
  assert.strictEqual(fold.plan(null, 'auto', null, null).mode, 'single');
});

h.test('честная строка на экране настроек', function () {
  var summary = fold.summarize(PROBE);
  var line = fold.honest(fold.plan(summary, 'auto', null, {}), summary);
  assert.ok(/setBitmapWithCrops/.test(line));
  assert.ok(/SEM_FLAG_SUB_DISPLAY — их можно проверить/.test(line));
  var none = fold.honest(fold.plan(null, 'auto', null, {}), null);
  assert.ok(/недоступны/.test(none) && /не проводилась/.test(none));
  assert.deepStrictEqual(fold.singleShot({ innerWidth: 1812, innerHeight: 2176 }), { width: 1812, height: 2176 });
});

h.done(__filename);
