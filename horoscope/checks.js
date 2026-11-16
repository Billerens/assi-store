// Checks of «Гороскоп по данным» on the phone (module_check). Detectors and checks run on made-up
// days; the real forecast files are only read, and what the checks write is put back.
var assi = require('lib/assi');
var files = assi.files;
var MAIN = 'modules/horoscope/main.js';

function main() {
  return require(MAIN);
}

function snapshot(path) {
  return files.exists(path) ? files.read(path) : null;
}

function restore(path, text) {
  if (text === null) files.remove(path);
  else files.write(path, text);
}

var TODAY = '2026-11-19';

function history(change) {
  var dates = require('modules/horoscope/dates.js');
  var out = [];
  for (var i = 56; i >= 1; i--) {
    var date = dates.add(TODAY, -i);
    var day = { date: date, paused: null, known: { sleep: true, steps: true, screen: true, places: true, spend: true },
      steps: 5000, stepsGoal: 8000, sleepMin: 450, sleepGoal: 450, bedtime: '23:50', lateMin: 0, places: [], deliveryLate: 0, habitIds: [], chains: {} };
    if (change) change(day, dates.weekday(date), dates.diff(TODAY, date));
    out.push(day);
  }
  return out;
}

exports['доставка в 4 четверга подряд даёт ровно это предсказание'] = function (t) {
  var det = require('modules/horoscope/detectors.js');
  var days = history(function (d, wd, age) { if (wd === 4 && age <= 28) d.deliveryLate = 1; });
  var got = det.candidates({ date: TODAY, days: days, goals: { steps: 8000, sleep: 450, dayEndHour: 5 } });
  t.equal(got.map(function (p) { return p.id; }), ['weekday.delivery']);
  t.equal(got[0].confidence, 1);
};

exports['проверка «сбылось» по типам, пауза даёт null'] = function (t) {
  var det = require('modules/horoscope/detectors.js');
  var day = { known: { steps: true, spend: true, places: true, sleep: true, screen: true }, steps: 9000, deliveryLate: 0, places: ['p1'], habitIds: ['h'], lateMin: 20 };
  var ctx = { day: day, next: { known: { sleep: true }, bedtime: '23:00' }, records: [], extras: { rpgLevel: 3 } };
  t.equal(det.evaluate({ check: { metric: 'steps', op: '>=', value: 8000 } }, ctx), true);
  t.equal(det.evaluate({ check: { metric: 'deliveryLate', op: '>=', value: 1 } }, ctx), false);
  t.equal(det.evaluate({ check: { metric: 'lateMin', op: '>=', value: 15 } }, ctx), true);
  t.equal(det.evaluate({ check: { type: 'visit', place: 'p1' } }, ctx), true);
  t.equal(det.evaluate({ check: { type: 'habit', id: 'h' } }, ctx), true);
  t.equal(det.evaluate({ check: { type: 'bedtimeBefore', value: 700, dayOffset: 1 } }, ctx), true);
  t.equal(det.evaluate({ check: { type: 'rpg', level: 4 } }, ctx), false);
  t.equal(det.evaluate({ check: { metric: 'steps', op: '>=', value: 1 } }, { day: { paused: 'sick', known: { steps: true }, steps: 9 } }), null);
  t.equal(det.evaluate({ check: { metric: 'steps', op: '>=', value: 1 } }, { day: { known: { steps: false } } }), null);
};

exports['текст модели с выдуманным числом не принимается'] = function (t) {
  var text = require('modules/horoscope/text.js');
  var templates = require('modules/horoscope/templates.json');
  var p = { id: 'weekday.delivery', detector: 'weekday', kind: 'spend', params: { k: 4, n: 4, weekday: 4, hour: 22 } };
  var words = text.describe(p, templates, {}, TODAY);
  var predictions = [Object.assign({}, p, words)];
  var body = 'Звёзды на четверг шепчут: ближе к 22:00 рука сама потянется заказать ужин — так было 4 из 4 последних четвергов. ' +
    'Звёзды не видят причин нарушать традицию, но, может быть, сегодня вы их перехитрите и приготовите что-нибудь сами. Завтра проверим.';
  t.ok(text.accept(body, predictions, {}, TODAY).ok, 'честный текст отклонён: ' + text.accept(body, predictions, {}, TODAY).reason);
  t.ok(!text.accept(body.replace('4 из 4', '7 из 8'), predictions, {}, TODAY).ok, 'выдуманные числа приняты');
};

exports['прогноз на сегодня, виджет, инструмент'] = function (t) {
  var paths = ['data/horoscope/settings.json', 'data/horoscope/signs.json'];
  var saved = paths.map(snapshot);
  var date = require('modules/horoscope/source.js').currentDay();
  var dayFile = 'data/horoscope/days/' + date + '.json';
  var savedDay = snapshot(dayFile);
  try {
    files.writeJson('data/horoscope/settings.json', { model: false, notify: false });
    main().start();
    var file = main().make(date, true);
    t.ok(file && file.text && file.text.length > 40, 'нет текста прогноза');
    t.ok(file.predictions.length >= 1 && file.predictions.length <= 4, 'предсказаний: ' + file.predictions.length);
    t.ok(file.predictions.some(function (p) { return p.tone !== 'tease'; }), 'нет ни одного приятного или нейтрального');
    t.equal(file.from, 'template');
    var widget = main().widget();
    t.ok(/^Звёзды на /.test(widget.text), 'виджет: ' + widget.text);
    var said = main().tool({ what: 'today' });
    t.equal(said.text, file.text, 'агент получает не сегодняшний текст');
    t.ok(files.exists('tools/horoscope_today.js'), 'инструмент агента не записан');
  } finally {
    paths.forEach(function (path, i) { restore(path, saved[i]); });
    restore(dayFile, savedDay);
  }
};

exports['экран: знак, прогноз, основания'] = function (t) {
  var page = t.screen('modules/horoscope/ui/index.html');
  t.wait(900);
  t.ok(/Звёзды на /.test(page.text('#left')), 'нет прогноза на экране');
  t.ok(/На чём основано/.test(page.text('#right')), 'нет «На чём основано»');
  t.ok(page.count('.emblem') >= 1, 'нет эмблемы знака');
};
