// The agents' tool "spending": writing an expense by voice, fixing the last operation, the
// subscriptions and the month's budget. The module puts a stub tools/spending.js into the
// workspace that points here (see installTool in main.js).
exports.name = 'spending';
exports.description = 'Траты владельца, которые модуль «Траты» сам записывает из пушей и SMS банков. ' +
  'Записать трату вручную («запиши: кофе 250» — action add), последние операции (last), «это была не трата» (not_expense), ' +
  '«это перевод себе» (internal), сменить категорию (category; all: true — для всех покупок в этом магазине), удалить (delete — только по ' +
  'явной просьбе владельца), подписки и ближайшие списания (subscriptions), бюджет месяца: потрачено, остаток, на день, категории (budget). ' +
  'Без id правки относятся к последней операции. Вопросы «сколько я потратил на такси за месяц» решайте по общей базе: ' +
  'base.sum / base_find с kind "expense" и tag — категорией строчными буквами («такси», «кафе и рестораны»); возвраты там с минусом. ' +
  'Финансовых советов не давайте: модуль показывает наблюдения, а не рекомендации.';
exports.parameters = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['add', 'last', 'not_expense', 'internal', 'category', 'delete', 'subscriptions', 'cancel_how', 'budget'],
      description: 'add — записать трату (amount, title, category?); last — последние операции (count); not_expense / internal — пометить операцию; ' +
        'category — сменить категорию (category, all); delete — удалить операцию; subscriptions — подписки (с их id); ' +
        'cancel_how — записать к подписке id, как её отменить (text: ссылка или шаги); budget — бюджет месяца'
    },
    amount: { type: 'number', description: 'add — сумма; отрицательная — возврат' },
    title: { type: 'string', description: 'add — что или где: «кофе», «Пятёрочка»' },
    category: { type: 'string', description: 'add, category — одна из категорий модуля: Продукты, Кафе и рестораны, Доставка еды, Такси, Транспорт, Связь и интернет, Подписки, Здоровье, Одежда, Дом, Развлечения, Переводы людям, Прочее' },
    currency: { type: 'string', description: 'add — код валюты, если не рубли: USD, EUR…' },
    when: { type: 'string', description: 'add — когда, если не сейчас: 2026-11-14T13:30' },
    id: { type: 'number', description: 'Номер операции из last; без него — последняя операция' },
    all: { type: 'boolean', description: 'category — для всех операций в этом магазине (по умолчанию да)' },
    count: { type: 'number', description: 'last — сколько операций (по умолчанию 5)' },
    note: { type: 'string', description: 'add — заметка к трате' },
    undo: { type: 'boolean', description: 'not_expense, internal — снять пометку' },
    text: { type: 'string', description: 'cancel_how — как отменить подписку: ссылка или короткие шаги' }
  },
  required: ['action']
};

function line(tx, money) {
  var d = new Date(tx.at);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var when = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  var sign = tx.type === 'refund' ? '+' : tx.type === 'income' || tx.type === 'transfer_in' || tx.type === 'cashback' ? '+' : '−';
  var marks = [];
  if (tx.internal) marks.push('перевод себе, не в тратах');
  if (tx.excluded) marks.push('не трата');
  if (tx.type === 'declined') marks.push('отказ');
  if (tx.type === 'hold') marks.push('холд');
  if (tx.foreign) marks.push('записано в базу вручную');
  return '#' + tx.id + ' ' + when + ' ' + tx.name + ' ' + sign + money.format(tx.amount, tx.currency) +
    (tx.category ? ' (' + tx.category + ')' : '') + (tx.card ? ' •' + tx.card : '') + (marks.length ? ' — ' + marks.join(', ') : '');
}

function target(spending, args) {
  if (args.id) return args.id;
  var last = spending.last(1)[0];
  if (!last) throw new Error('Операций пока нет');
  return last.id;
}

exports.run = function (args) {
  var spending = require('modules/spending/main.js');
  var money = require('modules/spending/logic/money.js');
  var view = require('modules/spending/logic/view.js');
  args = args || {};
  var action = String(args.action || 'budget');

  if (action === 'add') {
    if (args.amount === undefined || args.amount === null) return 'Нужна сумма (amount).';
    var added = spending.addManual({
      amount: args.amount, title: args.title, category: args.category, currency: args.currency, at: args.when, note: args.note
    });
    return 'Записано: ' + line(added, money) + '.';
  }

  if (action === 'last') {
    var list = spending.last(Math.min(Number(args.count) || 5, 30));
    if (!list.length) return 'Операций пока нет.';
    return list.map(function (tx) { return line(tx, money); }).join('\n');
  }

  if (action === 'not_expense') {
    var tx1 = spending.setExcluded(target(spending, args), !args.undo);
    return (args.undo ? 'Снова в тратах: ' : 'Не считается тратой: ') + line(tx1, money) + '.';
  }

  if (action === 'internal') {
    var tx2 = spending.setInternal(target(spending, args), !args.undo);
    return (args.undo ? 'Снова обычная операция: ' : 'Перевод себе, не в тратах: ') + line(tx2, money) + '.';
  }

  if (action === 'category') {
    if (!args.category) return 'Нужна категория (category).';
    var tx3 = spending.setCategory(target(spending, args), args.category, args.all !== false);
    return 'Категория «' + args.category + '»' + (args.all !== false ? ' — для всех операций в этом магазине' : '') + ': ' + line(tx3, money) + '.';
  }

  if (action === 'delete') {
    var id = target(spending, args);
    var before = spending.tx(id);
    if (!before) return 'Нет операции #' + id + '.';
    spending.remove(id);
    return 'Удалено: ' + line(before, money) + '.';
  }

  if (action === 'cancel_how') {
    if (!args.id) return 'Нужен id подписки (из action subscriptions).';
    var sub = spending.setSub(args.id, { cancelHow: args.text || '' });
    return 'Записано, как отменить «' + sub.merchant + '»: ' + (sub.cancelHow || 'пусто') + '.';
  }

  if (action === 'subscriptions') {
    var subs = spending.subscriptions();
    var parts = [];
    var period = { week: 'в неделю', month: 'в месяц', year: 'в год' };
    if (subs.confirmed.length) {
      parts.push('Подписки (' + money.format(subs.perMonth, subs.currency) + ' в месяц, ' + money.format(subs.perYear, subs.currency) + ' в год):\n' +
        subs.confirmed.map(function (sub) {
          return '- #' + sub.id + ' ' + sub.merchant + ': ' + money.format(sub.amount, sub.currency) + ' ' + period[sub.period] +
            (sub.next ? ', следующее списание ' + view.dateText(sub.next) : '') + (sub.cancelHow ? '; как отменить: ' + sub.cancelHow : '');
        }).join('\n'));
    }
    if (subs.candidates.length) {
      parts.push('Похоже на подписки (владелец ещё не подтвердил):\n' + subs.candidates.map(function (sub) {
        return '- ' + sub.merchant + ': ' + sub.count + ' списания по ' + money.format(sub.amount, sub.currency) + ' ' + period[sub.period];
      }).join('\n'));
    }
    if (subs.trials.length) {
      parts.push('Пробные периоды:\n' + subs.trials.map(function (sub) { return '- ' + sub.merchant + ' до ' + view.dateText(sub.next); }).join('\n'));
    }
    return parts.length ? parts.join('\n\n') : 'Подписок не найдено.';
  }

  // budget
  var month = spending.month(0);
  var sum = month.summary;
  var cur = month.currency;
  var head = month.label + ': потрачено ' + money.format(sum.spent, cur) +
    (sum.budget ? ' из ' + money.format(sum.budget, cur) + ', осталось ' + money.format(sum.left, cur) + ', на день — ' + money.format(sum.perDay, cur) +
      ' (' + sum.daysLeft + ' ' + view.plural(sum.daysLeft, 'день', 'дня', 'дней') + ' до конца месяца)' : ' (бюджет не задан)') + '.';
  var cats = sum.byCategory.slice(0, 8).map(function (item) {
    return '- ' + item.name + ': ' + money.format(item.sum, cur) + (item.limit ? ' из лимита ' + money.format(item.limit, cur) : '');
  });
  var soon = month.upcoming.map(function (sub) { return sub.merchant + ' ' + money.format(sub.amount, sub.currency) + ' ' + view.dateText(sub.next); });
  return head + (cats.length ? '\n' + cats.join('\n') : '') + (soon.length ? '\nСкоро спишут: ' + soon.join(', ') + '.' : '');
};
