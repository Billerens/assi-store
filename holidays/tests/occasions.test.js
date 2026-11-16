// node tests/occasions.test.js — the built-in calendar (occasions.json) is whole and sane.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var calendar = require('../calendar.js');
var decor = require('../decor.js');
var settings = require('../settings.js');
var occasions = require('../occasions.json');
var t = require('./harness.js');

var ICONS = ['spark', 'star', 'heart', 'calendar', 'flag', 'moon', 'book', 'bell', 'clock', 'home', 'user'];
var decorDir = path.join(__dirname, '..', 'decor');

t.test('у каждого повода свой id, название и верное правило', function () {
  var seen = {};
  occasions.forEach(function (occasion) {
    assert.ok(/^[a-z][a-z-]*$/.test(occasion.id), occasion.id);
    assert.ok(!seen[occasion.id], 'повтор ' + occasion.id);
    seen[occasion.id] = true;
    assert.ok(occasion.title, occasion.id + ': нет названия');
    assert.ok(calendar.validRule(occasion.rule), occasion.id + ': правило ' + JSON.stringify(occasion.rule));
    assert.ok(typeof occasion.priority === 'number', occasion.id + ': нет приоритета');
    assert.ok(occasion.about, occasion.id + ': нет описания для экрана');
  });
});

t.test('все поводы из таблицы описания на месте', function () {
  ['new-year', 'christmas', 'maslenitsa', 'womens-day', 'defender-day', 'april-fools', 'cosmonautics', 'easter',
    'victory-day', 'knowledge-day', 'halloween', 'first-snow', 'birthday-owner', 'birthday-contact', 'assi-anniversary'].forEach(function (id) {
    assert.ok(occasions.some(function (occasion) { return occasion.id === id; }), id);
  });
});

t.test('выключенные по умолчанию — существующие поводы; 23.02 и 8.03 среди них', function () {
  settings.OFF_BY_DEFAULT.forEach(function (id) {
    assert.ok(occasions.some(function (occasion) { return occasion.id === id; }), id);
  });
  assert.ok(settings.OFF_BY_DEFAULT.indexOf('defender-day') >= 0);
  assert.ok(settings.OFF_BY_DEFAULT.indexOf('womens-day') >= 0);
});

t.test('декор и пасхалки: есть файл или рисуются кодом', function () {
  occasions.forEach(function (occasion) {
    [].concat(occasion.decor || []).concat(occasion.egg || []).forEach(function (name) {
      if (name === 'joke') return;
      var known = decor.DECORS[name];
      assert.ok(known, occasion.id + ': неизвестный декор ' + name);
      if (!known.generated) assert.ok(fs.existsSync(path.join(decorDir, name + '.css')), occasion.id + ': нет decor/' + name + '.css');
    });
  });
});

t.test('акценты — #RRGGBB, иконки из набора кита', function () {
  occasions.forEach(function (occasion) {
    if (occasion.accent !== undefined) assert.ok(decor.isHex(occasion.accent), occasion.id + ': ' + occasion.accent);
    if (occasion.icon !== undefined) assert.ok(ICONS.indexOf(occasion.icon) >= 0, occasion.id + ': иконка ' + occasion.icon);
  });
});

t.test('фразы для обоев — латиницей, без знаков (их читает поиск картинок)', function () {
  occasions.forEach(function (occasion) {
    if (occasion.wallpaper === undefined) return;
    assert.ok(/^[a-z ]+$/.test(occasion.wallpaper), occasion.id + ': ' + occasion.wallpaper);
  });
});

t.test('9 мая — торжественно: без декора и пасхалок', function () {
  var victory = occasions.filter(function (occasion) { return occasion.id === 'victory-day'; })[0];
  assert.strictEqual(victory.solemn, true);
  assert.ok(!victory.decor && !victory.egg);
});

t.test('день рождения владельца — самый важный повод', function () {
  var owner = occasions.filter(function (occasion) { return occasion.id === 'birthday-owner'; })[0];
  occasions.forEach(function (occasion) {
    if (occasion !== owner) assert.ok(occasion.priority < owner.priority, occasion.id);
  });
});

t.test('окна поводов не длиннее месяца, пасхалка — внутри окна', function () {
  occasions.forEach(function (occasion) {
    var from = occasion.from || 0;
    var to = occasion.to || 0;
    assert.ok(from <= 0 && to >= 0 && to - from <= 31, occasion.id);
    if (occasion.eggFrom !== undefined) assert.ok(occasion.eggFrom >= from && occasion.eggTo <= to, occasion.id + ': пасхалка вне окна');
  });
});

t.test('даты 2026 и 2027 совпадают с календарём', function () {
  var expect = {
    'new-year': ['2026-12-31', '2027-12-31'],
    christmas: ['2026-01-07', '2027-01-07'],
    maslenitsa: ['2026-02-16', '2027-03-08'],
    cosmonautics: ['2026-04-12', '2027-04-12'],
    easter: ['2026-04-12', '2027-05-02'],
    'victory-day': ['2026-05-09', '2027-05-09'],
    'mothers-day': ['2026-11-29', '2027-11-28']
  };
  Object.keys(expect).forEach(function (id) {
    var occasion = occasions.filter(function (item) { return item.id === id; })[0];
    assert.deepStrictEqual([calendar.anchors(occasion, 2026, {})[0], calendar.anchors(occasion, 2027, {})[0]], expect[id], id);
  });
});

t.done('occasions');
