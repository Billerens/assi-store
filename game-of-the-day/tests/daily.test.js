// «Игра дня» itself (main.js) under node: the phone, the agent and the hub «Игротека» are played by
// voice-adventure's tests/engine-stub.js and the fakes below. node tests/daily.test.js
var assert = require('assert');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var STUB = path.join(ROOT, '..', 'voice-adventure', 'tests', 'engine-stub.js');

var dev = { online: true, features: ['notify.actions', 'job.once', 'app.visible'] };
var device = {
  features: function () { return dev.features.slice(); },
  has: function (name) { return dev.features.indexOf(name) >= 0; },
  online: function () { return dev.online; },
  charging: function () { return false; },
  moveDir: function () { return false; }
};

var env = null;
var hubCalls = [];
var hub = {
  offlineCheck: function (id) {
    var prefix = 'modules/games/' + id + '/';
    var hits = [];
    Object.keys(env.files).forEach(function (p) {
      if (p.indexOf(prefix) !== 0 || !/\.(html?|js|css)$/.test(p)) return;
      var m = /https?:\/\/[^\s'"<>]+/.exec(env.files[p]);
      if (m) hits.push({ path: p.slice('modules/games/'.length), url: m[0], line: 1 });
    });
    return { ok: !hits.length, hits: hits };
  },
  catalogSet: function (op, id, value) {
    hubCalls.push([op, id, value]);
    if (op === 'trial' && !value) {
      var g = JSON.parse(env.files['modules/games/' + id + '/game.json']);
      if (g.status === 'trial') g.status = 'active';
      env.files['modules/games/' + id + '/game.json'] = JSON.stringify(g, null, 2);
    }
    return {};
  }
};

// «Рисуй — угадаю» as the game of the day sees it (present only when a test puts its main.js).
var drawCalls = [];
var drawDay = { stock: true, played: false };
var drawGuess = {
  dayDrawing: function (date, options) {
    drawCalls.push({ date: date, peek: !!(options && options.peek) });
    if (options && options.peek && !drawDay.ordered) return { ready: false, date: date, why: 'ещё не заказан' };
    if (!drawDay.stock && !drawDay.ordered) return { ready: false, date: date, why: 'нет сети' };
    drawDay.ordered = true;
    return { ready: true, date: date, played: drawDay.played, open: 'modules/draw-guess/ui/index.html?daily=1', title: 'Рисунок дня', text: 'Модель нарисовала загадку — угадайте, что это' };
  }
};

// The hub's engine: does it take «daily/2026-11-14-2», a second game of a day (a newer Axiko)?
var hubTakesSlots = true;
var core = {
  validId: function (id) {
    return hubTakesSlots ? /^daily\/\d{4}-\d{2}-\d{2}(-[2-9])?$/.test(id) : /^daily\/\d{4}-\d{2}-\d{2}$/.test(id);
  }
};

env = require(STUB).install({
  mounts: { 'modules/game-of-the-day': ROOT },
  fakes: { './device.js': device, 'modules/games/main.js': hub, 'modules/draw-guess/main.js': drawGuess, 'modules/games/engine/core.js': core }
});
var main = env.require('modules/game-of-the-day/main.js');

// A clock of its own: 14 November 2026 (a Saturday), 07:00; sleep moves it.
var REAL_NOW = Date.now;
var clock = 0;
Date.now = function () { return clock; };
global.sleep = function (ms) { clock += Number(ms) || 0; };
var DAY = 86400000;

function at(h, m, dayOffset) {
  return new Date(2026, 10, 14 + (dayOffset || 0), h, m || 0, 0).getTime();
}

var DATE = '2026-11-14';
var DIR = 'modules/games/daily/' + DATE;
var ANSWER = JSON.stringify({
  title: 'Отражатель', pitch: 'ловите лучи зеркалом', genre: 'puzzle', controls: 'drag', session: '2m',
  tags: { visual: 'geometry', difficulty: 'medium', theme: 'light' }
});

var failed = 0;
var passed = 0;
function test(name, fn) {
  env.reset();
  hubCalls = [];
  drawCalls = [];
  drawDay = { stock: true, played: false };
  dev.online = true;
  dev.features = ['notify.actions', 'job.once', 'app.visible'];
  hubTakesSlots = true;
  clock = at(7, 0);
  env.files['modules/games/main.js'] = '// the hub';
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + (error && error.stack || error));
  }
}

function json(p) {
  return JSON.parse(env.files[p]);
}

function log() {
  return env.files['data/games/daily/log.json'] ? json('data/games/daily/log.json') : [];
}

function entry(date) {
  return log().filter(function (e) { return e.date === (date || DATE); })[0];
}

function writeLog(list) {
  env.files['data/games/daily/log.json'] = JSON.stringify(list);
}

/** What the agent leaves in the folder of the day. */
function gameFiles(date, extra) {
  extra = extra || {};
  var dir = 'modules/games/daily/' + date;
  env.files[dir + '/game.json'] = JSON.stringify({ id: 'template', title: 'Отражатель', about: 'Ловите лучи зеркалом', genre: 'Puzzle', engine: 1, entry: 'ui/index.html', status: 'active' });
  env.files[dir + '/ui/index.html'] = '<!doctype html>\n<body>\n<script src="../sim.js"></script>\n' + (extra.html || '') + '</body>\n';
  env.files[dir + '/sim.js'] = 'var Big = require(\'../engine/big.js\');\nexports.id = "daily/' + date + '";';
  env.files[dir + '/checks.js'] = "var dir = 'modules/games/daily/" + date + "';";
}

/** The agent gamesmith in its own thread: writes the game on the task, busy for `busy` polls, then answers. */
function agent(options) {
  options = options || {};
  var st = { sent: [], busy: options.busy === undefined ? 1 : options.busy, stopped: false, date: options.date || DATE };
  env.native['agent.newThread'] = function () { return 'thread-1'; };
  env.native['agent.send'] = function (id, text, thread, attach, mode) {
    st.sent.push({ id: id, text: text, thread: thread, mode: mode });
    if (st.sent.length === 1 && options.files !== false) gameFiles(st.date, options);
    return true;
  };
  env.native['agent.busy'] = function () {
    if (st.stopped) return false;
    if (st.busy === Infinity) return true;
    return st.busy-- > 0;
  };
  env.native['agent.stop'] = function () { st.stopped = true; return true; };
  env.native['agent.history'] = function () {
    var out = [{ type: 'user', text: st.sent[0] ? st.sent[0].text : '' }, { type: 'tool', text: 'fs_write' }];
    if (options.answer !== null) out.push({ type: 'assistant', text: options.answer === undefined ? 'Готово.\n```json\n' + ANSWER + '\n```' : options.answer });
    if (options.note) out.push({ type: 'note', text: options.note });
    return out;
  };
  return st;
}

function noticesWith(re) {
  return env.notices.filter(function (n) { return re.test(n.text || ''); });
}

// ---- making ---------------------------------------------------------------------------------------------------

test('утром агент делает игру: своё задание, проверка папки, крючок оценки, уведомление к readyBy', function () {
  var st = agent();
  var out = main.make('утро');
  assert.strictEqual(out.made, true, JSON.stringify(out));
  assert.ok(env.files['agents/gamesmith/agent.json'] && env.files['agents/gamesmith/system.md'], 'агент поставлен');
  assert.deepStrictEqual(json('agents/gamesmith/agent.json').tools.slice(0, 2), ['fs_*', 'js_eval']);
  var task = st.sent[0];
  assert.strictEqual(task.id, 'gamesmith');
  assert.strictEqual(task.thread, 'thread-1');
  assert.strictEqual(task.mode, 'after');
  assert.ok(/Сделай игру дня на 2026-11-14/.test(task.text) && /modules\/games\/daily\/2026-11-14\//.test(task.text), task.text);
  assert.ok(/AGENT\.md пока нет: скопируй modules\/games\/engine\/template\//.test(task.text), 'без AGENT.md — шаблон движка');
  assert.ok(/свободный выбор/.test(task.text));
  var e = entry();
  assert.strictEqual(e.made, true);
  assert.strictEqual(e.title, 'Отражатель');
  assert.deepStrictEqual(e.tags, { genre: 'puzzle', controls: 'drag', session: '2m', visual: 'geometry', difficulty: 'medium', theme: 'light' });
  assert.strictEqual(e.attempts, 1);
  assert.strictEqual(e.mode, 'free');
  var g = json(DIR + '/game.json');
  assert.strictEqual(g.id, 'daily/2026-11-14');
  assert.strictEqual(g.status, 'daily');
  assert.ok(env.files[DIR + '/ui/index.html'].indexOf('<script src="/modules/game-of-the-day/ui/rate.js"></script>\n</body>') >= 0);
  assert.strictEqual(env.notices.length, 0, 'до 08:00 молчит');
  clock = at(8, 0);
  main.start();
  env.jobs['daily-game:ready'].fn();
  assert.strictEqual(env.notices.length, 1);
  assert.strictEqual(env.notices[0].text, 'Игра дня: «Отражатель» — ловите лучи зеркалом, 2 минуты');
  assert.strictEqual(env.notices[0].open, DIR + '/ui/index.html');
  assert.strictEqual(env.notices[0].id, 'daily-game');
  assert.strictEqual(main.notifyReady(false).send, false, 'второй раз не шлёт');
  assert.ok(env.events.some(function (ev) { return ev.name === 'daily-game.state' && ev.data.phase === 'made'; }));
  assert.strictEqual(main.make('утро').skipped, 'игра дня уже есть');
});

// ---- the drawing of the day («Рисуй — угадаю») ----------------------------------------------------------------

test('рисунок дня: утром заказан, к readyBy — тихое уведомление на ?daily=1, один раз', function () {
  env.files['modules/draw-guess/main.js'] = '// draw-guess';
  agent();
  main.start();
  env.jobs['daily-game:make'].fn();
  env.runSpawned();
  assert.deepStrictEqual(drawCalls[0], { date: DATE, peek: false }, 'утром заказан');
  assert.ok(main.log(50).some(function (line) { return line.text === 'Рисунок дня готов'; }));
  assert.strictEqual(main.status().drawing.ready, true);
  clock = at(8, 0);
  env.jobs['daily-game:ready'].fn();
  var notes = env.notices.filter(function (n) { return n.id === 'daily-game-drawing'; });
  assert.strictEqual(notes.length, 1);
  assert.strictEqual(notes[0].open, 'modules/draw-guess/ui/index.html?daily=1');
  assert.strictEqual(notes[0].channel, 'quiet');
  assert.ok(!/маяк/.test(notes[0].text), 'загадку не выдаёт');
  env.jobs['daily-game:ready'].fn();
  assert.strictEqual(env.notices.filter(function (n) { return n.id === 'daily-game-drawing'; }).length, 1, 'второй раз не шлёт');
});

test('рисунок дня уже открыт — без уведомления; не готов — журнал и кнопка «Заказать»', function () {
  env.files['modules/draw-guess/main.js'] = '// draw-guess';
  drawDay.ordered = true;
  drawDay.played = true;
  assert.strictEqual(main.notifyReady(false).drawing.send, false);
  drawDay = { stock: false, played: false };
  var st = main.status().drawing;
  assert.strictEqual(st.installed, true);
  assert.strictEqual(st.ready, false);
  assert.strictEqual(main.drawingNow().started, true);
  env.runSpawned();
  assert.ok(main.log(50).some(function (line) { return /Рисунок дня не готов: нет сети/.test(line.text); }));
});

test('рисунка дня нет без «Рисуй — угадаю», при «Не заказывать» и в выходной при «В дни игры дня»', function () {
  agent();
  env.jobs = {};
  main.start();
  env.jobs['daily-game:make'].fn();
  env.runSpawned();
  assert.strictEqual(drawCalls.length, 0, 'модуля нет — не зовём');
  var st = main.status().drawing;
  assert.strictEqual(st.installed, false);
  assert.strictEqual(main.drawingNow().skipped, 'Нет «Рисуй — угадаю»');
  env.files['modules/draw-guess/main.js'] = '// draw-guess';
  main.saveSettings({ drawing: 'off' });
  assert.strictEqual(main.status().drawing.on, false);
  assert.strictEqual(drawCalls.length, 0);
  main.saveSettings({ drawing: 'days', days: 'weekdays' });
  assert.strictEqual(main.status().drawing.on, false, '14 ноября 2026 — суббота');
  main.saveSettings({ drawing: 'all' });
  assert.strictEqual(main.status().drawing.on, true);
});

test('готово после readyBy — уведомление сразу', function () {
  clock = at(8, 30);
  agent();
  assert.ok(main.make('утро').made);
  assert.strictEqual(noticesWith(/^Игра дня: «Отражатель»/).length, 1);
});

test('вне окна, по выходным при «по будням», выключено, нет Игротеки — не делает и говорит почему', function () {
  agent();
  clock = at(11, 0);
  assert.ok(/не время/.test(main.make('утро').skipped));
  clock = at(7, 0);
  main.saveSettings({ days: 'weekdays' });
  assert.strictEqual(main.make('утро').skipped, 'сегодня игры нет по расписанию');
  main.saveSettings({ days: 'never' });
  assert.ok(/выключена/.test(main.make('утро').skipped));
  assert.strictEqual(main.homeCard().text, 'Выключена в настройках');
  main.saveSettings({ days: 'all' });
  delete env.files['modules/games/main.js'];
  assert.ok(/Нет Игротеки/.test(main.make('утро').skipped));
  assert.strictEqual(main.homeCard().text, 'Нужна Игротека');
  assert.strictEqual(env.nativeCalls.filter(function (c) { return c.method === 'agent.send'; }).length, 0, 'агент не тронут');
});

test('без сети — повтор каждые 30 минут (точный будильник), после giveUpAt — честный отказ', function () {
  dev.online = false;
  var out = main.make('утро');
  assert.strictEqual(out.skipped, 'нет сети');
  assert.strictEqual(env.jobs['daily-game:retry'].when.once, at(7, 30));
  assert.strictEqual(entry().waiting, 'нет сети');
  clock = at(7, 30);
  env.jobs['daily-game:retry'].fn();
  assert.strictEqual(env.runSpawned(), 1);
  assert.strictEqual(env.jobs['daily-game:retry'].when.once, at(8, 0));
  clock = at(9, 0);
  main.make('retry');
  assert.strictEqual(env.jobs['daily-game:retry'].when.once, at(9, 30), 'последняя попытка — в giveUpAt');
  clock = at(9, 30);
  env.jobs['daily-game:retry'].fn();
  assert.ok(!env.jobs['daily-game:retry']);
  var e = entry();
  assert.strictEqual(e.final, true);
  assert.strictEqual(e.error, 'не было сети до 09:30');
  assert.strictEqual(env.notices.length, 1);
  assert.strictEqual(env.notices[0].text, 'Сегодня игра не собралась: не было сети до 09:30. Следующая — завтра в 08:00');
  assert.strictEqual(env.notices[0].channel, 'quiet');

  // Without job.once — a repeating job; the network coming back starts the work.
  env.reset();
  env.files['modules/games/main.js'] = '// the hub';
  clock = at(7, 0);
  dev.features = [];
  dev.online = false;
  main.make('утро');
  assert.deepStrictEqual(env.jobs['daily-game:retry'].when, { every: 30 });
  main.start();
  dev.online = true;
  agent();
  env.subscriptions['network:game-of-the-day-network']({ online: true });
  env.runSpawned();
  assert.strictEqual(entry().made, true);
});

test('агент сам говорит «не вышло» — вторая попытка, потом честное уведомление с причиной', function () {
  clock = at(8, 10);
  agent({ answer: '{"error": "не прошла проверку на внешнем экране"}' });
  var first = main.make('утро');
  assert.strictEqual(first.error, 'не прошла проверку на внешнем экране');
  assert.strictEqual(first.final, false);
  assert.ok(env.jobs['daily-game:retry'], 'повтор назначен');
  assert.strictEqual(env.notices.length, 0, 'пока пробует — молчит');
  var second = main.make('retry');
  assert.strictEqual(second.final, true);
  assert.strictEqual(entry().attempts, 2);
  assert.ok(/В папке уже есть работа прошлой попытки/.test(env.nativeCalls.filter(function (c) { return c.method === 'agent.send'; }).pop().args[1]));
  assert.strictEqual(env.notices.length, 1);
  assert.strictEqual(env.notices[0].text, 'Сегодня игра не собралась: не прошла проверку на внешнем экране. Следующая — завтра в 08:00');
  assert.ok(/попытки|не вышло/.test(main.make('retry').skipped));
  assert.ok(/Не собралась/.test(main.card().text));
});

test('адрес в сети, нет экрана, нет game.json — игра не принимается', function () {
  agent({ html: '<script src="https://cdn.example.com/three.js"></script>\n' });
  var out = main.make('утро');
  assert.ok(/без сети/.test(out.error) && /cdn\.example\.com/.test(out.error), out.error);
  env.reset();
  env.files['modules/games/main.js'] = '// the hub';
  agent({ files: false });
  assert.ok(/нет game\.json/.test(main.make('утро').error));
});

test('срок вышел — «сдавай» в работу, через graceMinutes агент остановлен; без ответа описание из game.json', function () {
  var st = agent({ busy: Infinity, answer: null, note: 'Остановлено' });
  var started = clock;
  var out = main.make('утро');
  var steer = st.sent[1];
  assert.ok(steer && steer.mode === 'steer' && /Срок работы вышел/.test(steer.text), JSON.stringify(st.sent.slice(1)));
  assert.strictEqual(st.stopped, true);
  var minutes = (clock - started) / 60000;
  assert.ok(minutes >= 45 && minutes < 46.5, 'остановлен через ' + minutes + ' мин');
  assert.strictEqual(out.made, true, JSON.stringify(out));
  var e = entry();
  assert.strictEqual(e.title, 'Отражатель');
  assert.strictEqual(e.pitch, 'Ловите лучи зеркалом');
  assert.strictEqual(e.tags.genre, 'puzzle');
  assert.strictEqual(e.answered, false);
  assert.strictEqual(e.steered, 'time');
  assert.strictEqual(e.stopped, true);
});

test('расход дошёл до maxCostPerGame — «сдавай» по деньгам; цена игры — разница трат агента', function () {
  var spent = 0.1;
  env.native['usage.summary'] = function () {
    spent += 0.3;
    return { budget: 0, days: [{ day: DATE, cost: spent + 5, who: { gamesmith: { cost: spent }, axiko: { cost: 5 } } }] };
  };
  var st = agent({ busy: 5 });
  var out = main.make('утро');
  assert.ok(out.made);
  assert.ok(st.sent[1] && /Расход на эту игру дошёл до предела/.test(st.sent[1].text));
  assert.strictEqual(entry().steered, 'cost');
  assert.ok(entry().costUsd > 1 && entry().costUsd < 3, String(entry().costUsd));
});

test('оболочка без потоков агента — одна задача ai.run', function () {
  env.agent = function (id, task) {
    assert.strictEqual(id, 'gamesmith');
    gameFiles(DATE);
    return ANSWER;
  };
  var out = main.make('утро');
  assert.ok(out.made, JSON.stringify(out));
  assert.strictEqual(env.agentRuns.length, 1);
  assert.ok(/Сделай игру дня/.test(env.agentRuns[0].task));
});

test('игра дня руками (агент по слову владельца): та же проверка папки', function () {
  gameFiles(DATE);
  var out = main.register(DATE, { title: 'Ручная', tags: { genre: 'logic' } });
  assert.ok(out.ok, JSON.stringify(out));
  assert.strictEqual(entry().title, 'Ручная');
  assert.strictEqual(entry().byHand, true);
  assert.strictEqual(json(DIR + '/game.json').status, 'daily');
  assert.ok(/modules\/games\/engine\/big\.js/.test(env.files[DIR + '/sim.js']));
  env.files[DIR + '/ui/index.html'] += '<img src="http://example.com/x.png">';
  assert.ok(!main.register(DATE, {}).ok, 'адрес в сети не пропускается');
});

test('кнопка «Сделать сейчас» — в фоне, в любое время', function () {
  clock = at(21, 0);
  agent();
  assert.deepStrictEqual(main.makeNow(), { started: true });
  env.runSpawned();
  assert.strictEqual(entry().made, true);
  assert.ok(/уже есть/.test(main.makeNow().skipped));
});

// ---- ratings and the move ----------------------------------------------------------------------------------------

function madeDay(offset, title, genre, extra) {
  var d = new Date(2026, 10, 14 + offset);
  var date = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
  date = date.replace(/-(\d)-/, '-0$1-');
  var e = { date: date, id: 'daily/' + date, made: true, title: title, pitch: '', tags: { genre: genre, controls: 'tap', session: '2m' } };
  Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
  return e;
}

test('оценка: лог, таблица вкуса, общая база (одна запись на игру), «Критик» один раз', function () {
  writeLog([madeDay(-1, 'Шары', 'sort'), madeDay(0, 'Отражатель', 'puzzle')]);
  main.saveSettings({ criticRatings: 2 });
  env.files['data/games/links/plays.json'] = JSON.stringify([
    { game: 'daily/2026-11-14', from: at(6, 50), to: at(6, 52) }, { game: 'daily/2026-11-14', from: at(6, 55), to: at(6, 58) }
  ]);
  var r = main.rate(DATE, { stars: 4, genrePreference: 'like', reasons: ['залип', 'сложно', 'чепуха', 'залип'], voice: '  слишком быстро,  но идея классная ', playedSec: 30 });
  assert.strictEqual(r.rating, 4);
  var e = entry();
  assert.deepStrictEqual(e.reasons, ['залип', 'сложно']);
  assert.strictEqual(e.voice, 'слишком быстро, но идея классная');
  assert.strictEqual(e.sessions, 2);
  assert.strictEqual(e.playedSec, 300);
  assert.deepStrictEqual(json('data/games/daily/taste.json').genre, { puzzle: { score: 5, n: 1 } });
  assert.strictEqual(env.base.length, 1);
  assert.deepStrictEqual([env.base[0].kind, env.base[0].title, env.base[0].amount, env.base[0].source], ['rating', 'Игра дня: Отражатель', 4, 'games']);
  assert.deepStrictEqual(env.base[0].data.tags, { genre: 'puzzle', controls: 'tap', session: '2m' });
  main.rate(DATE, { stars: 5 });
  assert.strictEqual(env.base.length, 1, 'повторная оценка правит ту же запись');
  assert.strictEqual(env.base[0].amount, 5);
  assert.ok(!env.files['data/games/achievements-outbox.json'], 'одной оценки мало');
  main.rate('2026-11-13', { stars: 2, reasons: ['скучно'] });
  var box = json('data/games/achievements-outbox.json');
  assert.deepStrictEqual(box.map(function (x) { return x.key; }), ['games/daily/critic']);
  assert.strictEqual(box[0].title, 'Критик');
  main.rate('2026-11-13', { stars: 3 });
  assert.strictEqual(json('data/games/achievements-outbox.json').length, 1);
  assert.throws(function () { main.rate(DATE, { stars: 7 }); }, /от 1 до 5/);
  assert.throws(function () { main.rate('2026-11-01', { stars: 3 }); }, /нет/);
  assert.throws(function () { main.rate('../etc', { stars: 3 }); }, /Не дата/);
});

test('«Оставить»: папка в каталоге, trial и origin, адреса переписаны, крючок снят, сохранения под новый id', function () {
  agent();
  main.make('утро');
  env.files['modules/games/otrazhatel/game.json'] = '{"id": "otrazhatel"}';
  var saves = 3;
  env.query = function (name, sql, args) {
    assert.strictEqual(name, 'games');
    if (/count\(\*\)/.test(sql)) return [{ n: args[0] === 'daily/2026-11-14' ? saves : 0 }];
    return [];
  };
  main.rate(DATE, { stars: 5 });
  var out = main.keep(DATE);
  assert.strictEqual(out.id, 'otrazhatel-2', 'имя занято — следующее');
  var to = 'modules/games/otrazhatel-2';
  assert.ok(!Object.keys(env.files).some(function (p) { return p.indexOf(DIR + '/') === 0; }), 'папка дня ушла');
  var g = json(to + '/game.json');
  assert.strictEqual(g.id, 'otrazhatel-2');
  assert.strictEqual(g.status, 'trial');
  assert.deepStrictEqual(g.origin, { from: 'game-of-the-day', date: DATE, rating: 5 });
  assert.ok(env.files[to + '/ui/index.html'].indexOf('rate.js') < 0, 'крючок снят');
  assert.strictEqual(env.files[to + '/checks.js'], "var dir = 'modules/games/otrazhatel-2';");
  assert.strictEqual(env.files[to + '/sim.js'], "var Big = require('modules/games/engine/big.js');\nexports.id = \"otrazhatel-2\";", 'движок полным путём, id новый');
  var calls = env.dbs.games.calls.map(function (c) { return c.sql + ' ' + JSON.stringify(c.args); });
  assert.ok(calls.some(function (c) { return /^update or ignore saves set game = \? where game = \? \["otrazhatel-2","daily\/2026-11-14"\]/.test(c); }), calls.join('\n'));
  assert.deepStrictEqual(hubCalls, [['trial', 'otrazhatel-2', true]]);
  var e = entry();
  assert.strictEqual(e.kept, true);
  assert.strictEqual(e.slug, 'otrazhatel-2');
  assert.strictEqual(out.saves, 3);
  assert.strictEqual(main.card().open, to + '/ui/index.html');
  assert.ok(main.keep(DATE).already);
  assert.throws(function () { main.remove(DATE); }, /уже в Игротеке/);
  assert.strictEqual(main.make('утро').skipped, 'игра дня уже есть', 'оставленная не переделывается');
});

test('лист в игре: оценка сразу, перенос — через settleSec после выхода; «Позже» только время', function () {
  agent();
  main.make('утро');
  var info = main.rateInfo(DATE);
  assert.deepStrictEqual([info.ok, info.rated, info.rateAfterSec, info.voiceSec, info.chips.length], [true, null, 60, 10, 11]);
  var out = main.decide(DATE, { stars: 4, reasons: ['залип'], voice: 'слишком быстро', playedSec: 75, decision: 'keep' });
  assert.strictEqual(out.pending, 'keep');
  assert.strictEqual(entry().rating, 4);
  assert.strictEqual(main.rateInfo(DATE).pending, 'keep');
  var before = clock;
  env.runSpawned();
  assert.strictEqual(clock - before, 3000, 'ждёт settleSec');
  assert.strictEqual(entry().kept, true);
  assert.strictEqual(entry().slug, 'otrazhatel');
  assert.strictEqual(main.rateInfo(DATE).ok, false, 'оставленная больше не оценивается в листе');

  env.reset();
  env.files['modules/games/main.js'] = '// the hub';
  agent();
  main.make('утро');
  main.decide(DATE, { stars: null, playedSec: 120, decision: 'later' });
  assert.strictEqual(entry().rating, undefined);
  assert.strictEqual(entry().playedSec, 120);
  main.decide(DATE, { stars: 1, decision: 'remove' });
  env.runSpawned();
  assert.ok(entry().removedAt);
  assert.ok(!env.files[DIR + '/game.json']);
  assert.ok(env.dbs.games.calls.some(function (c) { return /^delete from saves where game = \?/.test(c.sql) && c.args[0] === 'daily/2026-11-14'; }));
});

test('уборка: неоставленная старше keepDays удаляется с сохранениями, свежая и оставленная — нет', function () {
  writeLog([
    madeDay(-4, 'Старая', 'arcade', { rating: 3 }),
    madeDay(-3, 'Ровно три дня', 'logic'),
    madeDay(-1, 'Вчерашняя', 'sort'),
    madeDay(-6, 'Оставленная', 'puzzle', { kept: true, slug: 'kept-one', keptAt: at(7, 0, -6) }),
    { date: '2026-11-07', id: 'daily/2026-11-07', made: false, error: 'нет сети', final: true }
  ]);
  ['2026-11-10', '2026-11-11', '2026-11-13', '2026-11-07', '2026-11-01'].forEach(function (d) { gameFiles(d); });
  var out = main.sweep();
  assert.deepStrictEqual(out.removed.sort(), ['2026-11-01', '2026-11-07', '2026-11-10', '2026-11-11']);
  assert.ok(!env.files['modules/games/daily/2026-11-10/game.json'] && !env.files['modules/games/daily/2026-11-01/game.json']);
  assert.ok(env.files['modules/games/daily/2026-11-13/game.json'], 'вчерашняя живёт');
  assert.ok(entry('2026-11-10').removedAt && entry('2026-11-11').removedAt && entry('2026-11-07').removedAt);
  assert.ok(!entry('2026-11-13').removedAt && !entry('2026-11-08').removedAt);
  assert.ok(env.dbs.games.calls.some(function (c) { return /^delete from saves/.test(c.sql) && c.args[0] === 'daily/2026-11-10'; }));
  assert.ok(env.dbs.games.calls.some(function (c) { return /count\(\*\)/.test(c.sql) && c.args[0] === 'daily/2026-11-08'; }), 'поздние сохранения оставленной подбираются');
});

test('прижилась: три разных дня игры после «Оставить» — «Все игры», предложение агенту в чате', function () {
  var keptAt = at(7, 0, -6);
  writeLog([madeDay(-6, 'Отражатель', 'puzzle', { rating: 5, kept: true, slug: 'otrazhatel', keptAt: keptAt })]);
  env.files['modules/games/otrazhatel/game.json'] = JSON.stringify({ id: 'otrazhatel', status: 'trial' });
  env.files['data/games/links/plays.json'] = JSON.stringify([
    { game: 'otrazhatel', from: at(12, 0, -5), to: at(12, 5, -5) },
    { game: 'otrazhatel', from: at(18, 0, -5), to: at(18, 5, -5) },
    { game: 'otrazhatel', from: at(12, 0, -3), to: at(12, 5, -3) }
  ]);
  assert.deepStrictEqual(main.promote(), []);
  assert.strictEqual(main.status().trial[0].days, 2);
  var plays = json('data/games/links/plays.json');
  plays.push({ game: 'otrazhatel', from: at(9, 0, -1), to: at(9, 3, -1) });
  env.files['data/games/links/plays.json'] = JSON.stringify(plays);
  assert.deepStrictEqual(main.promote(), ['otrazhatel']);
  assert.deepStrictEqual(hubCalls, [['trial', 'otrazhatel', false]]);
  assert.strictEqual(json('modules/games/otrazhatel/game.json').status, 'active');
  var note = env.notices[0];
  assert.strictEqual(note.text, '«Отражатель» прижился. Добавить престиж и связки с поездкой?');
  assert.deepStrictEqual(note.actions, [{ title: 'Обсудить с агентом', call: 'modules/game-of-the-day/main.js', fn: 'discuss', args: { id: 'otrazhatel' } }]);
  assert.strictEqual(main.status().offers.length, 1);
  main.discuss({ id: 'otrazhatel' });
  var sent = env.nativeCalls.filter(function (c) { return c.method === 'agent.send'; })[0];
  assert.strictEqual(sent.args[0], 'axiko');
  assert.ok(/прижилась/.test(sent.args[1]) && /modules\/games\/otrazhatel\//.test(sent.args[1]) && /престиж/.test(sent.args[1]));
  assert.ok(env.cancelled.indexOf('daily-game-root-otrazhatel') >= 0);
  assert.strictEqual(main.status().offers.length, 0);
  assert.deepStrictEqual(main.promote(), [], 'один раз');
});

// ---- taste in the task and the weekly summary ---------------------------------------------------------------------

test('явное нежелание rhythm: жанр исключается из следующих предложений', function () {
  writeLog([
    madeDay(-1, 'Бит', 'rhythm', { rating: 1, genrePreference: 'dislike' }), madeDay(-2, 'Бит 2', 'rhythm', { rating: 1, genrePreference: 'dislike' }), madeDay(-3, 'Бит 3', 'rhythm', { rating: 1, genrePreference: 'dislike' }),
    madeDay(-4, 'Отражатель', 'puzzle', { rating: 5, genrePreference: 'like', reasons: ['залип'] })
  ]);
  var explore = 0;
  for (var i = 0; i < 14; i++) {
    var d = new Date(2026, 10, 14 + i);
    var key = d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
    var text = main.task(key);
    assert.ok(text.indexOf('жанр «rhythm»') < 0, key);
    if (/исследование/.test(text)) explore++;
    else assert.ok(/вариация на «Отражатель»/.test(text) && /Не делай жанры: rhythm/.test(text), text);
    assert.ok(/Не любит жанр rhythm 1 \(3\)/.test(text));
    assert.ok(/«Отражатель» \(5\): залип/.test(text));
  }
  assert.ok(explore >= 1 && explore <= 9, 'исследований: ' + explore);
});

test('недельная сводка: модель сводит вкус в память с меткой и шлёт владельцу; без модели — из таблицы', function () {
  writeLog([madeDay(-1, 'Отражатель', 'puzzle', { rating: 5, genrePreference: 'like', reasons: ['залип'] }), madeDay(-2, 'Бит', 'rhythm', { rating: 1, genrePreference: 'dislike' })]);
  assert.strictEqual(main.weekly(false).skipped, 'не день сводки');
  main.saveSettings({ summaryDay: 6 });
  var asked = [];
  env.ai = function (role, body) {
    asked.push({ role: role, body: body });
    return '{"owner": "На этой неделе понравились головоломки со светом. Не зашли ритм-игры.", "taste": ["Любит головоломки со светом", "Не любит ритм-игры", "Сессии по 2 минуты", "Одним пальцем", "Чистая геометрия"]}';
  };
  var out = main.weekly(false);
  assert.strictEqual(out.by, 'model');
  assert.strictEqual(asked[0].role, 'daily-game.taste');
  assert.ok(/понравились: Отражатель/.test(asked[0].body.messages[1].content));
  assert.strictEqual(env.memory.length, 1);
  assert.strictEqual(env.memory[0].tags, 'игра-дня');
  assert.ok(/Любит головоломки со светом\nНе любит ритм-игры/.test(env.memory[0].text));
  assert.strictEqual(env.notices[0].text, 'На этой неделе понравились головоломки со светом. Не зашли ритм-игры.');
  assert.strictEqual(main.weekly(false).skipped, 'сводка уже была');
  assert.ok(/Сводка вкуса за прошлые недели: Любит головоломки со светом/.test(main.task('2026-11-15')), 'задание берёт сводку');
  env.ai = function () { throw new Error('нет модели'); };
  var plain = main.weekly(true);
  assert.strictEqual(plain.by, 'table');
  assert.ok(/Понравились: Отражатель/.test(plain.owner), plain.owner);
  assert.ok(plain.taste.length >= 2);
});

test('появится modules/games/AGENT.md — задание ведёт по нему; праздник дня — тема игры', function () {
  assert.ok(/engine\/template/.test(main.task(DATE)));
  env.files['modules/games/AGENT.md'] = '# Как делать игру';
  env.files['data/holidays/history.json'] = JSON.stringify([{ day: DATE, occasion: 'first-snow', decor: [] }]);
  var text = main.task(DATE);
  assert.ok(/Сделай игру дня на 2026-11-14 по modules\/games\/AGENT\.md/.test(text) && !/engine\/template/.test(text), text);
  assert.ok(/Сегодня повод: first-snow — пусть игра будет на эту тему/.test(text));
  assert.strictEqual(main.status().guide, true);
});

// ---- the rest ---------------------------------------------------------------------------------------------------------

test('настройки в пределах; start ставит задачи, подписку на сеть и строку в памяти агента', function () {
  var view = main.saveSettings({ keepDays: 99, makeAt: '25:00', explore: 0.5 });
  var get = function (k) { return view.filter(function (row) { return row.key === k; })[0].value; };
  assert.strictEqual(get('keepDays'), 30);
  assert.deepStrictEqual(get('slots'), [{ make: '06:00', ready: '08:00' }], 'старый ключ makeAt понят, плохое время — по умолчанию');
  assert.strictEqual(get('explore'), 0.5);
  assert.throws(function () { main.saveSettings({ nonsense: 1 }); }, /Нет такой настройки/);
  main.saveSettings({ makeAt: '05:30' });
  assert.strictEqual(env.jobs['daily-game:make'].when.at, '05:30');
  assert.strictEqual(main.start(), true);
  assert.deepStrictEqual(Object.keys(env.jobs).filter(function (k) { return /^daily-game:(make|ready|week)$/.test(k); }).sort(), ['daily-game:make', 'daily-game:ready', 'daily-game:week']);
  assert.ok(env.subscriptions['network:game-of-the-day-network']);
  assert.ok(/game-of-the-day\/main\.js'\)\.makeNow\(\)/.test(env.files['agent/memory.md']));
  main.start();
  assert.strictEqual(env.files['agent/memory.md'].split('game-of-the-day').length, 2, 'строка один раз');
  assert.strictEqual(env.jobs['daily-game:retry'].when.once, at(7, 1), 'запуск в окне без игры — скоро попытка');
});

test('экран и карточки: статус, сегодняшняя игра, «На пробу», вкус; карточка Игротеки и главного экрана', function () {
  assert.strictEqual(main.card(), null);
  assert.strictEqual(main.homeCard().text, 'Будет сегодня в 08:00');
  assert.strictEqual(main.homeCard().state, 'idle');
  agent();
  main.make('утро');
  main.rate(DATE, { stars: 5, genrePreference: 'like', reasons: ['красиво'] });
  var s = main.status();
  assert.strictEqual(s.hub, true);
  assert.strictEqual(s.guide, false);
  assert.strictEqual(s.today.title, 'Отражатель');
  assert.strictEqual(s.today.open, DIR + '/ui/index.html');
  assert.strictEqual(s.today.canRate, true);
  assert.ok(s.taste.some(function (row) { return row.title === 'жанр' && row.value === 'puzzle' && row.score === 5; }));
  assert.strictEqual(s.chips.length, 11);
  assert.strictEqual(s.counts.ratings, 1);
  var card = main.card();
  assert.deepStrictEqual([card.title, card.text, card.made, card.rated], ['Отражатель', 'ловите лучи зеркалом', true, 5]);
  assert.strictEqual(main.homeCard().title, 'Отражатель');
  assert.ok(/Отражатель/.test(main.widget().text));
  assert.ok(main.log(5).length >= 2);
  assert.strictEqual(main.history(5)[0].date, DATE);
  assert.strictEqual(main.verify(DATE).ok, true);
  env.native['speech.listen'] = function (sec) { return sec === 10 ? 'слишком быстро' : ''; };
  assert.strictEqual(main.listen(), 'слишком быстро');
});

// ---- the schedule: slots, every N days, chosen weekdays, migration ---------------------------------------------------

var TWO = [{ make: '06:00', ready: '08:00' }, { make: '17:00', ready: '19:00' }];

test('старые настройки (makeAt, readyBy, giveUpAt, days) сами переходят в расписание со слотами', function () {
  env.files['data/games/daily/settings.json'] = JSON.stringify({ makeAt: '05:30', readyBy: '07:15', giveUpAt: '09:00', days: 'weekdays', keepDays: 5 });
  var s = main.settings();
  assert.strictEqual(s.frequency, 'weekdays');
  assert.deepStrictEqual(s.weekdays, [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(s.slots, [{ make: '05:30', ready: '07:15' }]);
  assert.strictEqual(s.giveUpMin, 105);
  assert.strictEqual(s.keepDays, 5);
  var saved = json('data/games/daily/settings.json');
  assert.ok(saved.makeAt === undefined && saved.days === undefined, 'старые ключи ушли из файла');
  assert.strictEqual(saved.frequency, 'weekdays');
  assert.ok(main.log(5).some(function (l) { return /переведены на новый вид: По будням в 07:15/.test(l.text); }));
  env.files['data/games/daily/settings.json'] = JSON.stringify({ days: 'never' });
  assert.strictEqual(main.settings().frequency, 'off');
  // Old data: a log line of a day is that day's first game.
  writeLog([madeDay(-1, 'Шары', 'sort')]);
  main.saveSettings({ frequency: 'daily' });
  assert.strictEqual(main.status().recent[0].slot, 0);
  assert.strictEqual(main.rate('2026-11-13', { stars: 4 }).rating, 4);
});

test('две игры в день: свои задачи и уведомления, папка «2026-11-14-2», карточки и оценка', function () {
  main.saveSettings({ slots: TWO });
  main.start();
  assert.strictEqual(env.jobs['daily-game:make'].when.at, '06:00');
  assert.strictEqual(env.jobs['daily-game:make-2'].when.at, '17:00');
  assert.strictEqual(env.jobs['daily-game:ready-2'].when.at, '19:00');
  agent();
  clock = at(6, 0);
  env.jobs['daily-game:make'].fn();
  env.runSpawned();
  assert.strictEqual(entry(DATE).made, true);
  clock = at(8, 0);
  env.jobs['daily-game:ready'].fn();
  assert.strictEqual(env.notices.filter(function (n) { return n.id === 'daily-game'; }).length, 1);
  assert.strictEqual(main.homeCard().nextText, 'Следующая — сегодня в 19:00');
  assert.strictEqual(main.homeCard().label, 'Сегодня, первая');
  var KEY = '2026-11-14-2';
  var st = agent({ date: KEY });
  clock = at(17, 0);
  env.jobs['daily-game:make-2'].fn();
  env.runSpawned();
  var second = entry(KEY);
  assert.ok(second && second.made, JSON.stringify(second));
  assert.strictEqual(second.slot, 1);
  assert.strictEqual(second.day, DATE);
  assert.ok(/Сделай игру дня на 2026-11-14 \(это вторая игра за день/.test(st.sent[0].text), st.sent[0].text);
  assert.ok(/modules\/games\/daily\/2026-11-14-2\//.test(st.sent[0].text) && /id: 'daily\/2026-11-14-2'/.test(st.sent[0].text));
  assert.ok(/«Отражатель»/.test(st.sent[0].text), 'утренняя игра — в «последних», её механику не повторять');
  assert.strictEqual(json('modules/games/daily/2026-11-14-2/game.json').id, 'daily/2026-11-14-2');
  assert.strictEqual(env.notices.length, 1, 'до 19:00 молчит');
  clock = at(19, 0);
  env.jobs['daily-game:ready-2'].fn();
  var n2 = env.notices.filter(function (n) { return n.id === 'daily-game-2'; });
  assert.strictEqual(n2.length, 1);
  assert.strictEqual(n2[0].open, 'modules/games/daily/2026-11-14-2/ui/index.html');
  var card = main.card();
  assert.strictEqual(card.key, KEY);
  assert.strictEqual(card.label, 'Сегодня, вторая');
  assert.strictEqual(card.next.when, 'завтра в 08:00');
  assert.strictEqual(main.status().games.length, 2);
  assert.strictEqual(main.status().today.date, KEY);
  assert.strictEqual(main.make('утро').skipped, 'игра дня уже есть');
  assert.strictEqual(main.makeNow().skipped, 'все игры на сегодня уже есть');
  assert.strictEqual(main.rate(KEY, { stars: 5 }).rating, 5);
  assert.strictEqual(main.rateInfo(KEY).rated, 5);
  var kept = main.keep(KEY);
  assert.strictEqual(kept.id, 'otrazhatel');
  assert.ok(env.files['modules/games/daily/2026-11-14/game.json'], 'первая игра дня на месте');
  assert.strictEqual(json('modules/games/daily/2026-11-14/game.json').id, 'daily/2026-11-14');
  assert.strictEqual(json('modules/games/otrazhatel/game.json').origin.date, KEY);
  // Fewer slots again: the second jobs go.
  main.saveSettings({ slots: [TWO[0]] });
  assert.ok(!env.jobs['daily-game:make-2'] && !env.jobs['daily-game:ready-2']);
});

test('кнопка при двух слотах: первая игра без игры — та, чьё время уже началось', function () {
  main.saveSettings({ slots: TWO });
  clock = at(18, 0);
  var st = agent();
  assert.deepStrictEqual(main.makeNow(), { started: true });
  env.runSpawned();
  assert.ok(entry(DATE).made, 'сначала утренняя, пропущенная');
  st = agent({ date: '2026-11-14-2' });
  main.makeNow();
  env.runSpawned();
  assert.ok(entry('2026-11-14-2').made);
  assert.ok(/вторая игра/.test(st.sent[0].text));
});

test('Игротека не принимает вторую игру дня — работает только первая, экран говорит почему', function () {
  hubTakesSlots = false;
  main.saveSettings({ slots: TWO });
  assert.ok(env.jobs['daily-game:make'] && !env.jobs['daily-game:make-2'], 'задача второй игры не ставится');
  var view = main.scheduleView();
  assert.strictEqual(view.blocked, true);
  assert.strictEqual(view.text, 'Каждый день в 08:00');
  agent();
  clock = at(17, 30);
  assert.ok(/Игротека пока не принимает вторую игру/.test(main.make('утро', false, 1).skipped));
});

test('через день: от даты начала, следующая — послезавтра; при выборе без даты начало — сегодня', function () {
  main.saveSettings({ frequency: 'every' });
  var s = main.settings();
  assert.strictEqual(s.anchor, DATE, 'начало — сегодня, чтобы «через день» не прыгало');
  assert.strictEqual(s.everyDays, 2);
  agent();
  assert.ok(main.make('утро').made);
  assert.strictEqual(main.homeCard().nextText, 'Следующая — послезавтра в 08:00');
  assert.strictEqual(main.scheduleView().text, 'Через день в 08:00');
  clock = at(7, 0, 1);
  assert.strictEqual(main.make('утро').skipped, 'сегодня игры нет по расписанию');
  var card = main.card();
  assert.strictEqual(card.key, DATE, 'вчерашняя игра — всё ещё текущая');
  assert.strictEqual(card.label, 'Вчера');
  main.saveSettings({ anchor: '2026-11-15' });
  assert.strictEqual(main.scheduleView().next.when, 'сегодня в 08:00');
  main.saveSettings({ everyDays: 3, anchor: '2026-11-14' });
  assert.strictEqual(main.scheduleView().next.when, 'послезавтра в 08:00');
  assert.deepStrictEqual(main.scheduleView().soon.slice(0, 2).map(function (x) { return x.key; }), ['2026-11-17', '2026-11-20']);
});

test('по выбранным дням недели и «не делать»: задачи снимаются, карточка честная', function () {
  main.saveSettings({ frequency: 'weekdays', weekdays: [1, 3, 5] });
  assert.strictEqual(main.scheduleView().text, 'По пн, ср, пт в 08:00');
  assert.strictEqual(main.homeCard().text, 'Следующая — послезавтра в 08:00', '14 ноября — суббота, следующая в понедельник');
  assert.strictEqual(main.make('утро').skipped, 'сегодня игры нет по расписанию');
  main.saveSettings({ frequency: 'off' });
  assert.ok(!env.jobs['daily-game:make'] && !env.jobs['daily-game:ready'], 'выключено — задач нет');
  assert.ok(env.jobs['daily-game:week'], 'сводка остаётся');
  assert.strictEqual(main.homeCard().state, 'off');
  assert.strictEqual(main.scheduleView().next, null);
  assert.ok(/Сегодня игры пока нет|Выключена/.test(main.widget().text));
});

test('карточка главного экрана: делается — с долей работы; не вышло — ошибка и «Сделать»', function () {
  clock = at(8, 10);
  agent({ answer: '{"error": "не прошла проверку"}' });
  main.make('утро');
  var card = main.homeCard();
  assert.strictEqual(card.state, 'error');
  assert.strictEqual(card.error, 'не прошла проверку');
  assert.strictEqual(card.canMake, true);
  env.files['modules/draw-guess/main.js'] = '// draw-guess';
  drawDay.ordered = true;
  agent({ busy: 3 });
  env.native['agent.busy'] = function () {
    var c = main.homeCard();
    assert.strictEqual(c.state, 'making');
    assert.ok(c.progress.fraction > 0 && c.progress.fraction < 1);
    return false;
  };
  main.make('retry');
  card = main.homeCard();
  assert.strictEqual(card.state, 'game');
  assert.strictEqual(card.drawing.ready, true);
  env.files[DIR + '/icon.svg'] = '<svg viewBox="0 0 24 24"></svg>';
  assert.strictEqual(main.homeCard().icon, '/' + DIR + '/icon.svg');
});

test('отзыв об игре и любовь к жанру сохраняются отдельно, редактируются и попадают в задание', function () {
  writeLog([madeDay(0, 'Неровный бит', 'rhythm')]);
  var response = main.rate(DATE, { stars: 1, genrePreference: 'like', comment: '  Звук и ноты не совпадают  ', reasons: ['неточность ритма'] });
  assert.strictEqual(response.rating, 1);
  assert.strictEqual(entry().genrePreference, 'like');
  assert.strictEqual(entry().comment, 'Звук и ноты не совпадают');
  assert.strictEqual(env.base[0].data.ratingScope, 'implementation');
  assert.strictEqual(env.base[0].data.genrePreference, 'like');
  assert.strictEqual(main.status().today.comment, 'Звук и ноты не совпадают');
  assert.strictEqual(main.rateInfo(DATE).genre, 'rhythm');
  assert.deepStrictEqual(json('data/games/daily/taste.json').genre.rhythm, { score: 5, n: 1 });
  assert.ok(main.task('2026-11-15').indexOf('Звук и ноты не совпадают') >= 0);
  assert.ok(main.task('2026-11-15').indexOf('Не делай жанры: rhythm') < 0);
  main.rate(DATE, { stars: 2, comment: '', genrePreference: 'unknown' });
  assert.strictEqual(entry().comment, '');
  assert.strictEqual(json('data/games/daily/taste.json').genre, undefined);
  assert.throws(function () { main.rate(DATE, { stars: 2, genrePreference: 'invented' }); }, /жанру/);
  assert.throws(function () { main.decide(DATE, { stars: null, comment: 'Не терять этот отзыв', decision: 'remove' }); }, /оценка реализации/);
  assert.strictEqual(entry().pending, undefined, 'не удаляет игру вместе с несохранённым отзывом');
  env.files['data/games/daily/taste-week.json'] = JSON.stringify({ taste: ['СТАРАЯ НЕВЕРНАЯ СВОДКА'] });
  assert.ok(main.task('2026-11-15').indexOf('СТАРАЯ НЕВЕРНАЯ СВОДКА') < 0);
});

Date.now = REAL_NOW;
console.log('daily: прошло ' + passed + ', не прошло ' + failed);
if (failed) process.exit(1);
