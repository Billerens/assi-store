// node tests/parse.test.js
var assert = require('assert');
var t = require('./harness.js');
var parse = require('../logic/parse.js');
var sha1 = require('../logic/sha1.js').sha1;
var factory = require('../parsers.json');

var all = parse.merge(factory, null);
var telegram = parse.parserFor('org.telegram.messenger', all);
var whatsapp = parse.parserFor('com.whatsapp', all);

function notice(fields) {
  var base = { app: 'Telegram', package: 'org.telegram.messenger', title: '', text: '', time: 1000, key: 'k', canReply: true };
  Object.keys(fields).forEach(function (key) { base[key] = fields[key]; });
  return base;
}

t.test('sha1 of known values', function () {
  assert.strictEqual(sha1(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  assert.strictEqual(sha1('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.strictEqual(sha1('The quick brown fox jumps over the lazy dog'), '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');
  // UTF-8: the same as node's crypto
  var crypto = require('crypto');
  ['Привет, мир', 'ёжик 🦔 в тумане', 'a'.repeat(1000)].forEach(function (text) {
    assert.strictEqual(sha1(text), crypto.createHash('sha1').update(text, 'utf8').digest('hex'));
  });
});

t.test('Telegram personal chat: the title is the sender', function () {
  var out = parse.parseNotice(notice({ title: 'Петя', text: 'Во сколько встречаемся?' }), telegram, function () { return false; });
  assert.strictEqual(out.chat, 'Петя');
  assert.strictEqual(out.isGroup, false);
  assert.strictEqual(out.messages.length, 1);
  assert.strictEqual(out.messages[0].sender, 'Петя');
  assert.strictEqual(out.messages[0].text, 'Во сколько встречаемся?');
});

t.test('Telegram group known as a group: the sender is split from the text', function () {
  var out = parse.parseNotice(notice({ title: 'Семья', text: 'Петя: Кто берёт торт?' }), telegram, function (title) { return title === 'Семья'; });
  assert.strictEqual(out.chat, 'Семья');
  assert.strictEqual(out.isGroup, true);
  assert.strictEqual(out.messages[0].sender, 'Петя');
  assert.strictEqual(out.messages[0].text, 'Кто берёт торт?');
});

t.test('Telegram group not known yet: the prefix is remembered, the chat stays personal for now', function () {
  var out = parse.parseNotice(notice({ title: 'Семья', text: 'Петя: Кто берёт торт?' }), telegram, function () { return false; });
  assert.strictEqual(out.isGroup, false);
  assert.strictEqual(out.prefix, 'Петя');
  assert.strictEqual(out.messages[0].text, 'Петя: Кто берёт торт?');
});

t.test('a colon in a personal message is not a sender', function () {
  var out = parse.parseNotice(notice({ title: 'Петя', text: 'в общем: буду в семь' }), telegram, function () { return false; });
  assert.strictEqual(out.prefix, null);
  assert.strictEqual(out.messages[0].sender, 'Петя');
});

t.test('counters are cut from the title', function () {
  var out = parse.parseNotice(notice({ title: 'Семья (3 сообщения)', text: 'Привет' }), telegram, function () { return false; });
  assert.strictEqual(out.chat, 'Семья');
});

t.test('WhatsApp group: "Семья: Петя" in the title', function () {
  var out = parse.parseNotice(notice({ package: 'com.whatsapp', app: 'WhatsApp', title: 'Семья: Петя', text: 'Собираемся в субботу в 15:00' }), whatsapp, null);
  assert.strictEqual(out.chat, 'Семья');
  assert.strictEqual(out.isGroup, true);
  assert.strictEqual(out.messages[0].sender, 'Петя');
});

t.test('WhatsApp group: "Петя @ Семья" and a counter', function () {
  var out = parse.parseNotice(notice({ package: 'com.whatsapp', title: 'Петя @ Семья (2 сообщения)', text: 'ок' }), whatsapp, null);
  assert.strictEqual(out.chat, 'Семья');
  assert.strictEqual(out.messages[0].sender, 'Петя');
});

t.test('WhatsApp summary is skipped', function () {
  var out = parse.parseNotice(notice({ package: 'com.whatsapp', title: 'WhatsApp', text: '5 сообщений из 2 чатов' }), whatsapp, null);
  assert.ok(out.skip);
});

t.test('hidden text is marked, not taken as a message text', function () {
  var out = parse.parseNotice(notice({ title: 'Telegram', text: 'Новое сообщение' }), telegram, null);
  assert.strictEqual(out.messages[0].hidden, true);
  assert.strictEqual(out.messages[0].text, '');
  var many = parse.parseNotice(notice({ title: 'Петя', text: 'You have a new message' }), telegram, null);
  assert.strictEqual(many.messages[0].hidden, true);
});

t.test('ongoing and empty notifications are skipped', function () {
  assert.strictEqual(parse.parseNotice(notice({ title: 'Музыка', text: 'Играет', ongoing: true }), telegram, null).skip, 'ongoing');
  assert.strictEqual(parse.parseNotice(notice({ title: 'Петя', text: '   ' }), telegram, null).skip, 'empty');
});

t.test('the full description: every message with its sender and time, own ones left out', function () {
  var out = parse.parseNotice(notice({
    title: 'Семья', conversationTitle: 'Семья', isGroup: true,
    messages: [
      { sender: 'Петя', text: 'Кто берёт торт?', time: 100 },
      { sender: null, text: 'Я возьму', time: 200 },
      { sender: 'Вы', text: 'и свечи', time: 250 },
      { sender: 'Маша', text: 'Ура', time: 300 }
    ]
  }), telegram, null);
  assert.strictEqual(out.isGroup, true);
  assert.deepStrictEqual(out.messages.map(function (m) { return m.sender; }), ['Петя', 'Маша']);
  assert.strictEqual(out.messages[1].msgTime, 300);
});

t.test('confirmation codes', function () {
  assert.ok(parse.isOtp('Ваш код подтверждения: 482913. Никому не сообщайте его'));
  assert.ok(parse.isOtp('G-123456 is your Google verification code'));
  assert.ok(parse.isOtp('Код для входа 123 456'));
  assert.ok(!parse.isOtp('Встречаемся в 1800 году'));
  assert.ok(!parse.isOtp('Код ресторана не помню'));
  var out = parse.parseNotice(notice({ package: 'com.samsung.android.messaging', title: '900', text: 'Код: 5532. Не сообщайте никому' }), parse.parserFor('com.samsung.android.messaging', all), null);
  assert.strictEqual(out.messages[0].otp, true);
});

t.test('a chat is a group when distinct prefixes keep coming', function () {
  assert.ok(parse.looksGroup(['Петя', 'Маша'], 2));
  assert.ok(!parse.looksGroup(['Петя', 'Петя', 'Петя'], 2));
  assert.ok(!parse.looksGroup(['Итак', '', '', '', 'Значит', '', ''], 2));
});

t.test('earlier messages are split once the chat turns out a group', function () {
  var updates = parse.reparse([
    { id: 1, sender: 'Семья', text: 'Петя: привет' },
    { id: 2, sender: 'Маша', text: 'уже разобрано' },
    { id: 3, sender: 'Семья', text: 'просто текст' }
  ], 'Семья', telegram);
  assert.deepStrictEqual(updates, [{ id: 1, sender: 'Петя', text: 'привет' }]);
});

t.test('chat ids: case, spaces, ё, invisible marks, dual profile', function () {
  assert.strictEqual(parse.chatId('com.whatsapp', '  Семья  Ёлкиных\u200E', 0), 'com.whatsapp:семья елкиных');
  assert.strictEqual(parse.chatId('com.whatsapp', 'Семья', 10), 'com.whatsapp:семья#10');
});

t.test('saved parsers replace the factory ones by id and add new ones', function () {
  var merged = parse.merge(factory, { parsers: [{ id: 'telegram', name: 'TG', packages: ['org.telegram.messenger'] }, { id: 'new', packages: ['x.y'] }] });
  assert.strictEqual(parse.parserFor('org.telegram.messenger', merged).name, 'TG');
  assert.strictEqual(parse.parserFor('x.y', merged).id, 'new');
  assert.strictEqual(parse.parserFor('unknown.app', merged).id, 'generic');
});

t.test('genitive of names', function () {
  assert.strictEqual(parse.genitive('Петя'), 'Пети');
  assert.strictEqual(parse.genitive('Мама'), 'Мамы');
  assert.strictEqual(parse.genitive('Маша'), 'Маши');
  assert.strictEqual(parse.genitive('Иван'), 'Ивана');
  assert.strictEqual(parse.genitive('Андрей'), 'Андрея');
  assert.strictEqual(parse.genitive('Игорь'), null);
  assert.strictEqual(parse.genitive('Петя Иванов'), null);
});

t.run('parse');
