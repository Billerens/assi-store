// The night series itself (main.js) under node, the phone replaced by voice-adventure's
// tests/engine-stub.js: node tests/series.test.js
var assert = require('assert');
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
var ADVENTURE = path.join(ROOT, '..', 'voice-adventure');
var env = require(path.join(ADVENTURE, 'tests', 'engine-stub.js')).install({
  mounts: { 'modules/voice-adventure': ADVENTURE, 'modules/bedtime-series': ROOT }
});
var sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'sample.json'), 'utf8'));
var fakeAssi = require('lib/assi');
var main = env.require('modules/bedtime-series/main.js');
var plan = env.require('modules/bedtime-series/plan.js');

var granted = {};
global.context = { checkSelfPermission: function (name) { return granted[String(name).replace('android.permission.', '')] ? 0 : -1; } };

var failed = 0;
var passed = 0;
function test(name, fn) {
  env.reset();
  granted = { RECORD_AUDIO: true };
  fakeAssi.rows = function () { return []; };
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + (error && error.stack || error));
  }
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function hhmm(time) {
  var d = new Date(time);
  return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}

/** The evening window around now, so that preparation is allowed. */
function eveningNow() {
  main.saveSettings({ prepareAt: hhmm(Date.now() - 3600000), remindAt: hhmm(Date.now() + 3600000) });
}

function json(key) {
  return JSON.parse(env.files[key]);
}

function index() {
  return json('data/series/index.json');
}

/** A season with `count` episodes already written (the sample, kept as a model's would be). */
function seasonWith(count) {
  var id = main.startSeason({ genre: 'city', tone: 'warm', minutes: 10, quiet: true }).season;
  for (var i = 0; i < count; i++) assert.ok(main.addEpisode(id, sample).ok);
  return id;
}

function lastState() {
  return json('data/series/state.json');
}

// ---- writing ------------------------------------------------------------------------------------------

test('новый сезон: первая серия пишется сразу, у серии в 15 минут свои пределы', function () {
  var asked = [];
  env.ai = function (role, body) {
    asked.push({ role: role, body: body });
    return '```json\n' + JSON.stringify(sample) + '\n```';
  };
  var out = main.startSeason({ genre: 'detective', tone: 'funny', minutes: 15 });
  assert.ok(out.ok && out.writing, JSON.stringify(out));
  assert.strictEqual(env.runSpawned() > 0, true);
  assert.strictEqual(asked.length, 3, 'задание и два исправления (fixTries)');
  assert.strictEqual(asked[0].role, 'series.write');
  assert.deepStrictEqual(asked[0].body.response_format, { type: 'json_object' });
  var prompt = asked[0].body.messages[1].content;
  assert.ok(/тихий детектив/.test(prompt) && /с юмором/.test(prompt) && /около 15 минут/.test(prompt), prompt.slice(0, 400));
  assert.ok(/это первая серия сезона/.test(prompt));
  assert.ok(new RegExp('от ' + Math.round(900 * 1.4) + ' до ' + Math.round(1600 * 1.4)).test(prompt), 'пределы длинной серии');
  var season = index().seasons[0];
  assert.strictEqual(season.written, 0, 'длинная серия: пример короче пределов и не принят');
  assert.ok(/короче/.test(season.lastError), season.lastError);
});

test('серия пишется, проверяется, исправляется по списку ошибок', function () {
  var calls = 0;
  var conversation = null;
  env.ai = function (role, body) {
    calls++;
    conversation = body.messages;
    if (calls === 1) {
      var bad = copy(sample);
      bad.scenes.s2a = 'Коротко.';
      return JSON.stringify(bad);
    }
    if (calls === 2) return 'Простите, вот исправленная серия без JSON.';
    return JSON.stringify(sample);
  };
  var id = main.startSeason({ genre: 'city', quiet: true }).season;
  var out = main.prepare('button', true);
  assert.strictEqual(out.written, 1, JSON.stringify(out));
  assert.strictEqual(calls, 3);
  assert.strictEqual(conversation.length, 6, 'одна беседа: задание, ответ, ошибки, ответ, ошибки');
  assert.ok(/s2a короче/.test(conversation[3].content), conversation[3].content);
  assert.ok(/не разобрался как JSON/.test(conversation[5].content));
  var season = index().seasons[0];
  assert.strictEqual(season.title, 'Город под мостами');
  assert.strictEqual(season.titleAuto, false);
  assert.strictEqual(season.titles['1'], 'Смотритель моста');
  assert.strictEqual(season.preparedOn, plan.dayOf(Date.now()));
  var ep = json('data/series/' + id + '/e1.json');
  assert.strictEqual(ep.number, 1);
  assert.strictEqual(ep.scenes.s1, sample.scenes.s1);
  var bible = json('data/series/' + id + '/bible.json');
  assert.ok(/Ночной город/.test(bible.world) && bible.characters.length === 3);
  assert.strictEqual(json('data/series/' + id + '/summaries.json')[0].episode, 1);
  assert.ok(env.events.some(function (e) { return e.name === 'series.state' && e.data.phase === 'written'; }));
  // Once a day.
  eveningNow();
  assert.ok(/уже написана/.test(main.prepare('job').skipped || ''));
});

test('детали дня: календарь и база — в промпт, лишние имена — нет', function () {
  granted.READ_CALENDAR = true;
  granted.READ_CONTACTS = true;
  var today = plan.midnight(Date.now());
  fakeAssi.rows = function (uri) {
    if (/calendar\/instances\/when\//.test(uri)) {
      assert.ok(uri.indexOf('/' + today + '/' + (today + 86400000)) > 0, uri);
      return [{ title: 'Обед с Петей и Мариной', begin: today + 15 * 3600000, end: today + 16 * 3600000, allDay: 0 }];
    }
    if (/contacts/.test(uri)) return [{ display_name: 'Марина Котова' }];
    return [];
  };
  env.base.push({ kind: 'trip', title: 'Поездка', amount: 34, unit: 'min', at: today + 9 * 3600000 });
  env.base.push({ kind: 'expense', title: 'Ресторан', amount: 5000, at: today + 14 * 3600000 });
  env.base.push({ kind: 'trip', title: 'Вчера', amount: 10, unit: 'min', at: today - 3600000 });
  main.saveSettings({ people: 'Петя' });
  var prompt = null;
  env.ai = function (role, body) {
    prompt = body.messages[1].content;
    var ep = copy(sample);
    ep.usedDetails = ['обед с Петей', 'поездка 34 мин'];
    return JSON.stringify(ep);
  };
  main.startSeason({ genre: 'sea', quiet: true });
  eveningNow();
  var out = main.prepare('job');
  assert.strictEqual(out.written, 1, JSON.stringify(out));
  assert.ok(/- в 15:00 — Обед с Петей и \[человек\]/.test(prompt), prompt);
  assert.ok(/- поездка 34 мин/.test(prompt));
  assert.ok(!/Марин|Ресторан|5000|поездка 10 мин/.test(prompt), 'лишнее ушло в промпт');
  var preview = main.preview();
  assert.strictEqual(preview.details.length, 2);
  assert.strictEqual(preview.removed, 1);
});

test('чужая деталь в серии — на исправление', function () {
  var calls = 0;
  var fix = '';
  env.ai = function (role, body) {
    calls++;
    if (calls === 2) fix = body.messages[3].content;
    var ep = copy(sample);
    if (calls === 1) ep.usedDetails = ['встреча в банке с управляющим'];
    return JSON.stringify(ep);
  };
  main.startSeason({ genre: 'sea', quiet: true });
  assert.strictEqual(main.prepare('button', true).written, 1);
  assert.strictEqual(calls, 2);
  assert.ok(/не из списка дня/.test(fix), fix);
});

test('без сети: повтор каждые 30 минут до напоминания, потом «Сегодня без новой серии»', function () {
  main.startSeason({ genre: 'city', quiet: true });
  eveningNow();
  env.online = false;
  var out = main.prepare('job');
  assert.strictEqual(out.skipped, 'нет сети');
  assert.ok(env.jobs['series:retry'] && env.jobs['series:retry'].when.once > Date.now(), 'нет разовой задачи повтора');
  env.features = env.features.filter(function (f) { return f !== 'job.once'; });
  main.prepare('retry');
  assert.deepStrictEqual(env.jobs['series:retry'].when, { every: 30 }, 'без job.once — повтор по расписанию');
  var note = main.remind();
  assert.strictEqual(note.text, 'Сегодня без новой серии: нет сети');
  var notice = env.notices[env.notices.length - 1];
  assert.strictEqual(notice.id, 'series-ready');
  assert.ok(!notice.actions, 'кнопка «Слушать» без серии');
  // The network is back later in the evening: the episode is written and the reminder replaced.
  env.online = true;
  env.ai = function () { return JSON.stringify(sample); };
  env.subscriptions['network:bedtime-series-network'] = null;
  main.start();
  env.subscriptions['network:bedtime-series-network']({ online: true });
  env.runSpawned();
  assert.strictEqual(index().seasons[0].written, 1);
  var last = env.notices[env.notices.length - 1];
  assert.strictEqual(last.text, 'Серия 1 готова: «Смотритель моста»');
  assert.ok(!env.jobs['series:retry'], 'повтор не снят');
});

test('вне вечернего окна сама серия не пишется', function () {
  main.startSeason({ genre: 'city', quiet: true });
  main.saveSettings({ prepareAt: hhmm(Date.now() + 3600000), remindAt: hhmm(Date.now() + 7200000) });
  env.ai = function () { throw new Error('модель не должна зваться'); };
  assert.ok(/не время/.test(main.prepare('network').skipped));
});

// ---- the reminder and playing ---------------------------------------------------------------------------

test('напоминание: «Серия N готова» с кнопкой «Слушать», кнопка запускает серию без экрана', function () {
  seasonWith(1);
  var note = main.remind();
  assert.strictEqual(note.text, 'Серия 1 готова: «Смотритель моста»');
  var notice = env.notices[env.notices.length - 1];
  assert.strictEqual(notice.open, 'modules/bedtime-series/ui/index.html');
  assert.strictEqual(notice.actions[0].title, 'Слушать');
  assert.strictEqual(notice.actions[0].call, 'modules/bedtime-series/main.js');
  var started = main[notice.actions[0].fn](notice.actions[0].args);
  assert.ok(started.ok, JSON.stringify(started));
  assert.strictEqual(env.voiceRuns.length, 1);
  assert.strictEqual(env.voiceRuns[0].options.listenSec, 15);
  assert.strictEqual(env.voiceRuns[0].options.pushToTalk, 'never');
  assert.ok(env.cancelled.indexOf('series-ready') >= 0);
  env.features = [];
  main.remind();
  assert.ok(!env.notices[env.notices.length - 1].actions, 'без notify.actions — без кнопок');
});

test('запуск: без распознавания речи и без серии — честная причина', function () {
  assert.ok(/начните сезон/.test(main.play().why));
  var id = main.startSeason({ genre: 'city', quiet: true }).season;
  var none = main.play();
  assert.ok(/Серия 1 ещё не готова/.test(none.why) && none.canWrite, JSON.stringify(none));
  main.addEpisode(id, sample);
  env.speechReady = false;
  assert.ok(/Распознавание речи/.test(main.play().why));
  assert.strictEqual(env.voiceRuns.length, 0);
});

test('серия до конца: выбор голосом, спокойная ветка в тишине, затухание, факт в базе', function () {
  var id = seasonWith(1);
  env.charging = false;
  main.play();
  var d = env.voiceRuns[0].driver;
  var first = d.begin();
  assert.ok(/Это сериал на ночь/.test(first.text) && /Серия 1: «Смотритель моста»/.test(first.text), first.text);
  assert.strictEqual(first.listen, false);
  var a = d.next();
  assert.ok(a.listen && a.listenSec === 15 && /медный или стальной/.test(a.text));
  var unclear = d.answer('какой-то третий', null);
  assert.ok(/Не расслышал/.test(unclear.text) && unclear.listen);
  var steel = d.answer('пожалуй, стальной', null);
  assert.ok(/^Стальной ключ/.test(steel.text), steel.text);
  assert.ok(/Так или иначе/.test(d.next().text));
  var b = d.next();
  var quieter = d.silence(1, b);
  assert.ok(quieter.slow && quieter.volume === 0.6 && /фонарщику/.test(quieter.text));
  var calm = d.silence(2, quieter);
  assert.ok(/Тогда выберу сам: «фонарщик»\. Вы садитесь рядом с фонарщиком/.test(calm.text), calm.text);
  assert.ok(calm.slow && calm.fade && calm.fade.from === 1, 'сцена 4 — затухание');
  var fin = d.next();
  assert.ok(fin.end && fin.reason === 'done' && fin.slow && fin.pauseMs === 900 && fin.fade.to === 0.4);
  d.end('done', 12);
  var state = lastState();
  assert.ok(state.done);
  assert.deepStrictEqual(state.choices, { A: 1, B: 0 });
  assert.deepStrictEqual(state.defaults, { B: true });
  assert.strictEqual(index().seasons[0].listened, 1);
  var fact = env.base.filter(function (r) { return r.kind === 'story'; })[0];
  assert.strictEqual(fact.title, 'Сериал: серия 1');
  assert.strictEqual(fact.amount, 12);
  assert.strictEqual(fact.source, 'series');
  assert.strictEqual(fact.data.asleep, false);
  assert.strictEqual(json('data/series/' + id + '/e1.json').played.choices.B, 0);
  // The next episode knows what was chosen.
  var prompt = '';
  env.ai = function (role, body) {
    prompt = body.messages[1].content;
    return JSON.stringify(sample);
  };
  assert.strictEqual(main.prepare('button', true).written, 2);
  assert.ok(/выбрал: «стальной», «фонарщик» \(выбрал рассказчик/.test(prompt), prompt.slice(-800));
  assert.ok(/Серия 1: Вечером у реки/.test(prompt));
});

test('уснул: две пропущенные развилки, тихая концовка, на следующий вечер — «продолжим или новую?»', function () {
  var id = seasonWith(1);
  main.play();
  var d = env.voiceRuns[0].driver;
  d.begin();
  var a = d.next();
  d.silence(1, a);
  assert.ok(/выберу сам: «медный»/.test(d.silence(2, a).text));
  d.next();
  var b = d.next();
  d.silence(3, b);
  var sleep = d.silence(4, b);
  assert.ok(sleep.end && sleep.reason === 'asleep' && sleep.volume === 0.4 && sleep.slow, JSON.stringify(sleep).slice(0, 200));
  assert.strictEqual(sleep.text, sample.asleep);
  d.end('asleep', 9);
  var state = lastState();
  assert.strictEqual(state.asleepAt, 'A');
  assert.ok(!state.done);
  assert.strictEqual(index().seasons[0].listened, 0);
  var fact = env.base.filter(function (r) { return r.kind === 'story'; })[0];
  assert.ok(fact.data.asleep && fact.data.asleepScene === 1, JSON.stringify(fact));
  assert.ok(fact.at <= Date.now());
  // No next episode yet: it continues from the scene before the fork.
  var status = main.status();
  assert.strictEqual(status.next.mode, 'continue');
  assert.strictEqual(status.next.moment, 'когда смотритель моста положил на стол два ключа');
  // The next one is written that evening (he fell asleep in episode 1, so 2 is due).
  env.ai = function () { return JSON.stringify(sample); };
  index();
  var idx = index();
  idx.seasons[0].preparedOn = '2000-01-01';
  env.files['data/series/index.json'] = JSON.stringify(idx);
  eveningNow();
  assert.strictEqual(main.prepare('job').written, 2);
  assert.ok(/вы уснули/.test(main.remind().text));
  main.play();
  var d2 = env.voiceRuns[1].driver;
  var ask = d2.begin();
  assert.ok(/вы уснули, когда смотритель моста положил на стол два ключа\. Продолжим оттуда или начнём новую серию\?/.test(ask.text), ask.text);
  var fresh = d2.answer('давай новую', null);
  assert.ok(/Серия 2: «Смотритель моста»/.test(fresh.text), fresh.text);
  assert.strictEqual(index().seasons[0].listened, 1, 'уснувшая серия засчитана');
  assert.strictEqual(lastState().episode, 2);
  assert.strictEqual(json('data/series/' + id + '/e1.json').played.asleepAt, 'A');
});

test('уснул и молчит на вопросе — продолжение с места, потом снова «уснул»', function () {
  seasonWith(2);
  var idx = index();
  idx.seasons[0].listened = 0;
  env.files['data/series/index.json'] = JSON.stringify(idx);
  env.files['data/series/state.json'] = JSON.stringify({
    story: 'series', season: idx.seasons[0].id, episode: 1, node: 'B', choices: { A: 0 }, defaults: {}, asked: {}, unclear: {},
    missed: 2, asleepAt: 'B', asleepTime: Date.now() - 20 * 3600000, done: false
  });
  main.play();
  var d = env.voiceRuns[0].driver;
  var ask = d.begin();
  assert.ok(/фонарщик и кондуктор/.test(ask.text), ask.text);
  var again = d.silence(1, ask);
  assert.ok(again.volume === 0.6 && /Продолжим оттуда/.test(again.text));
  var back = d.silence(2, again);
  assert.ok(/Продолжаем серию 1 с того места, где вы уснули\. Так или иначе/.test(back.text), back.text);
  var b = d.next();
  d.silence(3, b);
  var sleep = d.silence(4, b);
  assert.strictEqual(sleep.reason, 'asleep', 'одна пропущенная развилка после молчания на вопросе — уже «уснул»');
});

test('убили посреди серии — «Продолжить» с той же сцены; перебили сцену — сцена заново', function () {
  seasonWith(1);
  main.play();
  var d = env.voiceRuns[0].driver;
  d.begin();
  d.next();
  d.answer('медный', null);
  var over = d.answer('а что это было', null);
  assert.ok(/^Продолжаю\. Медный ключ/.test(over.text), 'перебили сцену: ' + over.text);
  d.next();
  // The process dies here: nothing but state.json is left.
  main.play();
  var again = env.voiceRuns[1].driver;
  var line = again.begin();
  assert.ok(/^Продолжаем серию 1\. Так или иначе/.test(line.text), line.text);
  assert.strictEqual(again.info().scene, 3);
  // A broken state.json gives way to the previous version.
  env.files['data/series/state.json'] = '{"story": "ser';
  assert.strictEqual(main.status().next.mode, 'resume');
});

test('на развилке служебные слова переспрашивают вариантами', function () {
  seasonWith(1);
  main.play();
  var d = env.voiceRuns[0].driver;
  d.begin();
  d.next();
  var help = d.answer('помощь', 'help');
  assert.ok(/Выберите: «медный» или «стальной»/.test(help.text) && help.listen);
  d.answer('непонятно', null);
  var picked = d.answer('опять непонятно', null);
  assert.ok(/Пусть будет «медный»/.test(picked.text), picked.text);
});

test('последняя серия сезона — ачивка «Досмотрел сезон»', function () {
  main.saveSettings({ seasonEpisodes: 2 });
  var id = seasonWith(2);
  var idx = index();
  idx.seasons[0].listened = 1;
  env.files['data/series/index.json'] = JSON.stringify(idx);
  main.play();
  var d = env.voiceRuns[0].driver;
  d.begin();
  d.next();
  d.answer('медный', null);
  d.next();
  d.next();
  d.answer('кондуктор', null);
  d.next();
  d.end('done', 14);
  var box = json('data/games/achievements-outbox.json');
  assert.strictEqual(box[0].key, 'stories/series/season-done');
  assert.strictEqual(box[0].title, 'Досмотрел сезон');
  assert.ok(index().seasons[0].finishedAt);
  assert.ok(main.play().finished);
  assert.ok(/досмотрен/.test(main.prepare('button', true).skipped));
  void id;
});

// ---- the recorded voice, live mode, start ------------------------------------------------------------------

test('голос заранее: манера «тихо, неторопливо, тепло», запись в e<N>/audio, затем звучит запись', function () {
  var id = seasonWith(1);
  env.unmetered = true;
  var out = main.prerenderNow(false);
  assert.strictEqual(out.done, 10);
  assert.strictEqual(env.rendered[0].dir, 'data/series/' + id + '/e1');
  assert.strictEqual(env.rendered[0].options.style, 'тихо, неторопливо, тепло');
  assert.strictEqual(env.rendered[0].options.anyPower, true);
  main.play();
  var d = env.voiceRuns[0].driver;
  var first = d.begin();
  assert.ok(first.parts && first.parts.some(function (p) { return p.audio && /s1\.wav$/.test(p.audio); }), JSON.stringify(first.parts));
  assert.ok(first.parts[0].text && !first.parts[0].audio, 'заголовок — голосом телефона');
  assert.strictEqual(d.info().recorded, 10);
  main.saveSettings({ 'voice.mode': 'local' });
  assert.ok(/голос телефона/.test(main.prerenderNow(true).skipped));
});

test('живой режим: агент-рассказчик, бриф в памяти, live.start', function () {
  var id = seasonWith(1);
  main.saveSettings({ live: true });
  env.native['agent.newThread'] = 't-7';
  env.native['live.start'] = true;
  var out = main.play();
  assert.ok(out.ok && out.live, JSON.stringify(out));
  assert.ok(env.files['agents/storyteller/agent.json'] && /Рассказчик/.test(env.files['agents/storyteller/agent.json']));
  assert.ok(/рассказчик вечернего аудиосериала/.test(env.files['agents/storyteller/system.md']));
  assert.ok(/Развилка A/.test(env.files['agents/storyteller/memory.md']));
  var call = env.nativeCalls.filter(function (c) { return c.method === 'live.start'; })[0];
  assert.deepStrictEqual(call.args, ['storyteller', 't-7']);
  assert.strictEqual(env.voiceRuns.length, 0, 'записанный цикл не запускался');
  assert.strictEqual(index().seasons[0].listened, 1);
  env.native['live.status'] = { active: true, state: 'listening' };
  assert.ok(main.stopPlay());
  assert.ok(env.nativeCalls.some(function (c) { return c.method === 'live.stop'; }));
  // The owner's edit of system.md survives.
  env.files['agents/storyteller/system.md'] = 'моя версия';
  main.addEpisode(id, sample);
  main.play();
  assert.strictEqual(env.files['agents/storyteller/system.md'], 'моя версия');
  env.native['live.start'] = false;
  main.addEpisode(id, sample);
  assert.ok(/не начался/.test(main.play().why));
});

test('старт: задачи по расписанию, событие сети, строчка в памяти агента один раз', function () {
  env.files['agent/memory.md'] = '# Память\n\n- кофе без сахара\n';
  assert.strictEqual(main.start(), true);
  assert.deepStrictEqual(env.jobs['series:prepare'].when, { at: '20:00' });
  assert.deepStrictEqual(env.jobs['series:remind'].when, { at: '22:30' });
  assert.ok(env.subscriptions['network:bedtime-series-network']);
  main.start();
  var memory = env.files['agent/memory.md'];
  assert.strictEqual(memory.split("modules/bedtime-series/main.js').play()").length - 1, 1, memory);
  assert.ok(/^# Память\n\n- кофе без сахара\n- Сериал на ночь: «включи сериал»/.test(memory), memory);
  main.saveSettings({ prepareAt: '19:15' });
  assert.deepStrictEqual(env.jobs['series:prepare'].when, { at: '19:15' });
});

test('сезоны: другой текущим, удаление вместе с сериями и состоянием, пересказы без спойлеров', function () {
  var first = seasonWith(2);
  var idx = index();
  idx.seasons[0].listened = 1;
  env.files['data/series/index.json'] = JSON.stringify(idx);
  var recaps = main.recaps();
  assert.strictEqual(recaps.items.length, 1, 'вторая серия не слушана — её пересказа нет');
  assert.strictEqual(recaps.season, 'Город под мостами');
  assert.ok(main.sayRecaps(3).ok);
  env.runSpawned();
  assert.ok(env.nativeCalls.some(function (c) { return c.method === 'speech.say' && /Серия 1, «Смотритель моста»\. Вечером у реки/.test(c.args[0]); }));
  env.now = Date.now() + 120000;
  var second = main.startSeason({ genre: 'fairy', quiet: true }).season;
  assert.notStrictEqual(first, second);
  assert.strictEqual(main.status().season.id, second);
  main.selectSeason(first);
  assert.strictEqual(main.status().season.id, first);
  main.play();
  env.voiceRuns[0].driver.begin();
  main.removeSeason(first);
  assert.strictEqual(main.status().season.id, second);
  assert.ok(!Object.keys(env.files).some(function (key) { return key.indexOf('data/series/' + first + '/') === 0; }), 'файлы сезона остались');
  assert.strictEqual(main.status().next.why, 'Серия 1 ещё не готова');
  assert.throws(function () { main.removeSeason('../../etc'); });
});

test('настройки: люди строкой, источники только известные, пределы', function () {
  var view = main.saveSettings({ people: 'Петя, мама', sources: ['trip', 'sms', 'calendar'], choiceWaitSec: 1000 });
  var get = function (key) { return view.filter(function (r) { return r.key === key; })[0].value; };
  assert.deepStrictEqual(get('people'), ['Петя', 'мама']);
  assert.deepStrictEqual(get('sources'), ['calendar', 'trip']);
  assert.strictEqual(get('choiceWaitSec'), 90);
  assert.throws(function () { main.saveSettings({ nope: 1 }); });
  assert.throws(function () { main.askPermission('READ_SMS'); });
  assert.strictEqual(main.widget().title, 'Сериал');
});

test('без голосового движка модуль честно говорит, чего не хватает', function () {
  var mount = env.mounts['modules/voice-adventure'];
  delete env.mounts['modules/voice-adventure'];
  var file = path.join(ROOT, 'main.js');
  var cached = require.cache[file];
  delete require.cache[file];
  try {
    var bare = require(file);
    var status = bare.status();
    assert.strictEqual(status.engine, false);
    assert.ok(/voice-adventure/.test(status.why));
    assert.strictEqual(bare.start(), false);
    assert.throws(function () { bare.play(); }, /голосового движка/);
    assert.ok(/Приключение/.test(bare.widget().text));
  } finally {
    env.mounts['modules/voice-adventure'] = mount;
    require.cache[file] = cached;
  }
});

console.log('series: прошло ' + passed + ', не прошло ' + failed);
if (failed) process.exit(1);
