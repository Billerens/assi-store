// The adventure itself (main.js, prompt.js, stock.js, schema.js) under node, the phone replaced by
// tests/engine-stub.js: node tests/adventure.test.js
var assert = require('assert');
var path = require('path');
var ROOT = path.join(__dirname, '..');
// «Жизнь-RPG» as the adventure sees it (present only when the test puts modules/rpg/main.js).
var rpgFake = {
  level: 12,
  status: function () { return { level: rpgFake.level, week: { locations: ['Дом'] } }; },
  map: function () {
    return { locations: [
      { name: 'Дом', visits: 90, hidden: true }, { name: 'Пристань', visits: 3 }, { name: 'Старый парк', visits: 7 },
      { name: 'Работа', visits: 50, hidden: true }
    ] };
  }
};
var env = require('./engine-stub.js').install({ mounts: { 'modules/voice-adventure': ROOT }, fakes: { 'modules/rpg/main.js': rpgFake } });
var prompts = require(path.join(ROOT, 'prompt.js'));
var stock = require(path.join(ROOT, 'stock.js'));
var schema = require(path.join(ROOT, 'schema.js'));
var settingsLib = require(path.join(ROOT, 'story-engine', 'settings.js'));
var demo = require(path.join(ROOT, 'content', 'demo.json'));
var main = env.require('modules/voice-adventure/main.js');

var failed = 0;
var passed = 0;
function test(name, fn) {
  env.reset();
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + (error && error.stack || error));
  }
}

/** A chapter the "model" writes: the demo chapter under another number, wrapped as the prompt asks. */
function written(n, extra) {
  var chapter = JSON.parse(JSON.stringify(demo.chapter));
  chapter.chapter = n;
  chapter.title = 'Глава номер ' + n;
  return JSON.stringify(Object.assign({
    plotTitle: 'Соль и туман', summary: 'Пересказ главы ' + n + '.',
    bible: { world: 'Побережье', heroes: ['смотритель'], threads: ['кто погасил маяк'], places: ['маяк'], tone: 'тихо' },
    chapter: chapter
  }, extra || {}));
}

var WALK = ['иди на север', 'зайди внутрь', 'иди на юг', 'иди на восток', 'возьми фонарь', 'возьми нож', 'разрежь сеть ножом',
  'иди на запад', 'иди на север', 'открой дверь ключом', 'зайди внутрь', 'иди наверх', 'возьми спички', 'спустись вниз',
  'возьми маслёнку', 'поднимись наверх', 'смажь замок маслом', 'иди наверх'];

function walk(d) {
  WALK.forEach(function (text) { d.answer(text, null); });
  return d.answer('зажги лампу спичками', null);
}

// ---- pure parts -----------------------------------------------------------------------------------

test('ответ модели: JSON из обёртки, свободный ответ для слуха', function () {
  assert.deepStrictEqual(prompts.parseJson('Вот глава:\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.throws(function () { prompts.parseJson('без json'); });
  var said = prompts.cleanFree('**Рассказчик:** На стене *выцарапано* слово «ждите». ✨\n- второе', 280);
  assert.ok(!/[*✨]/.test(said), said);
  assert.ok(/ждите/.test(said));
  assert.ok(prompts.cleanFree(new Array(80).join('Очень длинная фраза. '), 100).length <= 101);
});

test('промпт главы: библия, три последних пересказа, пределы из настроек', function () {
  var template = require('fs').readFileSync(path.join(ROOT, 'prompts', 'chapter.md'), 'utf8');
  var s = settingsLib.values(schema.SCHEMA, { 'rooms.min': 9, 'rooms.max': 7 });
  var text = prompts.chapterPrompt(template, {
    plotTitle: 'Соль и туман', genre: 'морская тайна', number: 5,
    bible: { world: 'Побережье', heroes: ['смотритель'], threads: ['огонь'] },
    summaries: [1, 2, 3, 4].map(function (n) { return { chapter: n, summary: 'было ' + n }; })
  }, schema.promptSettings(s));
  assert.ok(/Напиши главу 5/.test(text));
  assert.ok(/Мир: Побережье/.test(text));
  assert.ok(!/было 1/.test(text) && /было 2/.test(text) && /было 4/.test(text), 'пересказов не три последних');
  assert.ok(/7–9 комнат/.test(text), 'min и max не упорядочены');
  assert.ok(!/\{\{/.test(text), 'остались пустые места шаблона');
});

test('материал из Жизни-RPG в промпте: уровень и места; без него — пустая строка', function () {
  var template = require('fs').readFileSync(path.join(ROOT, 'prompts', 'chapter.md'), 'utf8');
  var s = schema.promptSettings(settingsLib.values(schema.SCHEMA, {}));
  var input = { plotTitle: 'Соль', genre: 'тайна', number: 2, bible: {}, summaries: [] };
  var plain = prompts.chapterPrompt(template, input, s);
  assert.ok(!/Жизни-RPG|жизни слушателя/.test(plain), 'без RPG нет ни слова о ней');
  var rich = prompts.chapterPrompt(template, Object.assign({ life: { level: 12, places: ['Пристань'] } }, input), s);
  assert.ok(/уровень героя слушателя в его «Жизни-RPG»: 12/i.test(rich), rich);
  assert.ok(/Пристань/.test(rich));
  assert.ok(!/\{\{/.test(rich));
  assert.strictEqual(prompts.lifeText({ level: 1, places: [] }), '');
});

function lifePrompt() {
  env.models['stories.write'] = { ok: true, local: false, why: '' };
  var asked = [];
  env.ai = function (role, body) {
    asked.push(body.messages[1].content);
    return written(1);
  };
  var plot = main.newAdventure({ genre: 'house' }).plot;
  env.spawned = [];
  main.writeChapter(plot, 1);
  return asked[0];
}

test('Жизнь-RPG есть: уровень и места без дома и работы — в задании главы', function () {
  env.files['modules/rpg/main.js'] = '// rpg';
  var ask = lifePrompt();
  assert.ok(/«Жизни-RPG»: 12/.test(ask), ask);
  assert.ok(/Старый парк; Пристань/.test(ask), 'места по числу визитов');
  assert.ok(!/Дом|Работа/.test(ask), 'дом и работа не уходят модели');
});

test('Жизнь-RPG есть, но настройка выключена или мест ноль — нет уровня и мест', function () {
  env.files['modules/rpg/main.js'] = '// rpg';
  main.saveSettings({ 'life.rpg': false });
  assert.ok(!/Жизни-RPG|Пристань/.test(lifePrompt()));
  main.saveSettings({ 'life.rpg': true, 'life.places': 0 });
  var ask = lifePrompt();
  assert.ok(/«Жизни-RPG»: 12/.test(ask) && !/Пристань/.test(ask), ask);
});

test('Жизни-RPG нет или она падает — глава пишется как раньше', function () {
  assert.ok(!/Жизни-RPG/.test(lifePrompt()));
  env.files['modules/rpg/main.js'] = '// rpg';
  var status = rpgFake.status;
  rpgFake.status = function () { throw new Error('сломано'); };
  try {
    assert.ok(!/Жизни-RPG/.test(lifePrompt()));
  } finally {
    rpgFake.status = status;
  }
});

test('понимание фразы моделью на телефоне сводится к миру', function () {
  var world = { items: [{ id: 'lamp', forms: ['лампа'] }], exits: [{ dir: 'север' }], puzzles: [{ id: 'valve', verb: 'повернуть' }] };
  var verbs = ['go', 'look', 'take', 'use'];
  assert.deepStrictEqual(prompts.fromModel({ verb: 'take', object: 'lamp' }, world, verbs).object, 'lamp');
  assert.strictEqual(prompts.fromModel({ verb: 'take', object: 'sword' }, world, verbs).object, null);
  assert.strictEqual(prompts.fromModel({ verb: 'go', dir: 'юг' }, world, verbs), null);
  assert.strictEqual(prompts.fromModel({ verb: 'fly' }, world, verbs), null);
  assert.strictEqual(prompts.fromModel({ verb: 'use', puzzle: 'valve' }, world, verbs).puzzle, 'valve');
  assert.ok(/Предметы: lamp/.test(prompts.understandPrompt('возьми', world, verbs)));
});

test('запас глав: что писать и сколько готово впереди', function () {
  assert.deepStrictEqual(stock.missing(0, 1, false, 2), [1, 2, 3]);
  assert.deepStrictEqual(stock.missing(3, 1, false, 2), []);
  assert.deepStrictEqual(stock.missing(3, 2, true, 2), [4, 5]);
  assert.deepStrictEqual(stock.missing(1, 1, false, 0), []);
  assert.strictEqual(stock.readyAhead(3, 1, false), 2);
  assert.strictEqual(stock.readyAhead(1, 1, true), -1);
  assert.strictEqual(stock.plotId(new Date(2026, 10, 14, 8, 5).getTime()), 'p20261114-0805');
  assert.strictEqual(stock.cardLine(3, 'Затопленная обсерватория'), 'Глава 3 · Затопленная обсерватория');
});

test('ачивки «Пять глав» и «Без подсказок»', function () {
  var got = stock.achievements({ chaptersDone: 5, lastChapterDone: true, lastChapterHints: 0 }, []);
  assert.deepStrictEqual(got.map(function (a) { return a.key; }), ['stories/quest/five-chapters', 'stories/quest/no-hints']);
  assert.deepStrictEqual(stock.achievements({ chaptersDone: 6, lastChapterDone: true, lastChapterHints: 2 }, ['stories/quest/five-chapters']), []);
});

test('настройки цикла и главы из схемы', function () {
  var s = settingsLib.values(schema.SCHEMA, { listenSec: 3, 'voice.pushToTalk': 'always' });
  assert.strictEqual(s.listenSec, 4);
  var voice = schema.voiceOptions(s);
  assert.strictEqual(voice.pushToTalk, 'always');
  assert.strictEqual(voice.doubleMs, 400);
  Object.keys(voice).forEach(function (key) { assert.ok(voice[key] !== undefined, 'нет ' + key); });
  var limits = schema.chapterLimits(s);
  assert.strictEqual(limits.hints, 3);
  assert.strictEqual(limits.maxTextChars, 400);
  Object.keys(schema.SCHEMA).forEach(function (key) {
    var spec = schema.SCHEMA[key];
    assert.ok(spec.title && spec.group, 'у настройки ' + key + ' нет названия или группы');
    if (typeof spec.value === 'number') assert.ok(spec.min !== undefined && spec.max !== undefined, 'у ' + key + ' нет пределов');
  });
});

// ---- main.js -----------------------------------------------------------------------------------------

test('готовая глава без сети: начать, пройти, отметить, записать', function () {
  env.online = false;
  var out = main.newAdventure({ genre: 'demo' });
  assert.ok(out.ok && out.ready, JSON.stringify(out));
  assert.strictEqual(env.spawned.length, 0, 'без сети ничего не должно писаться');
  var status = main.status();
  assert.strictEqual(status.current.title, 'Маяк на Сухой косе');
  assert.ok(status.current.ready);
  var played = main.play();
  assert.ok(played.ok, JSON.stringify(played));
  var d = env.voiceRuns[0].driver;
  assert.strictEqual(env.voiceRuns[0].options.listenSec, 12);
  var first = d.begin();
  assert.ok(/Говорите, когда рассказчик замолчит/.test(first.text), 'нет вступления в первый раз');
  assert.ok(/Глава 1\. /.test(first.text));
  var last = walk(d);
  assert.ok(/Маяк снова светит/.test(last.text), last.text);
  assert.ok(last.end, 'второй главы нет — сессия должна закончиться');
  assert.ok(/пишется/.test(last.text));
  d.save();
  d.end('done', 21);
  var plot = main.status().current;
  assert.ok(plot.done);
  assert.strictEqual(plot.chaptersDone, 1);
  var play = env.base.filter(function (r) { return r.kind === 'play'; });
  assert.strictEqual(play.length, 1);
  assert.strictEqual(play[0].amount, 21);
  assert.strictEqual(play[0].source, 'stories');
  assert.strictEqual(play[0].data.game, 'voice-adventure');
  var again = main.play();
  assert.ok(!again.ok && /пишется/.test(again.why), JSON.stringify(again));
});

test('служебные слова, подсказки, непонятное', function () {
  env.online = false;
  main.newAdventure({ genre: 'demo' });
  main.play();
  var d = env.voiceRuns[0].driver;
  d.begin();
  assert.ok(/Вы здесь/.test(d.answer('где я', 'where').text));
  assert.strictEqual(d.answer('что у меня', 'inventory').text, 'Руки пусты.');
  var h1 = d.answer('подсказка', 'hint').text;
  var h2 = d.answer('подсказка', 'hint').text;
  assert.notStrictEqual(h1, h2, 'вторая подсказка должна быть прямее первой');
  assert.strictEqual(d.info().hints, 2);
  var lost = d.answer('какая сегодня погода в городе', null);
  assert.ok(/Не понял/.test(lost.text) && lost.noRepeat, lost.text);
  assert.ok(/Не расслышал/.test(d.answer('   ', null).text));
});

test('модель на телефоне понимает непонятое и отвечает о том, чего нет в мире', function () {
  env.online = false;
  env.models['stories.local'] = { ok: true, local: true, why: '' };
  main.newAdventure({ genre: 'demo' });
  main.play();
  var d = env.voiceRuns[0].driver;
  d.begin();
  var asked = [];
  env.ai = function (role, body) {
    asked.push(role);
    var text = body.messages[body.messages.length - 1].content;
    if (/Ответь только JSON/.test(text)) return '{"verb": "go", "dir": "север"}';
    return 'На камнях кто-то нацарапал якорь.';
  };
  var moved = d.answer('топай к дому смотрителя', null);
  assert.ok(asked.indexOf('stories.local') >= 0, 'модель не спрошена');
  assert.strictEqual(d.info().room !== '' && d.info().room, demo.chapter.rooms.porch.name, moved.text);
  var free = d.answer('что нацарапано на камнях', null);
  assert.ok(/якорь/.test(free.text), free.text);
});

test('продолжение после перерыва — с пересказом', function () {
  env.online = false;
  main.newAdventure({ genre: 'demo' });
  main.play();
  var d = env.voiceRuns[0].driver;
  d.begin();
  d.answer('иди на восток', null);
  d.answer('возьми фонарь', null);
  env.now = Date.now() - 3 * 3600000;
  d.save();
  env.now = null;
  main.play();
  var back = env.voiceRuns[1].driver.begin();
  assert.ok(/В прошлый раз/.test(back.text) && /фонарь/.test(back.text), back.text);
  env.voiceRuns[1].driver.save();
  main.play();
  var soon = env.voiceRuns[2].driver.begin();
  assert.ok(/^Продолжаем/.test(soon.text), soon.text);
});

test('глава модели: исправление по списку ошибок, библия, пересказ, название', function () {
  env.models['stories.write'] = { ok: true, local: false, why: '' };
  var calls = [];
  env.ai = function (role, body) {
    calls.push(body.messages.length);
    assert.strictEqual(role, 'stories.write');
    if (calls.length === 1) {
      var broken = JSON.parse(written(1));
      broken.chapter.puzzles[0].hints = ['одна'];
      return JSON.stringify(broken);
    }
    assert.ok(/не прошла проверку/.test(body.messages[body.messages.length - 1].content));
    return written(1);
  };
  var out = main.newAdventure({ genre: 'house' });
  assert.ok(out.ok && out.writing, JSON.stringify(out));
  env.ai = (function (inner) {
    var n = 0;
    return function (role, body) {
      n++;
      if (n <= 2) return inner(role, body);
      var ask = body.messages[1].content;
      var number = Number(/Напиши главу (\d+)/.exec(ask)[1]);
      return written(number);
    };
  })(env.ai);
  env.runSpawned();
  var plot = main.status().current;
  assert.strictEqual(plot.written, 3, 'запас: глава и ещё две впереди');
  assert.strictEqual(plot.title, 'Соль и туман');
  assert.strictEqual(plot.ahead, 2);
  assert.strictEqual(calls[1], 4, 'исправление должно идти в той же беседе');
  var bible = JSON.parse(env.files['data/stories/quest/' + plot.id + '/bible.json']);
  assert.strictEqual(bible.world, 'Побережье');
  var summaries = JSON.parse(env.files['data/stories/quest/' + plot.id + '/summaries.json']);
  assert.deepStrictEqual(summaries.map(function (s) { return s.chapter; }), [1, 2, 3]);
  assert.ok(env.events.some(function (e) { return e.name === 'stories.quest' && e.data.phase === 'written' && e.data.chapter === 1; }));
  assert.ok(env.notices.some(function (n) { return /Глава 1 готова/.test(n.text); }), 'нет уведомления о готовой главе');
});

test('глава, которую не удалось исправить, не попадает в запас', function () {
  env.ai = function () {
    var broken = JSON.parse(written(1));
    broken.chapter.rooms.island = { name: 'Остров', text: 'Без дороги.', exits: {}, items: [] };
    return JSON.stringify(broken);
  };
  main.newAdventure({ genre: 'expedition' });
  env.runSpawned();
  var plot = main.status().current;
  assert.strictEqual(plot.written, 0);
  assert.ok(/не прошла проверку/.test(plot.lastError), plot.lastError);
  assert.ok(env.events.some(function (e) { return e.data && e.data.phase === 'failed'; }));
  // Right after a failure the network event does not try again (retryAfterMin).
  var asked = 0;
  env.ai = function () {
    asked++;
    throw new Error('не должно звать модель');
  };
  main.start();
  env.subscriptions['network:voice-adventure-network']({ online: true });
  env.runSpawned();
  assert.strictEqual(asked, 0, 'сразу после неудачи сеть снова позвала модель');
  // The button on the screen tries at once.
  main.refill('button');
  assert.strictEqual(asked, 1);
});

test('без сети новая глава ждёт сети, а сеть её пишет', function () {
  env.online = false;
  var out = main.newAdventure({ genre: 'maze-city' });
  assert.ok(!out.ok && /Маяк/.test(out.why), JSON.stringify(out));
  env.online = true;
  env.ai = function (role, body) {
    return written(Number(/Напиши главу (\d+)/.exec(body.messages[1].content)[1]));
  };
  main.start();
  assert.ok(env.jobs['stories:refill'] && env.jobs['stories:refill'].when.every === 180);
  env.subscriptions['network:voice-adventure-network']({ online: true });
  env.runSpawned();
  assert.strictEqual(main.status().current.written, 3);
});

test('между главами: «дальше» начинает следующую, ачивки уходят в ящик Игротеки', function () {
  env.online = false;
  main.newAdventure({ genre: 'demo' });
  var plot = main.status().current;
  var second = JSON.parse(written(2)).chapter;
  env.files['data/stories/quest/' + plot.id + '/ch2.json'] = JSON.stringify(second);
  env.files['data/stories/quest/stats.json'] = JSON.stringify({ chaptersDone: 4, sessions: 3, minutes: 50, granted: [] });
  main.play();
  var d = env.voiceRuns[0].driver;
  d.begin();
  var done = walk(d);
  assert.ok(/Начать следующую главу/.test(done.text) && !done.end, done.text);
  var box = JSON.parse(env.files['data/games/achievements-outbox.json']);
  var keys = box.map(function (item) { return item.key; });
  assert.ok(keys.indexOf('stories/quest/five-chapters') >= 0, keys.join(','));
  assert.ok(keys.indexOf('stories/quest/no-hints') >= 0, keys.join(','));
  assert.strictEqual(box[0].category, 'Игротека');
  var next = d.answer('дальше', 'resume');
  assert.ok(/Глава 2\. Глава номер 2/.test(next.text), next.text);
  assert.ok(/В прошлый раз|Смотритель|Вы|маяк/i.test(next.text));
  assert.strictEqual(main.status().current.chapter, 2);
  assert.strictEqual(main.status().current.done, false);
  var stats = JSON.parse(env.files['data/stories/quest/stats.json']);
  assert.deepStrictEqual(stats.granted.sort(), ['stories/quest/five-chapters', 'stories/quest/no-hints']);
});

test('запись голоса заранее: на Wi-Fi и зарядке, по узлам главы', function () {
  env.online = false;
  main.newAdventure({ genre: 'demo' });
  env.online = true;
  assert.ok(main.prerenderNow(false).skipped, 'выключено по умолчанию');
  main.saveSettings({ 'audio.prerender': true });
  env.charging = true;
  var out = main.prerenderNow(false);
  assert.ok(out.done > 8, JSON.stringify(out));
  assert.ok(env.rendered.every(function (r) { return /^c1-/.test(r.node); }));
  // A recorded text is played from its file within the line.
  main.play();
  var d = env.voiceRuns[0].driver;
  var first = d.begin();
  assert.ok(first.parts && first.parts.some(function (part) { return part.audio; }), JSON.stringify(first));
  main.saveSettings({ 'voice.mode': 'local' });
  main.play();
  assert.ok(!env.voiceRuns[1].driver.begin().parts, 'голос телефона — без записей');
});

test('настройки, удаление сюжета, карточка, виджет', function () {
  var view = main.saveSettings({ listenSec: 999, ahead: 1 });
  assert.strictEqual(view.filter(function (r) { return r.key === 'listenSec'; })[0].value, 60);
  assert.throws(function () { main.saveSettings({ nope: 1 }); });
  assert.deepStrictEqual(JSON.parse(env.files['data/stories/settings.json']), { listenSec: 60, ahead: 1 });
  assert.strictEqual(main.card().card, 'Новое приключение');
  env.online = false;
  var one = main.newAdventure({ genre: 'demo' }).plot;
  assert.ok(/Продолжить: Глава 1/.test(main.card().card), main.card().card);
  assert.ok(/Маяк/.test(main.widget().text));
  main.removePlot(one);
  assert.strictEqual(main.status().current, null);
  assert.ok(!Object.keys(env.files).some(function (key) { return key.indexOf('quest/' + one + '/') >= 0; }), 'файлы сюжета остались');
  assert.throws(function () { main.removePlot('../../etc'); });
});

console.log('adventure: прошло ' + passed + ', не прошло ' + failed);
if (failed) process.exit(1);
