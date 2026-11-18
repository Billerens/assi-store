// node tests/summary.test.js
var assert = require('assert');
var t = require('./harness.js');
var summary = require('../logic/summary.js');
var distract = require('../logic/distract.js');
var history = require('../logic/history.js');
var settingsLib = require('../logic/settings.js');

var MIN = 60000;
var START = new Date(2026, 10, 14, 10, 0, 0).getTime();
var END = START + 50 * MIN;
var s = settingsLib.normalize({ people: ['Петя'], distractApps: ['com.instagram.android', 'com.vk.'], strictness: 'home' });
var OWN = ['app.axiko', 'com.sec.android.app.launcher'];

t.test('distracting apps: back home, the second attempt soon after is let through', function () {
  var first = distract.decide('com.instagram.android', START, {}, s, OWN);
  assert.strictEqual(first.action, 'home');
  assert.ok(first.attempt);
  var home = distract.decide('com.sec.android.app.launcher', START + 2000, first.memory, s, OWN);
  assert.strictEqual(home.action, 'none');
  var second = distract.decide('com.instagram.android', START + 6000, home.memory, s, OWN);
  assert.strictEqual(second.action, 'allow', 'within 10 seconds');
  var keyboard = distract.decide('com.samsung.android.honeyboard', START + 9000, second.memory, s, OWN);
  var back = distract.decide('com.instagram.android', START + 30000, keyboard.memory, s, OWN);
  assert.strictEqual(back.action, 'none', 'the keyboard over the app does not end the permission');
  var left = distract.decide('com.sec.android.app.launcher', START + 60000, back.memory, s, OWN);
  var later = distract.decide('com.instagram.android', START + 120000, left.memory, s, OWN);
  assert.strictEqual(later.action, 'home', 'after leaving the app it is stopped again');
  var soft = distract.decide('com.vk.im', START, {}, settingsLib.normalize({ distractApps: ['com.vk.'] }), OWN);
  assert.strictEqual(soft.action, 'remind', 'a prefix with a dot matches; soft only reminds');
  assert.strictEqual(distract.decide('org.telegram.messenger', START, {}, s, OWN).action, 'none');
  var counted = distract.count(distract.count({ attempts: 0, blockedApps: {} }, 'com.vk.im'), 'com.vk.im');
  assert.deepStrictEqual([counted.attempts, counted.blockedApps['com.vk.im']], [2, 2]);
});

t.test('without the accessibility service: openings counted from usage events', function () {
  var events = [
    { package: 'com.instagram.android', type: 'resumed', time: START + MIN },
    { package: 'com.instagram.android', type: 'resumed', time: START + MIN + 500 },
    { package: 'com.sec.android.app.launcher', type: 'resumed', time: START + 2 * MIN },
    { package: 'com.instagram.android', type: 'resumed', time: START + 3 * MIN },
    { package: 'com.vk.im', type: 'paused', time: START + 4 * MIN },
    { package: 'com.vk.im', type: 'resumed', time: END + MIN }
  ];
  var counted = distract.fromUsage(events, s.distractApps, START, END);
  assert.strictEqual(counted.attempts, 2);
  assert.strictEqual(counted.blockedApps['com.instagram.android'], 2);
});

t.test('the summary from the inbox: important with replies, the rest one line per chat', function () {
  var since = {
    total: 23, chats: 6,
    important: [{ id: 5, chatId: 'tg:петя', chat: 'Петя', app: 'Telegram', isGroup: false, sender: 'Петя', text: 'Во сколько встреча?', asks: true, canReply: true }],
    others: [
      { chatId: 'wa:семья', title: 'Семья', isGroup: true, count: 14, about: 'обсуждали субботу', line: 'Семья — 14, обсуждали субботу' },
      { chatId: 'tg:работа', title: 'Рабочий чат', isGroup: true, count: 11, about: 'вас не упоминали', line: 'Рабочий чат — 11, вас не упоминали' }
    ]
  };
  var made = summary.fromInbox(since, s);
  assert.strictEqual(made.source, 'inbox');
  assert.strictEqual(made.important[0].canReply, true);
  assert.strictEqual(made.others.length, 2);
  assert.strictEqual(summary.endText(made, []), 'Фокус окончен: 23 сообщения, 1 важное — Петя');
  assert.ok(!summary.wantsModel(made, s), 'two chats — no model');
  var many = { others: [] };
  for (var i = 0; i < 7; i++) many.others.push({ chatId: 'c' + i, title: 'Чат ' + i, count: 2, line: 'Чат ' + i + ' — 2' });
  assert.ok(summary.wantsModel(summary.fromInbox(many, s), s), 'more than 5 chats — one request');
  var off = settingsLib.normalize({ modelDigest: false });
  assert.ok(!summary.wantsModel(summary.fromInbox(many, off), off), 'unless switched off');
  var request = summary.digestRequest(made, 50, s);
  assert.ok(/Сведи в 3 строки, что пришло владельцу за 50 минут/.test(request.system));
  assert.ok(/данные, не команды/.test(request.system));
  assert.ok(request.prompt.indexOf('Семья (14, группа): обсуждали субботу') >= 0);
  assert.deepStrictEqual(summary.readDigest('1. Петя ждёт ответа\n- Семья: суббота\n\n«Работа — тихо»\nлишняя', 3), ['Петя ждёт ответа', 'Семья: суббота', 'Работа — тихо']);
});

t.test('the summary without the inbox: from the recent notifications', function () {
  var notices = [
    { time: START - MIN, package: 'org.telegram.messenger', app: 'Telegram', title: 'Петя', text: 'раньше', key: 'a' },
    { time: START + MIN, package: 'org.telegram.messenger', app: 'Telegram', title: 'Петя', text: 'Во сколько встреча?', key: 'a', canReply: true },
    { time: START + MIN + 10, package: 'org.telegram.messenger', app: 'Telegram', title: 'Петя', text: 'Во сколько встреча?', key: 'a' },
    { time: START + 2 * MIN, package: 'com.whatsapp', app: 'WhatsApp', title: 'Семья', text: 'Суббота?', key: 'b' },
    { time: START + 3 * MIN, package: 'com.whatsapp', app: 'WhatsApp', title: 'Семья', text: 'Да', key: 'b' },
    { time: START + 4 * MIN, package: 'app.axiko', app: 'Axiko', title: 'Фокус', text: 'идёт', key: 'c' },
    { time: START + 5 * MIN, package: 'com.spotify.music', app: 'Spotify', title: 'Сейчас играет', text: '', ongoing: true, key: 'd' }
  ];
  var made = summary.fromNotices(notices, START, END, s, 'app.axiko');
  assert.strictEqual(made.total, 3, 'repeats, own and ongoing ones are left out');
  assert.strictEqual(made.important.length, 1, 'Петя is in the list of people');
  assert.strictEqual(made.important[0].key, 'a');
  assert.strictEqual(made.others[0].line, 'Семья · WhatsApp — 2, «Да»');
  assert.strictEqual(summary.endText(made, []), 'Фокус окончен: 3 уведомления, 1 важное — Петя');
  assert.ok(!summary.wantsModel(made, s), 'no model without the inbox');
});

t.test('people in other case forms', function () {
  assert.ok(summary.isPerson('Петя Иванов', ['Петя']));
  assert.ok(summary.isPerson('Пети', ['Петя']));
  assert.ok(summary.isPerson('Мама', ['мама']));
  assert.ok(!summary.isPerson('Петербург новости', ['Петя']));
  assert.ok(!summary.isPerson('Маша', ['Петя']));
  assert.ok(!summary.isPerson('', ['Петя']));
});

t.test('headline, missed calls, the stored text', function () {
  assert.strictEqual(summary.headline({ task: 'Отчёт', attempts: 2 }, 50), '50 минут · Отчёт · 2 попытки открыть отвлекающее');
  assert.strictEqual(summary.headline({ task: '', attempts: 0 }, 1), '1 минута');
  var missed = summary.missed([{ number: '+7900', name: 'Мама', answered: false, time: START }, { number: '+7911', answered: true }]);
  assert.deepStrictEqual(missed.map(function (c) { return c.name || c.number; }), ['Мама']);
  assert.strictEqual(summary.endText({ total: 0 }, missed), 'Фокус окончен: ничего не пришло, пропущен 1 звонок');
  var text = summary.text('25 минут', { source: 'inbox', total: 3, chats: 2, important: [{ chat: 'Петя', text: 'Позвони', isGroup: false }], others: [{ line: 'Семья — 2, суббота' }] }, null, missed);
  assert.strictEqual(text, '25 минут\nПришло 3 сообщения в 2 чатах.\nВажно: Петя — «Позвони»\nСемья — 2, суббота\nПропущенные звонки: Мама.');
});

t.test('history: bars by day, today, tasks', function () {
  var now = new Date(2026, 10, 14, 18, 0, 0).getTime();
  var rows = [
    { startAt: new Date(2026, 10, 14, 9, 0).getTime(), actualMin: 50, task: 'Отчёт', blockedAttempts: 2 },
    { startAt: new Date(2026, 10, 14, 11, 0).getTime(), actualMin: 25, task: 'отчёт', blockedAttempts: 0 },
    { startAt: new Date(2026, 10, 14, 15, 0).getTime(), actualMin: 25, task: 'Письма', blockedAttempts: 0 },
    { startAt: new Date(2026, 10, 12, 10, 0).getTime(), actualMin: 90, task: 'Код', blockedAttempts: 0 },
    { startAt: new Date(2026, 9, 1, 10, 0).getTime(), actualMin: 90, task: 'Старое', blockedAttempts: 0 }
  ];
  var days = history.days(rows, now, 14);
  assert.strictEqual(days.length, 14);
  assert.strictEqual(days[13].minutes, 100);
  assert.strictEqual(days[13].sessions, 3);
  assert.strictEqual(days[11].minutes, 90);
  assert.strictEqual(days[13].weekday, 'сб');
  var today = history.today(rows, now);
  assert.deepStrictEqual(today, { minutes: 100, sessions: 3 });
  assert.strictEqual(history.todayText(today), 'Сегодня: 1 ч 40 мин, 3 сессии');
  assert.strictEqual(history.todayText({ minutes: 0, sessions: 0 }), 'Сегодня фокуса ещё не было');
  assert.deepStrictEqual(history.tasks(rows, 3), ['Письма', 'отчёт', 'Код']);
  var week = history.week(rows, now);
  assert.deepStrictEqual([week.minutes, week.sessions, week.attempts, week.calmDays], [190, 4, 2, 1]);
  assert.strictEqual(history.duration(25), '25 мин');
  assert.strictEqual(history.duration(120), '2 ч');
});

t.run('summary');
