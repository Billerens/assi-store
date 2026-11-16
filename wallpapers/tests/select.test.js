var assert = require('assert');
var h = require('./harness');
var select = require('../select');
var settingsLib = require('../settings');
var ctx = require('../context');
var sources = require('../sources');

var S = settingsLib.defaults();

function grid(width, height, fn) {
  var out = [];
  for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) out.push(fn(x, y));
  return out;
}

h.test('dHash: градиент, его зеркало, похожая и другая картинки', function () {
  var right = select.dhash(grid(9, 8, function (x) { return x * 20; }));
  var left = select.dhash(grid(9, 8, function (x) { return 200 - x * 20; }));
  assert.strictEqual(right, '0000000000000000');
  assert.strictEqual(left, 'ffffffffffffffff');
  assert.strictEqual(select.hamming(right, left), 64);
  var noisy = grid(9, 8, function (x, y) { return 200 - x * 20 + (x === 3 && y === 2 ? 30 : 0); });
  assert.ok(select.hamming(select.dhash(noisy), left) <= 2);
  assert.strictEqual(select.hamming('', left), 64);
  assert.strictEqual(select.dhash([1, 2, 3]), '');
});

h.test('яркость и чёткость середины', function () {
  assert.strictEqual(select.luma(0xFFFFFFFF | 0), 255);
  assert.strictEqual(Math.round(select.luma(0xFF000000 | 0)), 0);
  assert.strictEqual(Math.round(select.luma(0xFFFF0000 | 0)), 76);
  assert.strictEqual(select.brightness(grid(4, 4, function () { return 51; })), 0.2);
  var flat = grid(32, 32, function () { return 90; });
  var checker = grid(32, 32, function (x, y) { return (x + y) % 2 ? 200 : 40; });
  assert.strictEqual(select.centerContrast(flat, 32), 0);
  assert.ok(select.centerContrast(checker, 32) > 0.6);
});

function jpegHead(width, height) {
  // SOI, an APP0 of 16 bytes, a DQT of 6, then SOF2 (progressive).
  var bytes = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
  for (var i = 0; i < 14; i++) bytes.push(0);
  bytes.push(0xFF, 0xDB, 0x00, 0x06, 1, 2, 3, 4);
  bytes.push(0xFF, 0xC2, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 3);
  for (var j = 0; j < 12; j++) bytes.push(0);
  return bytes;
}

h.test('размер картинки по первым байтам: JPEG, PNG, WebP', function () {
  assert.deepStrictEqual(select.imageSize(jpegHead(4000, 2667)), { type: 'jpeg', width: 4000, height: 2667 });
  var png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x0F, 0xA0, 0, 0, 0x17, 0x70, 8, 6];
  assert.deepStrictEqual(select.imageSize(png), { type: 'png', width: 4000, height: 6000 });
  var vp8x = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0];
  var w = 2999;
  var hgt = 4499;
  vp8x.push(w & 255, (w >> 8) & 255, w >> 16, hgt & 255, (hgt >> 8) & 255, hgt >> 16);
  assert.deepStrictEqual(select.imageSize(vp8x), { type: 'webp', width: 3000, height: 4500 });
  assert.strictEqual(select.imageSize([0x47, 0x49, 0x46]), null);
  assert.strictEqual(select.imageSize(null), null);
  var html = Array.from(Buffer.from('<!DOCTYPE html><html><head><title>x</title>'));
  assert.strictEqual(select.imageSize(html), null);
});

function today() { return '2026-11-14'; }

h.test('первое сито: размер, повтор, автор, файл, люди, ссылка', function () {
  var items = sources.parse('commons', h.sample('commons'), { minSide: 2400 }).items;
  var history = [
    { source: 'commons', source_id: '69470251', author: 'x', day: '2026-01-10' },
    { source: 'openverse', source_id: 'zzz', author: 'Bencegyulai', day: '2026-11-05' },
    { source: 'commons', source_id: '45574711', author: 'y', day: '2024-01-01' }
  ];
  items[0].people = true;
  items[4].bytes = 40 * 1048576;
  var result = select.prefilter(items, history, S, today(), ctx.daysBetween);
  var why = {};
  result.dropped.forEach(function (entry) { why[entry.item.sourceId] = entry.why; });
  assert.strictEqual(why['99193060'], 'люди в кадре');
  assert.strictEqual(why['69470251'], 'уже была');
  assert.strictEqual(why['97165341'], 'автор был недавно');
  assert.ok(/больше 30 МБ/.test(why['202774559']));
  assert.strictEqual(why['79282603'], 'мала: 3000×2008');
  // Shown two years ago: may come again.
  assert.deepStrictEqual(result.kept.map(function (item) { return item.sourceId; }), ['45574711']);
  var small = select.prefilter([{ source: 'x', sourceId: '1', width: 1600, height: 1067, originalUrl: 'a', thumbUrl: 'b' }], [], S, today(), ctx.daysBetween);
  assert.ok(/мала/.test(small.dropped[0].why));
  var probe = select.prefilter([{ source: 'x', sourceId: '1', width: 0, height: 0, probe: true, originalUrl: 'a', thumbUrl: 'b' }], [], S, today(), ctx.daysBetween);
  assert.strictEqual(probe.kept.length, 1);
  var allowed = settingsLib.normalize({ allowPeople: true });
  assert.ok(!select.prefilter([items[0]], [], allowed, today(), ctx.daysBetween).dropped.length);
});

h.test('второе сито: похожие, светлые, двойники среди найденных', function () {
  var a = { sourceId: 'a', dhash: 'ffff0000ffff0000', brightness: 0.2 };
  var b = { sourceId: 'b', dhash: 'ffff0000ffff0001', brightness: 0.2 };
  var c = { sourceId: 'c', dhash: '0123456789abcdef', brightness: 0.7 };
  var d = { sourceId: 'd', dhash: '0f0f0f0f0f0f0f0f', brightness: 0.3 };
  var e = { sourceId: 'e', dhash: '', brightness: 0.3 };
  var history = [{ dhash: '0f0f0f0f0f0f0f0e', day: '2026-06-01' }, { dhash: '0123456789abcdee', day: '2020-01-01' }];
  var result = select.postfilter([a, b, c, d, e], history, S, { name: 'горы' }, today(), ctx.daysBetween);
  var why = {};
  result.dropped.forEach(function (entry) { why[entry.item.sourceId] = entry.why; });
  assert.deepStrictEqual(result.kept.map(function (item) { return item.sourceId; }), ['a']);
  assert.strictEqual(why.b, 'похожа на другую из найденных');
  assert.ok(/слишком светлая/.test(why.c));
  assert.strictEqual(why.d, 'похожа на бывшую');
  assert.strictEqual(why.e, 'миниатюра не прочиталась');
  var bright = select.postfilter([c], [], S, { name: 'снег', bright: true }, today(), ctx.daysBetween);
  assert.strictEqual(bright.kept.length, 1);
});

h.test('вкус: слова, цели голоса, оценка', function () {
  assert.deepStrictEqual(select.words('The fog над Ладогой, 2026'), ['fog', 'ладогой', '2026']);
  var targets = select.voteTargets({ topic: 'горы', author: 'Anna Petrova', source: 'unsplash', query: 'mountains fog' });
  assert.deepStrictEqual(targets, [
    { kind: 'topic', value: 'горы' }, { kind: 'author', value: 'anna petrova' }, { kind: 'source', value: 'unsplash' },
    { kind: 'word', value: 'mountains' }, { kind: 'word', value: 'fog' }
  ]);
  var taste = select.taste([{ kind: 'author', value: 'Anna Petrova', weight: 2 }, { kind: 'word', value: 'city', weight: -4 }, { kind: 'nope', value: 'x', weight: 1 }]);
  assert.strictEqual(taste.author['anna petrova'], 2);
  assert.ok(select.tasteScore({ author: 'Anna Petrova', title: 'Fog' }, taste) > 0);
  assert.ok(select.tasteScore({ author: 'X', title: 'Night city lights' }, taste) < 0);
  assert.ok(select.tasteScore({ author: 'X', title: 'city city city city city city city city city city' }, taste) >= -1);
});

h.test('простая оценка: тёмный, большой, чёткий — выше', function () {
  var taste = select.taste([]);
  var dark = { brightness: 0.3, width: 4800, height: 7200, contrast: 0.08 };
  var bright = { brightness: 0.44, width: 4800, height: 7200, contrast: 0.08 };
  var blurry = { brightness: 0.3, width: 4800, height: 7200, contrast: 0.005 };
  var small = { brightness: 0.3, width: 2400, height: 3600, contrast: 0.08 };
  var ranked = select.rank([small, blurry, bright, dark], S, taste);
  assert.strictEqual(ranked[0], dark);
  assert.ok(ranked.indexOf(bright) > 0 && ranked.indexOf(blurry) > 0 && ranked.indexOf(small) > 0);
  assert.ok(typeof dark.score === 'number');
  var noBright = settingsLib.normalize({ scoreBrightness: 0 });
  assert.strictEqual(select.score(dark, noBright, taste), select.score(bright, noBright, taste));
});

h.test('модель запроса: подсказка и разбор ответа', function () {
  var prompt = select.queryPrompt({ topic: { name: 'горы', query: 'mountains' }, weather: { en: 'fog' }, season: { en: 'autumn' } },
    select.taste([{ kind: 'word', value: 'lake', weight: 1 }, { kind: 'word', value: 'city', weight: -1 }]));
  var data = JSON.parse(prompt.prompt);
  assert.strictEqual(data.topic, 'mountains');
  assert.deepStrictEqual(data.likes, ['lake']);
  assert.deepStrictEqual(data.dislikes, ['city']);
  assert.ok(/JSON/.test(prompt.system));
  assert.deepStrictEqual(select.parseQueries({ queries: ['Misty Mountains, autumn!', 'misty mountains autumn', 'горы', 'lake fog dawn', 'x y'] }),
    ['misty mountains autumn', 'lake fog dawn', 'x y']);
  assert.strictEqual(select.parseQueries({ text: 'x' }), null);
  assert.strictEqual(select.parseQueries({ queries: ['горы'] }), null);
  assert.deepStrictEqual(select.parseQueries(['a b']), ['a b']);
});

h.test('модель-судья: подсказка и разбор ответа', function () {
  var text = select.judgePrompt(6, S, { topic: { name: 'горы' }, weather: { word: 'туман' }, season: { ru: 'осень' } });
  assert.ok(/6 кандидатов/.test(text) && /904×2316/.test(text) && /1812×2176/.test(text) && /туман/.test(text));
  assert.deepStrictEqual(select.parseJudge({ best: 2, reasons: 'спокойный', focus: { x: 1.4, y: '0.3' }, reject: [1, 9] }, 6),
    { best: 1, reasons: 'спокойный', focus: { x: 1, y: 0.3 }, reject: [0] });
  assert.strictEqual(select.parseJudge({ best: 7 }, 6), null);
  assert.strictEqual(select.parseJudge({ best: 2, reject: [2] }, 6), null);
  assert.strictEqual(select.parseJudge('2', 6), null);
  assert.strictEqual(select.parseJudge({ best: '3' }, 6).focus, null);
});

h.test('кадр внешнего экрана из широкого снимка', function () {
  // 6000×4000 landscape → a 904:2316 band in the middle, full height.
  var rect = select.cropRect(6000, 4000, 904, 2316, null, {});
  assert.strictEqual(rect.height, 4000);
  assert.strictEqual(rect.width, Math.floor(4000 * 904 / 2316));
  assert.strictEqual(rect.x, Math.round(3000 - rect.width / 2));
  assert.strictEqual(rect.y, 0);
  var left = select.cropRect(6000, 4000, 904, 2316, { x: 0.02, y: 0.5 }, {});
  assert.strictEqual(left.x, 0);
  var right = select.cropRect(6000, 4000, 904, 2316, { x: 0.98, y: 0.5 }, {});
  assert.strictEqual(right.x + right.width, 6000);
});

h.test('кадр внутреннего экрана: главное уводится от шарнира', function () {
  // 4000×6000 portrait → a 1812:2176 almost square, full width.
  var middle = select.cropRect(4000, 8000, 1812, 2176, null, { hinge: 0.1, focusY: 0.4 });
  assert.strictEqual(middle.width, 4000);
  assert.strictEqual(middle.height, Math.floor(4000 * 2176 / 1812));
  assert.strictEqual(middle.y, Math.round(0.4 * 8000 - middle.height / 2));
  // Near the edge the crop stays inside the picture.
  assert.strictEqual(select.cropRect(4000, 6000, 1812, 2176, null, { focusY: 0.2 }).y, 0);
  // The crop is as wide as the picture, so the hinge shift cannot move it sideways.
  assert.strictEqual(middle.x, 0);
  var wide = select.cropRect(8000, 4000, 1812, 2176, { x: 0.5, y: 0.5 }, { hinge: 0.1 });
  // Focus at the middle → it lands 10% of the crop right of the hinge.
  var focusInCrop = (0.5 * 8000 - wide.x) / wide.width;
  assert.ok(Math.abs(focusInCrop - 0.6) < 0.001, String(focusInCrop));
  var leftSide = select.cropRect(8000, 4000, 1812, 2176, { x: 0.3, y: 0.5 }, { hinge: 0.1 });
  assert.ok(Math.abs((0.3 * 8000 - leftSide.x) / leftSide.width - 0.4) < 0.001);
});

h.test('чтение большого оригинала с уменьшением', function () {
  assert.strictEqual(select.sampleSize(4000, 6000, 904, 2316, 0), 2);
  assert.strictEqual(select.sampleSize(8000, 9600, 1812, 2176, 0), 4);
  assert.strictEqual(select.sampleSize(1812, 2176, 1812, 2176, 0), 1);
  assert.strictEqual(select.sampleSize(10000, 12000, 1812, 2176, 24e6), 4);
  assert.strictEqual(select.sampleSize(12000, 16000, 5000, 7000, 24e6), 4);
});

h.test('экраны из настроек', function () {
  assert.deepStrictEqual(select.targets(S), [
    { name: 'inner', width: 1812, height: 2176, hinge: 0.1 },
    { name: 'cover', width: 904, height: 2316, hinge: 0 }
  ]);
});

h.done(__filename);
