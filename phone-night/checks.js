// Checks of «Тайная жизнь телефона» on the phone (module_check phone-night). The night they use is
// the bundled sample (samples/*.txt through fixture.js), not the owner's: the parsers, the facts,
// the honesty check and the store are exercised without waiting for a real night. Nothing is sent,
// the model is not called (a stand-in answers), everything a check writes is removed after it.
var assi = require('lib/assi');
var fixture = require('modules/phone-night/fixture.js');
var settingsLib = require('modules/phone-night/settings.js');
var nightLib = require('modules/phone-night/night.js');

var SCREEN = 'modules/phone-night/ui/index.html';
var SAMPLE_NIGHT = '2026-11-13';
var CHECK_NIGHT = '2001-01-1' + String(Date.now()).slice(-1);

function main() {
  return require('modules/phone-night/main.js');
}

function texts() {
  var out = {};
  fixture.FILES.forEach(function (name) {
    out[name] = assi.files.read('modules/phone-night/samples/' + name + '.txt');
  });
  return out;
}

function sample(key) {
  var s = settingsLib.defaults();
  return { s: s, made: fixture.scenario(key, texts(), s) };
}

exports['разбор образцов: окно, батарея, сессия владельца, будильники'] = function (t) {
  var one = sample(SAMPLE_NIGHT);
  var report = main().fromInput(one.made.input, { model: false, settings: one.s });
  var f = report.facts;
  t.equal(f.window.how, 'screen', 'окно по экрану');
  t.equal(nightLib.hhmm(f.window.from) + '–' + nightLib.hhmm(f.window.to), '23:39–07:12', 'окно ночи');
  t.equal([f.battery.start, f.battery.end], [92, 82], 'батарея по ленте');
  t.equal(f.owner.sessions.length, 1, 'одна сессия владельца');
  t.equal(nightLib.hhmm(f.owner.sessions[0].from) + ' ' + f.owner.sessions[0].app + ' ' + f.owner.sessions[0].minutes, '02:40 Telegram 6');
  var apps = f.wakers.top.filter(function (row) { return row.key !== 'system'; });
  t.equal(apps[0].app + ' ' + apps[0].wakeups, 'Сервисы Google Play 19', 'главный будильщик');
  t.equal(f.notifications.total, 9, 'уведомлений за ночь');
  t.equal(f.doze.fullMinutes, 254, 'минут глубокого Doze');
  t.ok(report.whence.lines.every(function (line) { return line.from; }), 'у каждой строки есть источник');
};

exports['честность: выдуманное число отбрасывается, правдивый рассказ остаётся'] = function (t) {
  var one = sample(SAMPLE_NIGHT);
  var s = one.s;
  var facts = main().fromInput(one.made.input, { model: false, settings: s }).facts;
  var lies = 0;
  var lied = main().tell(facts, s, function () {
    lies++;
    return { headline: 'Ночь', lines: ['Батарея потеряла 17% — рекорд.'], tip: '' };
  });
  t.equal(lied.by, 'template', 'после двух неправд — шаблон');
  t.equal(lies, 2, 'одна повторная попытка');
  t.ok(/17/.test(lied.note), 'ошибка названа: ' + lied.note);
  var told = main().tell(facts, s, function () {
    return { headline: 'Ночная охота', lines: ['В 01:00 «Маркетплейс» вышел на охоту — 7 уведомлений до рассвета.', 'Батарея пережила ночь, потеряв 10%.'], tip: '' };
  });
  t.equal(told.by, 'model', 'правдивый рассказ принят');
  t.equal(told.attempts, 1);
};

exports['отчёт сохраняется, виден в списке и забывается'] = function (t) {
  var one = sample(CHECK_NIGHT);
  try {
    main().fromInput(one.made.input, { store: true, model: false, settings: one.s });
    var kept = main().report(CHECK_NIGHT);
    t.ok(kept.stored, 'отчёт сохранён');
    t.equal(kept.facts.battery.end, 82, 'факты прочитаны обратно');
    var listed = main().nights(400).filter(function (row) { return row.night === CHECK_NIGHT; });
    t.equal(listed.length, 1, 'ночь в списке прошлых');
  } finally {
    main().forget(CHECK_NIGHT);
  }
  t.equal(main().nights(400).filter(function (row) { return row.night === CHECK_NIGHT; }).length, 0, 'ночь забыта');
};

exports['журнал: событие записывается, текст уведомления — нет'] = function (t) {
  var made = main().handle('notification', {
    package: 'check.phone.night', app: 'Проверка', title: 'Проверка', text: 'секретный текст', key: 'check|phone-night|' + Date.now()
  }, { test: true });
  if (made.skipped) t.skip(made.skipped);
  try {
    var rows = assi.db('phone-night').query('select kind, package, extra from events where id = ?', [made.id]);
    t.equal(rows.length, 1, 'запись есть');
    t.equal(rows[0].kind, 'notification');
    t.ok(String(rows[0].extra).indexOf('секретный') < 0, 'текст не сохранён');
    t.equal(JSON.parse(rows[0].extra).len, 15, 'только длина');
  } finally {
    main().dropEvents([made.id]);
  }
};

exports['источники отвечают честно'] = function (t) {
  var sources = main().sources();
  if (!sources.battery.ok) t.skip('батарея не ответила: ' + sources.battery.note);
  t.ok(sources.battery.level >= 0 && sources.battery.level <= 100, 'уровень батареи ' + sources.battery.level);
  t.ok(typeof sources.usage === 'boolean', 'доступ к статистике — да или нет');
  t.ok(typeof sources.shizuku.ready === 'boolean', 'Shizuku — да или нет');
  var status = main().status();
  t.ok(/^\d{4}-\d{2}-\d{2}$/.test(status.night), 'ночь экрана: ' + status.night);
};

exports['настройки: сохраняются нормализованными и возвращаются'] = function (t) {
  var path = 'data/phone-night/settings.json';
  var had = assi.files.exists(path);
  var before = main().settings().values;
  try {
    var saved = main().saveSettings({ darkMinutes: 9999, style: 'стихи' });
    t.equal(saved.darkMinutes, 240, 'число ограничено');
    t.equal(saved.style, 'nature', 'неизвестный стиль заменён');
  } finally {
    main().saveSettings(before);
    if (!had) assi.files.remove(path);
  }
};

exports['экран открывается и рисует вкладки'] = function (t) {
  var page = t.screen(SCREEN);
  t.equal(page.count('.tabs .chip'), 4, 'четыре вкладки');
  page.click('.tabs .chip[data-id="settings"]');
  t.wait(800);
  t.ok(page.count('#settings .field') > 10, 'настройки нарисованы из схемы');
  page.click('.tabs .chip[data-id="today"]');
  t.wait(800);
  t.ok(page.count('#today .card') > 0, 'вкладка «Сегодня» не пуста');
};
