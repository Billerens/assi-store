// main.js in a pretend engine (tests/engine.js): the APIs answer with samples/, the phone is a
// set of records. What is checked is main.js's own work: the order of the steps, the history,
// the state, the rules of the day and the contracts with the screen and other modules.
var assert = require('assert');
var h = require('./harness');
var engine = require('./engine');

process.removeAllListeners('warning');

var MOUNTAINS = [{ name: 'горы', query: 'mountains', weight: 1 }];

function make(options) {
  var e = engine.make(options || {});
  e.main.saveSettings({ topics: MOUNTAINS });
  return e;
}

function rows(e) { return e.db.query('select * from history order by id'); }

h.test('подбор: ищет, кадрирует, ставит, записывает, сообщает', function () {
  var e = make();
  var result = e.main.run({});
  assert.ok(result.ok, result.error);
  assert.strictEqual(result.mode, 'single');
  assert.deepStrictEqual(result.screens, ['inner', 'cover', 'lock']);
  var row = rows(e)[0];
  assert.strictEqual(row.day, '2026-11-14');
  assert.strictEqual(row.topic, 'горы');
  assert.strictEqual(row.files, 1);
  assert.strictEqual(row.dry, 0);
  assert.ok(row.dhash && row.dhash.length === 16);
  assert.strictEqual(e.state().current, row.id);
  // Both crops from one download of the original; the original itself is not kept.
  var originals = e.log.downloads.filter(function (d) { return /original\.tmp$/.test(d.path); });
  assert.strictEqual(originals.length, 1);
  assert.deepStrictEqual(e.log.crops.map(function (c) { return c.width + 'x' + c.height; }), ['1812x2176', '904x2316']);
  ['inner.jpg', 'cover.jpg', 'thumb.jpg'].forEach(function (name) { assert.ok(e.disk['data/wallpapers/2026-11-14/' + name], name); });
  assert.ok(!Object.keys(e.disk).some(function (key) { return /original\.tmp|\/cache\//.test(key); }), 'временные файлы убраны');
  assert.strictEqual(e.log.sets.length, 1);
  assert.strictEqual(e.log.sets[0].want.lockShot, 'inner');
  var notice = e.log.notify[0];
  assert.ok(/^Новые обои: /.test(notice.title));
  assert.ok(/^Фото: .+, (Openverse|Wikimedia Commons)$/.test(notice.text));
  assert.strictEqual(notice.silent, true);
  assert.strictEqual(typeof notice.id, 'number');
  assert.ok(!notice.actions, 'без notify.actions нет кнопок');
  assert.ok(e.log.emits.some(function (x) { return x.name === 'wallpapers.changed'; }));
  assert.ok(e.log.widget > 0);
  assert.strictEqual(e.state().lastRun.ok, true);
});

h.test('без модели запросы — по шаблону, от точного к общему, и не больше лимита', function () {
  var e = make();
  e.main.saveSettings({ minSide: 9000, maxRequests: 5 });
  var result = e.main.run({});
  assert.ok(!result.ok);
  assert.ok(/не нашлось/.test(result.error));
  var asked = e.log.requests.filter(function (r) { return /commons|openverse|aic$/.test(r.name); });
  assert.strictEqual(asked.length, 5);
  assert.ok(/gsrsearch=mountains%20autumn/.test(asked[0].url));
  assert.ok(/gsrsearch=mountains%20filetype/.test(asked[3].url));
  assert.strictEqual(e.state().lastRun.ok, false);
  // The lock is released after a failure.
  e.main.saveSettings({ minSide: 2400 });
  assert.ok(e.main.run({}).ok);
});

h.test('повторов нет: ни той же картинки, ни того же автора две недели', function () {
  var e = make();
  var seen = [];
  var authors = [];
  for (var i = 0; i < 4; i++) {
    var result = e.main.run({ manual: true });
    assert.ok(result.ok, result.error);
    var row = e.main.get(result.id);
    assert.ok(seen.indexOf(row.source + ':' + row.source_id) < 0, 'повтор ' + row.title);
    assert.ok(authors.indexOf(row.author) < 0, 'автор ' + row.author);
    seen.push(row.source + ':' + row.source_id);
    authors.push(row.author);
  }
});

h.test('проба без установки и её уборка', function () {
  var e = make();
  var result = e.main.run({ dryRun: true, limit: 2 });
  assert.ok(result.ok && result.dry, result.error);
  assert.strictEqual(e.log.sets.length, 0);
  assert.strictEqual(e.state().current, undefined);
  assert.strictEqual(e.main.history({}).length, 0, 'пробы не в истории');
  assert.ok(e.disk['data/wallpapers/2026-11-14/inner.jpg']);
  assert.deepStrictEqual(e.main.clearDry(), { removed: 1 });
  assert.strictEqual(rows(e).length, 0);
  assert.ok(!e.disk['data/wallpapers/2026-11-14/inner.jpg']);
});

h.test('модель пишет запрос, модель со зрением выбирает и говорит, где главное', function () {
  var e = make({
    model: function (o) {
      if (o.role === 'wallpapers.query') return { queries: ['misty mountain ridge'] };
      if (o.role === 'wallpapers.judge') return { best: 2, reasons: 'спокойный туман, без людей', focus: { x: 0.3, y: 0.6 }, reject: [1] };
      return null;
    }
  });
  var result = e.main.run({});
  assert.ok(result.ok, result.error);
  assert.ok(/gsrsearch=misty%20mountain%20ridge/.test(e.log.requests[0].url));
  var judge = e.log.asks.filter(function (a) { return a && a.role === 'wallpapers.judge'; })[0];
  assert.strictEqual(judge.images, 8);
  var row = rows(e)[0];
  assert.strictEqual(row.focus_x, 0.3);
  assert.strictEqual(row.focus_y, 0.6);
  assert.ok(/спокойный туман/.test(row.reason));
  assert.deepStrictEqual(JSON.parse(row.judged), { best: 2, reject: [1], of: 8, model: 'test-model' });
  assert.ok(result.notes.indexOf('запрос написала модель') >= 0);
});

h.test('модель без зрения не судит; сломанный ответ — простая оценка', function () {
  var e = make({ model: function () { return { nonsense: true }; }, vision: false });
  var result = e.main.run({});
  assert.ok(result.ok);
  assert.ok(result.notes.some(function (n) { return /нет зрения/.test(n); }));
  assert.ok(result.notes.some(function (n) { return /по шаблону/.test(n); }));
  var broken = make({ model: function () { return new Error('таймаут'); } });
  var second = broken.main.run({});
  assert.ok(second.ok);
  assert.ok(second.notes.some(function (n) { return /не ответила/.test(n); }));
});

h.test('оригинал не скачался — берётся следующий', function () {
  var e = make();
  var first = e.main.run({ dryRun: true });
  var firstUrl = e.main.get(first.id).original_url;
  e.main.clearDry();
  e.options.brokenOriginals = [firstUrl];
  var result = e.main.run({});
  assert.ok(result.ok, result.error);
  assert.notStrictEqual(e.main.get(result.id).original_url, firstUrl);
  assert.ok(result.notes.some(function (n) { return /первый выбор не скачался/.test(n); }));
});

h.test('без разрешения: подобрано, но не поставлено — и путь «вручную»', function () {
  var e = make({ canSet: { declared: false, granted: false, supported: true, allowed: true, ok: false } });
  var result = e.main.run({});
  assert.strictEqual(result.ok, false);
  assert.ok(/SET_WALLPAPER/.test(result.error));
  assert.strictEqual(e.log.sets.length, 0);
  var state = e.state();
  assert.strictEqual(state.manualNeeded.id, result.id);
  assert.ok(/не поставлены/.test(e.log.notify[0].title));
  assert.strictEqual(e.main.today().manualNeeded.id, result.id);
  var opened = e.main.applyManually();
  assert.strictEqual(e.log.intents[0].path, 'data/wallpapers/2026-11-14/inner.jpg');
  assert.ok(e.log.intents[0].exists);
  assert.ok(/^content:/.test(opened.uri));
  assert.strictEqual(e.state().manualNeeded, null);
  e.main.applyManually(result.id);
  assert.strictEqual(e.log.intents[1].oldUri, opened.uri, 'прошлая копия в галерее заменяется');
});

h.test('«Вернуть вчерашние»: прошлые снова, текущие с минусом', function () {
  var e = make();
  assert.strictEqual(e.main.revert().ok, false);
  var first = e.main.run({});
  e.later(86400000);
  var second = e.main.run({});
  var back = e.main.revert();
  assert.ok(back.ok, back.error);
  assert.strictEqual(e.main.get(back.id).source_id, e.main.get(first.id).source_id);
  assert.strictEqual(e.main.get(back.id).again, first.id);
  assert.strictEqual(e.main.get(second.id).reverted, 1);
  assert.strictEqual(e.state().current, back.id);
  var weights = e.main.weights();
  assert.ok(weights.some(function (w) { return w.kind === 'topic' && w.value === 'горы' && w.weight === -0.5; }), JSON.stringify(weights));
  assert.strictEqual(e.log.sets.length, 3);
  assert.ok(e.main.today().canRevert);
});

h.test('«Другие сейчас» не чаще лимита в час', function () {
  var e = make();
  e.main.saveSettings({ otherPerHour: 2 });
  assert.ok(e.main.other().ok);
  assert.ok(e.main.other().ok);
  var third = e.main.other();
  assert.strictEqual(third.limited, true);
  assert.ok(/2 раз в час/.test(third.error));
  assert.strictEqual(e.main.today().otherLeft, 0);
  e.later(3600001);
  assert.ok(e.main.other().ok);
});

h.test('пока подбор идёт, второй не начинается', function () {
  var inner = null;
  var e = make({ onEmit: function (name) { if (name === 'wallpapers.progress' && !inner) inner = e.main.run({}); } });
  var outer = e.main.run({});
  assert.ok(outer.ok);
  assert.deepStrictEqual(inner, { ok: false, busy: true, error: 'обои уже подбираются' });
});

h.test('голос «больше/меньше такого» и долгая память', function () {
  var e = make();
  var result = e.main.run({});
  e.main.vote(result.id, 1);
  var weights = e.main.weights();
  assert.ok(weights.some(function (w) { return w.kind === 'topic' && w.value === 'горы' && w.weight === 1; }));
  assert.ok(weights.some(function (w) { return w.kind === 'source'; }));
  e.main.vote(result.id, -1);
  assert.ok(e.main.weights().some(function (w) { return w.kind === 'topic' && w.value === 'горы' && w.weight === -1; }), 'с +1 на −1 — шаг 2');
  assert.strictEqual(e.log.memory.length, 2);
  assert.deepStrictEqual(e.log.memory[0].tags, ['обои', 'вкус']);
  e.main.prefer('word', 'City', -3);
  assert.ok(e.main.weights().some(function (w) { return w.kind === 'word' && w.value === 'city' && w.weight === -3; }));
  assert.throws(function () { e.main.prefer('colour', 'red', 1); });
  e.main.forgetWeight('word', 'city');
  assert.ok(!e.main.weights().some(function (w) { return w.value === 'city'; }));
  assert.strictEqual(e.log.memory.length, 3, 'prefer тоже запоминается');
  e.main.saveSettings({ rememberTaste: false });
  e.main.vote(result.id, 1);
  assert.strictEqual(e.log.memory.length, 3);
});

h.test('избранное: список, по выходным — из избранного, не чаще раза в 21 день', function () {
  var e = make({ now: '2026-11-02T07:00:00' });
  var monday = e.main.daily();
  assert.ok(monday.ok, monday.error);
  e.main.favorite(monday.id, true);
  assert.strictEqual(e.main.history({ favorites: true }).length, 1);
  e.at('2026-11-07T07:00:00');
  var early = e.main.daily();
  // Only 5 days since it was shown: the favourite rests, a new picture comes.
  assert.notStrictEqual(e.main.get(early.id).source_id, e.main.get(monday.id).source_id);
  assert.ok(!/избранного/.test(e.main.get(early.id).reason));
  e.at('2026-11-28T07:00:00');
  var saturday = e.main.daily();
  assert.strictEqual(e.main.get(saturday.id).source_id, e.main.get(monday.id).source_id);
  assert.strictEqual(e.main.get(saturday.id).again, monday.id);
  assert.ok(/избранного/.test(e.log.notify[e.log.notify.length - 1].title));
  assert.strictEqual(e.main.get(saturday.id).favorite, 1);
  assert.strictEqual(e.main.history({ favorites: true }).length, 1, 'одна картинка — одна строка в избранном');
  e.main.favorite({ id: monday.id, on: false });
  assert.strictEqual(e.main.history({ favorites: true }).length, 0);
  e.at('2026-12-26T07:00:00');
  var noFavorites = e.main.daily();
  assert.ok(noFavorites.ok);
  assert.ok(!/избранного/.test(e.main.get(noFavorites.id).reason));
});

h.test('если владелец сегодня уже выбирал сам — утро не меняет', function () {
  var e = make();
  e.main.other();
  var morning = e.main.daily();
  assert.ok(/вручную/.test(morning.skipped));
  e.main.saveSettings({ enabled: false });
  assert.ok(/выключено/.test(e.main.daily().error));
  assert.ok(!e.log.jobs['wallpapers.daily']);
});

h.test('только Wi-Fi: ждёт сети, потом подбирает', function () {
  var e = make({ network: { online: true, wifi: false } });
  e.main.saveSettings({ wifiOnly: true, favoriteDays: [] });
  var first = e.main.daily();
  assert.strictEqual(first.pending, true);
  assert.deepStrictEqual(e.log.jobs['wallpapers.retry'].spec, { every: 30 });
  assert.strictEqual(e.state().pending.day, '2026-11-14');
  assert.strictEqual(e.log.downloads.length, 0);
  e.main.start();
  var listener = e.log.on['network:wallpapers.network'];
  listener({ online: true, wifi: false });
  assert.strictEqual(rows(e).length, 0);
  e.options.network = { online: true, wifi: true };
  listener({ online: true, wifi: true });
  assert.strictEqual(rows(e).length, 1);
  assert.strictEqual(e.state().pending, null);
  assert.ok(!e.log.jobs['wallpapers.retry']);
});

h.test('только Wi-Fi с job.once: разовая задача; к полудню — из избранного', function () {
  var e = make({ network: { online: true, wifi: false }, features: ['job.once'] });
  e.main.saveSettings({ wifiOnly: true, favoriteDays: [] });
  e.options.network = { online: true, wifi: true };
  var old = e.main.run({});
  e.main.favorite(old.id, true);
  e.options.network = { online: true, wifi: false };
  e.at('2026-12-01T07:00:00');
  e.main.daily();
  var spec = e.log.jobs['wallpapers.retry'].spec;
  assert.strictEqual(spec.once, e.now() + 30 * 60000);
  e.at('2026-12-01T09:00:00');
  assert.strictEqual(e.main.retry().pending, true);
  assert.strictEqual(e.log.jobs['wallpapers.retry'].spec.once, e.now() + 30 * 60000);
  e.at('2026-12-01T12:05:00');
  var noon = e.main.retry();
  assert.ok(noon.ok, noon.error);
  assert.strictEqual(e.main.get(noon.id).source_id, e.main.get(old.id).source_id);
  assert.ok(/без Wi-Fi/.test(e.main.get(noon.id).reason));
});

h.test('погода для «Праздничных пасхалок»: weatherNow с кэшем', function () {
  var e = make({ weatherCode: 73 });
  assert.strictEqual(e.main.weatherNow(60), null, 'ни города, ни геолокации');
  e.main.saveSettings({ city: 'Санкт-Петербург' });
  var now = e.main.weatherNow(60);
  assert.strictEqual(now.code, 73);
  assert.strictEqual(now.snow, true);
  assert.strictEqual(now.word, 'снег');
  assert.ok(Math.abs(now.latitude - 59.94) < 0.01);
  var asked = e.log.requests.length;
  e.later(30 * 60000);
  e.main.weatherNow(60);
  assert.strictEqual(e.log.requests.length, asked, 'полчаса — из кэша');
  e.later(31 * 60000);
  e.main.weatherNow(60);
  assert.strictEqual(e.log.requests.length, asked + 1, 'старше часа — заново, город уже известен');
  var phoneLocation = make({ location: { latitude: -33.9, longitude: 18.4 } });
  assert.strictEqual(phoneLocation.main.weatherNow(60).code, 3);
});

h.test('погода и место попадают в запрос и причину', function () {
  var e = make({ weatherCode: 45, location: { latitude: 59.94, longitude: 30.31 } });
  var result = e.main.run({});
  assert.ok(/gsrsearch=mountains%20fog%20autumn/.test(e.log.requests.filter(function (r) { return r.name === 'commons'; })[0].url));
  assert.ok(/^туман, ноябрь, тема «горы»/.test(result.reason));
  var row = e.main.get(result.id);
  assert.strictEqual(row.weather, 'туман');
  assert.strictEqual(row.season, 'осень');
});

h.test('повод из «Праздничных пасхалок» становится темой дня', function () {
  var e = make({ holidays: { occasionToday: function (day) { return day === '2026-11-14' ? { id: 'first-snow', title: 'Первый снег', decor: 'snow', wallpaper: 'first snow forest' } : null; } } });
  var result = e.main.run({});
  var row = e.main.get(result.id);
  assert.strictEqual(row.topic, 'Первый снег');
  assert.ok(/повод «Первый снег»/.test(row.reason));
  assert.ok(/gsrsearch=first%20snow%20forest/.test(e.log.requests.filter(function (r) { return r.name === 'commons'; })[0].url));
  var asked = make({ holidays: { occasionToday: function () { throw new Error('сломался'); } } });
  assert.ok(asked.main.run({}).ok, 'чужая ошибка не мешает');
});

h.test('тема по просьбе: название темы или английские слова', function () {
  var e = make();
  e.main.saveSettings({ topics: MOUNTAINS.concat([{ name: 'космос', query: 'nebula galaxy', weight: 0, space: true }]) });
  var space = e.main.pickTopic('космос');
  assert.ok(space.ok, space.error);
  assert.strictEqual(e.main.get(space.id).topic, 'космос');
  // The saved NASA answer has small originals (2800×1400 at most) and one without a size: its
  // size is read from the file's first bytes (here 4000×6000), so only that one passes.
  assert.deepStrictEqual(space.status[0], { source: 'nasa-images', name: 'NASA Images', query: 'nebula galaxy autumn', ok: true, found: 4, kept: 1, note: '' });
  assert.ok(e.log.requests.some(function (r) { return r.name === 'apod'; }), 'APOD спрашивается для космоса');
  assert.strictEqual(e.log.requests.filter(function (r) { return r.name === 'apod'; }).length, 1, 'APOD — один раз за подбор');
  assert.ok(space.status.some(function (s) { return s.source === 'apod' && /заглушки/.test(s.note); }));
  var words = e.main.pickTopic('Foggy lake, dawn');
  assert.ok(/gsrsearch=foggy%20lake%20dawn/.test(e.log.requests.filter(function (r) { return r.name === 'commons'; }).pop().url));
  assert.strictEqual(e.main.get(words.id).topic, 'по просьбе');
  var unknown = e.main.pickTopic('море');
  assert.ok(unknown.notes.some(function (n) { return /не тема из настроек/.test(n); }));
  assert.strictEqual(e.main.get(unknown.id).topic, 'горы', 'по весам: космос с весом 0 не выпадает');
});

h.test('разные кадры на внешний и внутренний: две строки истории', function () {
  var e = make();
  e.main.saveSettings({ shots: 'different' });
  var result = e.main.run({});
  var list = rows(e);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[1].screens, 'cover');
  assert.strictEqual(list[1].again, result.id);
  assert.notStrictEqual(list[0].source_id, list[1].source_id);
  var originals = e.log.downloads.filter(function (d) { return /original\.tmp$/.test(d.path); });
  assert.strictEqual(originals.length, 2);
  assert.notStrictEqual(e.log.sets[0].inner.split(' ').pop(), e.log.sets[0].cover.split(' ').pop());
  assert.strictEqual(e.main.history({}).length, 2);
});

h.test('старые полные файлы убираются, миниатюры и избранное остаются; снова — перекадрируется', function () {
  var e = make({ now: '2026-10-01T07:00:00' });
  var kept = e.main.run({});
  e.main.favorite(kept.id, true);
  e.later(86400000);
  var old = e.main.run({});
  e.at('2026-11-14T07:00:00');
  assert.deepStrictEqual(e.main.clean(), { cleaned: 1 });
  assert.ok(e.disk['data/wallpapers/2026-10-01/inner.jpg'], 'избранное целиком');
  assert.ok(!e.disk['data/wallpapers/2026-10-02/inner.jpg']);
  assert.ok(e.disk['data/wallpapers/2026-10-02/thumb.jpg'], 'миниатюра осталась');
  assert.strictEqual(e.main.get(old.id).files, 0);
  assert.strictEqual(e.main.get(old.id).innerUrl, '');
  var before = e.log.downloads.length;
  var again = e.main.setAgain(old.id);
  assert.ok(again.ok);
  assert.strictEqual(e.log.downloads.length, before + 1);
  assert.ok(e.disk['data/wallpapers/2026-10-02/inner.jpg']);
  assert.strictEqual(e.main.get(old.id).files, 1);
});

h.test('разведка Fold, проверка флага и согласие владельца', function () {
  var e = make();
  e.main.run({});
  var probe = e.main.probeFold();
  assert.deepStrictEqual(probe.summary.flags, [{ name: 'SEM_FLAG_SUB_DISPLAY', value: 16 }]);
  assert.strictEqual(probe.plan.mode, 'crops');
  assert.ok(e.disk['data/wallpapers/fold-probe.json']);
  assert.throws(function () { e.main.testFlag('FLAG_NOPE'); });
  var test = e.main.testFlag('SEM_FLAG_SUB_DISPLAY', true);
  assert.strictEqual(test.which, 17);
  assert.ok(/cover\.jpg$/.test(e.log.flags[0].path));
  var after = e.main.confirmFlag(true);
  assert.strictEqual(after.plan.mode, 'flag');
  assert.strictEqual(e.log.sets[e.log.sets.length - 1].plan.mode, 'flag', 'после проверки обои поставлены заново');
  e.main.run({ manual: true });
  assert.strictEqual(e.log.sets[e.log.sets.length - 1].plan.flag.which, 17);
  e.main.testFlag('SEM_FLAG_SUB_DISPLAY', false);
  var rejected = e.main.confirmFlag(false);
  assert.deepStrictEqual(rejected.fold.rejected, ['SEM_FLAG_SUB_DISPLAY (16)']);
  assert.strictEqual(rejected.plan.mode, 'flag', 'отказ от второй пробы не снимает подтверждённую');
  e.main.saveSettings({ foldMode: 'single' });
  assert.strictEqual(e.main.settings().plan.mode, 'single');
  assert.strictEqual(e.main.forgetFold().fold, null);
});

h.test('кнопки в уведомлении, когда оболочка умеет', function () {
  var e = make({ features: ['notify.actions', 'widget.image'] });
  var result = e.main.run({});
  var notice = e.log.notify[0];
  assert.strictEqual(notice.id, 'wallpapers.daily');
  assert.deepStrictEqual(notice.actions.map(function (a) { return a.fn; }), ['revert', 'favorite']);
  assert.strictEqual(notice.actions[1].call, 'modules/wallpapers/main.js');
  // The shell calls require(call)[fn](args).
  e.main[notice.actions[1].fn](notice.actions[1].args);
  assert.strictEqual(e.main.get(result.id).favorite, 1);
  var widget = e.main.widget();
  assert.strictEqual(widget.image, 'data/wallpapers/2026-11-14/thumb.jpg');
  assert.ok(widget.text.indexOf(e.main.get(result.id).title) === 0);
});

h.test('экран: сегодня, история, настройки, ключи, место', function () {
  var e = make();
  var empty = e.main.today();
  assert.strictEqual(empty.current, null);
  assert.strictEqual(empty.canRevert, false);
  assert.ok(/не проводилась/.test(empty.foldLine));
  assert.strictEqual(e.main.widget().text, 'Обои ещё не выбирались');
  assert.strictEqual(e.main.describe(), 'Обои ещё не выбирались.');
  var result = e.main.run({});
  var today = e.main.today();
  assert.strictEqual(today.current.id, result.id);
  assert.ok(/^\/data\/wallpapers\/2026-11-14\/cover\.jpg\?v=\d+$/.test(today.current.coverUrl));
  assert.ok(/^Фото: /.test(today.current.credit));
  assert.ok(/^Сейчас обои «/.test(e.main.describe()));
  var s = e.main.settings();
  assert.ok(Array.isArray(s.schema) && s.values.time === '07:00');
  assert.deepStrictEqual(s.keys, { unsplash: false, pexels: false, apod: false });
  assert.strictEqual(s.models.judge.ready, false);
  e.main.saveSettings({ time: '8:15' });
  assert.deepStrictEqual(e.log.jobs['wallpapers.daily'].spec, { at: '08:15' });
  assert.strictEqual(e.main.set('minSide', 100), 600);
  e.main.askKey('unsplash');
  assert.strictEqual(e.main.keys().unsplash, true);
  assert.throws(function () { e.main.askKey('commons'); });
  e.main.removeKey('unsplash');
  assert.strictEqual(e.main.keys().unsplash, false);
  e.options.location = { latitude: 55.75, longitude: 37.62 };
  var place = e.main.askLocation();
  assert.strictEqual(place.granted, true);
  assert.strictEqual(place.place.from, 'геолокация');
  e.main.openOriginal(result.id);
  assert.ok(/^https:\/\//.test(e.log.opened[0]));
  assert.strictEqual(e.main.history({ limit: 1, offset: 5 }).length, 0);
  e.main.favorite(result.id, true);
  var stats = e.main.stats();
  assert.strictEqual(stats.shown, 1);
  assert.strictEqual(stats.favorites, 1);
  assert.strictEqual(stats.authors, 1);
  assert.strictEqual(Object.keys(stats.sources).length, 1);
  assert.deepStrictEqual(e.main.screenNow(), { width: 1812, height: 2176 });
});

h.test('ключ Unsplash включает Unsplash, и ему сообщается о скачивании', function () {
  var e = make();
  e.main.saveSettings({ sources: { commons: false, openverse: false, aic: false, pexels: false } });
  e.log.secrets['unsplash.key'] = 'KEY';
  var result = e.main.run({});
  assert.ok(result.ok, result.error);
  var row = e.main.get(result.id);
  assert.strictEqual(row.source, 'unsplash');
  assert.strictEqual(row.author, 'Anna Petrova');
  assert.strictEqual(e.log.pings.length, 1);
  assert.strictEqual(e.log.requests[0].headers.Authorization, 'Client-ID KEY');
});

h.test('по ссылке: любая картинка, по середине', function () {
  var e = make();
  var result = e.main.setFromUrl('https://upload.wikimedia.org/wikipedia/commons/8/84/Mountain_Fog.jpg');
  assert.ok(result.ok);
  var row = e.main.get(result.id);
  assert.strictEqual(row.source, 'url');
  assert.strictEqual(row.title, 'Mountain_Fog');
  assert.strictEqual(row.manual, 1);
  assert.ok(row.dhash);
});

h.test('без сети: ошибка понятная, временное убрано', function () {
  var e = make({ offline: true });
  var result = e.main.run({});
  assert.strictEqual(result.ok, false);
  assert.ok(result.status.every(function (s) { return !s.ok && /нет связи/.test(s.note); }));
  assert.ok(!Object.keys(e.disk).some(function (key) { return /cache/.test(key); }));
  var daily = e.main.daily();
  assert.ok(/Обои не сменились/.test(e.log.notify[e.log.notify.length - 1].title), JSON.stringify(daily));
});

h.test('после короткой ночи из «Здоровья» — тема «тишина» (по настройке, выключено по умолчанию)', function () {
  var health = {
    today: function () { return { date: '2026-11-14', known: { sleep: true }, sleepMin: 300 }; },
    goals: function () { return { sleepGoal: 450 }; }
  };
  var off = make({ health: health });
  var plain = off.main.run({});
  assert.strictEqual(off.main.get(plain.id).topic, 'горы', 'по умолчанию выключено');
  var e = make({ health: health });
  e.main.saveSettings({ calmAfterBadNight: true, topics: [{ name: 'горы', query: 'mountains', weight: 0 }] });
  var result = e.main.run({});
  assert.ok(result.ok, result.error);
  var row = e.main.get(result.id);
  assert.strictEqual(row.topic, 'тишина');
  assert.ok(/после короткой ночи/.test(row.reason), row.reason);
  assert.ok(/gsrsearch=calm%20quiet%20landscape/.test(e.log.requests.filter(function (r) { return r.name === 'commons'; })[0].url));
  var good = make({ health: { today: function () { return { known: { sleep: true }, sleepMin: 440 }; }, goals: function () { return { sleepGoal: 450 }; } } });
  good.main.saveSettings({ calmAfterBadNight: true });
  assert.strictEqual(good.main.get(good.main.run({}).id).topic, 'горы', 'ночь в норме — темы как обычно');
});

h.test('Питомец невыспавшийся — тема «тишина» (по настройке, выключено по умолчанию)', function () {
  var tired = { state: 'unrested', date: '2026-11-14' };
  var off = make({ pet: tired });
  assert.strictEqual(off.main.get(off.main.run({}).id).topic, 'горы', 'по умолчанию выключено');
  var e = make({ pet: tired });
  e.main.saveSettings({ calmFromPet: 'tired', topics: [{ name: 'горы', query: 'mountains', weight: 0 }] });
  var result = e.main.run({});
  assert.ok(result.ok, result.error);
  var row = e.main.get(result.id);
  assert.strictEqual(row.topic, 'тишина');
  assert.ok(/Питомец невыспавшийся/.test(row.reason), row.reason);
  var quiet = make({ pet: { state: 'quiet', date: '2026-11-14' } });
  quiet.main.saveSettings({ calmFromPet: 'tired' });
  assert.strictEqual(quiet.main.get(quiet.main.run({}).id).topic, 'горы', '«притихший» — только при «ещё и притихший»');
  var low = make({ pet: { state: 'quiet', date: '2026-11-14' } });
  low.main.saveSettings({ calmFromPet: 'low', topics: [{ name: 'горы', query: 'mountains', weight: 0 }] });
  assert.strictEqual(low.main.get(low.main.run({}).id).topic, 'тишина');
  var stale = make({ pet: { state: 'unrested', date: '2026-11-13' } });
  stale.main.saveSettings({ calmFromPet: 'tired' });
  assert.strictEqual(stale.main.get(stale.main.run({}).id).topic, 'горы', 'вчерашнее настроение не считается');
});

h.test('Питомца нет — настройка включена, но темы как обычно', function () {
  var e = make({});
  e.main.saveSettings({ calmFromPet: 'low' });
  var result = e.main.run({});
  assert.ok(result.ok, result.error);
  assert.strictEqual(e.main.get(result.id).topic, 'горы');
  assert.ok(!/Питомец/.test(e.main.get(result.id).reason));
});

h.test('страна картинки, счёт стран и ачивки «Путешественник» и «Коллекционер»', function () {
  var granted = [];
  var e = make({ unsplashCountry: 'Norway', achievements: { grant: function (item) { granted.push(item); return { ok: true }; } } });
  e.main.saveSettings({ sources: { commons: false, openverse: false, aic: false, pexels: false }, travellerCountries: 1, collectorFavorites: 1 });
  e.log.secrets['unsplash.key'] = 'KEY';
  var result = e.main.run({});
  assert.ok(result.ok, result.error);
  assert.strictEqual(e.main.get(result.id).country, 'Norway');
  assert.strictEqual(e.main.stats().countries, 1);
  assert.deepStrictEqual(granted.map(function (x) { return x.key; }), ['wallpapers/traveller']);
  assert.strictEqual(granted[0].source, 'wallpapers');
  e.main.favorite(result.id, true);
  assert.deepStrictEqual(granted.map(function (x) { return x.key; }), ['wallpapers/traveller', 'wallpapers/collector']);
  e.main.favorite(result.id, false);
  e.main.favorite(result.id, true);
  assert.strictEqual(granted.length, 2, 'каждая — один раз');
  // Without the achievements module the achievement waits in its outbox.
  var lonely = make();
  lonely.main.saveSettings({ collectorFavorites: 1 });
  var first = lonely.main.run({});
  lonely.main.favorite(first.id, true);
  var box = JSON.parse(lonely.disk['data/games/achievements-outbox.json']);
  assert.deepStrictEqual(box.map(function (x) { return x.key; }), ['wallpapers/collector']);
});

h.done(__filename);
