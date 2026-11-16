// Checks of the holidays module on the phone (module_check holidays). The date checks are pure; the
// look checks put the New Year on for a made-up day and take it off again, and then give back the
// settings, the state and today's look exactly as they were. Nothing is sent, the model is not called.
var files = require('lib/assi').files;
var DIR = 'modules/holidays';
var SCREEN = DIR + '/ui/index.html';
var SETTINGS = 'data/holidays/settings.json';
var STATE = 'data/holidays/state.json';
var DECOR_FILE = 'themes/_decor.css';

function calendar() {
  return require(DIR + '/calendar.js');
}

function holidays() {
  return require(DIR + '/main.js');
}

function occasion(id) {
  return files.readJson(DIR + '/occasions.json', []).filter(function (item) { return item.id === id; })[0];
}

function readText(path) {
  return files.exists(path) ? files.read(path) : null;
}

function putText(path, text) {
  if (text === null) {
    if (files.exists(path)) files.remove(path);
  } else {
    files.write(path, text);
  }
}

function activeTheme() {
  var list = native('theme.list') || [];
  var active = list.filter(function (theme) { return theme.active; })[0];
  return { id: active ? String(active.id) : '', list: list };
}

function hasDecorLayer() {
  try {
    return (native('shell.features') || []).indexOf('theme.decor') >= 0;
  } catch (error) {
    return false;
  }
}

/**
 * Runs fn with the module's settings set for a plain test (full look, New Year on) and its state
 * free of the owner's switch-offs; afterwards everything is as it was, today's look included.
 */
function withCleanDay(fn) {
  var settingsBefore = readText(SETTINGS);
  var stateBefore = readText(STATE);
  var layerBefore = readText(DECOR_FILE);
  var themeBefore = activeTheme().id;
  try {
    var values = settingsBefore ? JSON.parse(settingsBefore) : {};
    values.strength = 'full';
    values.powerSave = 'full';
    values.off = (values.off || []).filter(function (id) { return id !== 'new-year'; });
    files.write(SETTINGS, JSON.stringify(values));
    var state = stateBefore ? JSON.parse(stateBefore) : {};
    state.offKey = null;
    state.ownerChoseKey = null;
    state.ownerChose = false;
    state.preview = null;
    files.write(STATE, JSON.stringify(state));
    fn(themeBefore);
  } finally {
    putText(SETTINGS, settingsBefore);
    var restored = stateBefore ? JSON.parse(stateBefore) : null;
    if (restored && restored.mode === 'theme') {
      // The holiday theme was taken off by the check: the state must not read that as the owner's choice.
      restored.mode = null;
      restored.key = null;
      restored.themeSig = null;
    }
    putText(STATE, restored ? JSON.stringify(restored) : null);
    holidays().check(null, { silent: true });
    // A layer that was not this module's (another module's, the agent's) is put back as it was.
    if (layerBefore && layerBefore.indexOf('/* holidays') !== 0 && readText(DECOR_FILE) !== layerBefore) native('theme.decor', layerBefore);
  }
}

exports['Пасха: 2025 — 20.04, 2026 — 12.04, 2027 — 02.05, 2028 — 16.04'] = function (t) {
  t.equal(calendar().easter(2025), '2025-04-20');
  t.equal(calendar().easter(2026), '2026-04-12');
  t.equal(calendar().easter(2027), '2027-05-02');
  t.equal(calendar().easter(2028), '2028-04-16');
};

exports['Масленица 2026 — 16–22 февраля'] = function (t) {
  var maslenitsa = occasion('maslenitsa');
  var anchor = calendar().anchors(maslenitsa, 2026, {})[0];
  var span = calendar().windowOf(maslenitsa, anchor, {});
  t.equal([span.start, span.end], ['2026-02-16', '2026-02-22']);
};

exports['окно Нового года: 20.12 и 08.01 внутри, 09.01 — нет'] = function (t) {
  var list = files.readJson(DIR + '/occasions.json', []);
  var has = function (day) {
    return calendar().activeOn(list, day, {}).some(function (item) { return item.id === 'new-year'; });
  };
  t.ok(has('2026-12-20'), '20.12');
  t.ok(has('2027-01-08'), '08.01');
  t.ok(!has('2027-01-09'), '09.01');
};

exports['даты рождения из контактов: с годом, без года, iOS-1604'] = function (t) {
  var birthdays = require(DIR + '/birthdays.js');
  t.equal(birthdays.parse('1996-11-15'), { year: 1996, month: 11, day: 15 });
  t.equal(birthdays.parse('--11-15'), { year: null, month: 11, day: 15 });
  t.equal(birthdays.parse('1604-11-15'), { year: null, month: 11, day: 15 });
  t.equal(birthdays.parse('15.11.1996'), { year: 1996, month: 11, day: 15 });
  t.equal(birthdays.parse('когда-то'), null);
};

exports['20 декабря оформление надето, 9 января снято и тема владельца на месте'] = function (t) {
  var layer = hasDecorLayer();
  withCleanDay(function (themeBefore) {
    var on = holidays().check('2026-12-20', { silent: true });
    t.ok(on.plan, 'на 20 декабря нет оформления: ' + JSON.stringify(on));
    if (layer) {
      t.equal(on.mode, 'decor', 'способ');
      var css = readText(DECOR_FILE) || '';
      t.ok(css.indexOf('/* holidays: ') === 0, 'слой украшений не записан');
      t.ok(css.indexOf('prefers-reduced-motion') > 0, 'нет блока reduced-motion');
      if (themeBefore !== 'holiday') t.equal(activeTheme().id, themeBefore, 'тема владельца не тронута');
    } else {
      t.equal(on.mode, 'theme', 'способ');
      t.equal(activeTheme().id, 'holiday', 'праздничная тема не надета');
      var state = files.readJson(STATE, {});
      t.ok(themeBefore === 'holiday' || state.previous === themeBefore, 'прежняя тема не запомнена: ' + state.previous);
    }
    var off = holidays().check('2027-01-09', { silent: true });
    t.equal(off.plan, null, 'на 9 января оформление осталось');
    if (layer) {
      var left = readText(DECOR_FILE) || '';
      t.ok(left.indexOf('/* holidays') !== 0, 'слой украшений не убран');
    } else {
      var after = activeTheme();
      t.ok(after.id !== 'holiday', 'праздничная тема осталась');
      t.ok(!after.list.some(function (theme) { return theme.id === 'holiday'; }), 'файл праздничной темы не удалён');
      if (themeBefore !== 'holiday') t.equal(after.id, themeBefore, 'вернулась не та тема');
    }
  });
};

exports['предпросмотр: CSS без теней, с reduced-motion, цвета из темы'] = function (t) {
  var look = holidays().previewCss('new-year');
  t.ok(look.css.indexOf('/* holidays: preview:new-year */') === 0, 'начало CSS');
  t.ok(look.css.indexOf('@media (prefers-reduced-motion: reduce)') > 0, 'reduced-motion');
  t.ok(look.css.indexOf('box-shadow') < 0, 'тень');
  t.ok(look.css.indexOf('svg(') < 0, 'не подставлена картинка');
  t.ok(look.base && look.base.bg, 'нет токенов темы');
};

exports['повод дня для «Обоев дня»'] = function (t) {
  var today = holidays().occasionToday('2026-12-31');
  var settings = holidays().settings().values;
  if (settings.off.indexOf('new-year') >= 0) t.skip('Новый год выключен в настройках');
  t.ok(today && today.id === 'new-year' && today.wallpaper, JSON.stringify(today));
  t.equal(holidays().occasionToday('2026-07-15'), null, 'середина июля');
};

exports['инструмент агента tools/holidays.js записан и отвечает'] = function (t) {
  t.ok(files.exists('tools/holidays.js'), 'инструмент агента не записан (start() при запуске Assi)');
  var tool = require('tools/holidays.js');
  t.equal(tool.name, 'holidays', 'имя инструмента');
  t.ok(typeof tool.run === 'function', 'у инструмента нет run');
  t.equal(tool.parameters.properties.action['enum'], ['decor_off', 'decor_on', 'upcoming', 'remind', 'add'], 'действия');
  var week = holidays().tool({ action: 'upcoming', days: 7 });
  t.ok(Array.isArray(week), 'upcoming: ' + JSON.stringify(week));
  week.forEach(function (item) {
    t.ok(item.title && item.inDays <= 7, 'повод недели: ' + JSON.stringify(item));
  });
  t.equal(holidays().tool({ action: 'нет-такого' }), 'Неизвестное действие: нет-такого', 'чужое действие');
};

exports['экран открывается и показывает поводы'] = function (t) {
  var expected = holidays().upcoming().length;
  var page = t.screen(SCREEN + '?tab=upcoming');
  for (var tries = 0; tries < 30 && page.eval('document.body.dataset.ready || ""', 0) !== '1'; tries++) t.wait(200);
  t.equal(page.eval('document.body.dataset.ready || ""', 0), '1', 'список не загрузился');
  if (!expected) {
    t.ok(page.count('#occList .empty') === 1, 'нет надписи о пустом списке');
    return;
  }
  t.equal(page.count('#occList .occ'), expected, 'поводов на экране');
  page.click('#occList .occ');
  t.wait(400);
  t.ok(page.count('.preview-body') > 0, 'предпросмотр повода не открылся');
  t.ok(page.count('#tabs .chip') === 4, 'вкладок');
  page.eval('(function(){var b=document.querySelector(".sheet-back");if(b)b.click();return true})()', 0);
};
