// Checks of «Приключение» and of the shared «Голосовой движок историй» on the phone (module_check).
// They neither speak nor listen: the voice loop is exercised through its driver. What they add to
// data/stories/ they remove; the index, the counters, the journal and the settings are put back.
var assi = require('lib/assi');
var files = assi.files;
var MAIN = 'modules/voice-adventure/main.js';
var ENGINE = 'modules/voice-adventure/story-engine/';
var KEPT = [
  'data/stories/quest/index.json', 'data/stories/quest/index.prev.json', 'data/stories/quest/stats.json',
  'data/stories/quest/log.json', 'data/stories/settings.json'
];

function main() {
  return require(MAIN);
}

function engine(name) {
  return require(ENGINE + name + '.js');
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
  var made = [];
  try {
    return fn(made);
  } finally {
    made.forEach(function (id) {
      try { engine('store').removeDir('data/stories/quest/' + id); } catch (error) { /* already gone */ }
    });
    KEPT.forEach(function (path, i) { restore(path, saved[i]); });
  }
}

function demoWorld(room, inventory) {
  var chapter = engine('chapter').tidy(files.readJson('modules/voice-adventure/content/demo.json', {}).chapter);
  var quest = engine('quest');
  var state = quest.create(chapter, { plot: 'checks' });
  state.room = room;
  state.inventory = inventory || [];
  return { chapter: chapter, state: state, world: quest.world(chapter, state) };
}

exports['разбор фраз работает в движке'] = function (t) {
  var parse = engine('parse');
  var boat = demoWorld('boathouse', ['key']);
  var hall = demoWorld('hall', ['oil', 'lantern']);
  var cases = [
    ['возьми фонарь', boat, 'take', 'lantern'],
    ['подбери ножик', boat, 'take', 'knife'],
    ['иди на запад', boat, 'go', null],
    ['осмотри сеть', boat, 'look', 'net'],
    ['разрежь сеть ножом', boat, 'use', null],
    ['иди наверх', hall, 'go', null],
    ['смажь замок маслом', hall, 'use', null],
    ['положи маслёнку', hall, 'drop', 'oil'],
    ['возьми спичьки', hall, 'take', 'matches'],
    ['посмотри на цепь', hall, 'look', 'chain']
  ];
  var misses = cases.filter(function (row) {
    var got = parse.parse(row[0], row[1].world);
    return got.verb !== row[2] || (row[3] && got.object !== row[3]);
  }).map(function (row) { return row[0]; });
  t.equal(misses, [], 'не понято');
  t.equal(parse.service('что у меня'), 'inventory');
  t.ok(parse.parse('какая сегодня погода в городе', boat.world).unknown, 'непонятное не помечено');
};

exports['проверка главы ловит нерешаемую главу'] = function (t) {
  var chapter = engine('chapter');
  var demo = files.readJson('modules/voice-adventure/content/demo.json', {});
  t.equal(chapter.validate(demo.chapter, require('modules/voice-adventure/schema.js').chapterLimits(main().settings())), [], 'готовая глава');
  var broken = JSON.parse(JSON.stringify(demo.chapter));
  broken.puzzles[0].room = 'hall';
  broken.rooms.island = { name: 'Остров', text: 'Остров без дороги.', exits: {}, items: [] };
  var errors = chapter.validate(broken, {});
  t.ok(errors.some(function (e) { return /недостижима/.test(e); }), 'недостижимая комната: ' + errors.join('; '));
  t.ok(errors.some(function (e) { return /ключ/.test(e); }), 'ключ за замком: ' + errors.join('; '));
};

exports['готовая глава проходится голосом до конца (через водителя цикла)'] = function (t) {
  sandbox(function (made) {
    var out = main().newAdventure({ genre: 'demo', quiet: true });
    made.push(out.plot);
    t.ok(out.ok && out.ready, 'готовая глава не создалась');
    var d = main().driver(out.plot, { quiet: true });
    var first = d.begin();
    t.ok(/Глава 1/.test(first.text) && first.listen, 'начало: ' + first.text);
    var steps = [
      'иди на север', 'зайди внутрь', 'иди на юг', 'иди на восток', 'возьми фонарь', 'возьми нож', 'разрежь сеть ножом', 'иди на запад', 'иди на север',
      'открой дверь ключом', 'зайди внутрь', 'иди наверх', 'возьми спички', 'спустись вниз', 'возьми маслёнку',
      'поднимись наверх', 'смажь замок маслом', 'иди наверх'
    ];
    steps.forEach(function (text) { d.answer(text, null); });
    var inv = d.answer('что у меня', 'inventory');
    t.ok(/спички/.test(inv.text), 'инвентарь: ' + inv.text);
    d.save();
    // The app is killed here: a new driver continues from the same room with the same things.
    var again = main().driver(out.plot, { quiet: true });
    var back = again.begin();
    t.ok(/Продолжаем|В прошлый раз/.test(back.text), 'продолжение: ' + back.text);
    t.equal(again.info().room, d.info().room, 'комната после перезапуска');
    t.equal(again.info().inventory, d.info().inventory, 'вещи после перезапуска');
    var last = again.answer('зажги лампу спичками', null);
    t.ok(/Маяк снова светит/.test(last.text), 'развязка: ' + last.text);
    t.ok(/Глава 1 пройдена/.test(last.text), 'нет конца главы: ' + last.text);
    t.ok(last.end, 'без второй главы игра должна закончиться');
    var plot = main().status().plots.filter(function (p) { return p.id === out.plot; })[0];
    t.ok(plot && plot.done, 'глава не отмечена пройденной');
  });
};

exports['сохранение переживает испорченный файл'] = function (t) {
  var store = engine('store');
  var dir = 'data/stories/checks-store';
  try {
    store.saveState(dir, { story: 'quest', turn: 1 });
    store.saveState(dir, { story: 'quest', turn: 2 });
    t.equal(store.loadState(dir).turn, 2);
    files.write(dir + '/state.json', '{"story": "quest", "tu');
    t.equal(store.loadState(dir).turn, 1, 'нет отката на state.prev.json');
  } finally {
    store.removeDir(dir);
  }
  t.ok(!files.exists(dir), 'папка проверки не удалена');
};

exports['настройки держатся в пределах'] = function (t) {
  sandbox(function () {
    var view = main().saveSettings({ listenSec: 999, 'voice.mode': 'local' });
    var get = function (key) { return view.filter(function (row) { return row.key === key; })[0].value; };
    t.equal(get('listenSec'), 60);
    t.equal(get('voice.mode'), 'local');
    t.throws(function () { main().saveSettings({ nonsense: 1 }); }, 'неизвестная настройка принята');
  });
};

exports['запись проигрывается плеером движка'] = function (t) {
  var wav = engine('wav');
  var audio = engine('audio');
  var store = engine('store');
  var dir = 'data/stories/checks-audio';
  try {
    var rate = 8000;
    var samples = rate / 4;
    var header = wav.header(samples * 2, rate, 1, 16);
    var bytes = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, header.length + samples * 2);
    for (var i = 0; i < header.length; i++) bytes[i] = header[i] > 127 ? header[i] - 256 : header[i];
    var target = store.file(dir + '/audio/c1-room-test.wav');
    target.getParentFile().mkdirs();
    var stream = new java.io.FileOutputStream(target);
    try {
      stream.write(bytes);
    } finally {
      stream.close();
    }
    t.equal(audio.find(dir, 'c1-room-test'), dir + '/audio/c1-room-test.wav');
    var parts = engine('lines').segments('Вы входите. Тихая комната.', audio.known(dir, [{ node: 'c1-room-test', text: 'Тихая комната.' }]));
    t.equal(parts.length, 2, 'реплика не разделилась на голос и запись');
    var started = Date.now();
    var result = audio.play(dir + '/audio/c1-room-test.wav', { pollMs: 50, volume: 0 });
    t.equal(result, 'done', 'плеер');
    t.ok(Date.now() - started < 5000, 'проигрывание заняло слишком долго');
  } finally {
    store.removeDir(dir);
  }
};

exports['оболочка: голос, распознавание, возможности'] = function (t) {
  var phone = engine('phone');
  var features = phone.features();
  t.ok(Array.isArray(features), 'shell.features');
  var state = engine('voice').state('quest');
  t.ok(state && typeof state.running === 'boolean', 'состояние цикла');
  t.equal(engine('voice').command('checks-nothing', 'talk'), false, 'команда без сессии должна вернуть false');
  if (!phone.speech().ready) t.skip('распознавание речи на телефоне не скачано — игра голосом не пойдёт');
};

exports['карточка Игротеки и виджет'] = function (t) {
  var card = main().card();
  t.equal(card.title, 'Приключение');
  t.equal(card.open, 'modules/voice-adventure/ui/index.html');
  t.ok(typeof card.card === 'string' && card.card.length > 0, 'нет строки карточки');
  var widget = main().widget();
  t.ok(widget.text && widget.open, 'виджет');
};

exports['экран открывается'] = function (t) {
  var page = t.screen('modules/voice-adventure/ui/index.html');
  t.wait(800);
  t.ok(page.count('#genres .chip') >= 4, 'нет выбора жанра');
  t.ok(page.count('#talk') === 1, 'нет кнопки «Говорить»');
  page.click('#genres .chip:nth-child(4)');
  t.wait(200);
  t.ok(page.eval('!document.getElementById("customField").hidden', 0), 'поле «своё» не появилось');
};
