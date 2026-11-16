// Pure logic of the story engine: node tests/engine.test.js
var assert = require('assert');
var path = require('path');
var dir = path.join(__dirname, '..', 'story-engine');
var words = require(path.join(dir, 'words.js'));
var parse = require(path.join(dir, 'parse.js'));
var quest = require(path.join(dir, 'quest.js'));
var chapter = require(path.join(dir, 'chapter.js'));
var branch = require(path.join(dir, 'branch.js'));
var lines = require(path.join(dir, 'lines.js'));
var settings = require(path.join(dir, 'settings.js'));
var wav = require(path.join(dir, 'wav.js'));
var demo = require(path.join(__dirname, '..', 'content', 'demo.json'));

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

test('числа словами', function () {
  assert.strictEqual(words.numberWords(0), 'ноль');
  assert.strictEqual(words.numberWords(34), 'тридцать четыре');
  assert.strictEqual(words.numberWords(112), 'сто двенадцать');
  assert.strictEqual(words.numberWords(2001), 'две тысячи один');
  assert.strictEqual(words.numberWords(21000), 'двадцать одна тысяча');
  assert.strictEqual(words.numberWords(15), 'пятнадцать');
});

test('нормализация', function () {
  assert.strictEqual(words.normalize('  Возьми ЁЖИКА, пожалуйста!  '), 'возьми ежика пожалуйста');
  assert.strictEqual(words.normalize('иди 2 раза'), 'иди два раза');
  assert.strictEqual(words.normalize('северо-запад'), 'северо-запад');
  assert.strictEqual(words.normalize(null), '');
});

test('левенштейн и похожесть', function () {
  assert.strictEqual(words.levenshtein('ламбу', 'лампу'), 1);
  assert.strictEqual(words.levenshtein('кот', 'кит'), 1);
  assert.ok(words.levenshtein('абвгдеж', 'жедгвба', 2) > 2);
  assert.ok(words.similar('ламбу', 'лампу'));
  assert.ok(words.similar('фонарем', 'фонарём'));
  assert.ok(!words.similar('нож', 'ножа'));
  assert.ok(!words.similar('сеть', 'цепь'));
});

test('предложения и обрезка', function () {
  assert.deepStrictEqual(words.sentences('Раз. Два! Три?'), ['Раз.', 'Два!', 'Три?']);
  assert.strictEqual(words.clip('Короткий текст.', 100), 'Короткий текст.');
  assert.ok(words.clip('Первое предложение длинное. Второе предложение тоже длинное.', 40).length <= 41);
  assert.strictEqual(words.joinAnd(['лампа', 'ключ', 'карта']), 'лампа, ключ и карта');
  assert.strictEqual(words.plural(5, 'глава', 'главы', 'глав'), 'глав');
  assert.strictEqual(words.plural(22, 'глава', 'главы', 'глав'), 'главы');
});

test('служебные слова', function () {
  assert.strictEqual(parse.service('повтори'), 'repeat');
  assert.strictEqual(parse.service('Повтори, пожалуйста'), 'repeat');
  assert.strictEqual(parse.service('где я'), 'where');
  assert.strictEqual(parse.service('что у меня'), 'inventory');
  assert.strictEqual(parse.service('подсказка'), 'hint');
  assert.strictEqual(parse.service('сохрани'), 'save');
  assert.strictEqual(parse.service('пауза'), 'pause');
  assert.strictEqual(parse.service('хватит'), 'stop');
  assert.strictEqual(parse.service('возьми лампу'), null);
});

function worldAt(room, extra) {
  var c = chapter.tidy(demo.chapter);
  var s = quest.create(c, { plot: 'demo' });
  s.room = room;
  if (extra) extra(s);
  return { c: c, s: s, w: quest.world(c, s) };
}

test('двадцать типичных фраз: разбор понимает не меньше 18', function () {
  var at = worldAt('boathouse', function (s) { s.inventory = ['key', 'oil']; });
  var hall = worldAt('hall', function (s) { s.inventory = ['oil', 'lantern']; });
  var cases = [
    ['возьми лампу', at, null],
    ['возьми фонарь', at, { verb: 'take', object: 'lantern' }],
    ['подбери ножик', at, { verb: 'take', object: 'knife' }],
    ['возьми фонарик и нож', at, { verb: 'take', object: 'lantern' }],
    ['иди на запад', at, { verb: 'go', dir: 'запад' }],
    ['запад', at, { verb: 'go', dir: 'запад' }],
    ['осмотри сеть', at, { verb: 'look', object: 'net' }],
    ['разрежь сеть ножом', at, { verb: 'use', puzzle: 'net' }],
    ['осмотрись', at, { verb: 'look' }],
    ['что тут', at, { verb: 'look' }],
    ['возьми ламбу', worldAt('hall', null), null],
    ['возьми спичкы', worldAt('hall', null), { verb: 'take', object: 'matches' }],
    ['иди наверх', hall, { verb: 'go', dir: 'вверх' }],
    ['спустись вниз', hall, { verb: 'go', dir: 'вниз' }],
    ['смажь замок маслом', hall, { verb: 'use', puzzle: 'chain' }],
    ['открой дверь ключом', worldAt('porch', function (s) { s.inventory = ['key']; }), { verb: 'open', object: 'door', with: 'key' }],
    ['отопри дверь', worldAt('porch', function (s) { s.inventory = ['key']; }), { verb: 'open', object: 'door' }],
    ['зайди внутрь', worldAt('porch', null), { verb: 'go', dir: 'внутрь' }],
    ['положи маслёнку', hall, { verb: 'drop', object: 'oil' }],
    ['осмотри маслёнку', hall, { verb: 'look', object: 'oil' }],
    ['зажги лампу спичками', worldAt('lamproom', function (s) { s.inventory = ['matches']; }), { verb: 'use', puzzle: 'lamp' }],
    ['посмотри на цепь', hall, { verb: 'look', object: 'chain' }]
  ];
  var understood = 0;
  var misses = [];
  cases.forEach(function (row) {
    var got = parse.parse(row[0], row[1].w);
    if (!row[2]) {
      if (got.verb) understood++;
      return;
    }
    var ok = Object.keys(row[2]).every(function (key) { return got[key] === row[2][key]; });
    if (ok) understood++;
    else misses.push(row[0] + ' -> ' + JSON.stringify(got));
  });
  assert.ok(understood >= cases.length - 2, 'понято ' + understood + ' из ' + cases.length + ': ' + misses.join('; '));
  assert.strictEqual(misses.length, 0, misses.join('; '));
});

test('опечатка распознавания в предмете', function () {
  var at = worldAt('hall', function (s) { s.inventory = ['lantern']; });
  var got = parse.parse('возьми спичьки', at.w);
  assert.strictEqual(got.verb, 'take');
  assert.strictEqual(got.object, 'matches');
});

test('непонятное — unknown, пустое — empty', function () {
  var at = worldAt('shore', null);
  assert.ok(parse.parse('какая сегодня погода в городе', at.w).unknown);
  assert.ok(parse.parse('   ', at.w).empty);
  assert.ok(/Можно/.test(parse.helpLine(at.w)));
});

test('глава из коробки проходит проверку', function () {
  var errors = chapter.validate(demo.chapter, { maxTextChars: 400, roomsMin: 6, roomsMax: 10, itemsMin: 4, itemsMax: 8, puzzlesMin: 2, puzzlesMax: 3 });
  assert.deepStrictEqual(errors, []);
});

test('проверка ловит недостижимую комнату, ключ за замком, подсказки и длину', function () {
  var broken = JSON.parse(JSON.stringify(demo.chapter));
  broken.rooms.island = { name: 'Остров', text: 'Остров без дороги.', exits: {}, items: [] };
  var errors = chapter.validate(broken, {});
  assert.ok(errors.some(function (e) { return /island.*недостижима/.test(e); }), errors.join('\n'));

  var keyBehind = JSON.parse(JSON.stringify(demo.chapter));
  keyBehind.puzzles[0].room = 'hall';
  errors = chapter.validate(keyBehind, {});
  assert.ok(errors.some(function (e) { return /ключ «key»/.test(e); }), errors.join('\n'));

  var hints = JSON.parse(JSON.stringify(demo.chapter));
  hints.puzzles[1].hints = ['одна'];
  errors = chapter.validate(hints, {});
  assert.ok(errors.some(function (e) { return /подсказок 1/.test(e); }), errors.join('\n'));

  var long = JSON.parse(JSON.stringify(demo.chapter));
  long.rooms.shore.text = new Array(60).join('Очень длинно. ');
  errors = chapter.validate(long, { maxTextChars: 400 });
  assert.ok(errors.some(function (e) { return /длиннее 400/.test(e); }), errors.join('\n'));

  var dark = JSON.parse(JSON.stringify(demo.chapter));
  dark.items.lantern.light = false;
  errors = chapter.validate(dark, {});
  assert.ok(errors.some(function (e) { return /не светит/.test(e); }), errors.join('\n'));
});

test('проход главы из коробки до конца', function () {
  var c = chapter.tidy(demo.chapter);
  var s = quest.create(c, { plot: 'demo' });
  var events = [];
  function say(text) {
    var out = quest.act(c, s, parse.parse(text, quest.world(c, s)));
    s = out.state;
    events = events.concat(out.events);
    return out.text;
  }
  assert.ok(/Заперто|заперта/.test(say('иди на север') && say('зайди внутрь')));
  say('иди на юг');
  say('иди на восток');
  assert.ok(/фонарь/.test(say('возьми фонарь')));
  say('возьми нож');
  assert.ok(/ключ/.test(say('разрежь сеть ножом')));
  assert.ok(s.inventory.indexOf('key') >= 0);
  say('иди на запад');
  say('иди на север');
  assert.ok(/свободен/.test(say('открой дверь ключом')));
  assert.ok(/Нижний зал/.test(say('зайди внутрь')));
  assert.ok(/шкаф/i.test(say('иди наверх')));
  say('возьми спички');
  say('спустись вниз');
  assert.strictEqual(s.room, 'cellar');
  say('возьми маслёнку');
  say('поднимись наверх');
  assert.ok(/цепь соскальзывает/.test(say('смажь замок маслом')));
  assert.ok(/отодвинут/.test(quest.describe(c, s, true)));
  say('иди наверх');
  assert.strictEqual(s.room, 'lamproom');
  var last = say('зажги лампу спичками');
  assert.ok(/Маяк снова светит/.test(last), last);
  assert.ok(events.indexOf('chapter-done') >= 0);
  assert.ok(s.done);
  assert.strictEqual(quest.progress(c, s), 1);
});

test('тёмный погреб без фонаря закрыт', function () {
  var c = chapter.tidy(demo.chapter);
  var s = quest.create(c, {});
  s.room = 'hall';
  var out = quest.act(c, s, { verb: 'go', dir: 'вниз' });
  assert.ok(/тьма/.test(out.text));
  assert.strictEqual(out.state.room, 'hall');
});

test('подсказки по порядку и их счёт', function () {
  var c = chapter.tidy(demo.chapter);
  var s = quest.create(c, {});
  s.visited.push('boathouse');
  var first = quest.hint(c, s);
  assert.strictEqual(first.text, c.puzzles[0].hints[0]);
  var second = quest.hint(c, first.state);
  assert.strictEqual(second.text, c.puzzles[0].hints[1]);
  var third = quest.hint(c, second.state);
  var fourth = quest.hint(c, third.state);
  assert.strictEqual(fourth.text, c.puzzles[0].hints[2]);
  assert.strictEqual(fourth.state.hintsUsed.net, 3);
  assert.strictEqual(fourth.state.hints, 4);
  assert.strictEqual(s.hints, 0, 'исходное состояние не меняется');
});

test('инвентарь, «где я», пересказ', function () {
  var c = chapter.tidy(demo.chapter);
  var s = quest.create(c, {});
  assert.strictEqual(quest.inventoryText(c, s), 'Руки пусты.');
  s.room = 'boathouse';
  s = quest.act(c, s, { verb: 'take', object: 'lantern' }).state;
  assert.ok(/фонарь/.test(quest.inventoryText(c, s)));
  assert.ok(/Лодочный сарай/.test(quest.whereText(c, s)));
  assert.ok(/на запад/.test(quest.whereText(c, s)));
  var recap = quest.recap(c, s);
  assert.ok(/В прошлый раз/.test(recap) && /взяли фонарь/.test(recap), recap);
});

test('нельзя взять закреплённое, нельзя взять дважды', function () {
  var c = chapter.tidy(demo.chapter);
  var s = quest.create(c, {});
  s.room = 'boathouse';
  assert.ok(/зацепилась/.test(quest.act(c, s, { verb: 'take', object: 'net' }).text));
  s = quest.act(c, s, { verb: 'take', object: 'knife' }).state;
  assert.ok(/уже у вас/.test(quest.act(c, s, { verb: 'take', object: 'knife' }).text));
  var dropped = quest.act(c, s, { verb: 'drop', object: 'knife' });
  assert.ok(/положили нож/.test(dropped.text));
  assert.ok(dropped.state.placed.boathouse.indexOf('knife') >= 0);
});

test('тексты для записи заранее', function () {
  var list = chapter.texts(demo.chapter);
  assert.ok(list.some(function (entry) { return entry.node === 'room-shore'; }));
  assert.ok(list.every(function (entry) { return entry.text; }));
});

test('выбор ветки голосом', function () {
  var options = [{ id: 'a1', label: 'медный ключ', keywords: ['медный', 'медь'] }, { id: 'a2', label: 'стальной ключ', keywords: ['стальной', 'сталь'] }];
  assert.strictEqual(branch.choose('медный', options), 0);
  assert.strictEqual(branch.choose('Возьму стальной', options), 1);
  assert.strictEqual(branch.choose('первый', options), 0);
  assert.strictEqual(branch.choose('давай второй', options), 1);
  assert.strictEqual(branch.choose('не медный', options), 1);
  assert.strictEqual(branch.choose('медный или стальной', options), -1);
  assert.strictEqual(branch.choose('не знаю', options), -1);
  assert.strictEqual(branch.choose('медного', options), 0);
  assert.strictEqual(branch.yesNo('да'), 'yes');
  assert.strictEqual(branch.yesNo('давай продолжим'), 'yes');
  assert.strictEqual(branch.yesNo('нет, начнём новую'), 'no');
  assert.strictEqual(branch.yesNo('не надо'), 'no');
  assert.strictEqual(branch.yesNo('какая погода'), null);
});

test('части реплики с записанным звуком', function () {
  var parts = lines.segments('Вы взяли лампу. Тяжёлая и тёплая.', [{ text: 'Тяжёлая и тёплая.', audio: 'a.wav' }]);
  assert.deepStrictEqual(parts, [{ text: 'Вы взяли лампу.' }, { text: 'Тяжёлая и тёплая.', audio: 'a.wav' }]);
  assert.deepStrictEqual(lines.segments('Ничего.', []), [{ text: 'Ничего.' }]);
  var plan = lines.fadePlan(['s1', 's2', 's3', 'final'], 2, 0.4);
  assert.deepStrictEqual(Object.keys(plan), ['s3', 'final']);
  assert.strictEqual(plan.s3.from, 1);
  assert.strictEqual(plan.final.to, 0.4);
  assert.strictEqual(plan.s3.to, plan.final.from);
  assert.strictEqual(lines.volumeAt({ from: 1, to: 0.4 }, 50, 100), 0.7);
});

test('настройки: значения, пределы, время', function () {
  var schema = {
    listenSec: { value: 12, min: 3, max: 60 },
    on: { value: false },
    at: { value: '20:00', type: 'time' },
    mode: { value: 'auto', options: ['auto', 'local'] },
    people: { value: [] }
  };
  var v = settings.values(schema, { listenSec: 99, on: 'true', at: '7:05', mode: 'cloud', people: [{ name: 'Петя' }] });
  assert.deepStrictEqual(v, { listenSec: 60, on: true, at: '07:05', mode: 'auto', people: [{ name: 'Петя' }] });
  assert.deepStrictEqual(settings.changes(schema, { listenSec: '12', on: true }), { on: true });
  assert.strictEqual(settings.minutesOf('22:30'), 1350);
  assert.strictEqual(settings.validTime('25:00'), null);
  assert.strictEqual(settings.describe(schema, {})[0].key, 'listenSec');
});

test('заголовок wav', function () {
  var head = wav.header(48000, 24000, 1, 16);
  assert.strictEqual(head.length, 44);
  assert.ok(wav.isWav(head));
  assert.strictEqual(head[40] + head[41] * 256 + head[42] * 65536, 48000);
  assert.strictEqual(wav.seconds(48000, 24000), 1);
  assert.strictEqual(wav.extension('audio/pcm; rate=24000'), 'wav');
  assert.strictEqual(wav.extension('audio/mpeg'), 'mp3');
  assert.strictEqual(wav.rateOf('audio/L16; rate=16000'), 16000);
  assert.ok(wav.isRaw(''));
});

console.log('engine: прошло ' + passed + ', не прошло ' + failed);
if (failed) process.exit(1);
