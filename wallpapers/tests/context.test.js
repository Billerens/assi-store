var assert = require('assert');
var h = require('./harness');
var ctx = require('../context');
var settings = require('../settings');

h.test('дни: ключ, обратно, разница через перевод часов', function () {
  assert.strictEqual(ctx.dayKey(new Date(2026, 10, 4, 23, 59)), '2026-11-04');
  assert.strictEqual(ctx.fromKey('2026-11-04').getDate(), 4);
  assert.strictEqual(ctx.daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.strictEqual(ctx.daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.strictEqual(ctx.daysBetween('2026-11-14', '2025-11-14'), -365);
});

h.test('день недели: понедельник 1, воскресенье 7', function () {
  assert.strictEqual(ctx.weekday(new Date(2026, 10, 16)), 1);
  assert.strictEqual(ctx.weekday(new Date(2026, 10, 15)), 7);
  assert.strictEqual(ctx.weekday(new Date(2026, 10, 14)), 6);
});

h.test('сезон по месяцу и полушарию', function () {
  assert.strictEqual(ctx.season(new Date(2026, 10, 14), 59.9).key, 'autumn');
  assert.strictEqual(ctx.season(new Date(2026, 10, 14), -33.9).key, 'spring');
  assert.strictEqual(ctx.season(new Date(2026, 11, 1), null).key, 'winter');
  assert.strictEqual(ctx.season(new Date(2026, 1, 28)).key, 'winter');
  assert.strictEqual(ctx.season(new Date(2026, 2, 1)).ru, 'весна');
  assert.strictEqual(ctx.season(new Date(2026, 6, 1), -10).en, 'winter');
  assert.strictEqual(ctx.monthName(new Date(2026, 10, 14)), 'ноябрь');
});

h.test('коды погоды WMO → слово', function () {
  var cases = { 0: 'clear', 1: 'clear', 2: 'cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog', 51: 'rain', 67: 'rain', 80: 'rain', 82: 'rain',
    71: 'snow', 77: 'snow', 85: 'snow', 86: 'snow', 95: 'storm', 99: 'storm' };
  Object.keys(cases).forEach(function (code) { assert.strictEqual(ctx.weatherWord(Number(code)).key, cases[code], code); });
  assert.strictEqual(ctx.weatherWord(null), null);
  assert.strictEqual(ctx.weatherWord(10), null);
  assert.strictEqual(ctx.weatherWord('нет'), null);
  assert.strictEqual(ctx.weatherWord(73).snow, true);
  assert.strictEqual(ctx.weatherWord(61).snow, false);
});

h.test('ответ Open-Meteo (настоящий, Петербург)', function () {
  var weather = ctx.parseWeather(h.sample('open-meteo'));
  assert.deepStrictEqual(weather, { code: 3, temperature: 2.2, isDay: false, key: 'cloudy', word: 'облачно', en: 'clouds', snow: false });
  assert.strictEqual(ctx.parseWeather({ error: true }), null);
  assert.strictEqual(ctx.parseWeather(null), null);
});

h.test('геокодер Open-Meteo: первый найденный город', function () {
  var place = ctx.parsePlace(h.sample('geocoding'));
  assert.strictEqual(place.name, 'Санкт-Петербург');
  assert.strictEqual(place.country, 'Россия');
  assert.ok(Math.abs(place.latitude - 59.94) < 0.01);
  assert.strictEqual(ctx.parsePlace({ generationtime_ms: 1 }), null);
  assert.ok(/latitude=59\.939&longitude=30\.314&current=weather_code/.test(ctx.weatherUrl(place.latitude, place.longitude)));
  assert.ok(/name=%D0%A2%D0%B2%D0%B5%D1%80%D1%8C&count=1&language=ru/.test(ctx.geocodeUrl(' Тверь ')));
});

h.test('голоса меняют вес темы, но не ниже двадцатой', function () {
  assert.strictEqual(ctx.voteFactor(0, 0.25), 1);
  assert.strictEqual(ctx.voteFactor(2, 0.25), 1.5625);
  assert.strictEqual(ctx.voteFactor(-2, 0.25), 0.64);
  assert.strictEqual(ctx.voteFactor(-100, 0.25), 0.05);
  assert.strictEqual(ctx.voteFactor(5, 0), 1);
});

function fixed(value) { return function () { return value; }; }

h.test('тема дня по весам', function () {
  var topics = settings.DEFAULT_TOPICS;
  // Weights 3, 2, 1, 1 (total 7).
  assert.strictEqual(ctx.pickTopic(topics, [], { random: fixed(0) }).name, 'природа');
  assert.strictEqual(ctx.pickTopic(topics, [], { random: fixed(3.5 / 7) }).name, 'горы');
  assert.strictEqual(ctx.pickTopic(topics, [], { random: fixed(0.99) }).name, 'космос');
});

h.test('одна тема не больше streak дней подряд', function () {
  var topics = settings.DEFAULT_TOPICS;
  var picked = ctx.pickTopic(topics, ['природа', 'природа', 'горы'], { random: fixed(0), streak: 2 });
  assert.strictEqual(picked.name, 'горы');
  assert.strictEqual(ctx.pickTopic(topics, ['природа', 'горы'], { random: fixed(0), streak: 2 }).name, 'природа');
  assert.strictEqual(ctx.pickTopic([topics[0]], ['природа', 'природа'], { random: fixed(0), streak: 2 }).name, 'природа');
});

h.test('голоса за тему (ключи в нижнем регистре) двигают выбор', function () {
  var topics = [{ name: 'Море', query: 'sea', weight: 1 }, { name: 'Лес', query: 'forest', weight: 1 }];
  // Without votes 0.45 falls on «Море»; «меньше моря» ×4 makes it 0.41 of 1.41.
  assert.strictEqual(ctx.pickTopic(topics, [], { random: fixed(0.45) }).name, 'Море');
  assert.strictEqual(ctx.pickTopic(topics, [], { random: fixed(0.45), votes: { 'море': -4 }, voteStep: 0.25 }).name, 'Лес');
  assert.strictEqual(ctx.pickTopic([{ name: 'x', query: 'x', weight: 0 }], [], {}).name, 'x');
});

h.test('запросы от точного к общему', function () {
  var context = { topic: { query: 'mountains' }, weather: { en: 'fog' }, season: { en: 'autumn' } };
  assert.deepStrictEqual(ctx.queries(context, '{topic} {weather} {season}'),
    ['mountains fog autumn', 'mountains autumn', 'mountains fog', 'mountains']);
  assert.deepStrictEqual(ctx.queries({ topic: { query: 'sea' }, weather: null, season: { en: 'winter' } }, '{topic} {weather} {season}'),
    ['sea winter', 'sea']);
  assert.deepStrictEqual(ctx.queries(context, '{topic} calm'), ['mountains calm', 'mountains']);
});

h.test('причина выбора для экрана', function () {
  assert.strictEqual(ctx.reason({ weather: { word: 'туман' }, month: 'ноябрь', topic: { name: 'горы' } }), 'туман, ноябрь, тема «горы»');
  assert.strictEqual(ctx.reason({ occasion: { title: 'Новый год' }, month: 'декабрь', topic: { name: 'Новый год' } }), 'повод «Новый год», декабрь');
});

h.test('тема из праздника (договор с «Праздничными пасхалками»)', function () {
  var topic = ctx.occasionTopic({ id: 'new-year', title: 'Новый год', decor: 'snow', wallpaper: 'Winter night, snow & lights' });
  assert.deepStrictEqual(topic, { name: 'Новый год', query: 'winter night snow lights', weight: 1, bright: false, space: false, occasion: true });
  assert.strictEqual(ctx.occasionTopic({ id: 'x', title: 'x' }), null);
  assert.strictEqual(ctx.occasionTopic(null), null);
});

h.test('сравнение времени дня', function () {
  assert.strictEqual(ctx.atOrAfter(new Date(2026, 10, 14, 12, 0).getTime(), '12:00'), true);
  assert.strictEqual(ctx.atOrAfter(new Date(2026, 10, 14, 11, 59).getTime(), '12:00'), false);
});

h.test('настроение Питомца: какие состояния просят тишины, чужой день — нет', function () {
  assert.strictEqual(ctx.petCalm({ state: 'unrested', date: '2026-11-14' }, 'tired', '2026-11-14'), 'невыспавшийся');
  assert.strictEqual(ctx.petCalm({ state: 'sleepy' }, 'tired', '2026-11-14'), 'сонный');
  assert.strictEqual(ctx.petCalm({ state: 'quiet', date: '2026-11-14' }, 'tired', '2026-11-14'), null);
  assert.strictEqual(ctx.petCalm({ state: 'quiet', date: '2026-11-14' }, 'low', '2026-11-14'), 'притихший');
  assert.strictEqual(ctx.petCalm({ state: 'cheerful', date: '2026-11-14' }, 'low', '2026-11-14'), null);
  assert.strictEqual(ctx.petCalm({ state: 'unrested', date: '2026-11-13' }, 'tired', '2026-11-14'), null);
  assert.strictEqual(ctx.petCalm({ state: 'unrested' }, 'off', '2026-11-14'), null);
  assert.strictEqual(ctx.petCalm(null, 'low', '2026-11-14'), null);
  assert.strictEqual(ctx.reason({ month: 'ноябрь', topic: { name: 'тишина' }, petMood: 'сонный' }), 'ноябрь, тема «тишина», Питомец сонный');
});

h.test('плохая ночь и тема «тишина»', function () {
  assert.strictEqual(ctx.badNight({ known: { sleep: true }, sleepMin: 400 }, 450, 45), true);
  assert.strictEqual(ctx.badNight({ known: { sleep: true }, sleepMin: 410 }, 450, 45), false);
  assert.strictEqual(ctx.badNight({ known: { sleep: false }, sleepMin: 0 }, 450, 45), false, 'неизвестно — не плохо');
  assert.strictEqual(ctx.badNight(null, 450, 45), false);
  var topics = [{ name: 'природа', query: 'nature', weight: 3 }];
  var calm = { name: 'тишина', query: 'calm landscape', weight: 6 };
  var added = ctx.calmTopics(topics, calm);
  assert.strictEqual(added.length, 2);
  assert.strictEqual(added[1].weight, 6);
  assert.strictEqual(topics.length, 1, 'настройки не меняются');
  var own = ctx.calmTopics([{ name: 'Тишина', query: 'silence', weight: 1 }], calm);
  assert.strictEqual(own.length, 1);
  assert.strictEqual(own[0].weight, 7);
  assert.strictEqual(ctx.reason({ month: 'ноябрь', topic: { name: 'тишина' }, badNight: true }), 'ноябрь, тема «тишина», после короткой ночи');
});

h.done(__filename);
