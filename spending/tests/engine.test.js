// node tests/engine.test.js — main.js on its whole way, in a stand-in engine (tests/sim.js): a push
// and an SMS become one operation in the table and in the shared base, a hold closes, a transfer to
// oneself is grey, the dictionary and the model sort shops, the budget warns once, subscriptions are
// found and reminded of, a new format is learned as a rule, the SMS history is imported.
var assert = require('assert');
var path = require('path');
var sim = require('./sim.js');

if (!sim.realBase()) {
  console.log('engine: пропущено — нужен репозиторий Assi рядом (lib/base.js)');
  process.exit(0);
}

var ROOT = path.resolve(__dirname, '..');
var failed = 0;
var passed = 0;
var T0 = new Date(2026, 10, 14, 14, 5).getTime();
var MIN = 60000;
var DAY = 864e5;

function check(name, fn) {
  var engine = sim.create({ spending: ROOT });
  engine.env.now = T0;
  try {
    var spending = engine.require('modules/spending/main.js');
    spending.start();
    fn(spending, engine.env, engine.require);
    passed++;
  } catch (error) {
    failed++;
    console.log('FAIL ' + name + '\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 4).join('\n  ') : error));
  } finally {
    engine.close();
  }
}

function push(env, pkg, title, text, extra) {
  var notice = { package: pkg, app: pkg, title: title, text: text, time: env.now, key: '0|' + pkg + '|' + Math.random() };
  Object.keys(extra || {}).forEach(function (k) { notice[k] = extra[k]; });
  return env.handlers.notification(notice);
}

function sms(env, from, text) {
  return env.handlers.sms({ from: from, text: text });
}

function counted(spending) {
  return spending.feed({}).days.reduce(function (sum, day) { return sum + day.total; }, 0);
}

check('start subscribes to pushes and SMS, sets jobs, puts the tool stub', function (spending, env, req) {
  assert.ok(env.handlers.notification && env.handlers.sms);
  assert.ok(env.jobs['spending:subs'] && env.jobs['spending:daily']);
  var stub = req('lib/assi').files.read('tools/spending.js');
  assert.ok(stub.indexOf('modules/spending/tool.js') > 0);
});

check('a push of Т-Банк: one operation, the shop by the dictionary, a record in the base', function (spending, env, req) {
  var r = push(env, 'com.idamob.tinkoff.android', 'Покупка 350 ₽', 'Пятёрочка. Карта *1234. Доступно 12 345,67 ₽');
  assert.strictEqual(r.status, 'ok');
  var tx = spending.tx(r.id);
  assert.strictEqual(tx.name, 'Пятёрочка');
  assert.strictEqual(tx.category, 'Продукты');
  assert.strictEqual(tx.card, '1234');
  var base = req('lib/base');
  var records = base.find({ kind: 'expense' });
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].amount, 350);
  assert.deepStrictEqual(records[0].tags, ['продукты']);
  assert.strictEqual(records[0].data.txId, r.id);
  assert.ok(env.widget > 0, 'widget redrawn');
  assert.ok(env.emitted.some(function (e) { return e.name === 'spending.changed'; }));
});

check('the same notification updated is not a second purchase', function (spending, env) {
  var notice = { package: 'com.idamob.tinkoff.android', title: 'Покупка 350 ₽', text: 'Пятёрочка. Карта *1234', time: env.now, key: 'k1' };
  env.handlers.notification(notice);
  env.handlers.notification(notice);
  notice.text = 'Пятёрочка. Карта *1234. Доступно 12 345,67 ₽';
  env.handlers.notification(notice);
  assert.strictEqual(spending.last(10).length, 1);
});

check('SMS, push and wallet of one purchase are one in the sums; the richest record stays', function (spending, env, req) {
  var a = sms(env, '900', 'MIR-1234 14:05 Покупка 350р PYATEROCHKA 1234 Баланс: 12 345.67р');
  env.now += 20000;
  var b = push(env, 'com.samsung.android.spay', 'Samsung Wallet', 'Оплачено 350,00 ₽ · Карта Мир *1234');
  env.now += 20000;
  var c = push(env, 'ru.sberbankmobile', 'СберБанк', 'Покупка 350 ₽ PYATEROCHKA, карта MIR ••1234. Баланс 12 345,67 ₽');
  assert.strictEqual(a.status, 'ok');
  assert.ok(b.dupOf || c.dupOf, 'repeats glued');
  var feed = spending.feed({});
  assert.strictEqual(feed.days[0].items.length, 1);
  assert.strictEqual(counted(spending), 350);
  assert.strictEqual(req('lib/base').find({ kind: 'expense' }).length, 1);
  var all = spending.feed({ all: true }).days[0].items;
  assert.strictEqual(all.length, 3);
  var kept = all.filter(function (tx) { return !tx.dupOf; })[0];
  assert.notStrictEqual(kept.source, 'wallet');
  // Split two real purchases glued by mistake.
  var dup = all.filter(function (tx) { return tx.dupOf; })[0];
  spending.split(dup.id);
  assert.strictEqual(counted(spending), 700);
});

check('two purchases from one sender are two even within the window', function (spending, env) {
  push(env, 'com.idamob.tinkoff.android', 'Покупка 250 ₽', 'Кофемания. Карта *1234. Доступно 1 000 ₽');
  env.now += 3 * MIN;
  push(env, 'com.idamob.tinkoff.android', 'Покупка 250 ₽', 'Кофемания. Карта *1234. Доступно 750 ₽');
  assert.strictEqual(counted(spending), 500);
});

check('a hold and its final debit are one purchase of the final amount', function (spending, env, req) {
  push(env, 'com.idamob.tinkoff.android', 'Блокировка 1 000 ₽', 'AZS LUKOIL. Карта *1234. Доступно 7 520 ₽');
  env.now += 2 * DAY;
  push(env, 'com.idamob.tinkoff.android', 'Покупка 987 ₽', 'AZS LUKOIL. Карта *1234. Доступно 7 533 ₽');
  assert.strictEqual(counted(spending), 987);
  var records = req('lib/base').find({ kind: 'expense' });
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].amount, 987);
});

check('out of one bank and into another in minutes is a transfer to oneself', function (spending, env, req) {
  var out = push(env, 'ru.sberbankmobile', 'СберБанк', 'Перевод 2 000 ₽ Иван П., карта MIR ••1234. Баланс 4 983,10 ₽');
  env.now += 40000;
  var into = push(env, 'com.idamob.tinkoff.android', 'Пополнение 2 000 ₽', 'Перевод от Иван П. Доступно 13 432 ₽');
  assert.strictEqual(spending.tx(out.id).internal, 1);
  assert.strictEqual(spending.tx(into.id).internal, 1);
  assert.strictEqual(counted(spending), 0);
  assert.strictEqual(req('lib/base').find({ kinds: ['expense', 'income'] }).length, 0);
});

check('a refund is a negative expense in the base; declined is kept but not counted', function (spending, env, req) {
  push(env, 'com.idamob.tinkoff.android', 'Покупка 1 299 ₽', 'OZON.RU. Карта *1234. Доступно 12 731 ₽');
  env.now += DAY;
  push(env, 'com.idamob.tinkoff.android', 'Возврат 1 299 ₽', 'OZON.RU. Карта *1234. Доступно 14 030 ₽');
  push(env, 'com.idamob.tinkoff.android', 'Отказ 3 500 ₽', 'Пятёрочка. Недостаточно средств. Карта *1234');
  var base = req('lib/base');
  var total = base.find({ kind: 'expense' }).reduce(function (s, r) { return s + r.amount; }, 0);
  assert.strictEqual(total, 0);
  assert.strictEqual(spending.last(10).length, 3);
  assert.strictEqual(counted(spending), 0);
});

check('codes and ads are never stored, not even as unparsed', function (spending, env) {
  push(env, 'com.idamob.tinkoff.android', 'Код для входа', 'Никому не сообщайте код 4821');
  sms(env, '900', 'Код: 482913. Никому не сообщайте код, даже сотруднику банка.');
  push(env, 'com.idamob.tinkoff.android', 'Т-Банк', 'Одобрен кредит до 500 000 ₽ — заберите деньги в приложении');
  assert.strictEqual(spending.last(10).length, 0);
  assert.strictEqual(spending.sources().unparsed.length, 0);
});

check('an unknown shop waits in «Прочее»; the model sorts it, the dictionary and the base learn', function (spending, env, req) {
  var r = push(env, 'com.idamob.tinkoff.android', 'Покупка 780 ₽', 'BULOCHNAYA NA UGLU. Карта *1234. Доступно 9 565 ₽');
  assert.strictEqual(spending.tx(r.id).category, 'Прочее');
  assert.ok(env.jobs['spending:category'], 'category job armed');
  env.models['spending.category'] = { provider: 'openrouter', model: 'x' };
  env.answer = function (role, options) {
    assert.strictEqual(role, 'spending.category');
    assert.ok(options.prompt.indexOf('Bulochnaya Na Uglu') >= 0 || options.prompt.indexOf('BULOCHNAYA') >= 0);
    return { 'Bulochnaya Na Uglu': 'Кафе и рестораны' };
  };
  var out = spending.runCategories();
  assert.strictEqual(out.sorted, 1);
  assert.strictEqual(spending.tx(r.id).category, 'Кафе и рестораны');
  assert.deepStrictEqual(req('lib/base').find({ kind: 'expense' })[0].tags, ['кафе и рестораны']);
  // The next purchase there is sorted at once.
  var r2 = push(env, 'com.idamob.tinkoff.android', 'Покупка 300 ₽', 'BULOCHNAYA NA UGLU. Карта *1234. Доступно 9 265 ₽');
  assert.strictEqual(spending.tx(r2.id).category, 'Кафе и рестораны');
});

check('without a model the shops stay in «Прочее» and nothing breaks', function (spending, env) {
  push(env, 'com.idamob.tinkoff.android', 'Покупка 780 ₽', 'BULOCHNAYA NA UGLU. Карта *1234. Доступно 9 565 ₽');
  var out = spending.runCategories();
  assert.strictEqual(out.status, 'no model');
  assert.strictEqual(counted(spending), 780);
});

check('the owner changes a category for all purchases of a shop; base.sum by the tag shows it', function (spending, env, req) {
  var a = push(env, 'com.idamob.tinkoff.android', 'Покупка 350 ₽', 'Пятёрочка. Карта *1234. Доступно 1 000 ₽');
  env.now += DAY;
  push(env, 'com.idamob.tinkoff.android', 'Покупка 150 ₽', 'Пятёрочка. Карта *1234. Доступно 850 ₽');
  spending.setCategory(a.id, 'Дом', true);
  var sum = req('lib/base').sum({ kind: 'expense', tag: 'дом', by: 'month' });
  assert.strictEqual(sum[0].total, 500);
  env.now += DAY;
  var c = push(env, 'com.idamob.tinkoff.android', 'Покупка 99 ₽', 'Пятёрочка. Карта *1234. Доступно 751 ₽');
  assert.strictEqual(spending.tx(c.id).category, 'Дом');
});

check('«это не трата» and «удалить» take the operation out of the sums and the base', function (spending, env, req) {
  var a = push(env, 'com.idamob.tinkoff.android', 'Покупка 350 ₽', 'Пятёрочка. Карта *1234. Доступно 1 000 ₽');
  var b = push(env, 'com.idamob.tinkoff.android', 'Покупка 150 ₽', 'Магнит. Карта *1234. Доступно 850 ₽');
  spending.setExcluded(a.id, true);
  assert.strictEqual(counted(spending), 150);
  spending.remove(b.id);
  assert.strictEqual(counted(spending), 0);
  assert.strictEqual(req('lib/base').find({ kind: 'expense' }).length, 0);
  spending.setExcluded(a.id, false);
  assert.strictEqual(req('lib/base').find({ kind: 'expense' }).length, 1);
});

check('the budget warns once at 80% and once at 100%; «на день» is the rest over the days left', function (spending, env) {
  spending.saveSettings({ budget: 10000 });
  push(env, 'com.idamob.tinkoff.android', 'Покупка 7 000 ₽', 'Пятёрочка. Карта *1234. Доступно 1 000 ₽');
  assert.strictEqual(env.notifications.length, 0);
  push(env, 'com.idamob.tinkoff.android', 'Покупка 1 500 ₽', 'Магнит. Карта *1234. Доступно 850 ₽');
  assert.strictEqual(env.notifications.length, 1);
  assert.ok(/80% бюджета ноября, до конца месяца 17 дней/.test(env.notifications[0].text), env.notifications[0].text);
  push(env, 'com.idamob.tinkoff.android', 'Покупка 100 ₽', 'Магнит. Карта *1234. Доступно 750 ₽');
  assert.strictEqual(env.notifications.length, 1);
  push(env, 'com.idamob.tinkoff.android', 'Покупка 2 000 ₽', 'Магнит. Карта *1234. Доступно 50 ₽');
  assert.strictEqual(env.notifications.length, 2);
  var o = spending.overview();
  assert.strictEqual(o.summary.spent, 10600);
  assert.strictEqual(o.summary.left, -600);
  var w = spending.widget();
  assert.strictEqual(w.title, 'Ноябрь: 10 600 из 10 000 ₽');
  assert.ok(/Бюджет превышен на 600 ₽/.test(w.text));
});

check('the widget and the day for neighbours', function (spending, env) {
  spending.saveSettings({ budget: 60000 });
  push(env, 'com.idamob.tinkoff.android', 'Покупка 41 200 ₽', 'М.Видео. Карта *1234. Доступно 1 000 ₽');
  var w = spending.widget();
  assert.strictEqual(w.title, 'Ноябрь: 41 200 из 60 000 ₽');
  // 18 800 left over 17 days including today → 1 105 a day.
  assert.strictEqual(w.text.split('\n')[0], 'На день: 1 105 ₽');
  var day = spending.dayBudget('2026-11-14');
  assert.strictEqual(day.spent, 41200);
  assert.strictEqual(day.ok, false);
  var next = spending.dayBudget('2026-11-15');
  assert.strictEqual(next.allowance, Math.floor(18800 / 16));
});

check('an unusual purchase is asked about, with the button «Это не трата» on a shell that has buttons', function (spending, env) {
  env.features = ['notify.actions'];
  for (var i = 0; i < 6; i++) {
    push(env, 'com.idamob.tinkoff.android', 'Покупка 900 ₽', 'Магнит. Карта *1234. Доступно 10 000 ₽');
    env.now += DAY / 2;
  }
  env.notifications.length = 0;
  push(env, 'com.idamob.tinkoff.android', 'Покупка 8 450 ₽', 'Магнит. Карта *1234. Доступно 1 000 ₽');
  var n = env.notifications.filter(function (x) { return x.title === 'Необычная трата'; })[0];
  assert.ok(n, 'asked');
  assert.strictEqual(n.text, 'Магнит 8 450 ₽ — в 9 раз больше обычного для продуктов. Верно?');
  assert.strictEqual(n.actions[0].fn, 'actionNotExpense');
  spending.actionNotExpense(n.actions[0].args);
  assert.strictEqual(spending.tx(n.actions[0].args.id).excluded, 1);
});

check('without the shell\'s buttons the notification is plain', function (spending, env) {
  env.features = null;
  for (var i = 0; i < 6; i++) {
    push(env, 'com.idamob.tinkoff.android', 'Покупка 900 ₽', 'Магнит. Карта *1234. Доступно 10 000 ₽');
    env.now += DAY / 2;
  }
  push(env, 'com.idamob.tinkoff.android', 'Покупка 2 800 ₽', 'Магнит. Карта *1234. Доступно 1 000 ₽');
  var n = env.notifications.filter(function (x) { return x.title === 'Необычная трата'; })[0];
  assert.ok(n);
  assert.ok(/втрое больше обычного/.test(n.text));
  assert.strictEqual(n.actions, undefined);
  assert.strictEqual(n.id, undefined);
});

check('a subscription: three monthly charges → a candidate → confirmed → a reminder two days before', function (spending, env) {
  var start = new Date(2026, 7, 17, 9, 0).getTime();
  [0, 1, 2].forEach(function (m) {
    env.now = new Date(2026, 7 + m, 17, 9, 0).getTime();
    push(env, 'com.idamob.tinkoff.android', 'Покупка 399 ₽', 'KINOPOISK. Карта *1234. Доступно 5 000 ₽');
  });
  env.now = new Date(2026, 10, 1, 5, 0).getTime();
  var found = spending.runSubs();
  assert.strictEqual(found.added, 1);
  var subs = spending.subscriptions();
  assert.strictEqual(subs.candidates.length, 1);
  assert.strictEqual(subs.candidates[0].merchant, 'Кинопоиск');
  assert.strictEqual(new Date(subs.candidates[0].next).getDate(), 17);
  spending.confirmSub(subs.candidates[0].id, true);
  env.now = new Date(2026, 10, 15, 10, 0).getTime();
  env.installed = ['ru.kinopoisk'];
  env.features = ['usage', 'notify.actions'];
  env.usage = [{ package: 'ru.kinopoisk', app: 'Кинопоиск', ms: 600000, opens: 1 }];
  assert.strictEqual(spending.remind(), 1);
  var n = env.notifications.filter(function (x) { return x.title === 'Скоро спишут'; })[0];
  assert.strictEqual(n.text, 'Кинопоиск спишет 399 ₽ 17 ноября. За месяц вы открывали его один раз');
  assert.strictEqual(spending.remind(), 0, 'reminded once');
  assert.strictEqual(spending.overview().upcoming[0].merchant, 'Кинопоиск');
  spending.cancelSub(subs.candidates[0].id);
  assert.strictEqual(spending.subscriptions().confirmed.length, 0);
  void start;
});

check('a charge of 1 ₽ at a new shop is a trial; reminded before it ends', function (spending, env) {
  push(env, 'com.idamob.tinkoff.android', 'Покупка 1 ₽', 'Иви. Карта *1234. Доступно 3 999 ₽');
  spending.runSubs();
  var subs = spending.subscriptions();
  assert.strictEqual(subs.trials.length, 1);
  env.now = T0 + 5 * DAY + HOURS(1);
  assert.strictEqual(spending.remind(), 1);
  assert.ok(/Пробный период Иви кончается 21 ноября/.test(env.notifications[env.notifications.length - 1].text));
});

function HOURS(n) { return n * 3600000; }

check('a new format: the model reads it (checked against the text), three samples make a rule', function (spending, env) {
  spending.saveSettings({ packages: ['com.example.newbank'] });
  env.models['spending.parse'] = { provider: 'local', model: 'gemma' };
  env.models['spending.rules'] = { provider: 'local', model: 'gemma' };
  var texts = [
    ['Новый банк', 'Вы потратили 320,00 RUB в KOFEYNYA LAVKA по карте 5555. Остаток: 9 680,00 RUB', 320],
    ['Новый банк', 'Вы потратили 1 150,00 RUB в MAGNIT по карте 5555. Остаток: 8 530,00 RUB', 1150],
    ['Новый банк', 'Вы потратили 89,90 RUB в METRO MOSKVA по карте 5555. Остаток: 8 440,10 RUB', 89.9]
  ];
  env.answer = function (role, options) {
    if (role === 'spending.parse') {
      var t = texts.filter(function (x) { return options.prompt.indexOf(x[1]) >= 0; })[0];
      var shop = /в (.+?) по карте/.exec(t[1])[1];
      return { type: 'purchase', amount: t[2], currency: 'RUB', merchant: shop, card: '5555', balance: null, time: null };
    }
    if (role === 'spending.rules') {
      return { re: 'Вы потратили (?<amount>{AMT}) (?<currency>{CUR}) в (?<merchant>.+?) по карте (?<card>{CARD})', type: 'purchase' };
    }
    throw new Error('role ' + role);
  };
  texts.forEach(function (t) {
    var r = push(env, 'com.example.newbank', t[0], t[1]);
    assert.strictEqual(r.status, 'unknown');
    env.now += HOURS(1);
  });
  assert.strictEqual(spending.last(10).length, 3);
  assert.strictEqual(spending.sources().unparsed.length, 0);
  var rules = spending.rulesList().filter(function (r) { return r.own; });
  assert.strictEqual(rules.length, 1);
  // The fourth one is read by the rule, without the model.
  var asked = env.asked.length;
  var r4 = push(env, 'com.example.newbank', 'Новый банк', 'Вы потратили 500,00 RUB в PYATEROCHKA по карте 5555. Остаток: 7 940,10 RUB');
  assert.strictEqual(r4.status, 'ok');
  assert.strictEqual(env.asked.length, asked);
  assert.strictEqual(spending.tx(r4.id).name, 'Пятёрочка');
});

check('the model\'s invented amount is not believed', function (spending, env) {
  spending.saveSettings({ packages: ['com.example.newbank'] });
  env.models['spending.parse'] = { provider: 'local', model: 'gemma' };
  env.answer = function () { return { type: 'purchase', amount: 999, currency: 'RUB', merchant: 'X' }; };
  push(env, 'com.example.newbank', 'Новый банк', 'Вы потратили 320,00 RUB в KOFEYNYA LAVKA по карте 5555');
  assert.strictEqual(spending.last(10).length, 0);
  assert.strictEqual(spending.sources().unparsed.length, 1);
});

check('bank texts do not go to a cloud model unless allowed', function (spending, env) {
  spending.saveSettings({ packages: ['com.example.newbank'] });
  env.models['spending.parse'] = { provider: 'openrouter', model: 'big' };
  push(env, 'com.example.newbank', 'Новый банк', 'Вы потратили 320,00 RUB в KOFEYNYA LAVKA по карте 5555');
  assert.strictEqual(env.asked.length, 0);
  spending.saveSettings({ parseNew: 'cloud' });
  env.answer = function () { return { type: 'purchase', amount: 320, currency: 'RUB', merchant: 'KOFEYNYA LAVKA', card: '5555' }; };
  var id = spending.sources().unparsed[0].id;
  var r = spending.modelUnparsed(id);
  assert.strictEqual(r.status, 'ok');
});

check('apps outside the list that send money are offered in «Источники»', function (spending, env) {
  push(env, 'ru.somebank.app', 'Банк', 'Покупка 500 ₽ в KOFEYNYA. Карта *9999');
  push(env, 'org.telegram.messenger', 'Маша', 'привет');
  var src = spending.sources();
  assert.strictEqual(src.suggested.length, 1);
  assert.strictEqual(src.suggested[0].id, 'ru.somebank.app');
  spending.setSource('app', 'ru.somebank.app', true);
  assert.strictEqual(spending.sources().suggested.length, 0);
  var r = push(env, 'ru.somebank.app', 'Банк', 'Покупка 600 ₽ в KOFEYNYA. Карта *9999');
  assert.strictEqual(r.status, 'ok');
});

check('import of the SMS history: senders from the list, no repeats with the SMS seen live', function (spending, env) {
  var day = function (n, h) { return new Date(2026, 10, n, h || 12, 0).getTime(); };
  env.sms = [
    { address: '900', body: 'MIR-1234 12:00 Покупка 350р PYATEROCHKA 1234 Баланс: 12 345.67р', date: day(1) },
    { address: '900', body: 'MIR-1234 12:00 Покупка 1 299р YANDEX*TAXI Баланс: 11 046.67р', date: day(2) },
    { address: 'Tinkoff', body: 'Покупка, карта *1234. 780 RUB. SHOKOLADNITSA. Доступно 9565.67 RUB', date: day(3) },
    { address: 'MAMA', body: 'Купи хлеба', date: day(3) },
    { address: '900', body: 'Код: 482913. Никому не сообщайте код', date: day(4) },
    { address: '900', body: 'MIR-1234 13:00 Покупка 450р MTS Баланс: 9 432.10р', date: T0 - 30000 }
  ];
  sms(env, '900', 'MIR-1234 13:00 Покупка 450р MTS Баланс: 9 432.10р');
  var out = spending.importSms();
  assert.strictEqual(out.seen, 5);
  assert.strictEqual(out.added, 3);
  assert.strictEqual(spending.last(10).length, 4);
  assert.strictEqual(spending.overview().imported, true);
  assert.strictEqual(env.notifications.length, 0, 'import is quiet');
});

check('an expense the agent wrote into the base shows in the feed as manual and counts', function (spending, env, req) {
  var base = req('lib/base');
  base.add({ kind: 'expense', title: 'Кофе', amount: 250, unit: 'RUB', tags: ['кафе и рестораны'], source: 'assi', at: T0 - 30 * MIN });
  var items = spending.feed({}).days[0].items;
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].source, 'manual');
  assert.strictEqual(items[0].category, 'Кафе и рестораны');
  assert.strictEqual(spending.overview().summary.spent, 250);
  // The same expense come from the bank later is not counted twice.
  push(env, 'com.idamob.tinkoff.android', 'Покупка 250 ₽', 'Кофемания. Карта *1234. Доступно 1 000 ₽');
  assert.strictEqual(spending.overview().summary.spent, 250);
});

check('the voice tool: add, last, not_expense, budget', function (spending, env, req) {
  spending.saveSettings({ budget: 60000 });
  var tool = req('tools/spending.js');
  assert.strictEqual(tool.name, 'spending');
  var said = tool.run({ action: 'add', amount: 250, title: 'кофе', category: 'Кафе и рестораны' });
  assert.ok(/Записано: #\d+ .* кофе −250 ₽ \(Кафе и рестораны\)/.test(said), said);
  assert.ok(/Ноябрь: потрачено 250 ₽ из 60 000 ₽/.test(tool.run({ action: 'budget' })));
  tool.run({ action: 'not_expense' });
  assert.ok(/Ноябрь: потрачено 0 ₽/.test(tool.run({ action: 'budget' })));
  assert.ok(/не трата/.test(tool.run({ action: 'last' })));
});

check('a purchase abroad: the bank\'s ruble sum, or the CBR rate and then the final ruble debit', function (spending, env) {
  push(env, 'com.idamob.tinkoff.android', 'Покупка 15,50 €', '1 612,40 ₽ по курсу банка. BOLT.EU. Карта *1234. Доступно 9 720 ₽');
  assert.strictEqual(counted(spending), 1612.4);
  env.http = function (url) {
    return { ok: true, status: 200, text: '', json: function () { return { Valute: { USD: { Nominal: 1, Value: 100 } } }; } };
  };
  var r = push(env, 'com.idamob.tinkoff.android', 'Покупка 12,99 $', 'NETFLIX.COM. Карта *1234. Доступно 8 520 ₽');
  assert.strictEqual(spending.tx(r.id).fx, 'cbr');
  assert.strictEqual(spending.tx(r.id).amountBase, 1299);
  env.now += DAY;
  sms(env, 'Tinkoff', 'Покупка, карта *1234. 1310 RUB. NETFLIX.COM. Доступно 7210 RUB');
  assert.strictEqual(Math.round(counted(spending) * 100) / 100, 1612.4 + 1310);
});

check('the month in review without a model, in plain sentences', function (spending, env) {
  env.now = new Date(2026, 9, 10, 12).getTime();
  push(env, 'com.idamob.tinkoff.android', 'Покупка 3 000 ₽', 'Пятёрочка. Карта *1234. Доступно 1 000 ₽');
  env.now = new Date(2026, 10, 1, 10, 0).getTime();
  var out = spending.daily();
  assert.strictEqual(out.review, '2026-10');
  var r = spending.reviews()[0];
  assert.strictEqual(r.via, 'code');
  assert.ok(/Октябрь: потрачено 3 000 ₽/.test(r.lines[0]), r.lines[0]);
  assert.ok(env.notifications.some(function (n) { return n.title === 'Траты: октябрь'; }));
  assert.strictEqual(spending.daily().review, null, 'once');
});

/** Operations for the achievements: a month seen from its start, a delivery three weeks ago, none this week. */
function quietWeek(spending, env) {
  spending.addManual({ amount: 1000, title: 'Пятёрочка', category: 'Продукты', at: new Date(2026, 9, 1, 12).getTime() });
  spending.addManual({ amount: 800, title: 'Самокат', category: 'Доставка еды', at: new Date(2026, 9, 25, 21).getTime() });
  spending.addManual({ amount: 500, title: 'Пятёрочка', category: 'Продукты', at: new Date(2026, 10, 10, 12).getTime() });
}

check('achievements without «Ачивки»: «Неделя без доставки» and «Месяц в бюджете» wait in the shared box, once', function (spending, env, req) {
  quietWeek(spending, env);
  spending.saveSettings({ budget: 50000 });
  var out = spending.daily();
  assert.deepStrictEqual(out.awards, ['spending/no-delivery-week', 'spending/month-in-budget']);
  var files = req('lib/assi').files;
  var box = files.readJson('data/games/achievements-outbox.json', []);
  assert.deepStrictEqual(box.map(function (i) { return i.key; }), ['spending/no-delivery-week', 'spending/month-in-budget']);
  assert.ok(/Октябрь: потрачено 1 800/.test(box[1].text), box[1].text);
  assert.deepStrictEqual(spending.daily().awards, [], 'once');
  assert.strictEqual(files.readJson('data/games/achievements-outbox.json', []).length, 2);
});

check('no achievements: a delivery this week and no budget set', function (spending, env, req) {
  quietWeek(spending, env);
  spending.addManual({ amount: 600, title: 'Самокат', category: 'Доставка еды', at: new Date(2026, 10, 12, 20).getTime() });
  assert.deepStrictEqual(spending.daily().awards, []);
  assert.strictEqual(req('lib/assi').files.exists('data/games/achievements-outbox.json'), false);
});

(function () {
  // «Ачивки» installed: the items go to their grant(), nothing to the box.
  var os = require('os');
  var fs = require('fs');
  var fake = fs.mkdtempSync(path.join(os.tmpdir(), 'assi-achievements-'));
  fs.writeFileSync(path.join(fake, 'main.js'), 'exports.got = [];\nexports.grant = function (item) { exports.got.push(item); return { ok: true }; };\n');
  var engine = sim.create({ spending: ROOT, achievements: fake });
  engine.env.now = T0;
  try {
    var spending = engine.require('modules/spending/main.js');
    spending.start();
    var files = engine.require('lib/assi').files;
    files.write('modules/achievements/main.js', '// installed');
    quietWeek(spending, engine.env);
    spending.daily();
    var got = engine.require('modules/achievements/main.js').got;
    assert.deepStrictEqual(got.map(function (i) { return i.key; }), ['spending/no-delivery-week']);
    assert.strictEqual(got[0].category, 'Траты');
    assert.strictEqual(files.exists('data/games/achievements-outbox.json'), false);
    passed++;
  } catch (error) {
    failed++;
    console.log('FAIL achievements with «Ачивки»\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 4).join('\n  ') : error));
  } finally {
    engine.close();
  }
})();

console.log('engine: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
