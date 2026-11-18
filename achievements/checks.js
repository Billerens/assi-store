// Checks of «Ачивки за жизнь» on the phone (module_check runs them, and the app runs them after
// every agent's turn that changed the module — this is how rules the agent added get checked).
// They clean up after themselves: what they add to data/ and to the base, they remove.
var axiko = require('lib/axiko');
var files = axiko.files;
var MAIN = 'modules/achievements/main.js';

function main() {
  return require(MAIN);
}

function snapshot(path) {
  return files.exists(path) ? files.read(path) : null;
}

function restore(path, text) {
  if (text === null) files.remove(path);
  else files.write(path, text);
}

/** Runs fn with notifications switched off and puts list/state/settings back afterwards. */
function sandbox(fn) {
  var paths = ['data/achievements/list.json', 'data/achievements/state.json', 'data/achievements/settings.json', 'data/achievements/meta.json', 'data/pet/items.json'];
  var saved = paths.map(snapshot);
  var base = require('lib/base');
  var before = base.find({ kind: 'achievement', limit: 1 });
  var lastId = before.length ? before[0].id : 0;
  try {
    var settings = files.readJson('data/achievements/settings.json', {}) || {};
    settings.notify = 'none';
    files.writeJson('data/achievements/settings.json', settings);
    return fn();
  } finally {
    paths.forEach(function (path, i) { restore(path, saved[i]); });
    require('lib/base');
    axiko.db('base').exec("delete from records where kind = 'achievement' and id > ? and data like ?", [lastId, '%"checks/%']);
  }
}

exports['правила списка проходят проверку'] = function (t) {
  main().start();
  var errors = main().validate();
  t.equal(errors, [], 'ошибки в data/achievements/list.json');
  t.ok(main().list().length >= 96, 'в списке меньше стартовых 96 ачивок');
};

exports['движок правил: серия, пропуск дня без данных, пауза'] = function (t) {
  var rules = require('modules/achievements/rules.js');
  var goals = { steps: 8000, sleep: 450, bedtime: '00:00', water: 2000, stride: 0.75 };
  var day = function (date, fields) {
    var d = Object.assign({ date: date, paused: null, habitIds: [], chains: {} }, fields);
    d.known = { sleep: d.sleepMin !== undefined, steps: d.steps !== undefined, screen: false, places: false, spend: false };
    return d;
  };
  var def = { id: 'checks/streak', title: 'x', group: 'Движение', rule: { type: 'streak', when: { metric: 'steps', op: '>=', ref: 'stepsGoal' }, days: 3 } };
  var days = [
    day('2026-10-01', { steps: 9000 }), day('2026-10-02', { steps: 100 }), day('2026-10-03', { steps: 9000 }),
    day('2026-10-04', {}), day('2026-10-05', { steps: 0, paused: 'sick' }), day('2026-10-06', { steps: 8000 }), day('2026-10-07', { steps: 8100 })
  ];
  var skip = rules.evaluate(def, { days: days, goals: goals, pause: 'skip' });
  t.equal(skip.progress, 3, 'серия с пропуском дня без данных и дня паузы');
  t.equal(skip.tiers[0].metAt, '2026-10-07', 'серия из трёх набрана 7-го');
  var broken = rules.evaluate(def, { days: days, goals: goals, pause: 'break' });
  t.equal(broken.progress, 2, 'пауза рвёт серию по настройке');
  var count = rules.evaluate({ id: 'checks/count', title: 'x', group: 'Сон', rule: { type: 'count', when: { metric: 'steps', op: '>=', value: 8000 }, times: 2, within: 3 } }, { days: days, goals: goals });
  t.equal(count.tiers[0].metAt, '2026-10-03', 'два раза за три дня — уже 1-го и 3-го');
  var total = rules.evaluate({ id: 'checks/total', title: 'x', group: 'Движение', rule: { type: 'total', metric: 'steps', value: 30000 } }, { days: days, goals: goals });
  t.equal(total.progress, 34200);
};

exports['grant из игр заводит ачивку, повтор ничего не делает'] = function (t) {
  sandbox(function () {
    var item = { key: 'checks/game/first', source: 'games', category: 'Игротека', title: 'Проверочная', text: 'Проверка grant', at: Date.now(), hidden: false, icon: 'star' };
    var first = main().grant(item);
    t.ok(first.ok && first.granted, 'первый grant не выдал ачивку');
    var again = main().grant(item);
    t.ok(again.already, 'повтор с тем же key выдал ещё раз');
    var view = main().view();
    var shown = view.items.filter(function (one) { return one.id === 'checks/game/first'; })[0];
    t.ok(shown && shown.gotCount === 1 && shown.group === 'Игротека', 'ачивки нет в витрине');
    var record = require('lib/base').find({ kind: 'achievement', text: 'checks/game/first', limit: 5 });
    t.equal(record.length, 1, 'в общей базе должна быть ровно одна запись');
    var s = main().settings();
    t.equal(record[0].data.xp, s.xp[s.gamesRarity], 'опыт за игровую ачивку — по настройке редкости игр');
  });
};

exports['почтовый ящик игр забирается'] = function (t) {
  var outbox = 'data/games/achievements-outbox.json';
  var saved = snapshot(outbox);
  try {
    sandbox(function () {
      files.writeJson(outbox, [{ key: 'checks/game/outbox', source: 'games', category: 'Игротека', title: 'Из ящика', text: 'Проверка ящика', at: Date.now() }]);
      t.equal(main().drainOutbox(), 1);
      t.ok(!files.exists(outbox), 'ящик не опустел');
      t.ok(main().view().items.some(function (one) { return one.id === 'checks/game/outbox' && one.gotCount; }), 'ачивка из ящика не выдана');
    });
  } finally {
    restore(outbox, saved);
  }
};

exports['предпросмотр новой ачивки по истории'] = function (t) {
  var good = main().preview({ id: 'checks/three-k', title: 'Три тысячи', text: '3 дня подряд от 3 000 шагов', group: 'Движение', icon: 'flag', rarity: 'common',
    rule: { type: 'streak', when: { metric: 'steps', op: '>=', value: 3000 }, days: 3 } });
  t.ok(good.ok, 'правильное правило отклонено: ' + (good.errors || []).join('; '));
  t.ok(typeof good.matched === 'number', 'нет числа дней по истории');
  var bad = main().preview({ id: 'walker', title: 'Дубль', group: 'Движение', rule: { type: 'streak', when: { metric: 'шаги', op: '>=', value: 1 } } });
  t.ok(!bad.ok && bad.errors.length >= 2, 'ошибки в правиле не пойманы');
};

exports['событие и скрытые не видны до получения'] = function (t) {
  sandbox(function () {
    var view = main().view();
    var masked = view.items.filter(function (one) { return one.masked; });
    masked.forEach(function (one) {
      t.ok(one.title === 'Скрытое достижение' && one.progress === null, 'скрытая раскрыта: ' + one.id);
    });
    var summary = JSON.stringify(main().summary());
    main().list().filter(function (def) { return def.hidden; }).forEach(function (def) {
      var got = view.items.some(function (one) { return one.id === def.id && one.gotCount; });
      if (!got) t.ok(summary.indexOf(def.title) < 0, 'агенту видно название скрытой: ' + def.title);
    });
  });
};

exports['крючки Здоровья и виджет'] = function (t) {
  main().start();
  var hooks = files.readJson('data/health/hooks.json', []);
  var list = Array.isArray(hooks) ? hooks : hooks.hooks || [];
  t.ok(list.some(function (hook) { return hook.event === 'life.day' && hook.path === MAIN && hook.fn === 'onDay'; }), 'нет крючка life.day');
  var widget = main().widget();
  t.ok(/^Ачивки \d+ \/ \d+/.test(widget.text), 'виджет: ' + widget.text);
  t.ok(files.exists('tools/achievements.js'), 'инструмент агента не записан');
};

exports['экран показывает сетку значков'] = function (t) {
  var page = t.screen('modules/achievements/ui/index.html');
  t.wait(600);
  t.ok(page.count('.cell') > 0, 'на экране нет значков');
  t.ok(/Получено \d+ из \d+/.test(page.text('#summary')), 'нет строки «Получено N из M»');
  page.click('.cell');
  t.wait(300);
};

exports['карточка главного экрана: данные и кольцо'] = function (t) {
  var card = main().cardData();
  var sum = card.rarity.reduce(function (total, r) { return total + r.total; }, 0);
  t.equal(sum, card.total, 'по редкостям не сходится с общим числом');
  t.ok(card.daily.length >= 1 && card.daily.length <= 60, 'дней в графике: ' + card.daily.length);
  var page = t.screen('modules/achievements/ui/card.html');
  t.wait(600);
  t.ok(page.count('#ring svg') === 1, 'на карточке нет кольца');
  t.ok(/\d+%/.test(page.text('#ring')), 'на карточке нет процента');
};
