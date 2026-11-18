// Exercises the real Android adapter, including Rhino's unboxed Java numeric return values.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const calls = [];
const recycled = [];
const signature = 'setBitmap(android.graphics.Bitmap,android.graphics.Rect,boolean,int)';
const manager = {
  [signature](bitmap, crop, backup, flags) {
    assert.strictEqual(crop, null);
    assert.strictEqual(typeof flags, 'number');
    calls.push({ path: bitmap.path, flags });
    return calls.length;
  }
};
const scope = {
  exports: {}, context: {},
  require(id) {
    if (id === 'lib/axiko') return { files: { path: value => value } };
    return {};
  },
  java: { util: { concurrent: { TimeUnit: {} } }, lang: { Integer: { valueOf: Number } } },
  android: {
    graphics: {
      Bitmap: {},
      BitmapFactory: { decodeFile: value => ({ path: value, recycle: () => recycled.push(value) }) }
    },
    app: { WallpaperManager: { FLAG_SYSTEM: 1, FLAG_LOCK: 2, getInstance: () => manager } }
  }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'android.js'), 'utf8'), scope);
const files = { inner: 'inner.jpg', cover: 'cover.jpg' };
let result = scope.exports.setWallpaper({ mode: 'single' }, files, { inner: true, cover: true, lock: true, lockShot: 'cover' }, {});
assert.strictEqual(result.ok, true, result.error);
assert.deepStrictEqual(calls, [{ path: 'inner.jpg', flags: 1 }, { path: 'cover.jpg', flags: 2 }]);
assert.deepStrictEqual(recycled, ['inner.jpg', 'cover.jpg']);
assert.strictEqual(scope.exports.testFlag('cover.jpg', 17), 3);
assert.strictEqual(calls[2].flags, 17);
manager[signature] = () => { throw new Error('SecurityException: denied'); };
result = scope.exports.setWallpaper({ mode: 'single' }, files, { inner: true }, {});
assert.strictEqual(result.ok, false);
assert.strictEqual(result.denied, true);
assert.strictEqual(recycled.length, 4, 'bitmaps recycled even when Android refuses');
console.log('android adapter: 4 passed');
