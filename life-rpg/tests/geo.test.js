// node tests/geo.test.js — geohash cells of the map and the chronicle's lines.
var assert = require('assert');
var geo = require('../geo.js');
var chronicle = require('../chronicle.js');

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

test('known geohashes', function () {
  assert.strictEqual(geo.encode(57.64911, 10.40744, 11), 'u4pruydqqvj');
  assert.strictEqual(geo.encode(55.7558, 37.6173, 7).slice(0, 5), 'ucfv0');
});

test('decode is the box around the point, about 150 m at precision 7', function () {
  var hash = geo.encode(55.7558, 37.6173, 7);
  var box = geo.decode(hash);
  assert.ok(box.south <= 55.7558 && box.north >= 55.7558);
  assert.ok(box.west <= 37.6173 && box.east >= 37.6173);
  var width = geo.distance(box.lat, box.west, box.lat, box.east);
  var height = geo.distance(box.south, box.lon, box.north, box.lon);
  assert.ok(width > 0.07 && width < 0.16, 'width ' + width);
  assert.ok(height > 0.12 && height < 0.17, 'height ' + height);
  assert.strictEqual(geo.encode(box.lat, box.lon, 7), hash);
});

test('distance and bounds', function () {
  assert.ok(Math.abs(geo.distance(55.7558, 37.6173, 59.9343, 30.3351) - 634) < 5);
  var b = geo.bounds([geo.encode(55.75, 37.61, 7), geo.encode(55.76, 37.63, 7)]);
  assert.ok(b.south < 55.75 && b.north > 55.76 && b.west < 37.61 && b.east > 37.63);
});

test('chronicle lines: templates, no reproach, at most three', function () {
  var lines = chronicle.dayLines({ day: 214, hero: 'Странник', level: 15, places: ['Северный сквер'], achievements: ['Неделя'], steps: 11000, xp: 300, topSkill: 'endurance' });
  assert.strictEqual(lines[0], 'День 214. Странник открыл Северный сквер и прошёл 11 000 шагов.');
  assert.strictEqual(lines.length, 3);
  assert.ok(lines.every(function (l) { return chronicle.clean(l); }));
  var quiet = chronicle.dayLines({ day: 3, hero: 'Мох', places: [], achievements: [], steps: 4000, xp: 60, topSkill: 'regime' });
  assert.deepStrictEqual(quiet, ['День 3. Мох выспался и встретил утро бодрым — +60 опыта.']);
  assert.deepStrictEqual(chronicle.dayLines({ day: 4, hero: 'Мох', places: [], achievements: [], steps: 0, xp: 0 }), []);
  assert.ok(chronicle.dayLines({ day: 5, hero: 'Мох', paused: 'sick', places: [], achievements: [], steps: 0, xp: 0 })[0].indexOf('пледом') > 0);
});

test('the word filter and the numbers check of the model\'s text', function () {
  assert.strictEqual(chronicle.clean('Ты опять не спал'), false);
  assert.strictEqual(chronicle.clean('Странник шагал'), true);
  var lines = ['День 10. Странник прошёл 11 000 шагов.', 'День 11. Странник достиг 5-го уровня.'];
  assert.strictEqual(chronicle.sameNumbers('За два дня, 10-й и 11-й, герой прошёл 11000 шагов и достиг 5 уровня.', lines), true);
  assert.strictEqual(chronicle.sameNumbers('Герой прошёл 12 000 шагов.', lines), false);
  var prompt = chronicle.weekPrompt(lines, 'Странник');
  assert.ok(prompt.system.indexOf('Странник') > 0 && prompt.prompt.indexOf('11 000') > 0);
  assert.strictEqual(chronicle.week('2026-11-15'), '2026-11-09');
});

console.log('geo + chronicle: ' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
