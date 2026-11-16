// Checks of the inbox on the phone (module_check inbox): a made-up notification goes through the
// module's own handler, the way on('notification') gives it. Nothing is sent, the model is not
// called, every chat a check makes is removed after it.
var SCREEN = 'modules/inbox/ui/index.html';

function inbox() {
  return require('modules/inbox/main.js');
}

var stamp = String(Date.now()).slice(-6);
var counter = 0;

function notice(title, text, extra) {
  counter++;
  var made = {
    app: 'Telegram', package: 'org.telegram.messenger', title: title, text: text,
    time: Date.now() + counter, key: 'check|inbox|' + stamp + '|' + counter, canReply: false, ongoing: false
  };
  Object.keys(extra || {}).forEach(function (key) { made[key] = extra[key]; });
  return made;
}

var QUIET = { test: true, noModel: true };

exports['уведомление становится сообщением, повтор — нет'] = function (t) {
  var title = 'Проверка Петя ' + stamp;
  var first = inbox().handle(notice(title, 'Во сколько встречаемся?'), QUIET);
  try {
    t.ok(first.chatId, 'уведомление не дошло до ленты: ' + JSON.stringify(first));
    t.equal(first.added.length, 1, 'первое сообщение');
    var again = inbox().handle(notice(title, 'Во сколько встречаемся?'), QUIET);
    t.equal(again.added.length + again.edited.length, 0, 'обновление того же уведомления');
    var next = inbox().handle(notice(title, 'Позвони, как сможешь'), QUIET);
    t.equal(next.added.length, 1, 'второе сообщение');
    t.equal(inbox().messages(first.chatId).length, 2, 'сообщений в беседе');
    var card = inbox().cards().filter(function (item) { return item.id === first.chatId; })[0];
    t.ok(card && card.unread === 2, 'в ленте беседа с двумя новыми');
  } finally {
    if (first.chatId) inbox().forget(first.chatId);
  }
};

exports['правка заменяет сообщение'] = function (t) {
  var title = 'Проверка Правка ' + stamp;
  var first = inbox().handle(notice(title, 'Буду в 7 у входа'), QUIET);
  try {
    var edit = inbox().handle(notice(title, 'Буду в 8 у входа'), QUIET);
    t.equal(edit.edited.length, 1, 'правка');
    var list = inbox().messages(first.chatId);
    t.equal(list.length, 1, 'одна запись');
    t.equal(list[0].text, 'Буду в 8 у входа');
    t.equal(list[0].edited, 1, 'пометка «изменено»');
  } finally {
    inbox().forget(first.chatId);
  }
};

exports['группа: отправитель отделён от названия'] = function (t) {
  var group = 'Проверка Семья ' + stamp;
  var made = inbox().handle(notice(group + ': Петя', 'Собираемся в субботу в 15:00', { app: 'WhatsApp', package: 'com.whatsapp' }), QUIET);
  try {
    t.ok(made.isGroup, 'беседа — группа');
    var list = inbox().messages(made.chatId);
    t.equal(list[0].sender, 'Петя');
    t.equal(inbox().chatRow(made.chatId).title, group);
  } finally {
    inbox().forget(made.chatId);
  }
};

exports['Telegram: группа узнаётся по разным отправителям'] = function (t) {
  var group = 'Проверка Дача ' + stamp;
  var a = inbox().handle(notice(group, 'Петя: кто едет в субботу?'), QUIET);
  try {
    inbox().handle(notice(group, 'Маша: я еду'), QUIET);
    var chat = inbox().chatRow(a.chatId);
    t.equal(chat.isGroup, 1, 'беседа стала группой');
    var senders = inbox().messages(a.chatId).map(function (row) { return row.sender; });
    t.equal(senders, ['Петя', 'Маша'], 'ранние сообщения разобраны заново');
  } finally {
    inbox().forget(a.chatId);
  }
};

exports['код подтверждения не идёт в модель'] = function (t) {
  var made = inbox().handle(notice('900 ' + stamp, 'Ваш код 4821. Никому не сообщайте его', { package: 'com.samsung.android.messaging', app: 'Сообщения' }), QUIET);
  try {
    var row = inbox().messages(made.chatId)[0];
    t.equal(row.bucket, 'otp');
    t.equal(row.triagedBy, 'rule', 'код разобран правилом, без модели');
  } finally {
    inbox().forget(made.chatId);
  }
};

exports['правила владельца и работа без модели'] = function (t) {
  var title = 'Проверка Правило ' + stamp;
  var made = inbox().handle(notice(title, 'Нашёл старые фото'), QUIET);
  try {
    var row = inbox().messages(made.chatId)[0];
    t.equal(row.triagedBy, 'none', 'без модели — не разобрано');
    t.equal(row.reason, 'не разобрано');
    inbox().setOverride(made.chatId, 'important');
    inbox().handle(notice(title, 'И ещё видео'), QUIET);
    var rows = inbox().messages(made.chatId);
    t.ok(rows.every(function (item) { return item.bucket === 'important'; }), '«всегда важно» действует на новые и непрочитанные');
    t.equal(rows[1].triagedBy, 'rule');
  } finally {
    inbox().forget(made.chatId);
  }
};

exports['сводка за период для Фокуса'] = function (t) {
  var start = Date.now() - 1000;
  var title = 'Проверка Сводка ' + stamp;
  var made = inbox().handle(notice(title, 'Срочно перезвони'), QUIET);
  try {
    inbox().setOverride(made.chatId, 'important');
    var summary = inbox().since(start, Date.now() + 1000);
    var hit = summary.important.filter(function (item) { return item.chatId === made.chatId; });
    t.equal(hit.length, 1, 'важное сообщение в сводке');
    t.ok(summary.total >= 1);
  } finally {
    inbox().forget(made.chatId);
  }
};

exports['черновик по имени в другом падеже'] = function (t) {
  var made = inbox().handle(notice('Проверкин Тестович', 'Ты где?'), QUIET);
  try {
    var draft = inbox().draftFor('Проверкину Тестовичу', 'Буду в семь', 'voice', { notify: false, open: false, copy: false });
    t.ok(draft.found, 'беседа найдена: ' + draft.why);
    t.equal(draft.chatId, made.chatId);
    var saved = inbox().getDraft(draft.draftId);
    t.equal(saved.text, 'Буду в семь');
    t.equal(saved.status, 'new', 'ничего не отправлено');
  } finally {
    inbox().forget(made.chatId);
  }
};

exports['виджет'] = function (t) {
  var widget = inbox().widget();
  t.equal(widget.title, 'Входящие');
  t.ok(typeof widget.text === 'string' && widget.text.length > 0);
  t.equal(widget.open, SCREEN);
};

exports['экран показывает беседу'] = function (t) {
  var title = 'Проверка Экран ' + stamp;
  var made = inbox().handle(notice(title, 'Сообщение для экрана'), QUIET);
  try {
    var page = t.screen(SCREEN + '?chat=' + encodeURIComponent(made.chatId));
    var shown = 0;
    for (var i = 0; i < 12 && !shown; i++) {
      shown = page.count('.msg');
      if (!shown) t.wait(250);
    }
    t.ok(shown >= 1, 'сообщения беседы не показаны');
    t.equal(page.text('.chat-head h2'), title);
    t.ok(page.count('#tabs .chip') === 5, 'вкладки');
    t.ok(page.count('.gone') === 1, 'без живого уведомления — «Ответить отсюда нельзя»');
  } finally {
    inbox().forget(made.chatId);
  }
};
