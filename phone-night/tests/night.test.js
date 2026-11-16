// node tests/night.test.js — the night's window, facts, template report, honesty check, offenders, trends.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var night = require('../night');
var fixture = require('../fixture');
var settings = require('../settings');

var count = 0;
var failed = 0;
function test(name, fn) {
  count++;
  try {
    fn();
    console.log('ok ' + count + ' ' + name);
  } catch (error) {
    failed++;
    console.log('not ok ' + count + ' ' + name + '\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n  ') : error));
  }
}
function local(y, mo, d, h, mi, s) {
  return new Date(y, mo - 1, d, h, mi, s || 0).getTime();
}
var s = settings.defaults();
var texts = {};
fixture.FILES.forEach(function (name) {
  texts[name] = fs.readFileSync(path.join(__dirname, '..', 'samples', name + '.txt'), 'utf8');
});
function scenario(key, change) {
  var made = fixture.scenario(key || '2026-11-13', texts, s);
  if (change) change(made);
  return made;
}
function facts(made, options) {
  return night.buildFacts(made.input, options || s);
}

test('night keys and clock times around the day boundary', function () {
  assert.strictEqual(night.nightKey(local(2026, 11, 13, 23, 0), '14:00'), '2026-11-13');
  assert.strictEqual(night.nightKey(local(2026, 11, 14, 3, 0), '14:00'), '2026-11-13');
  assert.strictEqual(night.nightKey(local(2026, 11, 14, 13, 59), '14:00'), '2026-11-13');
  assert.strictEqual(night.nightKey(local(2026, 11, 14, 14, 0), '14:00'), '2026-11-14');
  assert.strictEqual(night.at('2026-11-13', '23:00', '14:00'), local(2026, 11, 13, 23, 0));
  assert.strictEqual(night.at('2026-11-13', '07:00', '14:00'), local(2026, 11, 14, 7, 0));
  assert.strictEqual(night.at('2026-11-30', '00:30', '14:00'), local(2026, 12, 1, 0, 30));
  assert.strictEqual(night.nextNight('2026-12-31'), '2027-01-01');
  assert.strictEqual(night.prevNight('2026-03-01'), '2026-02-28');
});

test('when the report may come: after 05:00, not before end minus 2 h, before the boundary', function () {
  var key = '2026-11-13';
  assert.strictEqual(night.morningFrom(key, s), local(2026, 11, 14, 5, 0));
  assert.ok(!night.mayReport(local(2026, 11, 14, 2, 40), key, s));
  assert.ok(night.mayReport(local(2026, 11, 14, 5, 30), key, s));
  assert.ok(!night.mayReport(local(2026, 11, 14, 14, 30), key, s));
  var late = Object.assign({}, s, { nightEnd: '09:00' });
  assert.strictEqual(night.morningFrom(key, late), local(2026, 11, 14, 7, 0));
  assert.ok(night.logging(local(2026, 11, 13, 22, 30), s));
  assert.ok(!night.logging(local(2026, 11, 13, 18, 0), s));
});

test('words: titles, durations, plurals, megabytes', function () {
  assert.strictEqual(night.nightTitle('2026-11-13'), 'Ночь с 13 на 14 ноября');
  assert.strictEqual(night.nightTitle('2026-10-31'), 'Ночь с 31 октября на 1 ноября');
  assert.strictEqual(night.duration(7 * 36e5 + 10 * 6e4), '7 ч 10 мин');
  assert.strictEqual(night.duration(45 * 6e4), '45 мин');
  assert.strictEqual(night.duration(2 * 36e5), '2 ч');
  assert.strictEqual(night.duration(20000), 'меньше минуты');
  assert.strictEqual(night.plural(1, 'раз', 'раза', 'раз'), 'раз');
  assert.strictEqual(night.plural(3, 'раз', 'раза', 'раз'), 'раза');
  assert.strictEqual(night.plural(12, 'раз', 'раза', 'раз'), 'раз');
  assert.strictEqual(night.plural(22, 'ночь', 'ночи', 'ночей'), 'ночи');
  assert.strictEqual(night.mbText(3.44), '3,4');
  assert.strictEqual(night.mbText(37.6), '38');
});

test('merge: one screen switch seen by three sources is one event', function () {
  var merged = night.mergeEvents([
    [{ at: 1000, kind: 'screen_on', src: 'live' }],
    [{ at: 2500, kind: 'screen_on', src: 'usage' }, { at: 2600, kind: 'resumed', package: 'x' }],
    [{ at: 9000, kind: 'screen_on', src: 'history' }]
  ], 3000);
  assert.deepStrictEqual(merged.map(function (e) { return e.at; }), [1000, 2600, 9000]);
});

test('window by the screen: the wake-up at 02:40 stays inside the night', function () {
  var f = facts(scenario());
  assert.strictEqual(f.window.how, 'screen');
  assert.strictEqual(f.window.from, local(2026, 11, 13, 23, 39, 40));
  assert.strictEqual(f.window.to, local(2026, 11, 14, 7, 12));
});

test('window: a long evening with the phone is not night; nominal when the screen says nothing', function () {
  var events = [
    { at: local(2026, 11, 13, 22, 10), kind: 'screen_off' },
    { at: local(2026, 11, 13, 22, 50), kind: 'screen_on' },
    { at: local(2026, 11, 14, 0, 40), kind: 'screen_off' },
    { at: local(2026, 11, 14, 6, 50), kind: 'screen_on' },
    { at: local(2026, 11, 14, 6, 51), kind: 'unlock' }
  ];
  var w = night.detectWindow(events, '2026-11-13', s, local(2026, 11, 14, 7, 0));
  assert.strictEqual(w.from, local(2026, 11, 14, 0, 40));
  assert.strictEqual(w.to, local(2026, 11, 14, 6, 51));
  var empty = night.detectWindow([], '2026-11-13', s, local(2026, 11, 14, 7, 30));
  assert.strictEqual(empty.how, 'nominal');
  assert.strictEqual(empty.from, local(2026, 11, 13, 23, 0));
  assert.strictEqual(empty.to, local(2026, 11, 14, 7, 0));
  var off = night.detectWindow(events, '2026-11-13', Object.assign({}, s, { byScreen: false }), local(2026, 11, 14, 6, 0));
  assert.strictEqual(off.to, local(2026, 11, 14, 6, 0));
  var dark = night.detectWindow([{ at: local(2026, 11, 13, 21, 0), kind: 'screen_off' }, { at: local(2026, 11, 14, 7, 30), kind: 'unlock' }],
    '2026-11-13', s, local(2026, 11, 14, 8, 0));
  assert.strictEqual(dark.from, local(2026, 11, 13, 22, 0));
  assert.strictEqual(dark.to, local(2026, 11, 14, 7, 30));
});

test('facts: battery, screen, the owner, wakers, traffic, cpu, notifications, jobs, doze', function () {
  var f = facts(scenario());
  assert.strictEqual(f.title, 'Ночь с 13 на 14 ноября');
  assert.deepStrictEqual([f.battery.start, f.battery.end, f.battery.drop, f.battery.source], [92, 82, 10, 'history']);
  assert.strictEqual(f.battery.charging.any, false);
  assert.deepStrictEqual(f.screen, { on: 2, unlocks: 1 });
  assert.strictEqual(f.owner.sessions.length, 1);
  assert.strictEqual(f.owner.sessions[0].app, 'Telegram');
  assert.strictEqual(f.owner.sessions[0].minutes, 6);
  assert.strictEqual(night.hhmm(f.owner.sessions[0].from), '02:40');
  assert.strictEqual(f.wakers.top[0].app, 'Система');
  assert.strictEqual(f.wakers.top[0].wakeups, 76);
  assert.strictEqual(f.wakers.list.filter(function (r) { return r.pkg === 'ru.marketplace.app'; })[0].wakeups, 9);
  assert.strictEqual(f.traffic.top[0].app, 'Telegram');
  assert.strictEqual(f.traffic.top[0].mb, 38);
  assert.strictEqual(f.cpu.top[0].app, 'Маркетплейс');
  assert.strictEqual(f.cpu.top[0].minutes, 40);
  assert.strictEqual(f.notifications.total, 9);
  assert.strictEqual(f.notifications.top[0].count, 7);
  assert.strictEqual(f.jobs.total, 4);
  assert.strictEqual(f.doze.fullMinutes, 254);
  assert.strictEqual(night.hhmm(f.doze.first), '02:10');
  assert.deepStrictEqual(f.exempt.apps.map(function (r) { return r.app; }), ['Assi', 'Telegram']);
  assert.strictEqual(f.foreground[0].minutes, 30);
  assert.strictEqual(f.network.offline, 1);
  assert.strictEqual(f.reboots.length, 0);
  assert.ok(f.marks.some(function (m) { return m.kind === 'alarm' && /Маркетплейс/.test(m.label); }));
});

test('facts: hidden apps vanish everywhere before the model and the screen', function () {
  var hidden = Object.assign({}, s, { hidden: ['ru.marketplace.app', 'org.telegram.messenger'] });
  var f = facts(scenario(), hidden);
  var text = JSON.stringify(f);
  assert.ok(!/Маркетплейс|ru\.marketplace/.test(text), 'Маркетплейс остался');
  assert.ok(!/Telegram|org\.telegram/.test(text), 'Telegram остался');
  assert.ok(!/Маркетплейс|Telegram/.test(JSON.stringify(night.modelFacts(f))));
});

test('facts: a reboot at night from the uptime and the usage journal', function () {
  var made = scenario('2026-11-13', function (m) {
    var boot = local(2026, 11, 14, 3, 12);
    m.input.morning = Object.assign({}, m.input.morning, { uptime: m.input.morning.at - boot });
    m.input.events = night.mergeEvents([m.input.events, [{ at: local(2026, 11, 14, 3, 11), kind: 'shutdown', src: 'usage' }]], 3000);
    m.input.boot = { reason: 'reboot', autoRestart: { found: true, on: true, keys: ['auto_restart_on=1'] } };
  });
  var f = facts(made);
  assert.strictEqual(f.reboots.length, 1);
  assert.strictEqual(f.reboots[0].kind, 'planned');
  var report = night.templateReport(f, s);
  assert.ok(report.lines.some(function (line) { return /Перезагрузка в 03:11 — похоже на автоперезагрузку Samsung/.test(line.text); }),
    JSON.stringify(report.lines));
});

test('facts: a night on the charger says so', function () {
  var made = scenario('2026-11-13', function (m) {
    m.input.history = null;
    m.input.evening = Object.assign({}, m.input.evening, { battery: 64, charging: true });
    m.input.morning = Object.assign({}, m.input.morning, { battery: 100, charging: true });
  });
  var f = facts(made);
  assert.ok(f.battery.charging.whole);
  var report = night.templateReport(f, s);
  assert.strictEqual(report.lines[0].text, 'Всю ночь на зарядке: 64% → 100%.');
});

test('template: the lines are true and the notification takes the first three', function () {
  var f = facts(scenario());
  var report = night.templateReport(f, s);
  var byKey = {};
  report.lines.forEach(function (line) { byKey[line.key] = line.text; });
  assert.strictEqual(report.headline, 'Ночь с 13 на 14 ноября');
  assert.strictEqual(byKey.battery, 'Батарея: 92% → 82% за 7 ч 32 мин.');
  assert.strictEqual(byKey.wakers, 'Будил чаще всех: «Сервисы Google Play» — 19 пробуждений будильниками; следом «Маркетплейс» (9), «WhatsApp» (4); сама система — 76.');
  assert.strictEqual(byKey.owner, 'Экран включался 2 раза, разблокировок 1. Вы брали телефон: 02:40, Telegram, 6 мин.');
  assert.strictEqual(byKey.notifications, 'Больше всего уведомлений: «Маркетплейс» — 7, с 01:00 до 05:00. Всего за ночь: 9.');
  assert.strictEqual(byKey.traffic, 'Больше всего трафика: «Telegram» — около 38 МБ (всего 49 МБ).');
  assert.strictEqual(byKey.doze, 'Глубокий сон Doze: 4 ч 14 мин, с 02:10 до 07:05.');
  var notice = night.noticeText(report, null, f, s);
  assert.strictEqual(notice, [byKey.battery, byKey.wakers, byKey.owner].join(' '));
  var privateNotice = night.noticeText(report, null, f, Object.assign({}, s, { ownerInNotice: false }));
  assert.ok(!/Telegram, 6 мин/.test(privateNotice));
  assert.ok(/Экран включался 2 раза, разблокировок 1\./.test(privateNotice));
});

test('honesty: the template itself passes the check of its facts', function () {
  var f = facts(scenario());
  var report = night.templateReport(f, s);
  var check = night.checkStory({ headline: report.headline, lines: report.lines.map(function (l) { return l.text; }), tip: '' },
    night.modelFacts(f), Object.assign({}, s, { storySentences: 40 }));
  assert.deepStrictEqual(check.errors, []);
});

test('honesty: a good nature story passes', function () {
  var f = facts(scenario());
  var story = {
    headline: 'Ночная охота',
    lines: [
      'В 01:00 стая уведомлений «Маркетплейса» вылетела на охоту — 7 раз до рассвета.',
      '«Telegram», самый прожорливый обитатель, утащил в нору около 38 МБ.',
      'С 02:10 до 07:05 телефон то и дело впадал в глубокую спячку Doze.',
      'В 02:40 хозяин ненадолго проснулся и 6 минут читал «Telegram».',
      'Батарея пережила ночь, потеряв 10%.'
    ],
    tip: ''
  };
  var check = night.checkStory(story, night.modelFacts(f), s);
  assert.deepStrictEqual(check.errors, []);
  assert.ok(check.ok);
});

test('honesty: invented numbers, times, apps, emoji and too many sentences are caught', function () {
  var mf = night.modelFacts(facts(scenario()));
  var bad = function (lines, what) {
    var check = night.checkStory({ headline: 'Ночь', lines: lines, tip: '' }, mf, s);
    assert.ok(!check.ok, 'не поймано: ' + what);
    return check.errors.join('; ');
  };
  assert.ok(/17/.test(bad(['Батарея потеряла 17% за ночь.'], 'число')));
  assert.ok(/03:15/.test(bad(['В 03:15 телефон проснулся.'], 'время')));
  assert.ok(/Instagram/.test(bad(['Instagram не давал спать.'], 'латиница')));
  assert.ok(/ВКонтакте/.test(bad(['«ВКонтакте» шумел всю ночь.'], 'кавычки')));
  bad(['Маркетплейс будил вдвое чаще: пять раз.'], 'число словом');
  bad(['Тихая ночь 🌙.'], 'эмодзи');
  var many = [];
  for (var i = 0; i < 9; i++) many.push('Батарея потеряла 10%.');
  assert.ok(/предложений 9/.test(bad(many, 'длина')));
  var tip = night.checkStory({ headline: 'Ночь', lines: ['Батарея потеряла 10%.'], tip: 'Ограничьте «Маркетплейс».' }, mf, s);
  assert.ok(!tip.ok && /совет без повода/.test(tip.errors.join(';')));
  assert.ok(!night.checkStory('строка', mf, s).ok);
});

test('model prompt: style, rules and the previous errors', function () {
  var mf = night.modelFacts(facts(scenario()));
  var p = night.storyPrompt(mf, 'detective', s, ['числа 14 нет в фактах']);
  assert.ok(/детектив/.test(p.system));
  assert.ok(/не больше 8 предложений/.test(p.system));
  assert.ok(/числа 14 нет в фактах/.test(p.prompt));
  assert.ok(/"app": "Маркетплейс"/.test(p.prompt));
});

test('whence: every line has a source, missing sources say why', function () {
  var made = scenario('2026-11-13', function (m) {
    m.input.sources = m.input.sources.map(function (source) {
      return source.id === 'alarm' ? { id: 'alarm', label: 'Будильники приложений', ok: false, via: '', note: 'Shizuku не был запущен' } : source;
    });
  });
  var f = facts(made);
  var w = night.whence(night.templateReport(f, s), f);
  assert.ok(w.lines.length >= 5);
  assert.ok(w.lines.every(function (line) { return line.from && line.from !== 'нет данных'; }), JSON.stringify(w.lines));
  assert.strictEqual(w.lines.filter(function (line) { return line.key === 'wakers'; })[0].from, 'dumpsys alarm, разница вечер–утро');
  assert.deepStrictEqual(w.missing, [{ id: 'alarm', label: 'Будильники приложений', note: 'Shizuku не был запущен' }]);
});

test('whence: every line of the story — the model\'s too — has its source', function () {
  var f = facts(scenario());
  var template = night.templateReport(f, s);
  var byTemplate = night.whence(template, f, { by: 'template', lines: template.lines.map(function (line) { return line.text; }) });
  assert.strictEqual(byTemplate.story.length, template.lines.length);
  assert.ok(byTemplate.story.every(function (line) { return line.from && line.keys.length === 1; }));
  var story = { by: 'model', lines: [
    'В 01:00 стая уведомлений «Маркетплейса» вылетела на охоту — 7 раз до рассвета.',
    '«Telegram» утащил около 38 МБ.',
    'С 02:10 до 07:05 телефон впадал в спячку Doze.',
    'Батарея пережила ночь, потеряв 10%.'
  ] };
  var told = night.whence(template, f, story).story;
  assert.deepStrictEqual(told.map(function (line) { return line.keys.join(','); }), ['notifications', 'traffic', 'doze', 'battery']);
  assert.strictEqual(told[1].from, night.SOURCE_TEXT.netstats);
});

test('battery use by apps: the estimate of batterystats, in the report, to the model, said to be approximate', function () {
  var f = facts(scenario());
  assert.ok(f.cpu.power.length > 0);
  var line = night.templateReport(f, s).lines.filter(function (row) { return row.key === 'power'; })[0];
  assert.ok(line, 'строки о расходе нет');
  assert.ok(/по оценке самого Android/.test(line.text) && /приблизительная/.test(line.text), line.text);
  assert.strictEqual(line.source, 'checkin');
  var mf = night.modelFacts(f);
  assert.strictEqual(mf.powerEstimate.apps[0].mah, f.cpu.power[0].mah);
  assert.ok(/приблизительная/.test(mf.powerEstimate.note));
  assert.ok(/приблизительная оценка самого Android/.test(night.storyPrompt(mf, 'dry', s).system));
  var told = { headline: 'Ночь', lines: ['По оценке Android, больше всего батареи съел «Маркетплейс» — около 8 мА·ч.'], tip: '' };
  assert.deepStrictEqual(night.checkStory(told, mf, s).errors, []);
});

test('reboot from Assi\'s own journal (kind reboot)', function () {
  var f = facts(scenario('2026-11-13', function (m) {
    m.input.events = m.input.events.concat([{ at: local(2026, 11, 14, 3, 12), kind: 'reboot', src: 'live' }]);
  }));
  assert.ok(f.reboots.some(function (reboot) { return reboot.at === local(2026, 11, 14, 3, 12); }), JSON.stringify(f.reboots));
});

function report(key, wakeups) {
  return { night: key, facts: { wakers: { ok: true, top: [], list: [{ app: 'Маркетплейс', pkg: 'ru.marketplace.app', wakeups: wakeups }] } } };
}

test('offenders: three nights in a row at the threshold gives a tip, a gap does not', function () {
  var tips = night.offenders([report('2026-11-13', 9), report('2026-11-12', 6), report('2026-11-11', 5)], s);
  assert.strictEqual(tips.length, 1);
  assert.strictEqual(tips[0].nights, 3);
  assert.strictEqual(tips[0].wakeups, 9);
  assert.ok(/не меньше 5 раз 3 ночи подряд/.test(night.tipText(tips[0], s)));
  assert.strictEqual(night.offenders([report('2026-11-13', 9), report('2026-11-12', 4), report('2026-11-11', 9)], s).length, 0);
  assert.strictEqual(night.offenders([report('2026-11-13', 9), report('2026-11-11', 9), report('2026-11-10', 9)], s).length, 0);
});

test('trends: nights, average loss without charging nights, frequent offenders', function () {
  var base = facts(scenario());
  var made = ['2026-11-11', '2026-11-12', '2026-11-13'].map(function (key, index) {
    var f = JSON.parse(JSON.stringify(base));
    f.battery.drop = [8, 12, 10][index];
    if (index === 1) f.battery.charging.any = true;
    return { night: key, facts: f };
  });
  var t = night.trendsOf(made, s, local(2026, 11, 14, 8, 0));
  assert.strictEqual(t.nights.length, 3);
  assert.strictEqual(t.avgDrop, 9);
  assert.strictEqual(t.nights[1].charging, true);
  assert.strictEqual(t.unlockNights, 3);
  assert.strictEqual(t.offenders[0].app, 'Сервисы Google Play');
  assert.strictEqual(t.offenders[0].nights, 3);
  assert.ok(!t.offenders.some(function (row) { return row.app === 'Система'; }), 'система — не нарушитель');
  assert.strictEqual(t.nights[0].topWaker.app, 'Сервисы Google Play');
  assert.strictEqual(t.nights[0].systemWakeups, 76);
});

test('time line: axis covers the window and the nominal night, battery thinned', function () {
  var f = facts(scenario());
  var line = night.timeline(f, Object.assign({}, s, { batteryPoints: 20 }));
  assert.strictEqual(line.from, local(2026, 11, 13, 23, 0));
  assert.strictEqual(line.to, local(2026, 11, 14, 7, 12));
  assert.ok(line.battery.length >= 2 && line.battery.length <= 21);
  assert.strictEqual(line.battery[line.battery.length - 1].level, 82);
  assert.ok(line.doze.length >= 3);
  var capped = night.buildFacts(scenario().input, Object.assign({}, s, { timelineMarks: 50 }));
  assert.ok(capped.marks.length <= 50);
});

// ---- the neighbours: Игротека, Траты, Фокус, Сериал на ночь -------------------------------------

function at(hhmm) { return night.at('2026-11-13', hhmm, s.dayBoundary); }
function withLinks() {
  return scenario('2026-11-13', function (m) {
    m.input.links = {
      stories: [
        { kind: 'story', at: at('23:52'), title: 'Сериал: серия 12', amount: 14, data: { asleep: true }, source: 'series' },
        { kind: 'story', at: at('23:10'), title: 'Сериал: серия 11', amount: 20, data: { asleep: false }, source: 'series' },
        { kind: 'story', at: at('15:30'), title: 'Сериал: серия 10', amount: 9, data: { asleep: true }, source: 'series' }
      ],
      plays: [
        { kind: 'play', at: at('02:46'), title: 'Подземка', amount: 6, data: { game: 'subway' } },
        { kind: 'play', at: at('23:45'), title: 'Кузница слияний', amount: 30, data: { game: 'merge-forge' } },
        { kind: 'play', at: at('20:00'), title: 'Сапёр', amount: 40, data: { game: 'minesweeper-rogue' } }
      ],
      purchases: [
        { kind: 'expense', at: at('02:44'), title: 'Самокат', amount: 990, unit: 'RUB' },
        { kind: 'expense', at: at('02:45'), title: 'Аптека', amount: 350, unit: 'RUB' },
        { kind: 'expense', at: at('03:00'), title: 'Возврат', amount: -100, unit: 'RUB' },
        { kind: 'expense', at: at('21:00'), title: 'Ужин', amount: 1500, unit: 'RUB' }
      ],
      focus: [
        { at: at('15:00'), from: at('15:00'), to: at('15:50'), minutes: 50, attempts: 3, dnd: null },
        { at: at('18:30'), from: at('18:30'), to: at('18:55'), minutes: 25, attempts: 1, dnd: true },
        { at: at('00:50'), from: at('00:50'), to: at('02:10'), minutes: 80, attempts: 0, dnd: true },
        { at: at('03:00'), from: at('03:00'), to: at('03:30'), minutes: 30, attempts: 0, dnd: false }
      ]
    };
  });
}

test('links: what the neighbours wrote becomes facts, only inside the window', function () {
  var f = facts(withLinks());
  assert.deepStrictEqual([f.asleep.title, night.hhmm(f.asleep.at)], ['Сериал: серия 12', '23:52']);
  assert.deepStrictEqual(f.play.games.map(function (row) { return [row.game, row.minutes]; }), [['Подземка', 6], ['Кузница слияний', 5]]);
  assert.strictEqual(f.play.minutes, 11);
  assert.strictEqual(f.purchases.count, 2, 'возврат и вечерняя покупка не считаются');
  assert.deepStrictEqual(f.purchases.totals, [{ unit: 'RUB', amount: 1340 }]);
  assert.strictEqual(f.purchases.top.merchant, 'Самокат');
  assert.strictEqual(f.quiet.minutes, 80);
  assert.strictEqual(f.quiet.hidden, 3, 'уведомления 01:00, 01:12, 02:05 пришли под «не беспокоить»');
  assert.deepStrictEqual(f.dayFocus, { sessions: 2, minutes: 75, attempts: 4 });
});

test('links: template lines with their sources; the owner\'s own lines stay out of a private notification', function () {
  var f = facts(withLinks());
  var report = night.templateReport(f, s);
  var line = function (key) { return (report.lines.filter(function (row) { return row.key === key; })[0] || {}).text; };
  assert.strictEqual(line('asleep'), 'Уснули под «Сериал: серия 12» около 23:52.');
  assert.strictEqual(line('play'), 'Ночью играли: «Подземка» — 6 мин, «Кузница слияний» — 5 мин.');
  assert.strictEqual(line('purchases'), 'Ночью 2 покупки на 1340 ₽, самая крупная — «Самокат» (990 ₽).');
  assert.strictEqual(line('quiet'), '«Не беспокоить» Фокуса ночью: 1 ч 20 мин; за это время пришло 3 уведомления — режим их скрыл.');
  assert.strictEqual(line('focusDay'), 'Днём в Фокусе: 2 сессии, 1 ч 15 мин; попыток открыть отвлекающее — 4.');
  var whence = night.whence(report, f, { by: 'template', lines: report.lines.map(function (row) { return row.text; }) });
  assert.ok(/Сериал на ночь/.test(whence.lines.filter(function (row) { return row.key === 'asleep'; })[0].from));
  assert.ok(/траты/.test(whence.lines.filter(function (row) { return row.key === 'purchases'; })[0].from));
  var all = Object.assign({}, s, { notifyLines: 20 });
  assert.ok(/Самокат/.test(night.noticeText(report, null, f, all)));
  var quiet = night.noticeText(report, null, f, Object.assign({}, all, { ownerInNotice: false }));
  assert.ok(!/Самокат|Подземка|уснули/i.test(quiet), quiet);
  assert.ok(/Не беспокоить/.test(quiet), 'скрытые уведомления — не про владельца');
});

test('links: the model may tell them, by the facts only', function () {
  var f = facts(withLinks());
  var mf = night.modelFacts(f);
  assert.strictEqual(mf.fellAsleep.at, '23:52');
  assert.strictEqual(mf.nightPurchases.top.unit, '₽');
  assert.strictEqual(mf.focusQuiet.hiddenNotifications, 3);
  var good = night.checkStory({
    headline: 'Ночь', tip: '',
    lines: ['Под «Сериал: серия 12» вы уснули в 23:52.', 'В 02:44 «Самокат» получил 990 ₽, а «Подземка» заняла 6 минут.']
  }, mf, s);
  assert.ok(good.ok, good.errors.join('; '));
  var bad = night.checkStory({ headline: 'Ночь', lines: ['Ночью «Пятёрочка» получила 990 ₽.'], tip: '' }, mf, s);
  assert.ok(!bad.ok);
  var told = night.storySources({ by: 'model', lines: ['Под «Сериал: серия 12» вы уснули в 23:52.'] }, night.templateReport(f, s), f);
  assert.deepStrictEqual(told[0].keys, ['asleep']);
});

test('links: no neighbours — no lines, the rest of the report as before', function () {
  var plain = facts(scenario());
  ['asleep', 'play', 'purchases', 'quiet', 'dayFocus'].forEach(function (key) { assert.strictEqual(plain[key], null, key); });
  var keys = night.templateReport(plain, s).lines.map(function (row) { return row.key; });
  ['asleep', 'play', 'purchases', 'quiet', 'focusDay', 'habit'].forEach(function (key) { assert.ok(keys.indexOf(key) < 0, key); });
  assert.ok(!night.modelFacts(plain).nightPurchases);
  var empty = night.linkFacts({ stories: [], plays: [], purchases: [], focus: [] }, plain.window, [], '2026-11-13', s);
  assert.deepStrictEqual(empty, { asleep: null, play: null, purchases: null, quiet: null, dayFocus: null });
  var short = night.linkFacts({ plays: [{ at: at('02:00'), amount: 3, title: 'Подземка' }] }, plain.window, [], '2026-11-13',
    Object.assign({}, s, { linkMinMinutes: 5 }));
  assert.strictEqual(short.play, null, 'короче порога — не упоминается');
  // An old report (no fields of the neighbours) still makes its template.
  var old = JSON.parse(JSON.stringify(plain));
  ['asleep', 'play', 'purchases', 'quiet', 'dayFocus'].forEach(function (key) { delete old[key]; });
  assert.ok(night.templateReport(old, s).lines.length > 3);
});

console.log((count - failed) + ' из ' + count + ' прошли');
if (failed) process.exitCode = 1;
