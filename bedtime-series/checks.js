// Checks of «Сериал на ночь» on the phone (module_check). They neither speak nor listen: the
// episode is walked through the driver of the voice loop. What they add to data/series/ they
// remove; the index, the state, the counters, the journal and the settings are put back.
var axiko = require('lib/axiko');
var files = axiko.files;
var MAIN = 'modules/bedtime-series/main.js';
var ENGINE = 'modules/voice-adventure/story-engine/';
var KEPT = [
  'data/series/index.json', 'data/series/index.prev.json', 'data/series/state.json', 'data/series/state.prev.json',
  'data/series/stats.json', 'data/series/log.json', 'data/series/settings.json'
];

function main() {
  return require(MAIN);
}

function engine(name) {
  return require(ENGINE + name + '.js');
}

function sample() {
  return files.readJson('modules/bedtime-series/content/sample.json', null);
}

function snapshot(path) {
  return files.exists(path) ? files.read(path) : null;
}

function restore(path, text) {
  if (text === null) {
    if (files.exists(path)) files.remove(path);
  } else {
    files.write(path, text);
  }
}

function sandbox(fn) {
  var saved = KEPT.map(snapshot);
  var before = engine('store').folders('data/series');
  try {
    return fn();
  } finally {
    engine('store').folders('data/series').forEach(function (id) {
      if (before.indexOf(id) < 0) {
        try { engine('store').removeDir('data/series/' + id); } catch (error) { /* already gone */ }
      }
    });
    KEPT.forEach(function (path, i) { restore(path, saved[i]); });
  }
}

/** A season with the sample episode written `count` times (no model). */
function seasonWith(count) {
  var out = main().startSeason({ genre: 'city', tone: 'warm', minutes: 10, quiet: true });
  for (var i = 0; i < count; i++) {
    var added = main().addEpisode(out.season, sample());
    if (!added.ok) throw new Error('пример серии не прошёл проверку: ' + added.errors.join('; '));
  }
  return out.season;
}

exports['граф серии и проверка работают в движке'] = function (t) {
  if (!files.exists(ENGINE + 'voice.js')) {
    t.skip('не установлен voice-adventure — голосового движка нет');
    return;
  }
  var graph = require('modules/bedtime-series/graph.js');
  t.equal(graph.validate(sample(), {}), [], 'пример серии');
  t.equal(graph.walk({ A: 1, B: 0 }), ['s1', 'A', 's2b', 's3', 'B', 's4a', 'final']);
  var broken = JSON.parse(JSON.stringify(sample()));
  broken.scenes.s2a = 'Коротко.';
  broken.scenes.s3 = broken.scenes.s3 + ' Там вас ждал Иван Петров.';
  broken.choices.B.options[1] = { label: 'фонарщик', keywords: ['фонарщик'] };
  var errors = graph.validate(broken, { forbidden: ['Оля'] });
  t.ok(errors.some(function (e) { return /s2a короче/.test(e); }), 'короткая сцена: ' + errors.join('; '));
  t.ok(errors.some(function (e) { return /фамили/.test(e); }), 'имя с фамилией: ' + errors.join('; '));
  t.ok(errors.some(function (e) { return /не отличить/.test(e); }), 'одинаковые варианты: ' + errors.join('; '));
};

exports['детали дня: только разрешённое, чужие имена вырезаны'] = function (t) {
  var details = require('modules/bedtime-series/details.js');
  var at = new Date().setHours(15, 0, 0, 0);
  var got = details.collect({
    calendar: [{ title: 'Обед с Петей и Иваном Сидоровым', begin: at, end: at + 3600000, allDay: 0 }],
    records: [
      { kind: 'trip', title: 'Поездка', amount: 34, unit: 'min', at: at + 7200000 },
      { kind: 'expense', title: 'Кофе', amount: 300, unit: 'RUB', at: at },
      { kind: 'note', title: 'Позвонить Марине, телефон +7 900 123-45-67', at: at + 9000000 }
    ],
    sources: ['calendar', 'trip', 'note'], people: ['Петя'], known: ['Марина Котова'], max: 6
  });
  var text = got.details.map(function (d) { return d.text; }).join(' | ');
  t.ok(/Петей/.test(text), 'разрешённое имя пропало: ' + text);
  t.ok(!/Иван|Сидоров|Марин|900/.test(text), 'лишнее осталось: ' + text);
  t.ok(!/Кофе|300/.test(text), 'траты попали в детали: ' + text);
  t.ok(/поездка 34 мин/.test(text), 'поездки нет: ' + text);
};

exports['соседи дня отвечают в движке: Праздники, Гороскоп, Питомец, Входящие, Рисуй — угадаю'] = function (t) {
  var links = require('modules/bedtime-series/links.js');
  var since = new Date().setHours(0, 0, 0, 0);
  var d = new Date();
  var day = d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
  var got = links.gather({ sources: ['holidays', 'hat', 'rpg', 'meetings', 'inbox', 'horoscope', 'pet', 'draw'], since: since, day: day, now: Date.now() });
  t.ok(Array.isArray(got.events), 'события общей базы');
  t.equal(got.notes, [], 'соседи с ошибками');
  ['holidays', 'horoscope', 'pet', 'inbox', 'draw-guess'].forEach(function (id) {
    t.ok(true, id + (links.installed(id) ? ': установлен' : ': не установлен — деталь пустая'));
  });
};

exports['серия идёт через водителя: выбор голосом, тишина, «уснул»'] = function (t) {
  if (!files.exists(ENGINE + 'voice.js')) {
    t.skip('не установлен voice-adventure');
    return;
  }
  sandbox(function () {
    var season = seasonWith(1);
    var play = { mode: 'new', episode: 1, node: 's1' };
    var d = main().driver(season, play, { quiet: true });
    var first = d.begin();
    t.ok(/Серия 1/.test(first.text) && !first.listen, 'начало: ' + first.text);
    var q = d.next();
    t.ok(q.listen && /медный или стальной/.test(q.text), 'развилка A: ' + q.text);
    var branchLine = d.answer('возьму стальной', null);
    t.ok(/Стальной ключ/.test(branchLine.text), 'ветка по голосу: ' + branchLine.text);
    t.equal(d.next().text.indexOf('Так или иначе') >= 0, true, 'сцена 3 после ветки');
    var qb = d.next();
    t.ok(qb.listen && /фонарщику/.test(qb.text), 'развилка B: ' + qb.text);
    var again = d.silence(1, qb);
    t.ok(again.listen && again.slow && again.volume < 1, 'повтор тише: ' + JSON.stringify(again).slice(0, 120));
    var calm = d.silence(2, again);
    t.ok(/выберу сам/.test(calm.text) && /фонарщиком/.test(calm.text), 'спокойная ветка: ' + calm.text);
    var last = d.next();
    t.ok(last.end && last.slow && last.fade, 'финал тихо и с затуханием');
    d.end('done', 0);
    var state = engine('store').loadState('data/series');
    t.ok(state.done, 'серия не отмечена дослушанной');
    t.equal(state.choices, { A: 1, B: 0 });

    // Asleep: two forks in a row without an answer.
    var d2 = main().driver(season, play, { quiet: true });
    d2.begin();
    var qa = d2.next();
    d2.silence(1, qa);
    t.ok(/Медный ключ/.test(d2.silence(2, qa).text), 'спокойная ветка A');
    d2.next();
    var qb2 = d2.next();
    d2.silence(3, qb2);
    var sleep = d2.silence(4, qb2);
    t.ok(sleep.end && sleep.reason === 'asleep' && /Спите спокойно/.test(sleep.text), 'тихая концовка: ' + sleep.text);
    d2.end('asleep', 0);
    var asleep = engine('store').loadState('data/series');
    t.equal(asleep.asleepAt, 'A', 'уснул на развилке A');

    // The next evening: «продолжим оттуда или новую?» once the next episode is there.
    main().addEpisode(season, sample());
    var pick = require('modules/bedtime-series/plan.js').toPlay(
      files.readJson('data/series/index.json', {}).seasons.filter(function (s) { return s.id === season; })[0], asleep, Date.now() + 3600000, 3);
    t.equal(pick.mode, 'ask');
    var d3 = main().driver(season, pick, { quiet: true });
    var ask = d3.begin();
    t.ok(/уснули, когда смотритель моста положил на стол два ключа/.test(ask.text) && ask.listen, 'вопрос: ' + ask.text);
    var resumed = d3.answer('давай продолжим оттуда', null);
    t.ok(/с того места, где вы уснули/.test(resumed.text) && /Вечер выдался тихий/.test(resumed.text), 'продолжение: ' + resumed.text);
  });
};

exports['убили посреди серии — продолжение с той же сцены'] = function (t) {
  if (!files.exists(ENGINE + 'voice.js')) {
    t.skip('не установлен voice-adventure');
    return;
  }
  sandbox(function () {
    var season = seasonWith(1);
    var d = main().driver(season, { mode: 'new', episode: 1 }, { quiet: true });
    d.begin();
    d.next();
    d.answer('медный', null);
    d.next();
    d.save();
    var plan = require('modules/bedtime-series/plan.js');
    var idx = files.readJson('data/series/index.json', {});
    var pick = plan.toPlay(idx.seasons.filter(function (s) { return s.id === season; })[0], engine('store').loadState('data/series'), Date.now(), 3);
    t.equal(pick.mode, 'resume');
    t.equal(pick.node, 's3');
    var again = main().driver(season, pick, { quiet: true });
    var line = again.begin();
    t.ok(/Продолжаем серию 1/.test(line.text) && /Так или иначе/.test(line.text), 'продолжение: ' + line.text);
  });
};

exports['настройки держатся в пределах'] = function (t) {
  sandbox(function () {
    var view = main().saveSettings({ choiceWaitSec: 999, people: 'Петя, мама , Петя', remindAt: '25:99', prepareAt: '19:30' });
    var get = function (key) { return view.filter(function (row) { return row.key === key; })[0].value; };
    t.equal(get('choiceWaitSec'), 90);
    t.equal(get('people'), ['Петя', 'мама']);
    t.equal(get('remindAt'), '22:30');
    t.equal(get('prepareAt'), '19:30');
    t.throws(function () { main().saveSettings({ nonsense: 1 }); }, 'неизвестная настройка принята');
  });
  main().start();
};

exports['напоминание и возможности оболочки'] = function (t) {
  sandbox(function () {
    seasonWith(1);
    var note = main().remind(true);
    t.ok(note.send && /Серия 1 готова: «Смотритель моста»/.test(note.text), 'напоминание: ' + note.text);
    axiko.notify.cancel('series-ready');
    var features = engine('phone').features();
    t.ok(Array.isArray(features), 'shell.features');
    if (features.indexOf('notify.actions') < 0) t.skip('оболочка без notify.actions — в напоминании нет кнопки «Слушать»');
    if (!engine('phone').speech().ready) t.skip('распознавание речи на телефоне не скачано — развилки голосом не пойдут');
  });
};

exports['экран открывается'] = function (t) {
  var page = t.screen('modules/bedtime-series/ui/index.html');
  t.wait(800);
  t.ok(/Сериал на ночь/.test(page.text('h1') || ''), 'нет заголовка');
  t.ok(page.count('#night') === 1, 'нет режима «ночник»');
  t.ok(page.count('.btn') >= 2, 'нет кнопок');
};
