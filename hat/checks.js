// Проверки Шляпы на телефоне (module_check hat): сравнение слов в движке на общем наборе
// cases.js, запасной словарь, проверка ответа модели, запись игры в базу, инструмент агента
// tools/hat.js, отклик на имя,
// экран подготовки и ход с зачётом «на слух» и «Отменой». Модель не зовётся, микрофон не
// открывается; всё, что проверки добавили, они убирают.
var SCREEN = 'modules/hat/ui/index.html';

function hat() {
  return require('modules/hat/main.js');
}

var stamp = String(Date.now()).slice(-6);

exports['сравнение слов: весь набор примеров'] = function (t) {
  var cases = require('modules/hat/cases.js');
  var outcome = cases.run(require('modules/hat/match.js'));
  t.ok(outcome.total >= 200, 'примеров мало: ' + outcome.total);
  t.equal(outcome.failed.length, 0, 'не сошлось: ' + JSON.stringify(outcome.failed.slice(0, 5)));
};

exports['сравнение слов: «кит» внутри «китайский» не засчитывается'] = function (t) {
  var match = require('modules/hat/match.js');
  t.ok(!match.matches('китайский ресторан', 'кит').ok, 'кит в китайском');
  t.ok(match.matches('это кит', 'кит').ok, 'кит отдельным словом');
  var railway = match.matches('ехали по железной дорогой', { word: 'железная дорога', forms: [] });
  t.ok(railway.ok, 'железной дорогой');
};

exports['запасной словарь: колода из 40 разных слов'] = function (t) {
  var deck = require('modules/hat/deck.js');
  var match = require('modules/hat/match.js');
  var info = hat().offlineInfo();
  t.ok(info.builtin >= 600, 'в словаре ' + info.builtin + ' слов');
  var cards = deck.offline(require('modules/hat/words.json'), { difficulty: 3, count: 40 });
  t.equal(cards.length, 40, 'слов в колоде');
  var seen = {};
  cards.forEach(function (card) {
    var plain = match.normalize(card.word);
    t.ok(!seen[plain], 'повтор: ' + card.word);
    seen[plain] = true;
  });
};

exports['ответ модели: лишнее отброшено'] = function (t) {
  var deck = require('modules/hat/deck.js');
  var made = deck.clean({ words: [
    { word: 'Холодильник', forms: ['холодильника'], roots: ['холод'], difficulty: 2 },
    { word: 'холодильники' },
    { word: 'iPhone' },
    { word: 'кошка 2' },
    { word: 'очень большая собака' },
    { word: 'ёлка' },
    { word: 'елка' },
    { word: 'самолёт' }
  ] }, { exclude: { 'самолет': true }, maxLetters: 24 });
  t.equal(made.cards.map(function (card) { return card.word; }), ['холодильник', 'ёлка'], 'оставлено');
  var why = made.dropped.map(function (item) { return item.why; });
  ['повтор', 'латиница или цифры', 'больше двух слов', 'уже было'].forEach(function (reason) {
    t.ok(why.indexOf(reason) >= 0, 'нет причины «' + reason + '»: ' + JSON.stringify(made.dropped));
  });
};

exports['игра пишется в базу и убирается'] = function (t) {
  var main = hat();
  var players = ['Проверка А' + stamp, 'Проверка Б' + stamp, 'Проверка В' + stamp, 'Проверка Г' + stamp];
  var id = main.gameStart({ mode: 'pairs', players: players, teams: [], settings: {}, deckId: null, wake: false });
  try {
    t.ok(id > 0, 'id игры');
    var turnId = main.turnSave(id, {
      round: 1, started: Date.now(), explainerName: players[0], guesserName: players[2], achieve: false,
      results: [
        { word: 'проверкаслово' + stamp, result: 'guessed', ms: 2100, heard: 'проверкаслово' + stamp, how: 'exact', latency: 900 },
        { word: 'проверкапропуск' + stamp, result: 'skipped', ms: 5000, heard: '', how: '' }
      ]
    });
    t.ok(turnId > 0, 'id хода');
    t.ok(main.turnUpdate(id, turnId, [{ word: 'проверкаслово' + stamp, result: 'undone', ms: 2100 }]), 'исправление хода');
    main.gameEnd(id, {
      scores: { players: [1, 0, 1, 0], teams: [] },
      summary: { words: 1, places: [{ place: 1, name: players[0], score: 1 }], explainers: [{ name: players[0], words: 1, ms: 60000 }], winner: players[0] },
      players: players, unguessed: [], toBase: false, keep: true
    });
    var found = main.stats().filter(function (person) { return person.name === players[0]; });
    t.equal(found.length, 1, 'игрок в статистике');
    t.equal(found[0].wins, 1, 'победа в статистике');
  } finally {
    main.removeGame(id);
  }
  t.equal(main.stats().filter(function (person) { return person.name === players[0]; }).length, 0, 'игра убрана');
};

exports['инструмент агента tools/hat.js записан и ведёт в open'] = function (t) {
  var files = require('lib/axiko').files;
  var main = hat();
  main.start();
  t.ok(files.exists('tools/hat.js'), 'инструмент агента не записан');
  t.equal(files.read('tools/hat.js'), require('modules/hat/tool.js').SOURCE, 'в tools/hat.js старый текст');
  var tool = require('tools/hat.js');
  t.equal(tool.name, 'hat', 'имя инструмента');
  t.ok(typeof tool.run === 'function', 'у инструмента нет run');
  t.equal(tool.parameters.properties.action['enum'], ['open'], 'действия инструмента');
  t.equal(main.tool({ action: 'нет-такого' }), 'Неизвестное действие: нет-такого', 'чужое действие');
  var prefill = require('modules/hat/tool.js').prefill({ action: 'open', count: 6, theme: 'кино' });
  t.equal(prefill, { players: 6, theme: 'кино' }, '«нас шестеро, тема — кино»');
};

exports['отклик на имя: выключается на игру и возвращается'] = function (t) {
  var status;
  try {
    status = native('wake.status');
  } catch (error) {
    t.skip('нет wake.status: ' + error.message);
  }
  var mark = require('lib/axiko').files.readJson('data/hat/wake.json', null);
  if (mark && mark.pending) t.skip('идёт игра — отклик на имя уже выключен ею');
  var main = hat();
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

exports['экран: подготовка, игроки добавляются'] = function (t) {
  var page = t.screen(SCREEN);
  var ready = false;
  for (var i = 0; i < 20 && !ready; i++) {
    ready = page.eval('document.body.dataset.ready === "1"', 300) === true;
  }
  t.ok(ready, 'экран не загрузил данные движка');
  var name = 'Проверка' + stamp;
  var before = page.eval('hatScreen.state.setup.players.length', 0);
  try {
    page.type('#name', name);
    page.click('#add');
    t.equal(page.eval('hatScreen.state.setup.players.length', 0), before + 1, 'игрок добавлен');
    t.ok(page.eval('document.body.textContent.indexOf(' + JSON.stringify(name) + ') >= 0', 0), 'имя на экране');
    t.ok(page.count('#start') === 1, 'кнопка «Начать»');
    t.ok(page.count('#build-offline') === 1 || page.eval('hatScreen.state.settings.ownWords', 0), 'кнопка «Без сети»');
  } finally {
    page.eval('hatScreen.removePlayer(' + JSON.stringify(name) + ')', 0);
  }
  t.equal(page.eval('hatScreen.state.setup.players.length', 0), before, 'проверочный игрок убран');
};

exports['ход: услышанное слово засчитано, «Отмена» возвращает'] = function (t) {
  var page = t.screen(SCREEN);
  for (var i = 0; i < 20; i++) {
    if (page.eval('document.body.dataset.ready === "1"', 300) === true) break;
  }
  try {
    var word = page.eval('hatScreen.testTurn(["холодильник", "железная дорога", "кошка"], ["А", "Б", "В", "Г"])', 800);
    t.ok(typeof word === 'string' && word.length > 0, 'слово хода: ' + word);
    t.equal(page.text('#word'), word, 'слово на экране');
    t.ok(page.count('#skip') === 1 && page.count('#guessed') === 1, 'кнопки «Пропуск» и «Угадали»');
    var heard = {
      'холодильник': 'это же холодильником',
      'железная дорога': 'по железной дороге',
      'кошка': 'кошку'
    }[word];
    t.equal(page.eval('hatScreen.hear("ну, это просто разговор")', 0).length, 0, 'посторонняя фраза не засчитана');
    var results = page.eval('hatScreen.hear(' + JSON.stringify(heard) + ')', 300);
    t.equal(results.length, 1, 'зачёт на слух');
    t.equal(results[0].result, 'guessed', 'исход');
    t.ok(page.count('#undo') === 1, 'крупная «Отмена» видна');
    page.click('#undo');
    t.wait(300);
    t.equal(page.eval('hatScreen.results()', 0)[0].result, 'undone', 'после «Отмены»');
    t.ok(page.eval('hatScreen.state.game.hat.length', 0) === 3, 'слово вернулось в шляпу');
  } finally {
    page.eval('hatScreen.endTest()', 400);
  }
};
