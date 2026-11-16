// node tests/links.test.js — what the horoscope reads from Праздники, Питомец and Обои дня, with each
// neighbour present, absent and broken.
var assert = require('assert');
var links = require('../links.js');
var text = require('../text.js');

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

var DATE = '2026-12-29';
var quiet = console.warn;
console.warn = function () {};

/** A fake «Праздники»: occasionToday and upcoming of the real module's shape. */
function holidays(today, list) {
  return {
    occasionToday: function (date) { assert.strictEqual(date, DATE); return today; },
    upcoming: function (days) { this.asked = days; return list; }
  };
}

test('holiday: today from occasionToday, the nearest one ahead from upcoming', function () {
  var module = holidays({ id: 'ny-eve', title: 'Канун', decor: null, wallpaper: 'snow' }, [
    { id: 'ny', title: 'Новый год', anchor: '2027-01-01', inDays: 3, kind: 'holiday' },
    { id: 'far', title: 'Далёкий', anchor: '2027-01-10', inDays: 12, kind: 'holiday' }
  ]);
  var got = links.holiday(module, DATE, { on: true, days: 3 });
  assert.deepStrictEqual(got, { today: { id: 'ny-eve', title: 'Канун' }, soon: { id: 'ny', title: 'Новый год', inDays: 3 } });
  assert.strictEqual(module.asked, 3);
  assert.strictEqual(links.holiday(module, DATE, { on: true, days: 2 }).soon, null, 'beyond the setting');
});

test('holiday: an occasion without a wallpaper phrase still counts today; solemn, weather and contacts are left out', function () {
  var list = [
    { id: 'own', title: 'Годовщина', anchor: DATE, inDays: 0, kind: 'own' },
    { id: 'memory', title: 'День памяти', anchor: '2026-12-30', inDays: 1, kind: 'holiday', solemn: true },
    { id: 'snow', title: 'Первый снег', anchor: '2026-12-30', inDays: 1, kind: 'weather' },
    { id: 'anya', title: 'День рождения: Аня', anchor: '2026-12-31', inDays: 2, kind: 'birthday' }
  ];
  assert.deepStrictEqual(links.holiday(holidays(null, list), DATE, { on: true, days: 3 }), { today: { id: 'own', title: 'Годовщина' }, soon: null });
  assert.deepStrictEqual(links.holiday(holidays(null, list.slice(1)), DATE, { on: true, days: 3, people: true }).soon, { id: 'anya', title: 'День рождения: Аня', inDays: 2 });
  assert.strictEqual(links.holiday(holidays({ id: 'memory', title: 'День памяти' }, list.slice(1, 2)), DATE, { on: true, days: 3 }), null, 'a solemn day is no joke');
});

test('holiday: absent, switched off or broken — null', function () {
  assert.strictEqual(links.holiday(null, DATE, { on: true, days: 3 }), null);
  assert.strictEqual(links.holiday(holidays({ id: 'a', title: 'А' }, []), DATE, { on: false, days: 3 }), null);
  var broken = { occasionToday: function () { throw new Error('boom'); }, upcoming: function () { throw new Error('boom'); } };
  assert.strictEqual(links.holiday(broken, DATE, { on: true, days: 3 }), null);
  assert.strictEqual(links.holiday({}, DATE, { on: true, days: 3 }), null, 'an old module without these functions');
});

test('pet: name, mood and a clean short phrase; absent or off — null', function () {
  var pet = { state: function () { return { state: 'calm', title: 'Спокойный', name: 'Листик', phrase: 'Сегодня я никуда не тороплюсь.' }; } };
  var clean = function (phrase) { return text.clean(phrase, ['тороплюсь']); };
  var got = links.pet(pet, { on: true, phraseMax: 160 });
  assert.strictEqual(got.line, 'Прогноз читает Листик (сейчас — спокойный) и добавляет от себя: «Сегодня я никуда не тороплюсь».');
  assert.strictEqual(links.pet(pet, { on: true, phraseMax: 160, clean: clean }).line, 'Прогноз читает Листик (сейчас — спокойный).', 'a banned word drops the phrase');
  assert.strictEqual(links.pet(pet, { on: true, phraseMax: 10 }).phrase, '', 'too long');
  assert.strictEqual(links.pet(pet, { on: false, phraseMax: 160 }), null);
  assert.strictEqual(links.pet(null, { on: true, phraseMax: 160 }), null);
  assert.strictEqual(links.pet({ state: function () { throw new Error('boom'); } }, { on: true }), null);
  assert.strictEqual(links.pet({ state: function () { return {}; } }, { on: true }), null, 'no name');
});

test('wallpaper: today\'s picture with a link; absent, off or none yet — null', function () {
  var wallpapers = { today: function () { return { current: { title: 'Туман над озером', thumbUrl: '/data/wallpapers/7/thumb.jpg?v=1', credit: 'Фото: А, Unsplash' } }; } };
  assert.deepStrictEqual(links.wallpaper(wallpapers, { on: true }), {
    title: 'Туман над озером', thumbUrl: '/data/wallpapers/7/thumb.jpg?v=1', credit: 'Фото: А, Unsplash', open: 'modules/wallpapers/ui/index.html'
  });
  assert.strictEqual(links.wallpaper(wallpapers, { on: false }), null);
  assert.strictEqual(links.wallpaper(null, { on: true }), null);
  assert.strictEqual(links.wallpaper({ today: function () { return { current: null }; } }, { on: true }), null);
  assert.strictEqual(links.wallpaper({ today: function () { throw new Error('boom'); } }, { on: true }), null);
});

console.warn = quiet;
console.log('links: ' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
