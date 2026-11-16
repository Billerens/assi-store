// Checks of Траты on the phone (module_check spending): made-up bank messages go through the
// module's own way, the way on('notification') and on('sms') give them — quietly (no notifications,
// no model). Every operation a check makes is removed after it, with its record in the shared base.
var SCREEN = 'modules/spending/ui/index.html';

function spending() {
  return require('modules/spending/main.js');
}

function base() {
  return require('lib/base');
}

var stamp = String(Date.now()).slice(-5);
var QUIET = { quiet: true, noModel: true };

/** An amount nobody has just paid: 1 000–1 899 with kopecks from the stamp. */
function amount() {
  var n = 1000 + Number(stamp) % 900;
  return { text: String(n).replace(/^(\d)(\d{3})$/, '$1 $2') + ',' + stamp.slice(-2), value: n + Number(stamp.slice(-2)) / 100 };
}

function cleanup(ids) {
  ids.filter(Boolean).forEach(function (id) {
    try { spending().remove(id); } catch (error) { /* already gone */ }
  });
}

exports['пуш банка становится операцией и записью в общей базе'] = function (t) {
  var sum = amount();
  var shop = 'PROVERKA' + stamp;
  var r = spending().ingest({
    title: 'Покупка ' + sum.text + ' ₽', text: shop + '. Карта *0000. Доступно 1 000 ₽', sender: 'com.idamob.tinkoff.android',
    source: 'push', key: 'check|spending|' + stamp
  }, QUIET);
  try {
    t.equal(r.status, 'ok', 'разбор');
    var tx = spending().tx(r.id);
    t.equal(tx.amount, sum.value, 'сумма');
    t.equal(tx.card, '0000', 'карта');
    t.ok(tx.counted > 0, 'операция в суммах');
    var record = base().find({ kind: 'expense', source: 'spending', limit: 50 }).filter(function (x) { return x.data && x.data.txId === r.id; })[0];
    t.ok(record, 'запись в общей базе');
    t.equal(record.amount, sum.value, 'сумма в базе');
    var again = spending().ingest({
      title: 'Покупка ' + sum.text + ' ₽', text: shop + '. Карта *0000. Доступно 1 000 ₽', sender: 'com.idamob.tinkoff.android',
      source: 'push', key: 'check|spending|' + stamp
    }, QUIET);
    t.equal(again.status, 'skip', 'то же уведомление второй раз');
  } finally {
    cleanup([r.id]);
  }
  t.equal(base().find({ kind: 'expense', source: 'spending', limit: 50 }).filter(function (x) { return x.data && x.data.txId === r.id; }).length, 0, 'запись в базе удалена');
};

exports['пуш и SMS одной покупки — одна операция'] = function (t) {
  var sum = amount();
  var a = spending().ingest({ text: 'MIR-0000 12:00 Покупка ' + sum.text + 'р PROVERKA' + stamp + ' Баланс: 5 000.00р', sender: '900', source: 'sms' }, QUIET);
  var b = spending().ingest({
    title: 'СберБанк', text: 'Покупка ' + sum.text + ' ₽ PROVERKA' + stamp + ', карта MIR ••0000. Баланс 5 000,00 ₽',
    sender: 'ru.sberbankmobile', source: 'push', key: 'check|spending|b' + stamp
  }, QUIET);
  try {
    t.equal(a.status, 'ok', 'SMS');
    t.equal(b.status, 'ok', 'пуш');
    t.ok(a.dupOf || b.dupOf, 'повтор склеен');
    var keeper = b.dupOf ? a.id : b.id;
    t.equal(spending().tx(keeper).repeats.length, 1, 'у операции один повтор');
  } finally {
    cleanup([a.id, b.id]);
  }
};

exports['холд и окончательное списание — одна покупка'] = function (t) {
  var shop = 'AZS PROVERKA' + stamp;
  var hold = spending().ingest({ title: 'Блокировка 1 000 ₽', text: shop + '. Карта *0000. Доступно 7 520 ₽', sender: 'com.idamob.tinkoff.android', source: 'push', key: 'check|h1|' + stamp }, QUIET);
  var final = spending().ingest({ title: 'Покупка 987 ₽', text: shop + '. Карта *0000. Доступно 7 533 ₽', sender: 'com.idamob.tinkoff.android', source: 'push', key: 'check|h2|' + stamp }, QUIET);
  try {
    t.equal(hold.status, 'ok', 'холд');
    t.equal(spending().tx(hold.id).dupOf, final.id, 'холд закрыт списанием');
    t.equal(spending().tx(hold.id).counted, 0, 'холд не в суммах');
  } finally {
    cleanup([final.id, hold.id]);
  }
};

exports['коды и реклама не сохраняются'] = function (t) {
  var before = spending().status().unparsed;
  t.equal(spending().ingest({ text: 'Код: 48' + stamp.slice(-4) + '. Никому не сообщайте код', sender: '900', source: 'sms' }, QUIET).status, 'skip', 'код');
  t.equal(spending().ingest({ title: 'Т-Банк', text: 'Одобрен кредит до 500 000 ₽ — заберите деньги', sender: 'com.idamob.tinkoff.android', source: 'push' }, QUIET).status, 'skip', 'реклама');
  t.equal(spending().status().unparsed, before, 'в «Не разобрано» ничего не добавилось');
};

exports['бюджет, «на день» и виджет считаются'] = function (t) {
  var o = spending().overview();
  t.ok(o.period && o.period.label, 'месяц');
  t.ok(typeof o.summary.spent === 'number', 'потрачено');
  var w = spending().widget();
  t.ok(w.title.indexOf(o.period.label) === 0, 'заголовок виджета: ' + w.title);
  t.ok(w.text.length > 0, 'текст виджета');
  var day = spending().dayBudget();
  t.ok(day.date && typeof day.spent === 'number', 'день для соседей');
};

exports['подписки находятся кодом, без модели'] = function (t) {
  var subs = require('modules/spending/logic/subs.js');
  var DAY = 864e5;
  var at = function (m) { var d = new Date(); return new Date(d.getFullYear(), d.getMonth() - m, 5, 9, 0).getTime(); };
  var found = subs.detect([3, 2, 1].map(function (m, i) {
    return { id: i + 1, at: at(m), type: 'purchase', amount: 399, amountBase: 399, merchant: 'KINOPOISK', currency: 'RUB' };
  }), { minCount: 3, dayTol: 3, amountTolPct: 15, now: Date.now() });
  t.equal(found.length, 1, 'одна подписка');
  t.equal(found[0].period, 'month', 'раз в месяц');
  t.ok(found[0].next > Date.now() - DAY, 'следующее списание впереди');
};

exports['инструмент голоса на месте'] = function (t) {
  var files = require('lib/assi').files;
  t.ok(files.exists('tools/spending.js'), 'заглушка tools/spending.js');
  var tool = require('tools/spending.js');
  t.equal(tool.name, 'spending', 'имя инструмента');
  t.ok(/потрачено/.test(tool.run({ action: 'budget' })), 'бюджет голосом');
};

exports['экран открывается: вкладки, лента с операцией, карточка'] = function (t) {
  var sum = amount();
  var shop = 'PROVERKA' + stamp;
  var r = spending().ingest({ title: 'Покупка ' + sum.text + ' ₽', text: shop + '. Карта *0000', sender: 'com.idamob.tinkoff.android', source: 'push', key: 'check|s|' + stamp }, QUIET);
  try {
    var page = t.screen(SCREEN + '?tab=feed');
    t.equal(page.count('.tabs .chip'), 5, 'вкладок');
    t.wait(600);
    t.ok(page.eval('document.getElementById("feed").textContent.indexOf(' + JSON.stringify('Proverka' + stamp) + ') >= 0', 0), 'операция в ленте');
    page.click('.op');
    t.wait(400);
    t.ok(page.count('.sheet') === 1, 'карточка операции открылась');
    page.eval('document.querySelector(".sheet-back").click()', 0);
    page.click('.tabs .chip[data-id="overview"]');
    t.wait(600);
    t.ok(page.count('#overview .card') > 0, 'обзор нарисован');
    t.ok(page.count('#overview svg') + page.count('#overview .empty') > 0, 'график или пусто');
  } finally {
    cleanup([r.id]);
  }
};

exports['SMS: есть разрешение и история читается'] = function (t) {
  if (Number(context.checkSelfPermission('android.permission.READ_SMS')) !== 0) t.skip('нет разрешения READ_SMS — экран «Траты» спросит его при импорте');
  var rows = require('lib/assi').rows('content://sms/inbox', ['address', 'date'], null, null, 'date desc', 1);
  t.ok(Array.isArray(rows), 'content://sms/inbox отвечает');
};

exports['экранное время приложений (для напоминаний о подписках)'] = function (t) {
  var shell = require('modules/spending/shell.js');
  var opens = shell.opens(String(context.getPackageName()), Date.now() - 864e5);
  if (opens === null) t.skip('нет доступа к истории использования: в напоминаниях не будет, сколько раз открывали приложение');
  t.ok(opens >= 0, 'число открытий');
};
