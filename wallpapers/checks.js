// Checks of «Обои дня» on the phone. They never set a wallpaper: the real setting is seen only
// by the owner's eyes. What they create (a test picture, a trial pick) they remove, and the
// module's state and settings are put back as they were.
var axiko = require('lib/axiko');
var sources = require('./sources');
var select = require('./select');
var fold = require('./fold');
var ctx = require('./context');
var settingsLib = require('./settings');
var phone = require('./android');

var MAIN = 'modules/wallpapers/main.js';
var DIR = 'data/wallpapers/check';

function sample(name) { return axiko.files.readJson('modules/wallpapers/samples/' + name + '.json', null); }

function snapshot(path) { return axiko.files.exists(path) ? axiko.files.read(path) : null; }

function restore(path, text) {
  if (text === null) axiko.files.remove(path);
  else axiko.files.write(path, text);
}

/** A 3000×2000 test picture: a dark gradient with a light square in the middle. */
function testPicture(path) {
  var Bitmap = android.graphics.Bitmap;
  var bitmap = Bitmap.createBitmap(3000, 2000, Bitmap.Config.ARGB_8888);
  try {
    var canvas = new android.graphics.Canvas(bitmap);
    var paint = new android.graphics.Paint();
    // An int[] of colours picks the int overload: with two plain numbers Rhino may choose the one
    // taking packed `long` colours, whose bits then name colour spaces.
    var colors = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, 2);
    colors[0] = 0xFF203048 | 0;
    colors[1] = 0xFF0C0C0C | 0;
    paint.setShader(new android.graphics.LinearGradient(0, 0, 3000, 0, colors, null, android.graphics.Shader.TileMode.CLAMP));
    canvas.drawRect(0, 0, 3000, 2000, paint);
    var square = new android.graphics.Paint();
    square['setColor(int)'](0xFFE0E0E0 | 0);
    canvas.drawRect(1300, 800, 1700, 1200, square);
    var file = new java.io.File(axiko.files.path(path));
    file.getParentFile().mkdirs();
    var output = new java.io.FileOutputStream(file);
    try {
      bitmap.compress(Bitmap.CompressFormat.JPEG, 90, output);
    } finally {
      output.close();
    }
  } finally {
    bitmap.recycle();
  }
}

function firstBytes(path, count) {
  var input = new java.io.FileInputStream(axiko.files.path(path));
  try {
    var buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, count);
    var read = input.read(buffer);
    var out = [];
    for (var i = 0; i < read; i++) out.push(buffer[i] & 255);
    return out;
  } finally {
    input.close();
  }
}

exports['источники разбираются на сохранённых ответах'] = function (t) {
  var opts = { minSide: 2400, maxArea: sources.iiifMaxArea(sample('aic-info')) };
  t.equal(opts.maxArea, 4800000, 'предел Art Institute');
  t.equal(sources.parse('commons', sample('commons'), opts).items.length, 6, 'Commons');
  t.equal(sources.parse('openverse', sample('openverse'), opts).items.length, 5, 'Openverse');
  t.equal(sources.parse('nasa-images', sample('nasa-images'), opts).items.length, 4, 'NASA Images');
  t.equal(sources.parse('aic', sample('aic'), opts).items.length, 4, 'Art Institute');
  t.equal(sources.parse('unsplash', sample('unsplash'), opts).items.length, 2, 'Unsplash');
  t.equal(sources.parse('pexels', sample('pexels'), opts).items.length, 3, 'Pexels');
  var apod = sources.parse('apod', sample('apod-placeholder'), opts);
  t.equal(apod.items.length, 0, 'заглушки APOD не кандидаты');
  t.ok(/заглушки: 3/.test(apod.note), 'о заглушках сказано');
};

exports['отсев по размеру, повторам и dHash на подставных данных'] = function (t) {
  var s = settingsLib.defaults();
  var items = sources.parse('commons', sample('commons'), { minSide: 2400 }).items;
  var history = [{ source: 'commons', source_id: items[0].sourceId, author: 'x', day: '2026-11-01', dhash: 'ffff0000ffff0000' }];
  var first = select.prefilter(items, history, s, '2026-11-14', ctx.daysBetween);
  t.ok(first.dropped.some(function (entry) { return entry.why === 'уже была'; }), 'повтор отсеян');
  t.ok(first.dropped.some(function (entry) { return /^мала/.test(entry.why); }), 'маленькая отсеяна');
  first.kept[0].dhash = 'ffff0000ffff0001';
  first.kept[0].brightness = 0.2;
  first.kept[1].dhash = '0123456789abcdef';
  first.kept[1].brightness = 0.9;
  var second = select.postfilter(first.kept.slice(0, 2), history, s, { name: 'горы' }, '2026-11-14', ctx.daysBetween);
  t.equal(second.dropped.map(function (entry) { return entry.why.split(':')[0]; }), ['похожа на бывшую', 'слишком светлая']);
};

exports['настройки нормализуются и сохраняются'] = function (t) {
  var main = require(MAIN);
  var before = snapshot('data/wallpapers/settings.json');
  try {
    var saved = main.saveSettings({ candidates: 99, time: '7:30', topics: [{ name: 'Проверка', query: 'Проверка test', weight: 2 }] });
    t.equal(saved.values.candidates, 20);
    t.equal(saved.values.time, '07:30');
    t.equal(saved.values.topics[0].query, 'test');
    t.equal(settingsLib.normalize({}).minSide, 2400);
  } finally {
    restore('data/wallpapers/settings.json', before);
    main.start();
  }
};

exports['картинка читается, режется и уменьшается на телефоне'] = function (t) {
  try {
    testPicture(DIR + '/source.jpg');
    var size = phone.bounds(DIR + '/source.jpg');
    t.equal([size.width, size.height], [3000, 2000], 'размер');
    var head = select.imageSize(firstBytes(DIR + '/source.jpg', 65536)) || {};
    t.equal([head.type, head.width, head.height], ['jpeg', 3000, 2000], 'размер по первым байтам (столько же, сколько читает модуль)');
    var seen = phone.analyze(DIR + '/source.jpg');
    t.ok(seen.brightness > 0.03 && seen.brightness < 0.4, 'тёмная картинка: ' + seen.brightness);
    t.ok(seen.contrast > 0, 'в середине есть деталь');
    t.equal(seen.dhash.length, 16, 'dHash');
    var rect = select.cropRect(3000, 2000, 904, 2316, null, {});
    phone.crop(DIR + '/source.jpg', rect, 904, 2316, DIR + '/cover.jpg', 90, 24e6);
    var cover = phone.bounds(DIR + '/cover.jpg');
    t.equal([cover.width, cover.height], [904, 2316], 'кадр внешнего экрана');
    var inner = select.cropRect(3000, 2000, 1812, 2176, { x: 0.5, y: 0.5 }, { hinge: 0.1 });
    phone.crop(DIR + '/source.jpg', inner, 1812, 2176, DIR + '/inner.jpg', 90, 2e6);
    var innerSize = phone.bounds(DIR + '/inner.jpg');
    t.equal([innerSize.width, innerSize.height], [1812, 2176], 'кадр внутреннего экрана (чтение с уменьшением)');
    phone.shrink(DIR + '/inner.jpg', 360, DIR + '/thumb.jpg', 85, false);
    t.equal(phone.bounds(DIR + '/thumb.jpg').width, 360, 'миниатюра');
    t.ok(/^data:image\/jpeg;base64,/.test(phone.dataUrl(DIR + '/thumb.jpg', 128)), 'миниатюра для модели');
    var again = phone.analyze(DIR + '/source.jpg');
    t.equal(again.dhash, seen.dhash, 'dHash повторяется');
  } finally {
    axiko.files.remove(DIR);
  }
};

exports['можно ли ставить обои — честный ответ'] = function (t) {
  var can = phone.canSet();
  ['declared', 'granted', 'supported', 'allowed', 'ok'].forEach(function (key) { t.equal(typeof can[key], 'boolean', key); });
  if (can.declared) t.ok(can.granted, 'SET_WALLPAPER — обычное разрешение: объявлено, значит выдано');
  if (!can.declared) t.skip('в этой сборке Axiko нет SET_WALLPAPER — обои ставятся только вручную');
};

exports['разведка экранов Fold отвечает'] = function (t) {
  var raw = phone.probeFold();
  t.ok(raw.sdk > 0, 'версия системы');
  t.ok(Array.isArray(raw.fields) && Array.isArray(raw.methods), 'списки');
  var summary = fold.summarize(raw);
  var plan = fold.plan(summary, 'auto', null, {});
  t.ok(['crops', 'flag', 'single'].indexOf(plan.mode) >= 0, 'способ');
  if (raw.sdk >= 35) t.ok(summary.crops, 'на Android 15+ должны быть обои с кадрированиями (setBitmapWithCrops или setStreamWithCrops)');
};

exports['экран открывается'] = function (t) {
  var page = t.screen('modules/wallpapers/ui/index.html');
  t.equal(page.count('#tabs .chip'), 4, 'четыре вкладки');
  page.click('#tabs .chip[data-id="settings"]');
  t.wait(800);
  t.ok(page.count('#settingsView .group') >= 10, 'настройки нарисованы');
  page.click('#tabs .chip[data-id="today"]');
};

exports['погода по Open-Meteo'] = function (t) {
  if (!phone.network().online) t.skip('нет сети');
  var answer = phone.getJson(ctx.weatherUrl(59.94, 30.31), { 'User-Agent': sources.USER_AGENT });
  if (!answer.ok) t.skip('Open-Meteo не ответил: ' + (answer.error || answer.status));
  var weather = ctx.parseWeather(answer.json);
  t.ok(weather && typeof weather.code === 'number', 'код погоды');
};

exports['настоящий подбор без установки (только Commons)'] = function (t) {
  if (!phone.network().online) t.skip('нет сети');
  var main = require(MAIN);
  var state = snapshot('data/wallpapers/state.json');
  var result = null;
  try {
    result = main.run({ dryRun: true, limit: 2, sources: { commons: true }, query: 'mountains' });
    if (result.busy) t.skip('сейчас идёт подбор');
    var commons = (result.status || []).filter(function (line) { return line.source === 'commons'; });
    t.ok(commons.length > 0 && commons[0].ok, 'Commons ответил: ' + JSON.stringify(commons[0] || result.error));
    t.ok(result.ok, 'выбрана картинка: ' + (result.error || ''));
    var row = main.get(result.id);
    t.equal(row.dry, 1, 'это проба');
    t.ok(axiko.files.exists(row.dir + '/inner.jpg') && axiko.files.exists(row.dir + '/cover.jpg'), 'кадры сделаны');
    t.equal(phone.bounds(row.dir + '/cover.jpg').width, settingsLib.normalize(axiko.files.readJson('data/wallpapers/settings.json', {})).coverWidth, 'ширина внешнего кадра');
    t.ok(row.license && sources.freeLicense(row.license), 'свободная лицензия: ' + row.license);
    t.ok(row.author && row.page_url, 'автор и ссылка');
  } finally {
    if (result && result.id) main.clearDry(result.id);
    restore('data/wallpapers/state.json', state);
  }
};
