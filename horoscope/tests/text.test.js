// node tests/text.test.js — sentences from templates, the model's text check, the sign of the week.
var assert = require('assert');
var text = require('../text.js');
var signs = require('../signs.js');
var templates = require('../templates.json');
var stars = require('../stars.json');

var passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error('FAIL ' + name + '\n' + (error.stack || error));
    process.exitCode = 1;
  }
}

var DATE = '2026-11-19';
var delivery = { id: 'weekday.delivery', detector: 'weekday', kind: 'spend', tone: 'tease', params: { k: 4, n: 4, weekday: 4, hour: 22 } };

test('a prediction in words, with its fact and source', function () {
  var got = text.describe(delivery, templates, { tone: 'soft' }, DATE);
  assert.ok(/22:00/.test(got.claim) && /4 из 4 последних четвергов/.test(got.claim), got.claim);
  assert.deepStrictEqual(got.facts, ['4 из 4 последних четвергов: доставка еды после 22:00']);
  assert.strictEqual(got.source, 'Траты');
  assert.strictEqual(text.describe(delivery, templates, { tone: 'soft' }, DATE).claim, got.claim, 'steady');
});

test('places can be left unnamed', function () {
  var place = { id: 'weekday.place:p7', detector: 'weekday', kind: 'places', params: { k: 3, n: 4, weekday: 2, title: 'Сквер' } };
  assert.ok(/Сквер/.test(text.describe(place, templates, { mentionPlaces: true }, DATE).claim));
  var anon = text.describe(place, templates, { mentionPlaces: false }, DATE);
  assert.ok(!/Сквер/.test(anon.claim) && !/Сквер/.test(anon.facts[0]));
});

test('every template has every placeholder filled and no reproach', function () {
  var params = { k: 3, n: 4, weekday: 5, hour: 22, goal: 8000, min: 15, title: 'Сквер', game: 'Подземка', debt: 130, nights: 3, usual: 9000,
    pct: 20, habit: 'Растяжка', habitId: 's', chain: 29, round: 30, inDays: 2, daysLeft: 2, level: 15, toNext: 200, perDay: 300, by: 6, time: '15:00',
    holiday: 'Новый год', whenText: 'послезавтра', longMin: 50, shortMin: 25 };
  Object.keys(templates.claims).forEach(function (key) {
    var spec = templates.claims[key];
    ['soft', 'sharp', 'soft_anon', 'sharp_anon'].forEach(function (tone) {
      (spec[tone] || []).forEach(function (line) {
        var kind = key === 'achievement' ? 'achievement' : 'x';
        var id = key === 'chainLater' ? 'chain:s' : key;
        var p = { id: id, detector: key === 'chainLater' || key === 'chain' ? 'chain' : key === 'achievement' ? 'achievement' : 'weekday', kind: kind, params: Object.assign({}, params, key === 'chain' ? { inDays: 0 } : {}) };
        var filled = text.fill(line, Object.assign({ achievement: 'Пешеход II', inDaysText: '2 дня', daysLeftText: '2 дня', weekdayGen: 'пятниц', byDat: 'субботе', weekdayAcc: 'пятницу' }, p.params));
        assert.ok(!/\{\w+\}/.test(filled), key + ': ' + filled);
        assert.ok(text.clean(filled), key + ' has a banned word: ' + filled);
      });
    });
  });
  ['intro', 'signLine', 'introNoSign', 'pause', 'outro', 'empty'].forEach(function (key) {
    ['soft', 'sharp'].forEach(function (tone) { assert.ok(templates[key][tone].length && templates[key][tone].every(function (l) { return text.clean(l); }), key); });
  });
});

test('a holiday and Фокус in words', function () {
  var soon = text.describe({ id: 'holiday.soon:ny', detector: 'holiday', kind: 'holiday', params: { holiday: 'Новый год', inDays: 1 } }, templates, {}, DATE);
  assert.ok(/завтра — Новый год/.test(soon.claim), soon.claim);
  assert.deepStrictEqual(soon.facts, ['завтра — Новый год']);
  assert.strictEqual(soon.source, 'Праздники');
  var later = text.describe({ id: 'holiday.soon:ny', detector: 'holiday', kind: 'holiday', params: { holiday: 'Новый год', inDays: 3 } }, templates, {}, DATE);
  assert.deepStrictEqual(later.facts, ['через 3 дня — Новый год']);
  var today = text.describe({ id: 'holiday.today:march8', detector: 'holiday', kind: 'holiday', params: { holiday: '8 Марта' } }, templates, { tone: 'sharp' }, DATE);
  assert.ok(/Сегодня 8 Марта/.test(today.claim) && today.facts[0] === 'сегодня 8 Марта', today.claim);
  var hours = text.describe({ id: 'focus.after', detector: 'focus', kind: 'focus', params: { hour: 13, longMin: 50, shortMin: 25 } }, templates, {}, DATE);
  assert.deepStrictEqual(hours.facts, ['сессия фокуса после 13:00 — обычно 50 мин, до — 25 мин']);
  assert.strictEqual(hours.source, 'Фокус');
  // The numbers of a holiday's title are facts: the model may repeat them.
  var predictions = [Object.assign({ id: 'holiday.today:march8' }, today)];
  var body = 'Звёзды на четверг отмечают: сегодня 8 Марта, и весь день пройдёт под знаком цветов и тёплых слов. Звёзды советуют не спешить, ' +
    'улыбаться чаще обычного и принимать поздравления так, будто вы их давно ждали. Вечер обещает быть уютным и спокойным, без сюрпризов.';
  assert.deepStrictEqual(text.accept(body, predictions, {}, DATE), { ok: true });
});

test('the template text of a day', function () {
  var predictions = [delivery, { id: 'calm', detector: 'calm', kind: 'calm', params: {} }].map(function (p) { return Object.assign({}, p, text.describe(p, templates, {}, DATE)); });
  var body = text.compose({ title: 'Сова в доме Скроллера' }, predictions, templates, { tone: 'soft' }, DATE, null);
  assert.ok(/четверг/.test(body) && /Сова в доме Скроллера/.test(body), body);
  assert.ok(body.length > 150 && body.length < 700, 'length ' + body.length);
  var pause = text.compose(null, [], templates, { tone: 'soft' }, DATE, 'sick');
  assert.ok(/плед|отдых/.test(pause), pause);
});

test('the model\'s text: numbers must be from the facts, no reproach, no money', function () {
  var predictions = [Object.assign({}, delivery, text.describe(delivery, templates, {}, DATE))];
  var good = 'Звёзды на четверг шепчут: вечером, ближе к 22:00, рука сама потянется к телефону и закажет ужин. Так было 4 из 4 последних четвергов, ' +
    'и звёзды не видят причин нарушать традицию. Но кто знает — может, сегодня вы их перехитрите и приготовите что-то сами. Звёзды будут подглядывать и завтра честно признают поражение.';
  assert.deepStrictEqual(text.accept(good, predictions, {}, DATE), { ok: true });
  var invented = good.replace('4 из 4', '5 из 6');
  assert.strictEqual(text.accept(invented, predictions, {}, DATE).ok, false);
  assert.ok(/5, 6/.test(text.accept(invented, predictions, {}, DATE).reason));
  assert.strictEqual(text.accept(good + ' Не будьте ленивы.', predictions, {}, DATE).ok, false);
  assert.strictEqual(text.accept(good.replace('ужин', 'ужин за ₽'), predictions, {}, DATE).ok, false);
  assert.strictEqual(text.accept('Коротко.', predictions, {}, DATE).ok, false);
  assert.deepStrictEqual(text.numbers('8 000 шагов и 22:00, 4,5'), ['8000', '22', '0', '4.5']);
  var prompt = text.prompt({ title: 'Сова в доме Скроллера' }, predictions, { mentionMoney: false }, DATE, null);
  assert.ok(/суммы/.test(prompt.system) && /Факт: 4 из 4/.test(prompt.prompt));
});

test('the sign of the week', function () {
  assert.strictEqual(stars.length, 12);
  stars.forEach(function (s) {
    assert.ok(s.points.length >= 5 && s.points.length <= 9, s.id + ' points');
    s.lines.forEach(function (l) { assert.ok(s.points[l[0]] && s.points[l[1]], s.id + ' line'); });
  });
  var days = [];
  for (var i = 0; i < 7; i++) {
    days.push({ date: '2026-11-0' + (i + 2), known: { screen: true, sleep: true, steps: true }, lateMin: 70, socialMin: 80, steps: 4000, sleepMin: 420, wake: '08:00', habitIds: [] });
  }
  var sign = signs.ofWeek(stars, days, [], { sleep: 450 }, {});
  assert.strictEqual(sign.star, 'owl');
  assert.strictEqual(sign.house, 'scroller');
  assert.strictEqual(sign.title, 'Сова в доме Скроллера');
  assert.strictEqual(signs.ofWeek(stars, [], [], {}, {}), null);
});

console.log('text + signs: ' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
