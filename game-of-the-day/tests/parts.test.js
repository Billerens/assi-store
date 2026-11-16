// The pure parts of «Игра дня» under node: node tests/parts.test.js
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var days = require('../days.js');
var schema = require('../schema.js');
var taste = require('../taste.js');
var slug = require('../slug.js');
var prompts = require('../prompt.js');

var failed = 0;
var passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + (error && error.stack || error));
  }
}

var NOW = new Date(2026, 10, 14, 7, 0, 0).getTime();
var DAY = days.DAY;

function key(offset) {
  return days.dayKey(NOW + offset * DAY);
}

function game(offset, title, genre, rating, extra) {
  var entry = { date: key(offset), id: 'daily/' + key(offset), made: true, title: title, pitch: title + ' — замысел', tags: { genre: genre, controls: 'tap', session: '2m' } };
  if (rating !== undefined) entry.rating = rating;
  Object.keys(extra || {}).forEach(function (k) { entry[k] = extra[k]; });
  return entry;
}

var OPTIONS = { explore: 0.3, decay: 0.95, dislikedTo: 2.5, likedFrom: 4, newDays: 30 };

// ---- days ---------------------------------------------------------------------------------------------

test('дни: ключ, полночь, сколько прошло, окно, будни, одно и то же зерно', function () {
  assert.strictEqual(days.dayKey(NOW), '2026-11-14');
  assert.strictEqual(days.dayStart('2026-11-14'), new Date(2026, 10, 14).getTime());
  assert.strictEqual(days.dayStart('14.11.2026'), null);
  assert.strictEqual(days.daysSince('2026-11-11', NOW), 3);
  assert.strictEqual(days.daysSince('2026-11-14', NOW), 0);
  assert.strictEqual(days.daysSince('плохо', NOW), Infinity);
  assert.strictEqual(days.inWindow(NOW, '06:00', '09:30'), true);
  assert.strictEqual(days.inWindow(NOW, '07:01', '09:30'), false);
  assert.strictEqual(days.inWindow(NOW, '23:00', '07:30'), true, 'окно через полночь');
  assert.strictEqual(days.inWindow(NOW, '06:00', '06:00'), false);
  assert.strictEqual(days.at(NOW, '08:00'), new Date(2026, 10, 14, 8, 0).getTime());
  assert.strictEqual(days.makesOn(NOW, 'weekdays'), false, '14 ноября 2026 — суббота');
  assert.strictEqual(days.makesOn(NOW + 2 * DAY, 'weekdays'), true);
  assert.strictEqual(days.makesOn(NOW, 'all'), true);
  assert.strictEqual(days.makesOn(NOW, 'never'), false);
  assert.strictEqual(days.seedOf('2026-11-14'), days.seedOf('2026-11-14'));
  assert.notStrictEqual(days.seedOf('2026-11-14'), days.seedOf('2026-11-15'));
  var r = days.rng(days.seedOf('2026-11-14'));
  var a = r();
  var b = r();
  assert.ok(a >= 0 && a < 1 && b >= 0 && b < 1 && a !== b);
  assert.strictEqual(days.rng(days.seedOf('2026-11-14'))(), a, 'повторяемо');
});

// ---- settings -------------------------------------------------------------------------------------------

test('настройки: пределы, время, варианты; сохраняется только отличие, чужой ключ — ошибка', function () {
  var v = schema.values({ keepDays: 99, frequency: 'sometimes', explore: '0,45', maxCostPerGame: 0.001, giveUpMin: -5 });
  assert.strictEqual(v.keepDays, 30);
  assert.strictEqual(v.frequency, 'daily');
  assert.deepStrictEqual(v.slots, [{ make: '06:00', ready: '08:00' }]);
  assert.strictEqual(v.giveUpMin, 0);
  assert.strictEqual(v.explore, 0.45);
  assert.strictEqual(v.maxCostPerGame, 0.05);
  assert.strictEqual(v.workMinutes, 40);
  assert.deepStrictEqual(schema.merge({ keepDays: 5 }, { rateAfterSec: 60, frequency: 'off' }), { keepDays: 5, frequency: 'off' });
  assert.throws(function () { schema.merge({}, { nonsense: 1 }); }, /Нет такой настройки/);
  var view = schema.describe({});
  assert.ok(view.length === Object.keys(schema.SCHEMA).length);
  assert.ok(view.every(function (row) { return row.title && row.group; }));
  assert.strictEqual(view.filter(function (row) { return row.key === 'frequency'; })[0].type, 'choice');
  assert.strictEqual(view.filter(function (row) { return row.key === 'slots'; })[0].custom, true);
  // Every number of the spec is a setting.
  ['slots', 'everyDays', 'giveUpMin', 'keepDays', 'rateAfterSec', 'explore', 'noRepeatDays', 'decay', 'promoteSessions', 'maxCostPerGame', 'workMinutes']
    .forEach(function (k) { assert.ok(schema.SCHEMA[k], k); });
});

test('слоты, дни недели, дата начала: чистятся; старые ключи понятны и в файле, и в правке', function () {
  assert.deepStrictEqual(schema.cleanSlots([{ make: '19:00', ready: '18:00' }, { make: '9:00', ready: '10:30' }, { make: '09:00', ready: '11:00' }, { make: 'x' }]),
    [{ make: '09:00', ready: '10:30' }, { make: '19:00', ready: '19:00' }], 'по времени, без повторов, готова не раньше начала');
  assert.strictEqual(schema.cleanSlots([]), null);
  assert.strictEqual(schema.values({ slots: [] }).slots.length, 1, 'пустой список — слот по умолчанию');
  assert.strictEqual(schema.values({ slots: [1, 2, 3, 4, 5, 6, 7, 8].map(function (h) { return { make: '0' + h + ':00', ready: '0' + h + ':30' }; }) }).slots.length, schema.MAX_SLOTS);
  assert.deepStrictEqual(schema.cleanWeekdays([0, 6, 1, 1, 9, 'x']), [1, 6, 0], 'с понедельника, без повторов');
  assert.strictEqual(schema.values({ weekdays: [] }).weekdays.length, 5);
  assert.strictEqual(schema.values({ anchor: '2026-02-30' }).anchor, '');
  assert.strictEqual(schema.values({ anchor: '2026-11-14' }).anchor, '2026-11-14');
  // «every» without a start: today.
  assert.deepStrictEqual(schema.merge({}, { frequency: 'every' }, '2026-11-14'), { frequency: 'every', anchor: '2026-11-14' });
  assert.deepStrictEqual(schema.merge({ frequency: 'every', anchor: '2026-11-01' }, { everyDays: 3 }, '2026-11-14'), { frequency: 'every', anchor: '2026-11-01', everyDays: 3 });
  // The first version's keys.
  var m = schema.migrate({ makeAt: '05:30', readyBy: '07:15', giveUpAt: '09:00', days: 'weekdays', keepDays: 5 });
  assert.strictEqual(m.changed, true);
  assert.deepStrictEqual(m.settings, { slots: [{ make: '05:30', ready: '07:15' }], giveUpMin: 105, frequency: 'weekdays', keepDays: 5 });
  assert.deepStrictEqual(schema.migrate({ makeAt: '06:00', readyBy: '08:00', giveUpAt: '09:30', days: 'all' }).settings, {}, 'значения по умолчанию — пустой файл');
  assert.deepStrictEqual(schema.migrate({ days: 'never' }).settings, { frequency: 'off' });
  assert.strictEqual(schema.migrate({ keepDays: 4 }).changed, false);
  assert.deepStrictEqual(schema.merge({ slots: [{ make: '06:00', ready: '08:00' }, { make: '17:00', ready: '19:00' }] }, { makeAt: '05:00' }).slots,
    [{ make: '05:00', ready: '08:00' }, { make: '17:00', ready: '19:00' }], 'makeAt в правке — время первой игры');
  assert.deepStrictEqual(schema.merge({}, { days: 'weekdays' }), { frequency: 'weekdays' });
});

test('расписание: ключи игр, окна слотов, через N дней, дни недели, ближайшие игры и слова', function () {
  assert.strictEqual(days.gameKey('2026-11-14', 0), '2026-11-14');
  assert.strictEqual(days.gameKey('2026-11-14', 1), '2026-11-14-2');
  assert.deepStrictEqual(days.parseKey('2026-11-14-2'), { day: '2026-11-14', slot: 1 });
  assert.deepStrictEqual(days.parseKey('2026-11-14'), { day: '2026-11-14', slot: 0 });
  assert.strictEqual(days.parseKey('2026-11-14-1'), null);
  assert.strictEqual(days.parseKey('../x'), null);
  assert.strictEqual(days.dayStart('2026-11-14-2'), days.dayStart('2026-11-14'));
  assert.strictEqual(days.daysSince('2026-11-13-2', NOW), 1);
  var slots = [{ make: '06:00', ready: '08:00' }, { make: '08:30', ready: '09:00' }, { make: '23:00', ready: '23:30' }];
  var w0 = days.slotTimes(NOW, slots, 0, 90);
  assert.strictEqual(w0.giveUp, new Date(2026, 10, 14, 8, 30).getTime(), 'окно обрезано началом следующей игры');
  assert.strictEqual(days.slotTimes(NOW, slots, 2, 90).giveUp, new Date(2026, 10, 15).getTime(), 'и полуночью');
  assert.strictEqual(days.slotAt(NOW, slots, 90), 0);
  assert.strictEqual(days.slotAt(new Date(2026, 10, 14, 8, 40).getTime(), slots, 90), 1);
  assert.strictEqual(days.slotAt(new Date(2026, 10, 14, 12, 0).getTime(), slots, 90), -1);
  var every = { frequency: 'every', everyDays: 2, anchor: '2026-11-14' };
  assert.deepStrictEqual([0, 1, 2, 3, -1, -2].map(function (d) { return days.makesOn(NOW + d * DAY, every); }), [true, false, true, false, false, true], 'через день — те же дни и до начала');
  assert.strictEqual(days.makesOn(NOW, { frequency: 'weekdays', weekdays: [6] }), true);
  assert.strictEqual(days.makesOn(NOW, { frequency: 'weekdays', weekdays: [1, 2] }), false);
  assert.strictEqual(days.makesOn(NOW, { frequency: 'off' }), false);
  assert.strictEqual(days.makesOn(NOW, { frequency: 'daily' }), true);
  var plan = { frequency: 'daily' };
  var two = [{ make: '06:00', ready: '08:00' }, { make: '17:00', ready: '19:00' }];
  assert.deepStrictEqual(days.upcoming(NOW, plan, two, 90, 3).map(function (x) { return x.key; }), ['2026-11-14', '2026-11-14-2', '2026-11-15']);
  assert.deepStrictEqual(days.upcoming(new Date(2026, 10, 14, 21, 0).getTime(), every, two, 90, 2).map(function (x) { return x.key; }), ['2026-11-16', '2026-11-16-2']);
  assert.deepStrictEqual(days.upcoming(NOW, { frequency: 'off' }, two, 90, 3), []);
  assert.strictEqual(days.whenText(new Date(2026, 10, 14, 19, 0).getTime(), NOW), 'сегодня в 19:00');
  assert.strictEqual(days.whenText(new Date(2026, 10, 15, 9, 0).getTime(), NOW), 'завтра в 09:00');
  assert.strictEqual(days.whenText(new Date(2026, 10, 16, 9, 0).getTime(), NOW), 'послезавтра в 09:00');
  assert.strictEqual(days.whenText(new Date(2026, 10, 19, 9, 0).getTime(), NOW), 'через 5 дней, в 09:00');
  assert.strictEqual(days.whenText(new Date(2026, 10, 25, 9, 0).getTime(), NOW), '25 ноября в 09:00');
  assert.strictEqual(days.scheduleText(plan, two), 'Каждый день в 08:00 и 19:00');
  assert.strictEqual(days.scheduleText(every, two.slice(0, 1)), 'Через день в 08:00');
  assert.strictEqual(days.scheduleText({ frequency: 'every', everyDays: 5 }, two.slice(0, 1)), 'Каждые 5 дней в 08:00');
  assert.strictEqual(days.scheduleText({ frequency: 'weekdays', weekdays: [1, 2, 3, 4, 5] }, two.slice(0, 1)), 'По будням в 08:00');
  assert.strictEqual(days.scheduleText({ frequency: 'weekdays', weekdays: [6, 0] }, two.slice(0, 1)), 'По выходным в 08:00');
  assert.strictEqual(days.scheduleText({ frequency: 'off' }, two), 'Выключена');
});

// ---- taste -------------------------------------------------------------------------------------------------

test('вкус: средняя с затуханием по дням давности и число игр', function () {
  var log = [game(0, 'Свет', 'puzzle', 5, { genrePreference: 'like' }), game(-10, 'Тьма', 'puzzle', 1, { genrePreference: 'dislike' }), game(-1, 'Бит', 'rhythm', 2, { genrePreference: 'dislike' }), game(-2, 'Пусто', 'arcade')];
  var table = taste.compute(log, NOW, 0.95);
  var w = Math.pow(0.95, 10);
  assert.strictEqual(table.genre.puzzle.score, Math.round((5 + w) / (1 + w) * 10) / 10);
  assert.strictEqual(table.genre.puzzle.n, 2);
  assert.strictEqual(table.genre.rhythm.score, 1);
  assert.ok(!table.genre.arcade, 'без оценки не считается');
  assert.strictEqual(taste.compute(log, NOW, 1).genre.puzzle.score, 3, 'без затухания — просто средняя');
  var rows = taste.rows(table);
  assert.strictEqual(rows[0].tag === 'genre' || rows[0].score >= rows[rows.length - 1].score, true);
  assert.deepStrictEqual(taste.disliked(table, 2.5).map(function (r) { return r.value; }), ['rhythm']);
  assert.strictEqual(taste.rowText({ tag: 'genre', value: 'puzzle', score: 4.3, n: 7 }), 'жанр puzzle 4,3 (7)');
});

test('направление дня: без оценок — свободно; исследование ~30 %, вариации — только на 4–5, нелюбимый жанр не берётся', function () {
  assert.strictEqual(taste.direction([], '2026-11-14', OPTIONS).mode, 'free');
  var log = [
    game(-1, 'Бит 1', 'rhythm', 1, { genrePreference: 'dislike' }), game(-2, 'Бит 2', 'rhythm', 1, { genrePreference: 'dislike' }), game(-3, 'Бит 3', 'rhythm', 1, { genrePreference: 'dislike' }),
    game(-4, 'Отражатель', 'puzzle', 5), game(-5, 'Шары', 'sort', 4), game(-6, 'Змейка', 'arcade', 2)
  ];
  var explore = 0;
  for (var i = 0; i < 60; i++) {
    var d = key(i);
    var way = taste.direction(log, d, OPTIONS);
    assert.deepStrictEqual(way, taste.direction(log, d, OPTIONS), 'один день — одно направление');
    if (way.mode === 'explore') {
      explore++;
      assert.notStrictEqual(way.genre, 'rhythm', 'нелюбимый жанр не исследуется, пока есть другие');
      if (i + 6 <= 30) assert.ok(['rhythm', 'puzzle', 'sort', 'arcade'].indexOf(way.genre) < 0, 'жанр уже был за 30 дней: ' + way.genre);
    } else {
      assert.strictEqual(way.mode, 'exploit');
      assert.ok(way.base.rating >= 4, 'вариация на ' + way.base.title);
      assert.ok(way.avoid.indexOf('rhythm') >= 0);
    }
  }
  assert.ok(explore >= 8 && explore <= 30, 'исследований за 60 дней: ' + explore);
  assert.strictEqual(taste.direction(log, '2026-11-14', { explore: 1, decay: 0.95, dislikedTo: 2.5, newDays: 30 }).mode, 'explore');
  assert.strictEqual(taste.direction(log, '2026-11-14', { explore: 0, decay: 0.95, dislikedTo: 2.5, newDays: 30 }).mode, 'exploit');
});

test('вкус: свежие жанры, недавние игры, отзывы, счётчики, неделя и сводка без модели', function () {
  var log = [
    game(0, 'Сегодня', 'logic'),
    game(-1, 'Отражатель', 'puzzle', 4, { genrePreference: 'like', reasons: ['залип', 'сложно'], voice: 'слишком   быстро', kept: true, costUsd: 0.42, minutes: 31 }),
    game(-3, 'Бит', 'rhythm', 1, { reasons: ['скучно'], genrePreference: 'dislike' }),
    game(-20, 'Старая', 'memory', 3),
    { date: key(-2), made: false, error: 'нет сети' }
  ];
  var fresh = taste.freshGenres(log, NOW, 14);
  assert.ok(fresh.indexOf('puzzle') < 0 && fresh.indexOf('memory') >= 0);
  assert.deepStrictEqual(taste.recent(log, NOW, 14).map(function (e) { return e.title; }), ['Сегодня', 'Отражатель', 'Бит']);
  assert.deepStrictEqual(taste.notes(log, 5), ['«Отражатель» (4): залип, сложно; голосом: «слишком быстро»; жанр puzzle: нравится', '«Бит» (1): скучно; жанр rhythm: не нравится']);
  assert.deepStrictEqual(taste.reasonCounts(log)[0], ['залип', 1]);
  assert.deepStrictEqual(taste.counts(log), { ratings: 3, kept: 1, made: 4 });
  var w = taste.week(log, NOW);
  assert.strictEqual(w.made, 3);
  assert.strictEqual(w.failed, 1);
  assert.strictEqual(w.rated, 2);
  assert.strictEqual(w.average, 2.5);
  assert.deepStrictEqual(w.liked, ['Отражатель']);
  assert.deepStrictEqual(w.disliked, ['Бит']);
  assert.strictEqual(w.cost, 0.42);
  var table = taste.compute(log, NOW, 0.95);
  var text = taste.plainSummary(w, table, { mode: 'explore', genre: 'physics' }, OPTIONS);
  assert.ok(/Понравились: Отражатель/.test(text) && /Не зашли: Бит/.test(text) && /попробую новое: physics/.test(text), text);
  var lines = taste.plainLines(table, OPTIONS);
  assert.ok(lines.length >= 2 && /^Любит: /.test(lines[0]) && lines.some(function (l) { return /^Не любит: жанр rhythm/.test(l); }), lines.join(' | '));
  assert.deepStrictEqual(taste.plainLines({}, OPTIONS), ['Оценок пока мало — вкус ещё не ясен.']);
});

// ---- the move into the catalog ------------------------------------------------------------------------------

test('имя оставленной игры: латиница, до 24 знаков, свободное, не служебное', function () {
  assert.strictEqual(slug.translit('Отражатель лучей'), 'otrazhatel-luchey');
  assert.strictEqual(slug.translit('Щука и ёж: 2!'), 'schuka-i-ezh-2');
  assert.strictEqual(slug.slugFor('Отражатель', '2026-11-14', []), 'otrazhatel');
  assert.strictEqual(slug.slugFor('Отражатель', '2026-11-14', ['otrazhatel']), 'otrazhatel-2');
  assert.strictEqual(slug.slugFor('Отражатель', '2026-11-14', ['otrazhatel', 'otrazhatel-2']), 'otrazhatel-3');
  var long = slug.slugFor('Очень длинное название игры про свет и тьму', '2026-11-14', []);
  assert.ok(long.length <= 24 && slug.validId(long), long);
  assert.strictEqual(slug.slugFor('Engine', '2026-11-14', []), 'day-261114', 'служебное имя');
  assert.strictEqual(slug.slugFor('★★★', '2026-11-14', []), 'day-261114');
  assert.strictEqual(slug.slugFor('★★★', '2026-11-14', ['day-261114']), 'day-261114-2');
  assert.ok(!slug.validId('daily') && !slug.validId('Abc') && slug.validId('a-1'));
  assert.ok(slug.validDate('2026-11-14') && !slug.validDate('2026-1-14') && !slug.validDate('../x'));
  assert.ok(slug.validKey('2026-11-14') && slug.validKey('2026-11-14-2') && !slug.validKey('2026-11-14-1') && !slug.validKey('2026-11-14/..'));
  assert.strictEqual(slug.rewrite('a modules/games/daily/2026-11-14/x b modules/games/daily/2026-11-14-2/y', '2026-11-14', 'one'), 'a modules/games/one/x b modules/games/daily/2026-11-14-2/y', 'другая игра того же дня не задета');
  assert.strictEqual(slug.rewrite('modules/games/daily/2026-11-14-2/y "daily/2026-11-14-2"', '2026-11-14-2', 'two'), 'modules/games/two/y "two"');
});

test('крючок оценки, манифесты, переписывание адресов, дни игры', function () {
  var html = '<!doctype html>\n<body>\n<script src="game.js"></script>\n</body>\n</html>\n';
  var hooked = slug.addHook(html);
  assert.ok(hooked.indexOf(slug.HOOK + '\n</body>') >= 0, hooked);
  assert.strictEqual(slug.addHook(hooked), hooked, 'один раз');
  assert.strictEqual(slug.stripHook(hooked), html);
  assert.ok(/rate\.js/.test(slug.addHook('<div></div>')), 'без </body> — в конец');
  var kept = slug.keptManifest({ id: 'daily/2026-11-14', title: 'Отражатель', status: 'daily', currencies: [] }, 'otrazhatel', '2026-11-14', 5);
  assert.deepStrictEqual(kept, { id: 'otrazhatel', title: 'Отражатель', status: 'trial', currencies: [], origin: { from: 'game-of-the-day', date: '2026-11-14', rating: 5 } });
  var daily = slug.dailyManifest({ id: 'template', title: 'X', status: 'active' }, '2026-11-14');
  assert.strictEqual(daily.id, 'daily/2026-11-14');
  assert.strictEqual(daily.status, 'daily');
  assert.strictEqual(daily.entry, 'ui/index.html');
  assert.strictEqual(slug.rewrite("require('modules/games/daily/2026-11-14/sim.js'); id = 'daily/2026-11-14'; x = \"daily/2026-11-14\"", '2026-11-14', 'otrazhatel'),
    "require('modules/games/otrazhatel/sim.js'); id = 'otrazhatel'; x = \"otrazhatel\"");
  assert.strictEqual(slug.fixEngine("var Big = require('../engine/big.js'); var k = require(\"../../engine/checks-kit.js\"); require('./x.js');"),
    "var Big = require('modules/games/engine/big.js'); var k = require(\"modules/games/engine/checks-kit.js\"); require('./x.js');");
  var base = new Date(2026, 10, 10, 12).getTime();
  var plays = [
    { game: 'otrazhatel', from: base, to: base + 60000 },
    { game: 'otrazhatel', from: base + 3600000, to: base + 3700000 },
    { game: 'otrazhatel', from: base + DAY, to: base + DAY + 1 },
    { game: 'other', from: base + 2 * DAY, to: base + 2 * DAY + 1 },
    { game: 'otrazhatel', from: base - DAY, to: base - DAY + 1 }
  ];
  assert.deepStrictEqual(slug.playDays(plays, ['otrazhatel'], base - 1), ['2026-11-10', '2026-11-11']);
});

// ---- texts ------------------------------------------------------------------------------------------------------

test('ответ агента: JSON в блоке или в конце, метки в одном месте, честный отказ', function () {
  var text = 'Готово, проверки прошли.\n```json\n{"title": "Отражатель", "pitch": "Ловите лучи зеркалом", "genre": "Puzzle", "controls": "drag", "session": "2m", "tags": {"visual": "geometry", "difficulty": "medium", "theme": "light"}}\n```';
  var r = prompts.parseResult(text);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.title, 'Отражатель');
  assert.deepStrictEqual(r.tags, { genre: 'puzzle', controls: 'drag', session: '2m', visual: 'geometry', difficulty: 'medium', theme: 'light' });
  var tail = prompts.parseResult('Сделал {вот так}. Итог: {"title": "Шары", "genre": "sort"}');
  assert.strictEqual(tail.title, 'Шары');
  var said = prompts.parseResult('{"error": "не прошла проверку на внешнем экране"}');
  assert.deepStrictEqual(said, { ok: false, said: true, error: 'не прошла проверку на внешнем экране' });
  assert.strictEqual(prompts.parseResult('не вышло').said, undefined);
  assert.strictEqual(prompts.parseResult('{"pitch": "без названия"}').ok, false);
});

test('задание агенту: дата, папка, срок, вкус, история, направление, правила и крючок', function () {
  var template = fs.readFileSync(path.join(ROOT, 'prompts', 'task.md'), 'utf8');
  var log = [
    game(-1, 'Отражатель', 'puzzle', 5, { reasons: ['залип'], genrePreference: 'like' }),
    game(-2, 'Бит', 'rhythm', 1, { genrePreference: 'dislike' }),
    game(-3, 'Бит 2', 'rhythm', 1, { genrePreference: 'dislike' })
  ];
  var input = {
    date: '2026-11-14', guide: false, minutes: 40, table: taste.compute(log, NOW, 0.95), summary: ['Любит свет'],
    notes: taste.notes(log, 8), recent: taste.recent(log, NOW, 14), noRepeatDays: 14, newDays: 30,
    way: { mode: 'exploit', base: { title: 'Отражатель', pitch: 'лучи', rating: 5 }, avoid: ['rhythm'] },
    occasion: 'new-year', hook: slug.HOOK, likedFrom: 4, dislikedTo: 2.5
  };
  var text = prompts.taskPrompt(template, input);
  [
    'Сделай игру дня на 2026-11-14', 'modules/games/engine/template/', 'Папка: modules/games/daily/2026-11-14/', 'Срок — 40 минут',
    'любит ', 'Не любит жанр rhythm', 'Сводка вкуса за прошлые недели: Любит свет', '«Отражатель» (5): залип', 'Последние 14 дней были: «Отражатель»',
    'вариация на «Отражатель»', 'Не делай жанры: rhythm', 'Сегодня повод: new-year', 'шириной 344 точки', 'data/games/vendor/',
    'modules/games/engine/sfx.js', '"status": "daily"', slug.HOOK, 'при 344 и 690', 'не дольше 20 мс', 'readPixels', '{"error"'
  ].forEach(function (part) { assert.ok(text.indexOf(part) >= 0, 'нет «' + part + '» в задании:\n' + text); });
  assert.ok(!/\{\{/.test(text), 'не подставлено');
  input.guide = true;
  input.way = { mode: 'explore', genre: 'physics', avoid: ['rhythm'] };
  var guided = prompts.taskPrompt(template, input);
  assert.ok(guided.indexOf('по modules/games/AGENT.md') >= 0 && guided.indexOf('engine/template') < 0);
  assert.ok(/исследование \(новое направление: жанр «physics», которого не было за 30 дней\)/.test(guided));
  assert.ok(guided.indexOf('Не делай жанры') < 0, 'в день исследования запрета нет');
  input.way = { mode: 'free', avoid: [] };
  input.table = {};
  assert.ok(/оценок пока мало/.test(prompts.taskPrompt(template, input)));
});

test('тексты: «сдавай», сводка недели, уведомления, длина сессии словами', function () {
  assert.ok(/Срок работы вышел.*за 5 мин дай ответ JSON/.test(prompts.steerText('time', 5)));
  assert.ok(/Расход на эту игру дошёл до предела/.test(prompts.steerText('cost', 5)));
  var parsed = prompts.parseTaste('```json\n{"owner": "Понравились головоломки со светом.", "taste": ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]}\n```');
  assert.strictEqual(parsed.taste.length, 8);
  assert.strictEqual(parsed.owner, 'Понравились головоломки со светом.');
  assert.throws(function () { prompts.parseTaste('{"owner": "x", "taste": []}'); });
  var template = fs.readFileSync(path.join(ROOT, 'prompts', 'taste.md'), 'utf8');
  var log = [game(-1, 'Отражатель', 'puzzle', 5, { reasons: ['залип'], genrePreference: 'like' })];
  var weekText = prompts.tastePrompt(template, {
    week: taste.week(log, NOW), table: taste.compute(log, NOW, 0.95), notes: taste.notes(log), reasons: taste.reasonCounts(log),
    previous: [], tomorrow: { mode: 'explore', genre: 'physics' }, newDays: 30
  });
  assert.ok(/понравились: Отражатель/.test(weekText) && /залип ×1/.test(weekText) && /physics/.test(weekText) && !/\{\{/.test(weekText), weekText);
  assert.strictEqual(prompts.readyText({ title: 'Отражатель', pitch: 'ловите лучи зеркалом.', tags: { session: '2m' } }), 'Игра дня: «Отражатель» — ловите лучи зеркалом, 2 минуты');
  assert.strictEqual(prompts.readyText({ title: 'Шары', tags: {} }), 'Игра дня: «Шары»');
  assert.strictEqual(prompts.failText('не прошла проверку на внешнем экране.'), 'Сегодня игра не собралась: не прошла проверку на внешнем экране. Завтра попробую снова');
  assert.strictEqual(prompts.failText('нет сети', 'сегодня в 19:00'), 'Сегодня игра не собралась: нет сети. Следующая — сегодня в 19:00');
  assert.strictEqual(prompts.failText('нет сети', ''), 'Сегодня игра не собралась: нет сети');
  assert.strictEqual(prompts.promoteText('Отражатель'), '«Отражатель» прижился. Добавить престиж и связки с поездкой?');
  assert.deepStrictEqual(['1m', '2m', '5m', '21m', '30s', '12m', 'x'].map(prompts.sessionWords),
    ['1 минута', '2 минуты', '5 минут', '21 минута', '30 секунд', '12 минут', '']);
});

test('низкая оценка реализации не понижает жанр; старые оценки не становятся предпочтениями', function () {
  var legacy = [game(-2, 'Старый бит', 'rhythm', 1), game(-1, 'Ещё бит', 'rhythm', 1)];
  assert.strictEqual(taste.compute(legacy, NOW, .95).genre, undefined);
  assert.deepStrictEqual(taste.direction(legacy, key(0), OPTIONS).avoid, []);
  var log = legacy.concat([game(0, 'Ритм', 'rhythm', 1, {
    genrePreference: 'like', reasons: ['неточность ритма'], comment: 'Люблю ритм-игры, но здесь ноты расходятся со звуком'
  })]);
  assert.deepStrictEqual(taste.compute(log, NOW, .95).genre.rhythm, { score: 5, n: 1 });
  assert.deepStrictEqual(taste.direction(log, key(0), OPTIONS).avoid, []);
  assert.ok(taste.notes(log, 5)[0].indexOf('но здесь ноты расходятся со звуком') >= 0);
  assert.ok(taste.notes(log, 5)[0].indexOf('жанр rhythm: нравится') >= 0);
  log[2].genrePreference = 'unknown';
  assert.strictEqual(taste.compute(log, NOW, .95).genre, undefined);
  log[2].genrePreference = 'neutral';
  assert.strictEqual(taste.compute(log, NOW, .95).genre.rhythm.score, 3);
});

console.log('parts: прошло ' + passed + ', не прошло ' + failed);
if (failed) process.exit(1);
