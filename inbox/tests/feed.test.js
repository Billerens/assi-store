// node tests/feed.test.js
var assert = require('assert');
var t = require('./harness.js');
var feed = require('../logic/feed.js');
var digest = require('../logic/digest.js');

var NOW = 1700000000000;
var settings = { digestThreshold: 15, digestHours: 2, digestRecount: 5, names: ['Илья'], draftCount: 3, tone: 'на ты, коротко' };

t.test('a group digest is due by count, by time unopened, or when the feed is open', function () {
  var chat = { isGroup: 1, openedAt: 0 };
  assert.ok(digest.due(chat, { unread: 15, sinceDigest: 15, oldestUnread: NOW }, NOW, settings, false));
  assert.ok(!digest.due(chat, { unread: 6, sinceDigest: 6, oldestUnread: NOW - 3600000 }, NOW, settings, false));
  assert.ok(digest.due(chat, { unread: 6, sinceDigest: 6, oldestUnread: NOW - 3 * 3600000 }, NOW, settings, false));
  assert.ok(digest.due(chat, { unread: 6, sinceDigest: 6, oldestUnread: NOW }, NOW, settings, true));
  assert.ok(!digest.due(chat, { unread: 40, sinceDigest: 3, oldestUnread: NOW }, NOW, settings, true), 'redone only after 5 more');
  assert.ok(!digest.due({ isGroup: 0 }, { unread: 40, sinceDigest: 40 }, NOW, settings, true));
});

t.test('a digest without a model', function () {
  var text = digest.plain([
    { sender: 'Петя', text: 'Собираемся в субботу?' },
    { sender: 'Маша', text: 'Да, у бабушки' },
    { sender: 'Петя', text: 'Илья, ты берёшь торт?' },
    { sender: 'Вова', text: 'ок' }
  ], settings.names);
  assert.ok(text.indexOf('4 сообщения: пишут Петя, Маша и ещё 1') === 0, text);
  assert.ok(text.indexOf('вас упомянули: Петя — «Илья, ты берёшь торт?»') > 0, text);
  assert.ok(text.indexOf('последнее: Вова — «ок»') > 0, text);
});

t.test('digest and draft requests', function () {
  var request = digest.prompt('Семья', [{ sender: 'Петя', text: 'привет' }, { hidden: true, text: '' }], settings);
  assert.ok(request.system.indexOf('(Илья)') > 0);
  assert.strictEqual(request.prompt, 'Группа «Семья»:\nПетя: привет');
  var draft = digest.draftPrompt({ title: 'Петя', isGroup: 0 }, [{ sender: 'Петя', text: 'Во сколько?' }, { own: true, text: 'Скоро' }], ['Петя — брат, живёт в Казани'], settings);
  assert.ok(draft.system.indexOf('3 коротких варианта') > 0);
  assert.ok(draft.system.indexOf('Тон: на ты, коротко') > 0);
  assert.ok(draft.prompt.indexOf('Владелец: Скоро') > 0);
  assert.ok(draft.prompt.indexOf('- Петя — брат, живёт в Казани') > 0);
  assert.deepStrictEqual(digest.readDrafts({ drafts: ['Буду в семь', '«Буду в семь»', '', 'Опоздаю', 'x', 'y'] }, 3), ['Буду в семь', 'Опоздаю', 'x']);
  assert.strictEqual(digest.tidy('"Собираются в субботу.\nТорт на вас.\nЛишнее"'), 'Собираются в субботу. Торт на вас.');
});

function card(id, title, isGroup, unread, last, extra) {
  var chat = { id: id, title: title, isGroup: isGroup, lastTime: last.time, app: 'Telegram', package: 'org.telegram.messenger', canReply: 1 };
  Object.keys(extra || {}).forEach(function (key) { chat[key] = extra[key]; });
  return feed.card(chat, last, unread);
}

t.test('cards, tabs and counts', function () {
  var cards = [
    card('a', 'Петя', 0, [{ bucket: 'important', asks: 1 }], { sender: 'Петя', text: 'Во сколько встречаемся?', time: NOW - 1000, bucket: 'important' }),
    card('b', 'Семья', 1, [{ bucket: 'noise' }, { bucket: 'later' }, { bucket: 'otp' }], { sender: 'Маша', text: 'ура', time: NOW - 500, bucket: 'noise' }, { digest: 'собираемся в субботу' }),
    card('c', 'Маша', 0, [], { sender: 'Маша', text: 'спасибо', time: NOW - 100, bucket: 'later' }),
    card('d', 'Скрытый', 0, [{ bucket: 'hidden' }], { sender: '', text: '', time: NOW - 50, bucket: 'hidden' })
  ];
  assert.strictEqual(cards[1].bucket, 'later');
  assert.strictEqual(cards[3].bucket, 'later');
  assert.ok(cards[3].preview.hidden);
  assert.deepStrictEqual(feed.counts(cards), { important: 1, later: 2, noise: 0, all: 4 });
  assert.deepStrictEqual(feed.tab(cards, 'important').map(function (c) { return c.id; }), ['a']);
  assert.deepStrictEqual(feed.tab(cards, 'later').map(function (c) { return c.id; }), ['d', 'b']);
  assert.deepStrictEqual(feed.tab(cards, 'all').map(function (c) { return c.id; }), ['a', 'd', 'b', 'c']);
  assert.strictEqual(feed.firstTab(feed.counts(cards)), 'important');
  assert.strictEqual(feed.firstTab({ important: 0, later: 3 }), 'later');
  var widget = feed.widget(cards, 2);
  assert.strictEqual(widget.text.split('\n')[0], 'Важно: 1 · Подождёт: 2');
  assert.strictEqual(widget.text.split('\n')[1], 'Петя: Во сколько встречаемся?');
  assert.strictEqual(widget.text.split('\n')[2], 'Скрытый: текст скрыт');
  assert.strictEqual(feed.line(cards[1]), 'Семья: 3 новых, собираемся в субботу');
  assert.ok(feed.widget([], 2).text.indexOf('Пока пусто') === 0);
});

t.test('the summary of a period for Focus', function () {
  var chats = {
    p: { id: 'p', title: 'Петя', isGroup: 0, canReply: 1 },
    f: { id: 'f', title: 'Семья', isGroup: 1, digest: 'обсуждали субботу', digestAt: NOW - 1000 },
    w: { id: 'w', title: 'Рабочий чат', isGroup: 1 }
  };
  var messages = [
    { id: 1, chatId: 'p', sender: 'Петя', text: 'Во сколько встреча?', bucket: 'important', asks: 1, time: NOW - 900 },
    { id: 2, chatId: 'f', sender: 'Маша', text: 'привет', bucket: 'noise', time: NOW - 800 },
    { id: 3, chatId: 'f', sender: 'Петя', text: 'суббота?', bucket: 'later', time: NOW - 700 },
    { id: 4, chatId: 'w', sender: 'Шеф', text: 'всем спасибо', bucket: 'noise', time: NOW - 600 },
    { id: 5, chatId: 'w', sender: 'Аня', text: 'отчёт готов', bucket: 'later', time: NOW - 500 },
    { id: 6, chatId: 'w', sender: 'Аня', text: 'ок', bucket: 'noise', time: NOW - 400 },
    { id: 7, chatId: 'x', sender: 'Банк', text: 'Код 1234', bucket: 'otp', time: NOW - 300 }
  ];
  var summary = feed.since(messages, chats, NOW - 3600000, NOW, ['Илья']);
  assert.strictEqual(summary.total, 6);
  assert.strictEqual(summary.chats, 3);
  assert.strictEqual(summary.important.length, 1);
  assert.strictEqual(summary.important[0].chat, 'Петя');
  assert.deepStrictEqual(summary.others.map(function (o) { return o.line; }), ['Рабочий чат — 3, вас не упоминали', 'Семья — 2, обсуждали субботу']);
  assert.deepStrictEqual(summary.byBucket, { important: 1, later: 2, noise: 3 });
});

t.test('finding a chat by a name said aloud', function () {
  var chats = [
    { id: 1, title: 'Петя', isGroup: 0, lastTime: 10 },
    { id: 2, title: 'Петя и компания', isGroup: 1, lastTime: 20 },
    { id: 3, title: 'Мама', isGroup: 0, lastTime: 5 },
    { id: 4, title: 'Семья', isGroup: 1, lastTime: 30 },
    { id: 5, title: 'Иван Петров', isGroup: 0, lastTime: 1 }
  ];
  assert.strictEqual(feed.findChat(chats, 'Пете').id, 1);
  assert.strictEqual(feed.findChat(chats, 'маме').id, 3);
  assert.strictEqual(feed.findChat(chats, 'в чат Семья').id, 4);
  assert.strictEqual(feed.findChat(chats, 'Ивану').id, 5);
  assert.strictEqual(feed.findChat(chats, 'Оле'), null);
});

t.test('days', function () {
  var day = feed.day(new Date(2026, 10, 14, 15, 30).getTime());
  assert.strictEqual(day.key, '2026-11-14');
  assert.strictEqual(day.start, new Date(2026, 10, 14).getTime());
});

t.run('feed');
