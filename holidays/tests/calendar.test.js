// node tests/calendar.test.js — dates of occasions.
var assert = require('assert');
var calendar = require('../calendar.js');
var occasions = require('../occasions.json');
var t = require('./harness.js');

function byId(id) {
  return occasions.filter(function (occasion) { return occasion.id === id; })[0];
}

function activeIds(day, ctx) {
  return calendar.activeOn(occasions, day, ctx || {}).map(function (item) { return item.id; });
}

t.test('Пасха 2025 — 20 апреля', function () { assert.strictEqual(calendar.easter(2025), '2025-04-20'); });
t.test('Пасха 2026 — 12 апреля', function () { assert.strictEqual(calendar.easter(2026), '2026-04-12'); });
t.test('Пасха 2027 — 2 мая', function () { assert.strictEqual(calendar.easter(2027), '2027-05-02'); });
t.test('Пасха 2028 — 16 апреля', function () { assert.strictEqual(calendar.easter(2028), '2028-04-16'); });
t.test('Пасха 2024 — 5 мая, 2030 — 28 апреля', function () {
  assert.strictEqual(calendar.easter(2024), '2024-05-05');
  assert.strictEqual(calendar.easter(2030), '2030-04-28');
});

t.test('Масленица 2026 — 16–22 февраля', function () {
  var maslenitsa = byId('maslenitsa');
  var anchor = calendar.anchors(maslenitsa, 2026, {})[0];
  var span = calendar.windowOf(maslenitsa, anchor, {});
  assert.deepStrictEqual([span.start, span.end], ['2026-02-16', '2026-02-22']);
  assert.ok(activeIds('2026-02-16').indexOf('maslenitsa') >= 0);
  assert.ok(activeIds('2026-02-22').indexOf('maslenitsa') >= 0);
  assert.ok(activeIds('2026-02-23').indexOf('maslenitsa') < 0);
  assert.ok(activeIds('2026-02-15').indexOf('maslenitsa') < 0);
});

t.test('окно Нового года: 20.12 и 08.01 внутри, 19.12 и 09.01 — нет', function () {
  assert.ok(activeIds('2026-12-20').indexOf('new-year') >= 0, '20.12');
  assert.ok(activeIds('2027-01-08').indexOf('new-year') >= 0, '08.01 следующего года');
  assert.ok(activeIds('2026-01-08').indexOf('new-year') >= 0, '08.01 этого года — окно прошлого');
  assert.ok(activeIds('2027-01-09').indexOf('new-year') < 0, '09.01');
  assert.ok(activeIds('2026-12-19').indexOf('new-year') < 0, '19.12');
});

t.test('пасхалки Нового года только 31.12–01.01', function () {
  var on = function (day) {
    return calendar.activeOn(occasions, day, {}).filter(function (item) { return item.id === 'new-year'; })[0].egg;
  };
  assert.strictEqual(on('2026-12-30'), false);
  assert.strictEqual(on('2026-12-31'), true);
  assert.strictEqual(on('2027-01-01'), true);
  assert.strictEqual(on('2027-01-02'), false);
});

t.test('главный повод — по приоритету: 7 января Новый год впереди Рождества', function () {
  var active = calendar.activeOn(occasions, '2027-01-07', {});
  assert.deepStrictEqual(active.map(function (item) { return item.id; }).slice(0, 2), ['new-year', 'christmas']);
  assert.strictEqual(calendar.pick(active).id, 'new-year');
});

t.test('день рождения владельца важнее Нового года', function () {
  var ctx = { owner: { year: 1990, month: 12, day: 25 } };
  assert.strictEqual(calendar.pick(calendar.activeOn(occasions, '2026-12-25', ctx)).id, 'birthday-owner');
});

t.test('Хэллоуин: 29–31 октября', function () {
  assert.ok(activeIds('2026-10-29').indexOf('halloween') >= 0);
  assert.ok(activeIds('2026-10-31').indexOf('halloween') >= 0);
  assert.ok(activeIds('2026-10-28').indexOf('halloween') < 0);
  assert.ok(activeIds('2026-11-01').indexOf('halloween') < 0);
});

t.test('n-й день недели: последнее воскресенье ноября 2026 — 29-е', function () {
  assert.strictEqual(calendar.nth(2026, 11, 7, -1), '2026-11-29');
  assert.strictEqual(calendar.anchors(byId('mothers-day'), 2026, {})[0], '2026-11-29');
});

t.test('n-й день недели: второе воскресенье мая 2026 — 10-е, первый понедельник сентября — 7-е', function () {
  assert.strictEqual(calendar.nth(2026, 5, 7, 2), '2026-05-10');
  assert.strictEqual(calendar.nth(2026, 9, 1, 1), '2026-09-07');
  assert.strictEqual(calendar.nth(2026, 2, 1, 5), null);
});

t.test('день недели', function () {
  assert.strictEqual(calendar.weekday('2026-11-14'), 6);
  assert.strictEqual(calendar.weekday('2026-11-16'), 1);
});

t.test('29 февраля в невисокосный год — 28-е', function () {
  var ctx = { owner: { year: 2000, month: 2, day: 29 } };
  assert.strictEqual(calendar.anchors(byId('birthday-owner'), 2027, ctx)[0], '2027-02-28');
  assert.strictEqual(calendar.anchors(byId('birthday-owner'), 2028, ctx)[0], '2028-02-29');
});

t.test('дни рождения близких: шаблон раскрывается по людям, далёкие не попадают', function () {
  var ctx = {
    people: [
      { id: '12', name: 'Аня', birthday: { year: 1996, month: 11, day: 15 }, close: true },
      { id: '13', name: 'Коллега', birthday: { year: null, month: 11, day: 15 }, close: false }
    ]
  };
  var ids = activeIds('2026-11-15', ctx);
  assert.ok(ids.indexOf('birthday:12') >= 0);
  assert.ok(ids.indexOf('birthday:13') < 0);
  var item = calendar.activeOn(occasions, '2026-11-15', ctx).filter(function (entry) { return entry.id === 'birthday:12'; })[0];
  assert.strictEqual(item.title, 'День рождения: Аня');
});

t.test('годовщина Assi — с первого года после установки', function () {
  var ctx = { installDay: '2026-11-10' };
  assert.deepStrictEqual(calendar.anchors(byId('assi-anniversary'), 2026, ctx), []);
  assert.deepStrictEqual(calendar.anchors(byId('assi-anniversary'), 2027, ctx), ['2027-11-10']);
});

t.test('событие календаря со словом', function () {
  var occasion = { id: 'wedding', title: 'Годовщина', rule: { calendar: 'свадьб' } };
  var ctx = { calendar: [{ title: 'Годовщина свадьбы', day: '2026-06-14' }, { title: 'Встреча', day: '2026-06-15' }] };
  assert.deepStrictEqual(calendar.anchors(occasion, 2026, ctx), ['2026-06-14']);
});

t.test('первый снег: окно по настройке, декор — только с согласия', function () {
  var ctx = { weather: { snow: { day: '2026-11-03', accepted: null } }, weatherDays: 3 };
  var first = calendar.activeOn(occasions, '2026-11-05', ctx).filter(function (item) { return item.id === 'first-snow'; })[0];
  assert.ok(first, 'активен на третий день');
  assert.strictEqual(first.consent, false);
  assert.ok(activeIds('2026-11-06', ctx).indexOf('first-snow') < 0, 'четвёртого дня нет');
  ctx.weather.snow.accepted = true;
  assert.strictEqual(calendar.activeOn(occasions, '2026-11-04', ctx).filter(function (item) { return item.id === 'first-snow'; })[0].consent, true);
});

t.test('ближайшие 60 дней с 14.11.2026', function () {
  var list = calendar.upcoming(occasions, '2026-11-14', 60, {});
  var ids = list.map(function (item) { return item.id; });
  ['mothers-day', 'new-year', 'christmas'].forEach(function (id) { assert.ok(ids.indexOf(id) >= 0, id); });
  assert.ok(ids.indexOf('halloween') < 0);
  assert.ok(ids.indexOf('maslenitsa') < 0);
  var newYear = list.filter(function (item) { return item.id === 'new-year'; })[0];
  assert.strictEqual(newYear.anchor, '2026-12-31');
  assert.strictEqual(newYear.inDays, 47);
  assert.ok(ids.indexOf('mothers-day') < ids.indexOf('new-year'), 'по дате');
});

t.test('ближайшие: идущий повод — первым и отмечен', function () {
  var list = calendar.upcoming(occasions, '2027-01-03', 10, {});
  assert.strictEqual(list[0].id, 'new-year');
  assert.strictEqual(list[0].active, true);
  assert.strictEqual(list[0].inDays, -3);
});

t.test('ближайшие на год вперёд переходят через год', function () {
  var list = calendar.upcoming(occasions, '2026-12-01', 400, {});
  var easter = list.filter(function (item) { return item.id === 'easter'; });
  assert.deepStrictEqual(easter.map(function (item) { return item.anchor; }), ['2027-05-02']);
});

t.test('разбор даты своего повода', function () {
  assert.deepStrictEqual(calendar.parseUserDate('14.06'), { year: null, month: 6, day: 14 });
  assert.deepStrictEqual(calendar.parseUserDate('14.06.2027'), { year: 2027, month: 6, day: 14 });
  assert.deepStrictEqual(calendar.parseUserDate('2027-06-14'), { year: 2027, month: 6, day: 14 });
  assert.deepStrictEqual(calendar.parseUserDate('06-14'), { year: null, month: 6, day: 14 });
  assert.strictEqual(calendar.parseUserDate('31.02'), null);
  assert.strictEqual(calendar.parseUserDate('завтра'), null);
});

t.test('правила проверяются, сломанное правило не валит календарь', function () {
  assert.strictEqual(calendar.validRule({ fixed: '13-01' }), false);
  assert.strictEqual(calendar.validRule({ nth: { month: 11, weekday: 7, n: -1 } }), true);
  var list = occasions.concat([{ id: 'broken', title: 'x', rule: { fixed: 'abc' } }, { id: 'none', title: 'y' }]);
  assert.ok(calendar.activeOn(list, '2026-12-31', {}).length > 0);
});

t.test('сезон первого снега', function () {
  assert.strictEqual(calendar.season('2026-11-14'), 2026);
  assert.strictEqual(calendar.season('2027-01-05'), 2026);
});

t.test('коды погоды со снегом', function () {
  [71, 73, 75, 77, 85, 86].forEach(function (code) { assert.ok(calendar.isSnowCode(code), code); });
  [0, 3, 45, 61, 95].forEach(function (code) { assert.ok(!calendar.isSnowCode(code), code); });
});

t.done('calendar');
