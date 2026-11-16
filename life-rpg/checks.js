// Checks of «Жизнь-RPG» on the phone (module_check). They use a day far in the past (2000-01-03)
// with a made-up summary and clean up after themselves: the journal rows of that day, the state
// and the other files of data/rpg/ are put back as they were.
var assi = require('lib/assi');
var files = assi.files;
var MAIN = 'modules/rpg/main.js';
var DAY = '2000-01-03';
var PATHS = ['data/rpg/state.json', 'data/rpg/settings.json', 'data/rpg/active.json', 'data/rpg/chronicle.json', 'data/rpg/cells.json', 'data/rpg/locations.json'];

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

function journal() {
  return assi.db('rpg/xp');
}

/** Default formulas, no notifications; everything put back afterwards. */
function sandbox(fn) {
  var saved = PATHS.map(snapshot);
  try {
    files.writeJson('data/rpg/settings.json', { notify: { level: false, weeklyQuest: false }, quests: { model: false }, chronicle: { model: false } });
    return fn();
  } finally {
    PATHS.forEach(function (path, i) { restore(path, saved[i]); });
    journal().exec('delete from xp where day = ?', [DAY]);
    journal().exec("delete from xp where ref like 'checks:%'");
  }
}

function dayXp(prefix) {
  var rows = journal().query('select sum(amount) as xp from xp where day = ? and ref like ?', [DAY, prefix + '%']);
  return rows.length ? rows[0].xp || 0 : 0;
}

exports['день из документа даёт 146 опыта, повтор не начисляет'] = function (t) {
  main().start();
  sandbox(function () {
    var goals = require('modules/rpg/source.js').goals();
    var summary = {
      known: { steps: true, sleep: true, screen: false, places: false, spend: false },
      steps: 9400, sleepMin: goals.sleep, sleepGoal: goals.sleep, bedtime: null,
      habitIds: ['checks-habit'], chains: { 'checks-habit': 15 }
    };
    main().close(DAY, summary, { quiet: true });
    t.equal(dayXp('day:'), 146, '94 + 40 + 12,5 (вниз) = 146');
    main().close(DAY, summary, { quiet: true });
    t.equal(dayXp('day:'), 146, 'повторное закрытие начислило ещё раз');
    var rows = journal().query("select skill, amount from xp where day = ? and ref like 'day:%' order by skill", [DAY]);
    t.equal(rows.map(function (r) { return r.skill + ':' + r.amount; }), ['endurance:94', 'habit:checks-habit:12', 'regime:40']);
  });
};

exports['смена формулы не уменьшает уровень'] = function (t) {
  sandbox(function () {
    journal().exec('insert into xp (day, at, skill, amount, reason, ref) values (?, ?, ?, ?, ?, ?)', [DAY, Date.now(), 'endurance', 6000, 'проверка', 'checks:big']);
    var before = main().rebuild().level;
    t.ok(before >= 2, 'уровень не вырос от 6 000 опыта');
    main().saveSettings({ level: { base: 5000, power: 2 } });
    var after = main().rebuild().level;
    t.ok(after >= before, 'уровень упал после смены формулы: ' + before + ' → ' + after);
  });
};

exports['look для Питомца'] = function (t) {
  var look = main().look();
  t.ok(typeof look.level === 'number' && look.level >= 1, 'нет уровня');
  t.ok(['sprout', 'two-leaves', 'four-leaves', 'bud', 'flower'].indexOf(look.stage) >= 0, 'стадия: ' + look.stage);
  t.ok(Array.isArray(look.traits), 'черты не список');
};

exports['квест: «не сейчас» и «другой» без штрафа'] = function (t) {
  sandbox(function () {
    var today = require('modules/rpg/source.js').currentDay();
    var quest = { id: 'checks:q:' + today, template: 'checks', title: 'Проверочный квест', metric: 'steps', op: '>=', target: 1, period: 'day',
      start: today, end: today, skill: 'endurance', xp: 10, progress: 0, done: false };
    files.writeJson('data/rpg/active.json', { quests: [quest], skip: {} });
    var level = main().view().level;
    t.ok(main().later(quest.id), 'квест не отложился');
    t.ok(!main().questsView().some(function (q) { return q.id === quest.id; }), 'отложенный квест остался');
    t.equal(main().view().level, level, 'отказ от квеста изменил уровень');
    files.writeJson('data/rpg/active.json', { quests: [quest], skip: {} });
    main().replace(quest.id);
    t.ok(!main().questsView().some(function (q) { return q.id === quest.id; }), 'заменённый квест остался');
  });
};

exports['карта: дом и работа без точки'] = function (t) {
  var map = main().map();
  t.ok(Array.isArray(map.cells) && Array.isArray(map.locations), 'карта не собралась');
  map.locations.forEach(function (one) {
    if (one.type === 'home' || one.type === 'work') t.ok(one.lat === null && one.lon === null, 'у дома или работы есть координаты: ' + one.id);
  });
};

exports['крючки, виджет и инструмент агента'] = function (t) {
  main().start();
  var hooks = files.readJson('data/health/hooks.json', []);
  var list = Array.isArray(hooks) ? hooks : hooks.hooks || [];
  t.ok(list.some(function (hook) { return hook.event === 'life.day' && hook.path === MAIN && hook.fn === 'onDay'; }), 'нет крючка life.day');
  var widget = main().widget();
  t.ok(/^Ур\. \d+ · \d+% до \d+/.test(widget.text), 'виджет: ' + widget.text);
  t.ok(files.exists('tools/rpg.js'), 'инструмент агента не записан');
  var status = main().tool({ action: 'status' });
  t.ok(typeof status.level === 'number', 'status без уровня');
};

exports['экран: персонаж и вкладки'] = function (t) {
  var page = t.screen('modules/rpg/ui/index.html');
  t.wait(800);
  t.ok(/Уровень \d+/.test(page.text('#panel-hero')), 'нет уровня на экране');
  t.ok(page.count('#tabs .chip') >= 4, 'нет вкладок');
  t.ok(page.count('#panel-hero .skill') >= 6, 'нет шести навыков');
};
