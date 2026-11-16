// node tests/birthdays.test.js — reading birthdays from contacts, ages, reminders.
var assert = require('assert');
var birthdays = require('../birthdays.js');
var t = require('./harness.js');

t.test('ISO с годом', function () {
  assert.deepStrictEqual(birthdays.parse('1996-11-15'), { year: 1996, month: 11, day: 15 });
});

t.test('без года: --11-15 и --1115', function () {
  assert.deepStrictEqual(birthdays.parse('--11-15'), { year: null, month: 11, day: 15 });
  assert.deepStrictEqual(birthdays.parse('--1115'), { year: null, month: 11, day: 15 });
});

t.test('слитно: 19961115', function () {
  assert.deepStrictEqual(birthdays.parse('19961115'), { year: 1996, month: 11, day: 15 });
});

t.test('год 1604 (iOS без года) — без года', function () {
  assert.deepStrictEqual(birthdays.parse('1604-11-15'), { year: null, month: 11, day: 15 });
});

t.test('с временем: 1996-11-15T00:00:00.000Z', function () {
  assert.deepStrictEqual(birthdays.parse('1996-11-15T00:00:00.000Z'), { year: 1996, month: 11, day: 15 });
});

t.test('по-русски: 15.11.1996, 15.11, 15/11/96', function () {
  assert.deepStrictEqual(birthdays.parse('15.11.1996'), { year: 1996, month: 11, day: 15 });
  assert.deepStrictEqual(birthdays.parse('15.11'), { year: null, month: 11, day: 15 });
  assert.deepStrictEqual(birthdays.parse('15/11/96'), { year: 1996, month: 11, day: 15 });
  assert.deepStrictEqual(birthdays.parse('01.02.05'), { year: 2005, month: 2, day: 1 });
});

t.test('мусор и невозможные даты — null', function () {
  ['', null, 'завтра', '1996-13-01', '1996-02-30', '--02-30', '1997-02-29', '32.01'].forEach(function (value) {
    assert.strictEqual(birthdays.parse(value), null, String(value));
  });
  assert.deepStrictEqual(birthdays.parse('--02-29'), { year: null, month: 2, day: 29 });
  assert.deepStrictEqual(birthdays.parse('1996-02-29'), { year: 1996, month: 2, day: 29 });
});

t.test('следующий день рождения и возраст', function () {
  var anna = birthdays.parse('1996-11-15');
  assert.strictEqual(birthdays.next(anna, '2026-11-14'), '2026-11-15');
  assert.strictEqual(birthdays.next(anna, '2026-11-15'), '2026-11-15');
  assert.strictEqual(birthdays.next(anna, '2026-11-16'), '2027-11-15');
  assert.strictEqual(birthdays.age(anna, '2026-11-15'), 30);
  assert.strictEqual(birthdays.age(birthdays.parse('--11-15'), '2026-11-15'), null);
});

t.test('склонение лет', function () {
  assert.strictEqual(birthdays.years(30), '30 лет');
  assert.strictEqual(birthdays.years(21), '21 год');
  assert.strictEqual(birthdays.years(22), '22 года');
  assert.strictEqual(birthdays.years(11), '11 лет');
  assert.strictEqual(birthdays.years(112), '112 лет');
});

t.test('когда', function () {
  assert.strictEqual(birthdays.when(0), 'Сегодня');
  assert.strictEqual(birthdays.when(1), 'Завтра');
  assert.strictEqual(birthdays.when(2), 'Послезавтра');
  assert.strictEqual(birthdays.when(5), 'Через 5 дней');
  assert.strictEqual(birthdays.when(3), 'Через 3 дня');
  assert.strictEqual(birthdays.when(-2), '2 дня назад');
});

// Rows as the contacts provider gives them (Data table, contact_event); a Samsung contact may
// keep a second event of another type, and an iOS one the 1604 year.
var rows = [
  { contact_id: 12, display_name: 'Аня Петрова', data1: '1996-11-15', data2: 3, starred: 1 },
  { contact_id: 12, display_name: 'Аня Петрова', data1: '2019-06-01', data2: 1, starred: 1 },
  { contact_id: 31, display_name: 'Петя', data1: '--03-02', data2: 3, starred: 0 },
  { contact_id: 40, display_name: 'Бабушка', data1: '1604-05-20', data2: 3, starred: 1 },
  { contact_id: 41, display_name: 'Сломанный', data1: 'когда-то', data2: 3, starred: 0 }
];

t.test('строки контактов → люди, по одному дню рождения на человека', function () {
  var people = birthdays.fromRows(rows);
  assert.deepStrictEqual(people.map(function (person) { return person.id; }), ['12', '31', '40']);
  assert.strictEqual(people[0].starred, true);
  assert.deepStrictEqual(people[2].birthday, { year: null, month: 5, day: 20 });
  assert.strictEqual(people.unreadable.length, 1);
  assert.strictEqual(people.unreadable[0].name, 'Сломанный');
});

t.test('близкие: избранные плюс отмеченные, отметка сильнее звёздочки', function () {
  var people = birthdays.fromRows(rows);
  var settings = { closeStarred: true, remindDays: 1, people: { '31': { remind: true, days: 3 }, '40': { remind: false } } };
  var marked = birthdays.markClose(people, settings);
  var byId = {};
  marked.forEach(function (person) { byId[person.id] = person; });
  assert.strictEqual(byId['12'].close, true);
  assert.strictEqual(byId['12'].days, 1);
  assert.strictEqual(byId['31'].close, true);
  assert.strictEqual(byId['31'].days, 3);
  assert.strictEqual(byId['40'].close, false);
  settings.closeStarred = false;
  assert.strictEqual(birthdays.markClose(people, settings)[0].close, false);
});

t.test('кому напомнить сегодня', function () {
  var people = birthdays.markClose(birthdays.fromRows(rows), { closeStarred: true, remindDays: 1, people: { '31': { remind: true, days: 3 } } });
  assert.deepStrictEqual(birthdays.due(people, '2026-11-14').map(function (person) { return person.id; }), ['12']);
  assert.deepStrictEqual(birthdays.due(people, '2027-02-27').map(function (person) { return person.id; }), ['31']);
  assert.deepStrictEqual(birthdays.due(people, '2026-11-13'), []);
});

t.test('текст напоминания: с возрастом и без', function () {
  var people = birthdays.markClose(birthdays.fromRows(rows), { closeStarred: true, remindDays: 1, people: { '31': { remind: true, days: 3 } } });
  var anna = birthdays.due(people, '2026-11-14')[0];
  assert.deepStrictEqual(birthdays.reminder(anna), { title: 'Завтра день рождения', text: 'Аня Петрова — исполняется 30 лет. Подготовить поздравление?' });
  var petya = birthdays.due(people, '2027-02-27')[0];
  assert.deepStrictEqual(birthdays.reminder(petya), { title: 'Через 3 дня день рождения', text: 'Петя. Подготовить поздравление?' });
});

t.test('расписание: ближайшие первыми', function () {
  var list = birthdays.schedule(birthdays.fromRows(rows), '2026-11-14');
  assert.deepStrictEqual(list.map(function (person) { return person.id; }), ['12', '31', '40']);
  assert.strictEqual(list[0].inDays, 1);
  assert.strictEqual(list[0].age, 30);
});

t.test('календарь «Дни рождения» как запасной источник', function () {
  var people = birthdays.fromCalendar([
    { title: 'День рождения Ани', day: '2026-11-15', calendar: 'Дни рождения' },
    { title: 'Пётр — день рождения', day: '2027-03-02', calendar: 'Мой' },
    { title: "Anna's birthday", day: '2026-11-15', calendar: 'Contacts' },
    { title: 'Встреча', day: '2026-11-16', calendar: 'Мой' }
  ]);
  assert.deepStrictEqual(people.map(function (person) { return person.name; }), ['Ани', 'Пётр', 'Anna']);
  assert.deepStrictEqual(people[0].birthday, { year: null, month: 11, day: 15 });
});

t.test('шаблон поздравления без модели', function () {
  assert.strictEqual(birthdays.template('Аня Петрова', 30), 'Аня, с днём рождения! 30 лет — отличный повод. Желаю здоровья, радости и побольше хороших дней.');
  assert.ok(birthdays.template('Петя', null).indexOf('лет') < 0);
});

t.done('birthdays');
