// Проверки «Рисуй — угадаю» на телефоне (module_check draw-guess): разбор рисунка модели и
// расписание анимации в движке Rhino, общий со Шляпой match.js, правила отправки снимков, роли
// моделей, слова без сети, инструмент агента tools/draw-guess.js, ачивки («Художник», grant модуля
// ачивок), раунд и картинка в базе (убираются), отклик на имя, набор для сравнения,
// экран: выбор режима, холст (штрихи настоящими событиями указателя, отмена, очистка, снимок JPEG,
// судья по карточке) и «Assi рисует» (анимация, зачёт на слух). Модель не зовётся (экран открыт
// с ?test=1 — запас рисунков не готовится), микрофон не открывается; всё добавленное убирается.
var SCREEN = 'modules/draw-guess/ui/index.html?test=1';

function dg() {
  return require('modules/draw-guess/main.js');
}

var stamp = String(Date.now()).slice(-6);

exports['рисунок модели: образец разбирается, все точки в поле'] = function (t) {
  var canvas = require('modules/draw-guess/canvas.js');
  var painting = require('modules/draw-guess/samples.js').painting();
  var checked = canvas.validatePainting(painting, { minStrokes: 15, maxStrokes: 40, maxPoints: 30 });
  t.ok(checked.ok, 'образец не прошёл: ' + checked.why);
  t.equal(checked.strokes.length, 15, 'штрихов');
  checked.strokes.forEach(function (stroke, i) {
    var parsed = canvas.parsePath(stroke.d);
    t.ok(parsed.ok, 'штрих ' + (i + 1) + ': ' + parsed.why);
    canvas.flatten(parsed.segments).forEach(function (line) {
      line.forEach(function (p) {
        t.ok(p[0] >= 0 && p[0] <= 1000 && p[1] >= 0 && p[1] <= 1000, 'штрих ' + (i + 1) + ': точка вне поля ' + p);
      });
    });
    t.ok(stroke.length > 0, 'длина штриха ' + (i + 1));
  });
  t.ok(!canvas.validatePainting({ strokes: [{ d: 'M 0 0 A 5 5 0 0 1 10 10' }] }, { minStrokes: 1 }).ok, 'дуга A не разрешена');
  t.ok(!canvas.validatePainting({ strokes: [{ d: 'M 0 0 L 2000 10' }] }, { minStrokes: 1 }).ok, 'точка вне поля');
  t.ok(!canvas.validatePainting({ strokes: [{ d: 'M 0 0 L 10 10' }], text: 'кот' }, { minStrokes: 1 }).ok, 'текст в рисунке');
};

exports['анимация: весь рисунок за 45 с ± 1 с, паузы как у человека'] = function (t) {
  var canvas = require('modules/draw-guess/canvas.js');
  var painting = require('modules/draw-guess/samples.js').painting();
  var strokes = canvas.validatePainting(painting, { minStrokes: 1, maxStrokes: 100, maxPoints: 100 }).strokes;
  var lengths = strokes.map(function (stroke) { return stroke.length; });
  var plan = canvas.schedule(lengths, 45000, { pauseMin: 150, pauseMax: 400 });
  t.equal(plan.length, strokes.length, 'шагов в расписании');
  var last = plan[plan.length - 1];
  t.ok(Math.abs(last.start + last.duration - 45000) <= 1000, 'конец рисунка: ' + (last.start + last.duration));
  for (var i = 1; i < plan.length; i++) {
    var pause = plan[i].start - (plan[i - 1].start + plan[i - 1].duration);
    t.ok(pause >= 149 && pause <= 401, 'пауза ' + i + ': ' + Math.round(pause));
  }
  var half = canvas.progressAt(plan, 22500);
  t.ok(half[0] === 1 && half[half.length - 1] === 0, 'к середине — первый штрих готов, последнего ещё нет');
};

exports['сравнение слов: тот же match.js, что у Шляпы'] = function (t) {
  var match = require('modules/draw-guess/match.js');
  var talk = require('modules/draw-guess/guess.js');
  t.ok(match.matches('это же маяком', 'маяк').ok, 'маяком');
  t.ok(!match.matches('кот', 'кошка').ok, '«кот» за «кошку» без синонимов');
  t.ok(talk.judge({ guess: 'башня', alternatives: ['свеча', 'маяк'] }, { word: 'маяк' }).ok, 'верное среди вариантов');
  t.ok(!talk.judge({ guess: 'кот', alternatives: [] }, { word: 'кошка', synonyms: ['кот'] }, { synonyms: false }).ok, 'синонимы выключены');
  t.ok(talk.judge({ guess: 'кот', alternatives: [] }, { word: 'кошка', synonyms: ['кот'] }, { synonyms: true }).ok, 'синонимы включены');
  var assi = require('lib/assi');
  if (!assi.files.exists('modules/hat/cases.js')) t.skip('Шляпа не установлена — общий набор примеров не с чем сравнить');
  var outcome = require('modules/hat/cases.js').run(match);
  t.equal(outcome.failed.length, 0, 'набор Шляпы: ' + JSON.stringify(outcome.failed.slice(0, 5)));
};

exports['снимки модели: не чаще интервала, один запрос в полёте, предел'] = function (t) {
  var canvas = require('modules/draw-guess/canvas.js');
  var s = canvas.sender({ minInterval: 3, pause: 1.5, minNew: 1, maxRequests: 2 });
  canvas.changed(s, 1, 1000);
  t.ok(canvas.decide(s, 1000, 'stroke'), 'первый штрих — сразу');
  canvas.sent(s, 1000);
  canvas.changed(s, 2, 2000);
  t.ok(!canvas.decide(s, 5000, 'stroke'), 'пока ответ в полёте — ничего');
  canvas.answered(s);
  t.ok(canvas.decide(s, 5000, 'answer'), 'по ответу — новый снимок, раз рисунок изменился');
  canvas.sent(s, 5000);
  canvas.answered(s);
  canvas.changed(s, 3, 6000);
  t.ok(!canvas.decide(s, 6500, 'tick'), 'предел запросов');
};

exports['роли моделей: что назначено и видит ли картинки'] = function (t) {
  var info = dg().roleInfo();
  ['guess', 'paint'].forEach(function (name) {
    var role = info[name];
    t.ok(role && typeof role.assigned === 'boolean' && typeof role.vision === 'boolean' && typeof role.local === 'boolean', name + ': ' + JSON.stringify(role));
  });
  var s = dg().settings();
  t.equal(info.guess.interval, info.guess.local ? s.localInterval : s.minInterval, 'интервал отправки');
};

exports['слова без сети: карточка из запаса'] = function (t) {
  var card = dg().card({ offline: true, difficulty: 1, theme: 'животные' });
  var words = require('modules/draw-guess/words.json');
  t.ok(card && card.word, 'карточка: ' + JSON.stringify(card));
  t.equal(card.source, 'offline', 'источник');
  t.ok(words.themes['животные'].indexOf(card.word) >= 0, 'тема: ' + card.word);
};

exports['инструмент агента tools/draw-guess.js записан и ведёт в open'] = function (t) {
  var files = require('lib/assi').files;
  var main = dg();
  main.start();
  t.ok(files.exists('tools/draw-guess.js'), 'инструмент агента не записан');
  t.equal(files.read('tools/draw-guess.js'), require('modules/draw-guess/tool.js').SOURCE, 'в tools/draw-guess.js старый текст');
  var tool = require('tools/draw-guess.js');
  t.equal(tool.name, 'draw_guess', 'имя инструмента');
  t.ok(typeof tool.run === 'function', 'у инструмента нет run');
  t.equal(main.tool({ action: 'нет-такого' }), 'Неизвестное действие: нет-такого', 'чужое действие');
  var prefill = require('modules/draw-guess/tool.js').prefill({ action: 'open', mode: 'model', start: true });
  t.equal(prefill, { mode: 'model', start: true }, '«нарисуй что-нибудь, а я угадаю»');
};

exports['ачивки: «Художник» после серии, модуль ачивок принимает grant'] = function (t) {
  var awards = require('modules/draw-guess/awards.js');
  var s = dg().settings();
  t.equal(awards.earned(['guessed', 'missed'], s, 1).length, 0, 'серия из одного');
  var run = [];
  for (var i = 0; i < s.artistStreak; i++) run.push('guessed');
  t.equal(awards.earned(run, { achievements: true, artistStreak: s.artistStreak }, 1).length, 1, 'серия по настройке');
  if (!require('lib/assi').files.exists('modules/achievements/main.js')) t.skip('«Ачивки за жизнь» не установлены — ачивки ждут в data/games/achievements-outbox.json');
  t.ok(typeof require('modules/achievements/main.js').grant === 'function', 'у модуля ачивок нет grant()');
};

exports['раунд и партия пишутся в базу и убираются'] = function (t) {
  var main = dg();
  var id = main.gameStart({ mode: 'human_draws', players: [], listen: false });
  try {
    t.ok(id > 0, 'id партии');
    var roundId = main.saveRound({
      mode: 'human_draws', word: 'проверка' + stamp, secretKnown: true,
      strokes: [{ points: [[100, 100, 0], [900, 900, 300]], width: 8 }],
      guesses: [{ at_ms: 1200, guess: 'проверка' + stamp, confidence: 0.8, alternatives: [], said: false, ms: 900 }],
      result: 'guessed', timeMs: 1500, requests: 1, roleModel: 'проверка', player: '', gameId: id
    });
    t.ok(roundId > 0, 'id раунда');
    main.gameEnd(id, { rounds: 1, modelHits: 1, humanHits: 0, cost: 0, scores: {}, toBase: false, keep: true });
    var stats = main.gameStats(id);
    t.equal(stats.human_draws.rounds, 1, 'раунд в партии');
    t.equal(stats.human_draws.hits, 1, 'угадано');
    var live = main.compare().live.filter(function (item) { return item.model === 'проверка'; });
    t.equal(live.length, 1, 'модель в сравнении');
  } finally {
    main.removeGame(id);
  }
  t.equal(main.gameStats(id).human_draws.rounds, 0, 'партия убрана');
  t.equal(main.compare().live.filter(function (item) { return item.model === 'проверка'; }).length, 0, 'сравнение убрано');
};

exports['картинка рисунка сохраняется и убирается'] = function (t) {
  var main = dg();
  var assi = require('lib/assi');
  var png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  var path = main.saveArt('check-' + stamp, png);
  try {
    t.equal(path, 'data/draw-guess/art/check-' + stamp + '.png', 'путь');
    t.ok(assi.files.exists(path), 'файл есть');
  } finally {
    main.removeArt(path);
  }
  t.ok(!assi.files.exists(path), 'файл убран');
  t.throws(function () { main.saveArt('x', 'не картинка'); }, 'не картинка');
};

exports['отклик на имя: выключается на игру и возвращается'] = function (t) {
  var status;
  try {
    status = native('wake.status');
  } catch (error) {
    t.skip('нет wake.status: ' + error.message);
  }
  var mark = require('lib/assi').files.readJson('data/draw-guess/wake.json', null);
  if (mark && mark.pending) t.skip('идёт игра — отклик на имя уже выключен ею');
  var main = dg();
  var was = !!(status && status.on);
  main.wakeOff();
  try {
    var during = native('wake.status');
    t.ok(!(during && during.on), 'во время игры отклик на имя должен быть выключен');
  } finally {
    main.wakeRestore();
  }
  var after = native('wake.status');
  t.equal(!!(after && after.on), was, 'отклик на имя вернулся как был');
};

exports['набор для сравнения: образцы на месте, свой рисунок добавляется и убирается'] = function (t) {
  var main = dg();
  var before = main.bench();
  t.ok(before.filter(function (item) { return !item.own; }).length >= 3, 'образцов');
  var id = main.benchAdd('проверка' + stamp, [{ points: [[100, 100, 0], [500, 500, 200]], width: 8 }]);
  try {
    t.equal(main.bench().length, before.length + 1, 'добавлен');
  } finally {
    main.benchRemove(id);
  }
  t.equal(main.bench().length, before.length, 'убран');
};

function openScreen(t) {
  var page = t.screen(SCREEN);
  var ready = false;
  for (var i = 0; i < 20 && !ready; i++) {
    ready = page.eval('document.body.dataset.ready === "1"', 300) === true;
  }
  t.ok(ready, 'экран не загрузил данные движка');
  return page;
}

exports['экран: два режима и «Начать»'] = function (t) {
  var page = openScreen(t);
  t.equal(page.count('#mode-human'), 1, 'карточка «Я рисую»');
  t.equal(page.count('#mode-model'), 1, 'карточка «Assi рисует»');
  t.equal(page.count('#start'), 1, 'кнопка «Начать»');
  t.ok(page.eval('document.documentElement.scrollWidth <= window.innerWidth + 1', 0), 'нет прокрутки вбок');
};

exports['холст: штрихи пальцем, отмена, очистка, снимок, судья по карточке'] = function (t) {
  var page = openScreen(t);
  try {
    var started = page.eval('dgScreen.testDraw("дом")', 800);
    t.equal(started.word, 'дом', 'карточка');
    t.equal(started.view, 'draw', 'экран рисования');
    t.equal(page.count('#ink'), 1, 'холст');
    ['#undo', '#clear', '#width', '#voice', '#yes', '#no', '#warm', '#done', '#exit'].forEach(function (selector) {
      t.equal(page.count(selector), 1, 'кнопка ' + selector);
    });
    t.equal(page.eval('dgScreen.drawLine([[250,500],[250,850],[750,850],[750,500],[250,500]])', 0), 1, 'первый штрих пальцем');
    t.equal(page.eval('dgScreen.drawLine([[220,520],[500,230],[780,520]], "pen")', 0), 2, 'второй штрих пером');
    if (dg().settings().palmMs >= 500) {
      t.equal(page.eval('dgScreen.drawLine([[100,100],[200,200]])', 0), 2, 'касание ладонью сразу после пера не рисует');
    }
    page.click('#undo');
    t.equal(page.eval('dgScreen.strokes()', 0), 1, 'после «Отменить штрих»');
    page.click('#clear');
    t.equal(page.eval('dgScreen.strokes()', 0), 0, 'после «Очистить»');
    page.click('#undo');
    t.equal(page.eval('dgScreen.strokes()', 0), 1, '«Отменить» вернула очищенное');
    t.equal(page.eval('dgScreen.drawLine([[220,520],[500,230],[780,520]], "pen")', 0), 2, 'крыша снова');
    var snap = page.eval('dgScreen.snapshot()', 0);
    t.equal(snap.type, 'image/jpeg', 'снимок — JPEG');
    t.equal(snap.size, dg().settings().imageSize, 'размер снимка');
    t.ok(snap.bytes > 1000 && snap.bytes < 80000, 'вес снимка: ' + snap.bytes);
    t.ok(snap.dark > 0.002 && snap.dark < 0.5, 'на снимке чёрные линии на белом: ' + snap.dark);
    var miss = page.eval('dgScreen.answer({ guess: "сарай", confidence: 0.4, alternatives: ["будка"] })', 0);
    t.equal(miss.phase, 'run', 'неверная догадка — рисуем дальше');
    page.click('#no');
    t.equal(page.eval('dgScreen.round().rejected', 0), ['сарай'], '«Нет» — в отвергнутые');
    var hit = page.eval('dgScreen.answer({ guess: "дома", confidence: 0.8 })', 300);
    t.equal(hit.result, 'guessed', '«дома» засчитано за «дом»');
    t.ok(hit.points >= 1 && hit.points <= 10, 'очки: ' + hit.points);
  } finally {
    page.eval('dgScreen.endTest()', 400);
  }
  try {
    page.eval('dgScreen.testDraw("кошка")', 800);
    page.eval('dgScreen.drawLine([[300,300],[700,700]])', 0);
    t.equal(page.eval('dgScreen.answer({ guess: "кот", confidence: 0.9 })', 0).phase, 'run', '«кот» за «кошку» без синонимов не засчитан');
  } finally {
    page.eval('dgScreen.endTest()', 400);
  }
};

exports['Assi рисует: штрихи появляются по расписанию, верное слово слышно'] = function (t) {
  var page = openScreen(t);
  try {
    var started = page.eval('dgScreen.testPaint(3)', 800);
    t.equal(started.view, 'paint', 'экран рисунка');
    t.equal(started.strokes, 15, 'штрихов');
    t.equal(started.paintMs, 3000, 'рисунок за 3 с');
    t.wait(1200);
    var part = page.eval('dgScreen.painted()', 0);
    t.ok(part > 0.05 && part < 0.98, 'к 1,2 с нарисована часть: ' + part);
    t.wait(2500);
    t.equal(page.eval('dgScreen.painted()', 0), 1, 'к концу — весь рисунок');
    t.equal(page.eval('dgScreen.hear("это ракета")', 0), false, 'неверное не засчитано');
    t.equal(page.eval('dgScreen.hear("да это же маяком")', 300), true, 'верное засчитано');
    var round = page.eval('dgScreen.round()', 0);
    t.equal(round.result, 'guessed', 'исход');
    t.ok(round.points >= 1, 'очки за скорость: ' + round.points);
    t.equal(page.count('#next'), 1, 'кнопка «Дальше»');
  } finally {
    page.eval('dgScreen.endTest()', 400);
  }
};
