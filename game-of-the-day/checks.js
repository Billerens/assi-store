// Checks of «Игра дня» on the phone (module_check). They do not start the agent (that costs money
// and 40 minutes): a game of the day is a copy of the hub's template in a folder of a day long past.
// What they add they remove; the log, the taste, the catalog, the plays and the settings are put back.
var assi = require('lib/assi');
var files = assi.files;
var HOME = 'modules/game-of-the-day';
var HUB = 'modules/games';
var TEMPLATE = HUB + '/engine/template';
var KEPT = [
  'data/games/daily/log.json', 'data/games/daily/taste.json', 'data/games/daily/taste-week.json', 'data/games/daily/state.json',
  'data/games/daily/journal.json', 'data/games/daily/settings.json', 'data/games/catalog.json', 'data/games/links/plays.json',
  'data/games/achievements-outbox.json'
];
var DATES = ['2001-01-01', '2001-01-02', '2001-01-03'];

function main() {
  return require(HOME + '/main.js');
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

function folders(dir) {
  try {
    return files.list(dir).map(String).filter(function (name) { return /\/$/.test(name); }).map(function (name) { return name.slice(0, -1); });
  } catch (error) {
    return [];
  }
}

function dropSaves(id) {
  try {
    assi.db('games').exec('delete from saves where game = ?', [id]);
  } catch (error) { /* no table */ }
}

/** Runs fn with the module's data put back afterwards; games made or kept by it go away. */
function sandbox(fn) {
  var saved = KEPT.map(snapshot);
  var before = folders(HUB);
  try {
    main().saveSettings({ criticRatings: 1000, collectorKept: 500 });   // a check never grants an achievement
    return fn();
  } finally {
    var log = [];
    try {
      log = JSON.parse(files.read('data/games/daily/log.json'));
    } catch (error) {
      log = [];
    }
    var base = require('lib/base');
    log.forEach(function (entry) {
      if (DATES.indexOf(entry.date) >= 0 && entry.baseId) {
        try { base.remove(entry.baseId); } catch (error) { /* gone */ }
      }
    });
    folders(HUB).forEach(function (id) {
      if (before.indexOf(id) < 0) {
        files.remove(HUB + '/' + id);
        dropSaves(id);
      }
    });
    DATES.forEach(function (date) {
      if (files.exists(HUB + '/daily/' + date)) files.remove(HUB + '/daily/' + date);
      dropSaves('daily/' + date);
    });
    KEPT.forEach(function (path, i) { restore(path, saved[i]); });
  }
}

/** Every file under a folder. */
function listFiles(dir, out) {
  out = out || [];
  files.list(dir).forEach(function (name) {
    name = String(name);
    if (/\/$/.test(name)) listFiles(dir + '/' + name.slice(0, -1), out);
    else out.push(dir + '/' + name);
  });
  return out;
}

/** The hub's template copied as the game of a day (what the agent would start from). */
function templateDay(date) {
  var to = HUB + '/daily/' + date;
  listFiles(TEMPLATE).forEach(function (path) { files.write(to + path.slice(TEMPLATE.length), files.read(path)); });
  return to;
}

function hub(t) {
  if (!files.exists(HUB + '/main.js') || !files.exists(TEMPLATE + '/game.json')) t.skip('нет Игротеки с шаблоном игры (modules/games/engine/template)');
}

exports['вкус, направление и имя игры считаются в движке'] = function (t) {
  var days = require(HOME + '/days.js');
  var taste = require(HOME + '/taste.js');
  var slug = require(HOME + '/slug.js');
  var prompts = require(HOME + '/prompt.js');
  var seed = days.seedOf('2026-11-14');
  t.equal(days.rng(seed)(), days.rng(seed)(), 'зерно дня повторяемо');
  t.ok(days.rng(seed)() >= 0 && days.rng(seed)() < 1);
  var now = days.dayStart('2026-11-14') + 7 * 3600000;
  var log = [
    { date: '2026-11-13', made: true, title: 'Бит', tags: { genre: 'rhythm' }, rating: 1, genrePreference: 'dislike' },
    { date: '2026-11-12', made: true, title: 'Отражатель', tags: { genre: 'puzzle' }, rating: 5, reasons: ['залип'] }
  ];
  var table = taste.compute(log, now, 0.95);
  t.equal(table.genre.rhythm, { score: 1, n: 1 });
  var way = taste.direction(log, '2026-11-14', { explore: 0, decay: 0.95, dislikedTo: 2.5, newDays: 30 });
  t.equal(way.mode, 'exploit');
  t.equal(way.base.title, 'Отражатель');
  t.equal(slug.slugFor('Отражатель лучей', '2026-11-14', []), 'otrazhatel-luchey');
  t.equal(prompts.parseResult('```json\n{"title": "Шары", "genre": "sort"}\n```').title, 'Шары');
};

exports['задание агенту собирается: папка дня, срок, правила, крючок оценки'] = function (t) {
  var text = main().task('2026-11-14');
  t.ok(/modules\/games\/daily\/2026-11-14\//.test(text), 'нет папки дня');
  t.ok(/Срок — \d+ минут/.test(text), 'нет срока');
  t.ok(text.indexOf('/modules/game-of-the-day/ui/rate.js') >= 0, 'нет крючка оценки');
  t.ok(text.indexOf(files.exists(HUB + '/AGENT.md') ? 'по modules/games/AGENT.md' : 'engine/template/') >= 0, 'нет ссылки на то, как делать игру');
  t.ok(!/\{\{/.test(text), 'не всё подставлено');
};

exports['игра дня из шаблона: проверка папки, оценка, «Оставить» с сохранением, перевод во «Все игры»'] = function (t) {
  hub(t);
  sandbox(function () {
    var date = DATES[0];
    templateDay(date);
    var reg = main().register(date, { title: 'Проверка игры дня', pitch: 'шаблон Игротеки', tags: { genre: 'idle', controls: 'tap', session: '2m' } });
    t.ok(reg.ok, 'папка не прошла проверку: ' + JSON.stringify(reg.problems || []));
    var dir = HUB + '/daily/' + date;
    t.equal(JSON.parse(files.read(dir + '/game.json')).status, 'daily');
    t.ok(files.read(dir + '/ui/index.html').indexOf('/modules/game-of-the-day/ui/rate.js') >= 0, 'крючка оценки нет');
    var games = require(HUB + '/main.js');
    var state = JSON.stringify({ ver: 1, card: 'проверка' });
    var saved = games.save('daily/' + date, 1, state, 'auto');
    t.ok(saved.ok, 'движок Игротеки не сохранил игру дня: ' + JSON.stringify(saved));
    var rated = main().rate(date, { stars: 5, reasons: ['залип'], voice: 'проверка' });
    t.equal(rated.rating, 5);
    var kept = main().keep(date);
    t.ok(kept.ok && /^proverka-igry-dnya/.test(kept.id), 'имя: ' + kept.id);
    t.ok(!files.exists(dir), 'папка дня осталась');
    var g = JSON.parse(files.read(HUB + '/' + kept.id + '/game.json'));
    t.equal(g.status, 'trial');
    t.equal(g.origin, { from: 'game-of-the-day', date: date, rating: 5 });
    t.ok(files.read(HUB + '/' + kept.id + '/ui/index.html').indexOf('rate.js') < 0, 'крючок не снят');
    var rows = assi.db('games').query('select count(*) as n from saves where game = ?', [kept.id]);
    t.equal(Number(rows[0].n), 1, 'сохранение не перешло под новый id');
    var listed = games.catalog().games.filter(function (one) { return one.id === kept.id; })[0];
    t.ok(listed && listed.trial, 'нет в «На пробу»');
    // Three different days of play: «Все игры».
    var plays = files.exists('data/games/links/plays.json') ? JSON.parse(files.read('data/games/links/plays.json')) : [];
    var day = 86400000;
    var keptAt = Date.now();
    [1, 2, 3].forEach(function (n) { plays.push({ game: kept.id, from: keptAt + n * day, to: keptAt + n * day + 60000 }); });
    files.write('data/games/links/plays.json', JSON.stringify(plays));
    t.equal(main().promote(), [kept.id]);
    t.equal(JSON.parse(files.read(HUB + '/' + kept.id + '/game.json')).status, 'active');
    try { assi.notify.cancel('daily-game-root-' + kept.id); } catch (error) { /* none */ }
  });
};

exports['без оценки старая игра убирается вместе с сохранениями'] = function (t) {
  hub(t);
  sandbox(function () {
    var date = DATES[1];
    templateDay(date);
    t.ok(main().register(date, {}).ok);
    require(HUB + '/main.js').save('daily/' + date, 1, JSON.stringify({ ver: 1 }), 'auto');
    var out = main().sweep();
    t.ok(out.removed.indexOf(date) >= 0, 'не убрана: ' + JSON.stringify(out));
    t.ok(!files.exists(HUB + '/daily/' + date), 'папка осталась');
    t.equal(Number(assi.db('games').query('select count(*) as n from saves where game = ?', ['daily/' + date])[0].n), 0);
  });
};

exports['лист оценки появляется при выходе из игры дня'] = function (t) {
  hub(t);
  sandbox(function () {
    var date = DATES[2];
    templateDay(date);
    t.ok(main().register(date, { title: 'Проверка листа' }).ok);
    main().saveSettings({ rateAfterSec: 5, criticRatings: 1000, collectorKept: 500 });
    var page = t.screen(HUB + '/daily/' + date + '/ui/index.html');
    t.wait(5600);
    page.click('#g-exit');
    t.wait(900);
    t.equal(page.count('.gotd-star'), 5, 'нет пяти звёзд');
    t.ok(page.count('.gotd-chips .chip') === 8, 'нет чипов причин');
    t.ok(/Оставить в Игротеке/.test(page.text('.gotd-actions') || ''), 'нет кнопок');
    page.eval('document.querySelectorAll(".sheet-back").forEach(function (n) { n.remove(); }); window.assi.back(); true', 0);
  });
};

exports['настройки держатся в пределах'] = function (t) {
  sandbox(function () {
    var view = main().saveSettings({ keepDays: 999, makeAt: '25:99', readyBy: '07:45', explore: 7 });
    var get = function (key) { return view.filter(function (row) { return row.key === key; })[0].value; };
    t.equal(get('keepDays'), 30);
    t.equal(get('slots'), [{ make: '06:00', ready: '07:45' }]);
    t.ok(main().scheduleView().text.indexOf('07:45') >= 0, 'расписание словами не то');
    t.equal(get('explore'), 1);
    t.throws(function () { main().saveSettings({ nonsense: 1 }); }, 'неизвестная настройка принята');
  });
  main().start();
};

exports['оболочка: агент, расход, уведомления'] = function (t) {
  main().installAgent();
  t.ok(files.exists('agents/gamesmith/agent.json') && files.exists('agents/gamesmith/system.md'), 'агент не поставлен');
  var usage = native('usage.summary', 1);
  t.ok(usage && Array.isArray(usage.days), 'usage.summary не отвечает');
  var features = [];
  try { features = native('shell.features') || []; } catch (error) { features = []; }
  if (features.indexOf('job.once') < 0) t.skip('оболочка без job.once — без сети повтор идёт по расписанию «каждые 30 минут»');
  if (features.indexOf('notify.actions') < 0) t.skip('оболочка без notify.actions — «Обсудить с агентом» только на экране');
};

exports['экран и карточка открываются'] = function (t) {
  var page = t.screen(HOME + '/ui/index.html');
  t.wait(800);
  t.equal(page.text('h1'), 'Игра дня');
  t.ok(page.count('#todayBox .card') === 1, 'нет карточки дня');
  t.ok(page.count('.btn') >= 2, 'нет кнопок');
  var card = t.screen(HOME + '/ui/card.html');
  t.wait(500);
  t.ok(/Игра дня/.test(card.text('.gc-head') || ''), 'карточка главного экрана пуста');
  page.eval('window.assi.back(); true', 0);
};
