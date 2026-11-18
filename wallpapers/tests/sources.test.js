// The parsers on answers saved from the real APIs on 2026-11-14 (commons, openverse, nasa-images,
// aic, aic-info, apod-placeholder) and on answers written in the documented format (unsplash,
// pexels, apod-classic: those need a key, or the API no longer gives such answers).
var assert = require('assert');
var h = require('./harness');
var sources = require('../sources');

var OPTS = { minSide: 2400, maxArea: 4800000 };

h.test('ключ в адресе: имя секрета идёт как есть, обычный ключ кодируется', function () {
  assert.ok(sources.request('apod', { key: '{{secret:nasa.key}}' }).url.indexOf('api_key={{secret:nasa.key}}&') > 0);
  assert.ok(sources.request('apod', { key: 'a b' }).url.indexOf('api_key=a%20b&') > 0);
  assert.ok(sources.request('apod', {}).url.indexOf('api_key=DEMO_KEY&') > 0);
  assert.strictEqual(sources.request('pexels', { query: 'sea', key: '{{secret:pexels.key}}' }).headers.Authorization, '{{secret:pexels.key}}');
});

h.test('свободные лицензии', function () {
  ['CC BY 4.0', 'CC BY-SA 3.0', 'CC0', 'CC0 1.0', 'Public domain', 'PD-USGov-NASA', 'Attribution', 'Public Domain Mark 1.0', 'Unsplash License', 'Pexels License']
    .forEach(function (name) { assert.ok(sources.freeLicense(name), name); });
  ['CC BY-NC 4.0', 'CC BY-ND 2.0', 'CC BY-NC-SA 3.0', 'Fair use', 'All rights reserved', '', null, 'GFDL']
    .forEach(function (name) { assert.ok(!sources.freeLicense(name), String(name)); });
});

h.test('коды лицензий Openverse', function () {
  assert.strictEqual(sources.openverseLicense('by-sa', '4.0'), 'CC BY-SA 4.0');
  assert.strictEqual(sources.openverseLicense('cc0', '1.0'), 'CC0 1.0');
  assert.strictEqual(sources.openverseLicense('pdm'), 'Public Domain Mark');
  assert.ok(!sources.freeLicense(sources.openverseLicense('by-nc', '2.0')));
});

h.test('миниатюра Wikimedia стандартной ширины', function () {
  assert.strictEqual(sources.wikimediaThumb('https://upload.wikimedia.org/wikipedia/commons/8/84/Mountain_Fog.jpg', 500),
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Mountain_Fog.jpg/500px-Mountain_Fog.jpg');
  assert.strictEqual(sources.wikimediaThumb('https://upload.wikimedia.org/wikipedia/commons/a/ab/Map.tif'),
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Map.tif/500px-Map.tif.jpg');
  assert.strictEqual(sources.wikimediaThumb('https://example.org/x.jpg'), '');
});

h.test('ссылки без меток utm и с параметрами', function () {
  assert.strictEqual(sources.clean('https://a.b/p?utm_source=x&id=1&utm_medium=y'), 'https://a.b/p?id=1');
  assert.strictEqual(sources.clean('https://a.b/p?utm_source=x'), 'https://a.b/p');
  assert.strictEqual(sources.withParams('https://a.b/p?x=1', { w: 2400, fm: 'jpg' }), 'https://a.b/p?x=1&w=2400&fm=jpg');
});

h.test('запросы к источникам', function () {
  var commons = sources.request('commons', { query: 'mountains fog', pageSize: 20, minSide: 2400 });
  assert.ok(commons.url.indexOf(encodeURIComponent('mountains fog filetype:bitmap filew:>2399 fileh:>2399')) > 0);
  assert.ok(/iiurlwidth=500/.test(commons.url));
  assert.ok(/User-Agent/.test(Object.keys(commons.headers).join()));
  var aic = sources.request('aic', { query: 'mountain landscape', pageSize: 10 });
  assert.strictEqual(aic.headers['AIC-User-Agent'], sources.USER_AGENT);
  assert.ok(/is_public_domain%5D=true/.test(aic.url));
  assert.strictEqual(sources.request('unsplash', { query: 'x', key: 'K' }).headers.Authorization, 'Client-ID K');
  assert.strictEqual(sources.request('pexels', { query: 'x', key: 'P' }).headers.Authorization, 'P');
  assert.ok(/api_key=DEMO_KEY/.test(sources.request('apod', { pageSize: 50 }).url));
  assert.ok(/count=10&/.test(sources.request('apod', { pageSize: 50 }).url), 'APOD: count=10, как в описании');
  assert.ok(/count=25&/.test(sources.request('apod', { apodCount: 25 }).url));
  assert.ok(/place_of_origin/.test(aic.url), 'AIC: страна картины');
  assert.ok(/aspect_ratio=tall/.test(sources.request('openverse', { query: 'x', aspect: 'tall' }).url));
  assert.ok(!/aspect_ratio/.test(sources.request('openverse', { query: 'x', aspect: 'any' }).url));
  assert.throws(function () { sources.request('flickr', {}); });
  assert.strictEqual(sources.fileHeaders('aic')['AIC-User-Agent'], sources.USER_AGENT);
  assert.strictEqual(sources.fileHeaders('commons')['AIC-User-Agent'], undefined);
});

h.test('Commons: настоящий ответ, все с размером и свободной лицензией', function () {
  var parsed = sources.parse('commons', h.sample('commons'), OPTS);
  assert.strictEqual(parsed.items.length, 6);
  var first = parsed.items[0];
  assert.strictEqual(first.source, 'commons');
  assert.strictEqual(first.sourceId, '99193060');
  assert.strictEqual(first.author, 'Vyacheslav Argenberg');
  assert.strictEqual(first.license, 'CC BY 4.0');
  assert.strictEqual(first.width, 4912);
  assert.ok(/^https:\/\/upload\.wikimedia\.org\//.test(first.originalUrl));
  assert.ok(/500px-/.test(first.thumbUrl));
  assert.ok(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(first.pageUrl));
  parsed.items.forEach(function (item) {
    assert.ok(sources.freeLicense(item.license), item.license);
    assert.ok(Math.min(item.width, item.height) >= 2000, item.title);
    assert.ok(item.author && item.author.indexOf('<') < 0, 'автор без HTML: ' + item.author);
  });
  assert.ok(parsed.items.some(function (item) { return item.author === 'Делфина'; }));
});

h.test('Commons: несвободная лицензия и не фото отброшены', function () {
  var json = h.sample('commons');
  var pages = json.query.pages;
  pages[0].imageinfo[0].extmetadata.LicenseShortName.value = 'CC BY-NC 2.0';
  pages[1].imageinfo[0].mime = 'image/svg+xml';
  var parsed = sources.parse('commons', json, OPTS);
  assert.strictEqual(parsed.items.length, 4);
  assert.ok(/: 2$/.test(parsed.note));
});

h.test('Openverse: миниатюры Wikimedia — от самой Wikimedia', function () {
  var parsed = sources.parse('openverse', h.sample('openverse'), OPTS);
  assert.strictEqual(parsed.items.length, 5);
  var wiki = parsed.items[0];
  assert.strictEqual(wiki.thumbUrl, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Mountain_Fog.jpg/500px-Mountain_Fog.jpg');
  var other = parsed.items[1];
  assert.ok(/api\.openverse\.org\/v1\/images\/.+\/thumb\/$/.test(other.thumbUrl));
  assert.strictEqual(other.license, 'CC0 1.0');
  assert.strictEqual(other.width, 1537);
});

h.test('APOD: заглушки после переезда сайта распознаются', function () {
  var parsed = sources.parse('apod', h.sample('apod-placeholder'), OPTS);
  assert.strictEqual(parsed.items.length, 0);
  assert.strictEqual(parsed.placeholders, 3);
  assert.ok(/заглушки: 3/.test(parsed.note));
});

h.test('APOD прежнего вида: видео и чужие права пропущены, размер узнаётся по файлу', function () {
  var parsed = sources.parse('apod', h.sample('apod-classic'), OPTS);
  assert.strictEqual(parsed.items.length, 2);
  assert.ok(parsed.items.every(function (item) { return item.probe && item.license === 'Public domain (NASA)'; }));
  assert.strictEqual(parsed.items[0].pageUrl, 'https://apod.nasa.gov/apod/ap190410.html');
  assert.ok(/M87bh_EHT_4000\.jpg$/.test(parsed.items[0].originalUrl));
});

h.test('NASA Images: оригинал с размером из canonical', function () {
  var parsed = sources.parse('nasa-images', h.sample('nasa-images'), OPTS);
  assert.strictEqual(parsed.items.length, 4);
  assert.strictEqual(parsed.items[0].sourceId, 'PIA14417');
  assert.strictEqual(parsed.items[0].width, 2800);
  assert.ok(/~orig\.jpg$/.test(parsed.items[0].originalUrl));
  assert.ok(parsed.items.some(function (item) { return item.probe; }));
});

h.test('Art Institute: предел 4,8 Мпикс из info.json', function () {
  assert.strictEqual(sources.iiifMaxArea(h.sample('aic-info')), 4800000);
  assert.strictEqual(sources.iiifMaxArea({}), 0);
  assert.deepStrictEqual(sources.aicServed(3000, 1600, 4800000), { width: 3000, height: 1600 });
  var big = sources.aicServed(3535, 8595, 4800000);
  assert.ok(big.width * big.height <= 4800000);
  assert.strictEqual(big.width, 1405);
  var parsed = sources.parse('aic', h.sample('aic'), OPTS);
  assert.strictEqual(parsed.items.length, 4);
  var hokkei = parsed.items[1];
  assert.strictEqual(hokkei.fullWidth, 3000);
  assert.strictEqual(hokkei.width, 2528);
  assert.ok(/\/full\/2528,\/0\/default\.jpg$/.test(hokkei.originalUrl));
  assert.strictEqual(hokkei.country, 'Japan', 'страна — место создания картины');
  // With minSide 2400 no painting can pass: the server's limit is the reason.
  assert.ok(parsed.items.every(function (item) { return Math.min(item.width, item.height) < 2400; }));
});

h.test('ответ проверкой на робота и ошибки', function () {
  assert.ok(/проверкой на робота/.test(sources.failure(403, '<html><title>Just a moment...</title><script src="https://challenges.cloudflare.com/x">')));
  assert.ok(/ключ/.test(sources.failure(401, '')));
  assert.ok(/лимит/.test(sources.failure(429, '')));
  assert.ok(/не отвечает/.test(sources.failure(503, '')));
});

h.test('Unsplash: платные пропущены, оригинал уменьшен на сервере, ссылки с utm', function () {
  var parsed = sources.parse('unsplash', h.sample('unsplash'), OPTS);
  assert.strictEqual(parsed.items.length, 2);
  var photo = parsed.items[0];
  assert.strictEqual(photo.author, 'Anna Petrova');
  assert.strictEqual(photo.width, 2400);
  assert.strictEqual(photo.fullWidth, 4000);
  assert.ok(/[?&]w=2400&fm=jpg&q=90$/.test(photo.originalUrl));
  assert.ok(/utm_source=axiko/.test(photo.pageUrl));
  assert.ok(/download_location|\/download/.test(photo.downloadLocation));
  assert.ok(/Unsplash\+: 1/.test(parsed.note));
});

h.test('Pexels: оригинал уменьшен на сервере', function () {
  var parsed = sources.parse('pexels', h.sample('pexels'), OPTS);
  assert.strictEqual(parsed.items.length, 3);
  assert.ok(/w=2400$/.test(parsed.items[0].originalUrl));
  assert.strictEqual(parsed.items[2].width, 1200);
  assert.strictEqual(parsed.items[2].originalUrl, 'https://images.pexels.com/photos/99/pexels-photo-99.jpeg');
});

h.test('странный ответ — пусто, без исключения', function () {
  ['commons', 'openverse', 'apod', 'nasa-images', 'aic', 'unsplash', 'pexels'].forEach(function (id) {
    var parsed = sources.parse(id, { strange: true }, OPTS);
    assert.strictEqual(parsed.items.length, 0, id);
  });
  assert.strictEqual(sources.parse('commons', { query: { pages: 'x' } }, OPTS).items.length, 0);
  assert.strictEqual(sources.parse('flickr', {}, OPTS).items.length, 0);
});

h.test('один файл из Commons и Openverse — одна кандидатура', function () {
  var commons = sources.parse('commons', h.sample('commons'), OPTS).items;
  var openverse = sources.parse('openverse', h.sample('openverse'), OPTS).items;
  var copy = JSON.parse(JSON.stringify(openverse[0]));
  copy.source = 'commons';
  copy.sourceId = '1';
  var list = sources.dedupe(commons.concat(openverse, [copy, commons[0]]));
  assert.strictEqual(list.length, commons.length + openverse.length);
});

h.test('порядок источников по теме и ключам', function () {
  var all = { commons: true, openverse: true, apod: true, 'nasa-images': true, aic: true, unsplash: true, pexels: true };
  assert.deepStrictEqual(sources.order(all, { space: false }, {}), ['commons', 'openverse', 'aic']);
  assert.deepStrictEqual(sources.order(all, { space: true }, { unsplash: true }), ['nasa-images', 'apod', 'commons', 'openverse', 'aic', 'unsplash']);
  assert.deepStrictEqual(sources.order({ commons: false, pexels: true }, null, { pexels: true }), ['pexels']);
});

h.test('подпись под картинкой', function () {
  assert.strictEqual(sources.credit({ source: 'unsplash', author: 'Anna Petrova' }), 'Фото: Anna Petrova, Unsplash');
  assert.strictEqual(sources.credit({ source: 'commons', author: '' }), 'Фото: автор не указан, Wikimedia Commons');
});

h.done(__filename);
