// node tests/main.test.js — main.js on a pretend phone (tests/engine.js): the look on and off with
// and without the shell's decoration layer, reminders, drafts, the owner's birthday, the first snow.
var assert = require('assert');
var engine = require('./engine.js');
var t = require('./harness.js');

// What main.js makes lives in the pretend engine's own realm: compared as plain data.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

var CONTACTS = [
  { contact_id: 12, display_name: 'Аня Петрова', data1: '1996-11-15', data2: 3, starred: 1 },
  { contact_id: 31, display_name: 'Петя', data1: '--03-02', data2: 3, starred: 0 }
];

t.test('без слоя украшений: 20.12 надевается тема «holiday» из темы владельца, 09.01 — прежняя вернулась', function () {
  var phone = engine.make({ now: '2026-12-20T12:00:00' });
  phone.main.start();
  phone.drain();
  assert.strictEqual(phone.active(), 'holiday');
  var theme = phone.themes.holiday;
  assert.strictEqual(theme.tokens.accent, '#7FB8FF');
  assert.strictEqual(theme.tokens.bg, '#000000');
  assert.ok(theme.css.indexOf('.card { border-radius: 4px; }') === 0, 'css владельца сохранён');
  assert.ok(theme.css.indexOf('body::before') > 0, 'снег');
  assert.strictEqual(phone.state().previous, 'midnight');
  assert.ok(phone.log.jobs['holidays.daily'] && phone.log.jobs['holidays.evening'], 'задачи');
  phone.at('2027-01-09T12:00:00');
  var result = phone.main.check();
  assert.strictEqual(result.plan, null);
  assert.strictEqual(phone.active(), 'midnight');
  assert.ok(!phone.themes.holiday && !phone.disk['themes/holiday.json'], 'праздничная тема удалена');
});

t.test('владелец сам выбрал тему посреди праздника — модуль её не трогает до конца повода', function () {
  var phone = engine.make({ now: '2026-12-25T12:00:00', features: [] });
  phone.main.check();
  assert.strictEqual(phone.active(), 'holiday');
  phone.setTheme('midnight');
  var result = phone.main.check();
  assert.strictEqual(result.ownerChose, true);
  assert.strictEqual(phone.active(), 'midnight');
  phone.main.check();
  assert.strictEqual(phone.active(), 'midnight', 'второй раз тоже не надел');
  assert.strictEqual(phone.main.status().ownerChose, true);
  phone.main.decorOn();
  assert.strictEqual(phone.active(), 'holiday', 'по просьбе вернул');
});

t.test('со слоем украшений тема владельца не меняется; пропавший файл слоя пишется заново', function () {
  var phone = engine.make({ now: '2026-12-31T12:00:00', features: ['theme.decor'] });
  var result = phone.main.check();
  assert.strictEqual(result.mode, 'decor');
  assert.strictEqual(phone.active(), 'midnight');
  var css = phone.disk['themes/_decor.css'];
  assert.ok(css.indexOf('/* holidays: new-year@2026-12-31 */') === 0);
  assert.ok(css.indexOf('--accent: #7FB8FF;') > 0 && css.indexOf('.topbar::after') > 0 && css.indexOf('.btn:active::after') > 0);
  delete phone.disk['themes/_decor.css'];
  phone.main.check();
  assert.ok(phone.disk['themes/_decor.css'], 'слой вернулся');
  phone.at('2027-01-09T12:00:00');
  phone.main.check();
  assert.ok(!phone.disk['themes/_decor.css'], 'слой убран');
});

t.test('чужой слой украшений модуль не стирает', function () {
  var phone = engine.make({ now: '2026-07-15T12:00:00', features: ['theme.decor'] });
  phone.disk['themes/_decor.css'] = '/* agent */ .card { outline: 1px solid red; }';
  phone.main.check();
  assert.strictEqual(phone.disk['themes/_decor.css'], '/* agent */ .card { outline: 1px solid red; }');
});

t.test('«выключи снег» — до конца повода; на следующий повод снова работает', function () {
  var phone = engine.make({ now: '2026-12-22T12:00:00', features: ['theme.decor'] });
  phone.main.check();
  var off = phone.main.decorOff();
  assert.strictEqual(off.title, 'Новый год');
  assert.ok(!phone.disk['themes/_decor.css']);
  phone.main.check();
  assert.ok(!phone.disk['themes/_decor.css'], 'не вернулся сам');
  phone.at('2027-04-12T12:00:00');
  phone.main.check();
  assert.ok(phone.disk['themes/_decor.css'].indexOf('cosmonautics') > 0, 'День космонавтики');
});

t.test('предпросмотр повода и его конец', function () {
  var phone = engine.make({ now: '2026-11-14T12:00:00' });
  phone.main.check();
  assert.strictEqual(phone.active(), 'midnight');
  var preview = phone.main.preview('halloween', 10);
  assert.strictEqual(preview.seconds, 10);
  assert.strictEqual(phone.active(), 'holiday');
  assert.ok(phone.themes.holiday.css.indexOf('.page::after') > 0, 'тыквы');
  assert.ok(phone.main.status().preview, 'статус знает о предпросмотре');
  phone.main.check();
  assert.strictEqual(phone.active(), 'holiday', 'обычная проверка предпросмотр не снимает');
  phone.main.endPreview(true);
  assert.strictEqual(phone.active(), 'midnight');
  assert.throws(function () { phone.main.preview('knowledge-day'); }, /нет оформления/);
});

t.test('напоминание о дне рождения: в 19:00 накануне, один раз, кнопка — только с notify.actions', function () {
  var phone = engine.make({ now: '2026-11-14T18:00:00', granted: ['READ_CONTACTS'], contacts: CONTACTS });
  phone.main.start();
  phone.drain();
  assert.strictEqual(phone.log.notify.length, 0, 'до 19:00 молчит');
  phone.at('2026-11-14T19:01:00');
  phone.log.jobs['holidays.evening'].fn();
  assert.strictEqual(phone.log.notify.length, 1);
  assert.strictEqual(phone.log.notify[0].title, 'Завтра день рождения');
  assert.strictEqual(phone.log.notify[0].text, 'Аня Петрова — исполняется 30 лет. Подготовить поздравление?');
  assert.ok(!phone.log.notify[0].actions, 'без notify.actions — без кнопок');
  assert.ok(phone.log.notify[0].open.indexOf('?tab=people') > 0);
  phone.log.jobs['holidays.evening'].fn();
  assert.strictEqual(phone.log.notify.length, 1, 'второй раз не напоминает');

  var withButtons = engine.make({ now: '2026-11-14T19:30:00', granted: ['READ_CONTACTS'], contacts: CONTACTS, features: ['notify.actions'] });
  withButtons.main.check();
  assert.strictEqual(withButtons.log.notify[0].actions[0].fn, 'draftFromNotice');
});

t.test('в сам день рождения близкого — запись в общую базу, один раз', function () {
  var phone = engine.make({ now: '2026-11-15T09:00:00', granted: ['READ_CONTACTS'], contacts: CONTACTS });
  phone.main.check();
  phone.main.check();
  assert.strictEqual(phone.log.base.length, 1);
  assert.strictEqual(phone.log.base[0].title, 'День рождения: Аня Петрова');
  assert.deepStrictEqual(plain(phone.log.base[0].data), { contact_id: '12', age: 30 });
});

t.test('близкие: отметка «напоминать за 3 дня» по имени', function () {
  var phone = engine.make({ now: '2026-02-27T19:30:00', granted: ['READ_CONTACTS'], contacts: CONTACTS });
  var marked = phone.main.setPerson('Петя', { days: 3 });
  assert.deepStrictEqual(plain([marked.id, marked.close, marked.days]), ['31', true, 3]);
  phone.main.check();
  assert.strictEqual(phone.log.notify[0].title, 'Через 3 дня день рождения');
  var people = phone.main.people();
  assert.strictEqual(people.people.filter(function (person) { return person.id === '31'; })[0].marked, true);
  assert.throws(function () { phone.main.setPerson('Незнакомец', { days: 1 }); }, /Не нашёл/);
});

t.test('черновик поздравления: моделью, во «Входящие», в историю; без модели — шаблон', function () {
  var phone = engine.make({ now: '2026-11-14T20:00:00', granted: ['READ_CONTACTS'], contacts: CONTACTS, inbox: true, model: '«Аня, с днём рождения!»' });
  var entry = phone.main.draft('12');
  assert.strictEqual(entry.text, 'Аня, с днём рождения!');
  assert.strictEqual(entry.by, 'model');
  assert.strictEqual(entry.inbox, 'Аня Петрова');
  assert.strictEqual(phone.log.inbox[0].source, 'model');
  assert.strictEqual(phone.main.people().drafts[0].text, 'Аня, с днём рождения!');
  var plain = engine.make({ now: '2026-11-14T20:00:00', granted: ['READ_CONTACTS'], contacts: CONTACTS, model: null });
  assert.strictEqual(plain.main.draft('Аня').by, 'template');
  var fromNotice = plain.main.draftFromNotice({ contact: '12' });
  assert.strictEqual(plain.log.clip, fromNotice.text, 'текст в буфере обмена');
});

t.test('день рождения владельца: конфетти при первом открытии, поздравление один раз', function () {
  var phone = engine.make({ now: '2026-06-20T09:00:00', features: ['theme.decor', 'app.visible'] });
  phone.settings({ ownerBirthday: '20.06.1990' });
  phone.main.start();
  phone.drain();
  assert.ok(phone.disk['themes/_decor.css'].indexOf('birthday-owner') > 0, 'праздничный цвет');
  assert.ok(phone.disk['themes/_decor.css'].indexOf('body::after') < 0, 'до открытия без конфетти');
  assert.strictEqual(phone.main.opened().first, true);
  phone.drain();
  assert.ok(phone.disk['themes/_decor.css'].indexOf('body::after') > 0, 'конфетти');
  var greetings = phone.log.notify.filter(function (item) { return item.title === 'С днём рождения!'; });
  assert.strictEqual(greetings.length, 1);
  assert.strictEqual(phone.main.opened().first, false);
  phone.at('2026-06-20T09:11:00');
  phone.main.check();
  assert.ok(phone.disk['themes/_decor.css'].indexOf('body::after') < 0, 'через 10 минут конфетти нет');
  var people = phone.main.people();
  assert.strictEqual(people.owner.source, 'settings');
  assert.strictEqual(people.owner.age, 36);
});

t.test('первый снег: вопрос с кнопками, после «да» — зимнее оформление', function () {
  var phone = engine.make({ now: '2026-11-14T10:00:00', features: ['notify.actions'], weatherCode: 73, granted: ['ACCESS_COARSE_LOCATION'] });
  var weather = phone.main.checkWeather();
  assert.strictEqual(weather.snow, true);
  var asked = phone.log.notify.filter(function (item) { return item.title === 'Первый снег'; })[0];
  assert.ok(asked && asked.actions.length === 2, 'вопрос с двумя кнопками');
  assert.strictEqual(phone.main.check().plan, null, 'без согласия не надевается');
  assert.strictEqual(phone.main.checkWeather(), null, 'второй раз за сезон не спрашивает');
  var after = phone.main.answerSnow({ yes: true });
  assert.strictEqual(after.plan.id, 'first-snow');
  assert.deepStrictEqual(plain(after.plan.layers), ['snow']);
  assert.strictEqual(phone.active(), 'holiday');
  phone.at('2026-11-17T10:00:00');
  assert.strictEqual(phone.main.check().plan, null, 'через три дня снято');
});

t.test('свои поводы: добавить, годовщина считается, удалить; встроенный — выключается', function () {
  var phone = engine.make({ now: '2026-11-14T12:00:00' });
  var made = phone.main.addOccasion({ title: 'Годовщина свадьбы', date: '14.06.2015', remind: 3, accent: '#f28db2', decor: 'snow' });
  assert.strictEqual(made.rule.fixed, '06-14');
  assert.strictEqual(made.accent, '#F28DB2');
  var item = phone.main.upcoming(400).filter(function (entry) { return entry.id === made.id; })[0];
  assert.strictEqual(item.anchor, '2027-06-14');
  assert.strictEqual(item.age, 12);
  assert.strictEqual(item.own, true);
  assert.throws(function () { phone.main.addOccasion({ title: 'x', date: 'завтра' }); }, /Не понимаю дату/);
  assert.deepStrictEqual(plain(phone.main.removeOccasion(made.id)), { removed: true });
  assert.deepStrictEqual(plain(phone.main.removeOccasion('halloween')), { disabled: true });
  assert.ok(phone.main.settings().values.off.indexOf('halloween') >= 0);
  phone.main.setOccasion('halloween', true);
  assert.ok(phone.main.settings().values.off.indexOf('halloween') < 0);
});

t.test('повод дня для «Обоев дня», виджет, настройки', function () {
  var phone = engine.make({ now: '2026-12-28T12:00:00' });
  assert.deepStrictEqual(plain(phone.main.occasionToday('2026-12-31')), { id: 'new-year', title: 'Новый год', decor: 'snow', wallpaper: 'snowy forest winter' });
  assert.strictEqual(phone.main.occasionToday('2026-07-15'), null);
  var widget = phone.main.widget();
  assert.strictEqual(widget.title, 'Праздники');
  assert.ok(widget.text.indexOf('Сейчас: Новый год') === 0, widget.text);
  var saved = phone.main.saveSettings({ motionSeconds: 99, remindTime: '20:15' });
  assert.strictEqual(saved.motionSeconds, 60);
  assert.deepStrictEqual(plain(phone.log.jobs['holidays.evening'].when), { at: '20:15' });
  assert.ok(phone.main.settings().decors.some(function (item) { return item.id === 'confetti'; }));
});

t.test('годовщина Axiko: итоги без выдумок, один раз', function () {
  var phone = engine.make({ now: '2026-11-10T12:00:00', installed: '2025-11-10T10:00:00' });
  phone.main.check();
  phone.main.check();
  var notes = phone.log.notify.filter(function (item) { return item.title === 'Год вместе'; });
  assert.strictEqual(notes.length, 1);
  assert.ok(notes[0].text.indexOf('3 модуля') > 0, notes[0].text);
});

t.test('строка в памяти ассистента 1 апреля — только с согласия, на следующий день убрана', function () {
  var phone = engine.make({ now: '2027-04-01T09:00:00' });
  phone.disk['agent/memory.md'] = '# Память\n- владелец любит чай\n';
  phone.main.check();
  assert.ok(phone.disk['agent/memory.md'].indexOf('holidays') < 0, 'без согласия не пишет');
  phone.settings({ memoryLine: true });
  phone.main.check();
  assert.ok(phone.disk['agent/memory.md'].indexOf('1 апреля') > 0);
  phone.at('2027-04-02T09:00:00');
  phone.main.check();
  assert.strictEqual(phone.disk['agent/memory.md'], '# Память\n- владелец любит чай\n');
});

t.test('энергосбережение: только цвет; stop() снимает всё', function () {
  var phone = engine.make({ now: '2026-12-31T12:00:00', powerSave: true });
  var result = phone.main.check();
  assert.deepStrictEqual(plain([result.plan.layers, result.plan.eggs]), [[], []]);
  assert.strictEqual(phone.active(), 'holiday');
  phone.main.start();
  phone.main.stop();
  assert.strictEqual(phone.active(), 'midnight');
  assert.ok(!phone.log.jobs['holidays.daily']);
});

t.test('ошибок в журнале нет', function () {
  var phone = engine.make({ now: '2026-12-31T12:00:00', granted: ['READ_CONTACTS', 'READ_CALENDAR'], contacts: CONTACTS, features: ['theme.decor', 'notify.actions', 'job.once', 'app.visible'] });
  phone.main.start();
  phone.drain();
  phone.main.status();
  phone.main.upcoming();
  phone.main.people();
  phone.main.previewCss('new-year');
  assert.deepStrictEqual(plain(phone.log.errors || []), []);
});

t.test('«Не забыл»: поздравление близким вовремя за срок — в ящик ачивок без модуля, в grant() с ним', function () {
  [false, true].forEach(function (installed) {
    var phone = engine.make({ now: '2026-11-14T20:00:00', granted: ['READ_CONTACTS'], contacts: CONTACTS, model: null, achievements: installed });
    phone.settings({ awardYearDays: 30, awardMinPeople: 1 });
    phone.main.check();
    assert.strictEqual(phone.disk['data/holidays/greeted.json'] !== undefined, true, 'счёт начат');
    phone.main.draft('12');
    phone.at('2026-12-15T12:00:00');
    phone.main.check();
    var box = phone.files.readJson('data/games/achievements-outbox.json', []);
    var got = installed ? phone.log.granted : box;
    assert.deepStrictEqual(plain(got.map(function (item) { return item.key; })), ['holidays/not-forgotten'], installed ? 'grant' : 'ящик');
    assert.strictEqual(installed ? box.length : phone.log.granted.length, 0);
    assert.strictEqual(got[0].category, 'Жизнь');
    phone.main.check();
    assert.strictEqual((installed ? phone.log.granted : phone.files.readJson('data/games/achievements-outbox.json', [])).length, 1, 'один раз');
  });
});

t.test('«Не забыл»: без поздравления или с опозданием ачивки нет', function () {
  var phone = engine.make({ now: '2026-11-14T20:00:00', granted: ['READ_CONTACTS'], contacts: CONTACTS, model: null });
  phone.settings({ awardYearDays: 30, awardMinPeople: 1 });
  phone.main.check();
  phone.at('2026-11-16T12:00:00');
  phone.main.draft('12');   // after the birthday: counts for the next one, a year ahead — not this one
  phone.at('2026-12-15T12:00:00');
  phone.main.check();
  assert.strictEqual(phone.disk['data/games/achievements-outbox.json'], undefined);
});

t.done('main');
