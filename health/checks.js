// Checks of the health module on the phone (module_check). Every check cleans up what it adds,
// and keeps the other modules out of it (health._quiet): no pet reaction to a check's glass.
var base = require('lib/base');
var assi = require('lib/assi');
var MAIN = 'modules/health/main.js';
var SCREEN = 'modules/health/ui/index.html';

function health() {
  return require(MAIN);
}

function quietly(fn) {
  var hm = health();
  hm._quiet(true);
  try {
    return fn(hm);
  } finally {
    hm._quiet(false);
  }
}

exports['сводка дня: все поля на месте'] = function (t) {
  var hm = health();
  var d = hm.day();
  var fields = require('modules/health/logic/summary.js').FIELDS;
  fields.forEach(function (key) { t.ok(key in d, 'нет поля ' + key); });
  t.ok(/^\d{4}-\d{2}-\d{2}$/.test(d.date), 'дата: ' + d.date);
  t.ok(typeof d.known.sleep === 'boolean' && typeof d.known.steps === 'boolean', 'known без флагов');
  t.equal(hm.days(d.date, d.date)[0].date, d.date, 'days() и day() о разном');
  var now = hm.today();
  t.ok(typeof now.hour === 'number' && typeof now.night === 'boolean', 'today() без часа и ночи');
  t.ok(now.goals && now.goals.stepsGoal > 0, 'today() без целей');
};

exports['вода: стакан попадает в сводку и убирается'] = function (t) {
  quietly(function (hm) {
    var before = hm.recompute()[0].waterMl;
    var added = hm.addWater(300);
    try {
      t.equal(hm.day().waterMl, before + 300, 'вода в сводке');
      t.ok(base.get(added.id).kind === 'water', 'записи water нет в базе');
    } finally {
      base.remove(added.id);
      hm.recompute();
    }
    t.equal(hm.day().waterMl, before, 'после уборки');
  });
};

exports['привычка: отметка, цепочка, один раз в день'] = function (t) {
  quietly(function (hm) {
    var habit = hm.saveHabit({ title: 'Проверка привычки ' + Date.now(), schedule: { days: [1, 2, 3, 4, 5, 6, 7] } });
    try {
      var first = hm.markHabit(habit.id);
      t.ok(first.chain >= 1, 'цепочка после отметки: ' + first.chain);
      var second = hm.markHabit(habit.id);
      t.ok(second.already === true, 'вторая отметка за день записалась');
      t.ok(hm.day().habitIds.indexOf(habit.id) >= 0, 'привычки нет в сводке');
      t.equal(hm.chain(habit.id), first.chain, 'chain() не совпадает');
      hm.unmarkHabit(habit.id);
      t.equal(hm.chain(habit.id), 0, 'после отмены цепочка не нулевая');
    } finally {
      hm.unmarkHabit(habit.id);
      hm.removeHabit(habit.id);
    }
    t.ok(!hm.habits().some(function (h) { return h.id === habit.id; }), 'привычка осталась в списке');
  });
};

exports['пауза: включается и снимается'] = function (t) {
  var hm = health();
  if (hm.paused()) t.skip('сейчас идёт пауза владельца — не трогаю её');
  quietly(function () {
    var today = hm.day().date;
    var p = hm.pause({ type: 'rest', until: today, title: 'Проверка паузы' });
    try {
      t.equal(hm.paused(), 'rest', 'paused()');
      t.equal(hm.day().paused, 'rest', 'сводка не знает о паузе');
    } finally {
      hm.unpause();
      if (base.get(p.id)) base.remove(p.id);
      hm.recompute();
    }
    t.equal(hm.paused(), null, 'пауза не снялась');
  });
};

exports['крючки: по порядку, ошибка одного не мешает'] = function (t) {
  var hm = health();
  var event = 'check.hooks';
  hm._probes(true);
  try {
    hm.hook(event, 'modules/health/nope.js', 'onDay', 1);
    hm.hook(event, MAIN, '_missing', 2);
    hm.hook(event, MAIN, '_probe', 3);
    hm.hook(event, MAIN, '_probe', 3);
    var list = hm.hooks().filter(function (x) { return x.event === event; });
    t.equal(list.length, 3, 'повторная запись крючка');
    var results = hm.fire(event, '2026-01-01');
    t.equal(results.map(function (r) { return r.ok; }), [false, false, true], 'порядок или исход');
    t.equal(hm._probes(true), ['2026-01-01'], 'аргумент не дошёл');
  } finally {
    hm.unhook('modules/health/nope.js');
    hm.unhook(MAIN, event);
  }
  t.ok(!hm.hooks().some(function (x) { return x.event === event; }), 'крючки проверки остались');
};

exports['лекарство: приём, статус, отмена'] = function (t) {
  quietly(function (hm) {
    var med = hm.saveMed({ name: 'Проверка лекарства ' + Date.now(), times: ['09:00', '21:00'], remind: false });
    try {
      var dose = hm.medsToday().filter(function (d) { return d.medId === med.id; })[0];
      t.ok(dose, 'приёма нет в сегодняшних');
      var mark = hm.medTaken(med.id, dose.due);
      t.ok(mark.status === 'taken' || mark.status === 'late', 'статус: ' + mark.status);
      var after = hm.medsToday().filter(function (d) { return d.medId === med.id && d.due === dose.due; })[0];
      t.equal(after.status, mark.status, 'статус в списке');
      t.ok(hm.day().medsTaken >= 1, 'сводка не видит приёма');
      hm.medUndo(med.id, dose.due);
      after = hm.medsToday().filter(function (d) { return d.medId === med.id && d.due === dose.due; })[0];
      t.equal(after.status, null, 'отметка не снялась');
    } finally {
      hm.medsToday().forEach(function (d) { if (d.medId === med.id) hm.medUndo(med.id, d.due); });
      hm.removeMed(med.id);
    }
  });
};

exports['сон: ручная правка главнее и снимается'] = function (t) {
  quietly(function (hm) {
    var night = '2001-01-03';
    var out = hm.setSleep({ night: night, bed: '23:30', wake: '07:15' });
    try {
      t.equal(out.minutes, 465, 'минуты сна');
      var d = hm.recompute(night)[0];
      t.equal([d.sleepMin, d.bedtime, d.wake, d.sleepFrom], [465, '23:30', '07:15', 'manual'], 'сводка ночи');
    } finally {
      hm.clearManualSleep(night);
    }
    t.equal(hm.recompute(night)[0].known.sleep, false, 'правка не снялась');
  });
};

exports['виджет: три строки'] = function (t) {
  var w = health().widget();
  t.equal(w.title, 'Здоровье');
  t.ok(String(w.text).split('\n').length === 3, 'строк: ' + String(w.text).split('\n').length);
  t.ok(/шагов/.test(w.text), 'нет шагов: ' + w.text);
};

exports['инструменты агента на месте'] = function (t) {
  t.ok(assi.files.exists('tools/health_mark.js'), 'нет tools/health_mark.js (модуль не запускался?)');
  t.ok(assi.files.exists('tools/health_day.js'), 'нет tools/health_day.js');
  var text = require('tools/health_day.js').run({});
  t.ok(/^День \d{4}-\d{2}-\d{2}/.test(text), 'health_day: ' + text);
};

exports['настройки: схема и сохранение'] = function (t) {
  var hm = health();
  t.ok(hm.settingsSchema().length > 40, 'мало настроек');
  var glass = hm.settings().glassMl;
  t.equal(hm.setSettings({ glassMl: glass }).glassMl, glass, 'настройка не сохранилась');
  t.equal(hm.setSettings({ nope: 1, glassMl: 'abc' }).glassMl, glass, 'неверное значение прошло');
};

exports['сбор данных проходит без падения'] = function (t) {
  var report = health().collect();
  t.ok(report && typeof report === 'object', 'сбор ничего не вернул');
  if (report.busy) t.skip('сбор уже шёл');
  ['hc', 'sensor', 'steps', 'screen', 'sleep'].forEach(function (key) { t.ok(key in report, 'нет шага ' + key); });
};

exports['экран: вкладки и стакан воды'] = function (t) {
  var hm = health();
  hm._quiet(true);
  var before = hm.recompute()[0].waterMl;
  var started = Date.now();
  try {
    var page = t.screen(SCREEN + '?tab=today');
    t.wait(800);
    t.equal(page.count('#tabs .chip'), 4, 'вкладки');
    t.ok(page.count('#today .card') >= 4, 'карточек «Сегодня»: ' + page.count('#today .card'));
    page.click('[aria-label="Плюс стакан"]');
    t.wait(1200);
    t.equal(hm.day().waterMl, before + hm.settings().glassMl, 'стакан с экрана');
  } finally {
    base.find({ kind: 'water', since: started - 1000, source: 'health' }).forEach(function (r) { base.remove(r.id); });
    hm.recompute();
    hm._quiet(false);
  }
};
