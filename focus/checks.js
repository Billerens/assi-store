// Checks of Focus on the phone (module_check focus). Every session here is a test one
// ({ test: true }): "do not disturb" is not touched, no notifications, nothing in the shared base.
// A check never runs over a real session; what it changes (state, settings, the inbox's chats,
// the sessions' rows) it puts back.
var assi = require('lib/assi');

var SCREEN = 'modules/focus/ui/index.html';
var STATE_PATH = 'data/focus/state.json';
var SETTINGS_PATH = 'data/focus/settings.json';

function focus() {
  return require('modules/focus/main.js');
}

function read(path) {
  return assi.files.exists(path) ? assi.files.read(path) : null;
}

function put(path, text) {
  if (text === null) {
    if (assi.files.exists(path)) assi.files.remove(path);
  } else {
    assi.files.write(path, text);
  }
}

/** Runs fn with the state (and the settings, patched) as they were before, put back after. */
function quietly(t, patch, fn) {
  var state = assi.files.readJson(STATE_PATH, {}) || {};
  if (state.id && !state.test) t.skip('идёт настоящая сессия фокуса');
  var savedState = read(STATE_PATH);
  var savedSettings = read(SETTINGS_PATH);
  if (patch) {
    var current = assi.files.readJson(SETTINGS_PATH, {}) || {};
    Object.keys(patch).forEach(function (key) { current[key] = patch[key]; });
    assi.files.writeJson(SETTINGS_PATH, current);
  }
  var made = [];
  try {
    fn(made);
  } finally {
    var left = assi.files.readJson(STATE_PATH, {}) || {};
    if (left.id && left.test) {
      try { focus().end('owner'); } catch (error) { /* gone */ }
    }
    made.forEach(function (id) { focus().forget(id); });
    put(STATE_PATH, savedState);
    put(SETTINGS_PATH, savedSettings);
  }
}

function start(options) {
  var all = { minutes: 25, task: 'Проверка фокуса', dnd: false, block: false, cycles: false, test: true };
  Object.keys(options || {}).forEach(function (key) { all[key] = options[key]; });
  return focus().startFocus(all);
}

exports['сессия: начало, продление, конец — один раз'] = function (t) {
  quietly(t, null, function (made) {
    var started = start({});
    t.ok(started.ok, 'не началась: ' + started.why);
    made.push(started.session.id);
    t.equal(started.session.total, 25);
    t.ok(started.session.left > 24 * 60000, 'осталось почти 25 минут');
    var again = start({});
    t.ok(!again.ok, 'вторая сессия поверх первой не начинается');
    var longer = focus().extend(10);
    t.ok(longer.ok);
    t.equal(longer.session.total, 35, 'продлена на 10 минут');
    t.ok(/Фокус: ещё 3\d минут/.test(focus().left().text), focus().left().text);
    var ended = focus().end('owner');
    t.ok(ended.ok, 'закончилась');
    t.equal(ended.dnd.restored, false, '«не беспокоить» Фокус не включал — и не трогает');
    t.ok(!focus().end('owner').ok, 'второй конец ничего не делает');
    var row = focus().summary(started.session.id);
    t.ok(row && row.session.endedBy === 'owner', 'сессия записана');
    t.ok(row.headline.indexOf('Проверка фокуса') >= 0, row.headline);
  });
};

exports['восстановление: прошедшая сессия заканчивается после перезапуска'] = function (t) {
  quietly(t, null, function (made) {
    var now = Date.now();
    var id = 'fcheck' + now.toString(36);
    made.push(id);
    assi.files.writeJson(STATE_PATH, {
      id: id, kind: 'work', startAt: now - 40 * 60000, endAt: now - 15 * 60000, plannedMin: 25, extendedMin: 0,
      pausedAt: null, pausedMs: 0, task: 'Проверка восстановления', mode: 'priority', attempts: 0, blockedApps: {}, calls: [],
      dndWanted: false, dndOk: false, dndBy: null, test: true
    });
    t.equal(focus().restore(), 'restore');
    t.ok(!(assi.files.readJson(STATE_PATH, {}) || {}).id, 'сессии больше нет');
    var row = focus().summary(id);
    t.equal(row.session.endedBy, 'restore');
    t.equal(row.session.actualMin, 25, 'засчитано до конца по плану, а не до перезапуска');
  });
};

exports['отвлекающее приложение: напоминание, вторая попытка пускает'] = function (t) {
  quietly(t, { distractApps: ['check.focus.app'], strictness: 'home', allowSecondSec: 10 }, function (made) {
    var started = start({ block: true });
    made.push(started.session.id);
    t.ok(started.session.block, 'блокировка включена');
    var first = focus().appOpened({ package: 'check.focus.app' });
    t.equal(first.action, 'home');
    t.ok(/^Фокус: ещё \d+ минут/.test(first.text), first.text);
    focus().appOpened({ package: 'com.android.systemui' });
    var second = focus().appOpened({ package: 'check.focus.app' });
    t.equal(second.action, 'allow', 'вторая попытка за 10 секунд');
    t.equal(focus().appOpened({ package: 'org.telegram.messenger' }).action, 'none');
    var ended = focus().end('owner');
    t.ok(ended.ok);
    var row = focus().summary(started.session.id);
    t.equal(row.session.attempts, 2, 'в сводке две попытки');
    t.ok(row.headline.indexOf('2 попытки') >= 0, row.headline);
  });
};

exports['звонок во время фокуса: пропущенный попадает в сводку'] = function (t) {
  quietly(t, { callAction: 'nothing' }, function (made) {
    var started = start({});
    made.push(started.session.id);
    focus().callEvent({ state: 'ringing', number: '+70000000001' });
    focus().callEvent({ state: 'idle', number: '' });
    focus().end('owner');
    var row = focus().summary(started.session.id);
    t.equal(row.missed.length, 1, 'один пропущенный');
    t.equal(row.missed[0].number, '+70000000001');
  });
};

exports['звонок с настройкой «пауза»: время стоит, потом идёт дальше'] = function (t) {
  quietly(t, { callAction: 'pause' }, function (made) {
    var started = start({});
    made.push(started.session.id);
    t.equal(focus().callEvent({ state: 'ringing', number: '+70000000002' }), 'pause');
    t.ok(focus().status().session.paused, 'пауза');
    t.equal(focus().callEvent({ state: 'idle' }), 'resume');
    t.ok(!focus().status().session.paused, 'снова идёт');
  });
};

exports['сводка со Входящими: сообщение за сессию'] = function (t) {
  if (!assi.files.exists('modules/inbox/main.js')) t.skip('модуль «Входящие» не установлен — сводка из уведомлений');
  var inbox = require('modules/inbox/main.js');
  var chatId = null;
  quietly(t, null, function (made) {
    var started = start({});
    made.push(started.session.id);
    var stamp = String(Date.now()).slice(-6);
    var got = inbox.handle({
      app: 'Telegram', package: 'org.telegram.messenger', title: 'Проверка Фокуса ' + stamp, text: 'Во сколько встреча?',
      time: Date.now(), key: 'check|focus|' + stamp, canReply: false, ongoing: false
    }, { test: true, noModel: true });
    chatId = got.chatId;
    t.ok(chatId, 'Входящие приняли подставное уведомление');
    try {
      var during = focus().status();
      if (during.settings.showCount) t.ok(during.session.messages >= 1, 'во время сессии видно число пришедших');
      focus().end('owner');
      var row = focus().summary(started.session.id);
      t.equal(row.summary.source, 'inbox');
      var all = row.summary.important.map(function (item) { return item.chatId; }).concat(row.summary.others.map(function (item) { return item.chatId; }));
      t.ok(all.indexOf(chatId) >= 0, 'беседа в сводке');
    } finally {
      if (chatId) inbox.forget(chatId);
    }
  });
};

exports['без Входящих: человек из списка пробивается сквозь тишину'] = function (t) {
  quietly(t, { people: ['Проверкин'], breakthroughEveryMin: 15 }, function (made) {
    var started = start({});
    made.push(started.session.id);
    var through = focus().noticeDuring({ package: 'org.telegram.messenger', title: 'Проверкин Тест', text: 'Срочно', time: Date.now() }, { test: true });
    t.ok(through.through, 'человек из списка');
    var other = focus().noticeDuring({ package: 'org.telegram.messenger', title: 'Кто-то другой', text: 'Привет', time: Date.now() }, { test: true });
    t.ok(!other.through, 'остальные ждут конца');
  });
};

exports['циклы: после работы — перерыв, после него — следующая работа'] = function (t) {
  quietly(t, { cycles: true, workMin: 25, breakMin: 5, cyclesCount: 2, autoNext: false }, function (made) {
    var started = start({ cycles: true, minutes: 25 });
    made.push(started.session.id);
    t.equal(started.session.cycle, 1);
    var ended = focus().end('timer');
    t.ok(ended.ok);
    var now = focus().status();
    t.ok(now.running && now.session.kind === 'break', 'идёт перерыв');
    t.equal(Math.round(now.session.total), 5);
    var next = focus().next();
    t.ok(next.ok, 'следующая работа: ' + next.why);
    made.push(next.session.id);
    t.equal(next.session.cycle, 2);
    focus().end('timer');
    var last = focus().status();
    t.ok(last.running && last.session.kind === 'break' && last.session.long, 'после последней — длинный перерыв');
    focus().stopCycles();
    t.ok(!focus().status().running, 'циклы закончены');
  });
};

exports['виджет'] = function (t) {
  var widget = focus().widget();
  t.equal(widget.title, 'Фокус');
  t.ok(typeof widget.text === 'string' && widget.text.length > 0);
  t.equal(widget.open, SCREEN);
};

exports['экран: фишки до старта, кольцо во время сессии'] = function (t) {
  quietly(t, null, function (made) {
    var durations = focus().status().settings.durations;
    var page = t.screen(SCREEN + '?tab=now');
    var chips = 0;
    for (var i = 0; i < 12 && !chips; i++) {
      chips = page.count('.chip.big');
      if (!chips) t.wait(250);
    }
    t.equal(chips, durations.length + 1, 'фишки длительности и «Своё»');
    t.ok(page.count('#start') === 1, 'кнопка «Начать»');
    var started = start({});
    made.push(started.session.id);
    var page2 = t.screen(SCREEN + '?tab=now');
    var ring = 0;
    for (var j = 0; j < 12 && !ring; j++) {
      ring = page2.count('.ring');
      if (!ring) t.wait(250);
    }
    t.ok(ring === 1, 'кольцо обратного отсчёта');
    t.ok(/^\d+:\d\d$/.test(page2.text('#time')), 'время: ' + page2.text('#time'));
  });
};
