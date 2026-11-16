// The pure parts of the night series (graph, details, prompt, plan, schema) under node:
// node tests/parts.test.js
var assert = require('assert');
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
var ADVENTURE = path.join(ROOT, '..', 'voice-adventure');
var env = require(path.join(ADVENTURE, 'tests', 'engine-stub.js')).install({
  mounts: { 'modules/voice-adventure': ADVENTURE, 'modules/bedtime-series': ROOT }
});
var graph = env.require('modules/bedtime-series/graph.js');
var details = env.require('modules/bedtime-series/details.js');
var prompts = env.require('modules/bedtime-series/prompt.js');
var plan = env.require('modules/bedtime-series/plan.js');
var schema = env.require('modules/bedtime-series/schema.js');
var settingsLib = env.require('modules/voice-adventure/story-engine/settings.js');
var sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'sample.json'), 'utf8'));

var failed = 0;
var passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + (error && error.stack || error));
  }
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function at(h, m) {
  var d = new Date(2026, 10, 14, h, m || 0, 0, 0);
  return d.getTime();
}

// ---- graph ------------------------------------------------------------------------------------------

test('граф: пример серии проходит проверку, пути сходятся', function () {
  assert.deepStrictEqual(graph.validate(sample, { details: [] }), []);
  assert.deepStrictEqual(graph.walk({ A: 0, B: 1 }), ['s1', 'A', 's2a', 's3', 'B', 's4b', 'final']);
  assert.deepStrictEqual(graph.walk({ A: 1, B: 0 }), ['s1', 'A', 's2b', 's3', 'B', 's4a', 'final']);
  assert.strictEqual(graph.next('A', {}), null, 'без выбора дальше развилки не идём');
  assert.strictEqual(graph.next('final', {}), null);
  assert.strictEqual(graph.texts(sample).length, 10, '7 сцен, 2 вопроса, концовка');
  assert.strictEqual(graph.sceneNumber('s2b'), 2);
  assert.strictEqual(graph.sceneNumber('B'), 3);
  assert.strictEqual(graph.momentOf(sample, 'A'), 'когда смотритель моста положил на стол два ключа');
  var noMoment = copy(sample);
  noMoment.choices.B.moment = '';
  assert.ok(/на вопросе/.test(graph.momentOf(noMoment, 'B')));
});

test('граф: затухание последних двух сцен на любом пути', function () {
  var plan2 = graph.fade(2, 0.4);
  assert.deepStrictEqual(Object.keys(plan2).sort(), ['final', 's4a', 's4b']);
  assert.strictEqual(plan2.s4a.from, 1);
  assert.strictEqual(plan2.final.to, 0.4);
  assert.strictEqual(plan2.s4a.to, plan2.final.from);
  assert.deepStrictEqual(graph.fade(0, 0.4), {});
});

test('граф: проверка ловит длину, гигиену, имена, похожие варианты, чужие детали', function () {
  var bad = copy(sample);
  bad.scenes.s1 = 'Слишком коротко.';
  bad.scenes.s3 = bad.scenes.s3 + ' ' + new Array(120).join('ещё слово ');
  bad.scenes.s2a = bad.scenes.s2a + ' ☀';
  bad.scenes.s2b = '- первое\n- второе ' + bad.scenes.s2b;
  bad.scenes.s4a = bad.scenes.s4a + ' Рядом сидела Мария Иванова.';
  bad.scenes.s4b = bad.scenes.s4b + ' Это было на улице Садовой, дом 5.';
  bad.scenes.final = bad.scenes.final + ' И Оля помахала рукой.';
  bad.choices.A.options[1] = { label: 'медный ключ', keywords: ['медный'] };
  bad.asleep = '';
  bad.usedDetails = ['встреча с бухгалтером в банке'];
  var errors = graph.validate(bad, { details: ['в 15:00 — обед с Петей', 'поездка 34 мин'], forbidden: ['Оля'] });
  var has = function (re) { return errors.some(function (e) { return re.test(e); }); };
  assert.ok(has(/s1 короче/), errors.join('\n'));
  assert.ok(has(/s3 длиннее/), errors.join('\n'));
  assert.ok(has(/эмодзи/), errors.join('\n'));
  assert.ok(has(/список/), errors.join('\n'));
  assert.ok(has(/фамили/), errors.join('\n'));
  assert.ok(has(/адрес/), errors.join('\n'));
  assert.ok(has(/«Оля» не из разрешённых/), errors.join('\n'));
  assert.ok(has(/не отличить голосом/), errors.join('\n'));
  assert.ok(has(/asleep/), errors.join('\n'));
  assert.ok(has(/не из списка дня/), errors.join('\n'));
  var fine = copy(sample);
  fine.usedDetails = ['обед с Петей'];
  assert.deepStrictEqual(graph.validate(fine, { details: ['в 15:00 — обед с Петей'] }), []);
});

test('граф: ответ модели приводится к одному виду', function () {
  var raw = copy(sample);
  raw.scenes.s1 = { text: ' ' + sample.scenes.s1 + ' ' };
  raw.choices.A.calm = 'b';
  raw.choices.B.options = ['фонарщик', 'кондуктор'];
  var ep = graph.normalize(raw);
  assert.strictEqual(ep.scenes.s1, sample.scenes.s1);
  assert.strictEqual(ep.choices.A.calm, 1);
  assert.deepStrictEqual(ep.choices.B.options.map(function (o) { return o.next; }), ['s4a', 's4b']);
  assert.strictEqual(ep.choices.B.options[0].label, 'фонарщик');
});

// ---- details of the day -------------------------------------------------------------------------------

test('детали: чужие имена, телефоны, почта, адреса и ссылки вырезаются', function () {
  var one = details.scrub('Обед с Петей и Иваном Сидоровым', ['Петя'], []);
  assert.strictEqual(one.text, 'Обед с Петей и [человек]');
  assert.deepStrictEqual(one.removed, ['Иваном', 'Сидоровым']);
  var two = details.scrub('заметка: Позвонить Марине по +7 900 123-45-67, ivan@mail.ru, https://x.ru/a', ['Петя'], ['Марина Котова']);
  assert.ok(!/Марин|900|ivan|https/.test(two.text), two.text);
  assert.ok(/\[человек\]/.test(two.text));
  var three = details.scrub('место: кафе на ул. Ленина, д. 5', [], []);
  assert.ok(!/Ленина|д\. 5/.test(three.text), three.text);
  assert.ok(details.namesOne('Пете', ['Петя']));
  assert.ok(details.namesOne('Петей', ['Петя']));
  assert.ok(!details.namesOne('Петров', ['Петя']), 'фамилия принята за имя');
  assert.ok(details.namesOne('мамой', ['мама']));
});

test('детали: только разрешённые источники, без трат и здоровья, по порядку дня', function () {
  var got = details.collect({
    calendar: [
      { title: 'Обед с Петей', begin: at(15), end: at(16), allDay: 0 },
      { title: 'День рождения Оли', begin: at(0), end: at(23, 59), allDay: 1 },
      { title: '', begin: at(9) }
    ],
    records: [
      { kind: 'trip', title: 'Поездка', amount: 34, unit: 'min', at: at(9, 30) },
      { kind: 'workout', title: 'Бассейн', amount: 0.75, unit: 'h', at: at(19) },
      { kind: 'expense', title: 'Кофе', amount: 300, at: at(10) },
      { kind: 'sleep', title: 'Сон', amount: 7, unit: 'h', at: at(7) },
      { kind: 'trip', title: 'Поездка', amount: 34, unit: 'min', at: at(9, 31) }
    ],
    sources: ['calendar', 'trip', 'workout'], people: ['Петя'], known: [], max: 6
  });
  var texts = got.details.map(function (d) { return d.text; });
  assert.deepStrictEqual(texts, ['весь день: День рождения [человек]', 'поездка 34 мин', 'в 15:00 — Обед с Петей', 'тренировка: Бассейн, 45 мин']);
  assert.deepStrictEqual(got.removed, ['Оли']);
  var none = details.collect({ calendar: [{ title: 'Обед', begin: at(15) }], records: [{ kind: 'trip', amount: 5, unit: 'min', at: at(8) }], sources: ['note'] });
  assert.deepStrictEqual(none.details, []);
  assert.deepStrictEqual(details.kindsOf(['place', 'note', 'money']), ['place', 'visit', 'note']);
  assert.ok(/деталей нет/.test(details.format([])));
  assert.strictEqual(details.format([{ text: 'поездка 34 мин' }]), '- поездка 34 мин');
  var many = [];
  for (var i = 0; i < 10; i++) many.push({ kind: 'note', title: 'заметка номер ' + i, at: at(8, i) });
  assert.strictEqual(details.collect({ records: many, sources: ['note'], max: 6 }).details.length, 6);
  assert.strictEqual(details.collect({ records: many, sources: ['note'], max: 0 }).details.length, 0, 'ноль — без деталей');
});

test('детали соседей: праздник, Шляпа, уровень, встреча, Входящие, знак недели, питомец, рисунки', function () {
  var events = [
    { kind: 'event', source: 'hat', title: 'Шляпа', at: at(20), data: { players: 5, games: 2, words: 40, names: ['Петя Иванов', 'Оля', 'Сергей'] } },
    { kind: 'event', source: 'rpg', title: 'Уровень 14', at: at(8), data: { level: 14 } },
    { kind: 'event', source: 'rpg', title: 'Уровень 15', at: at(8, 1), data: { level: 15 } },
    { kind: 'event', source: 'recorder', title: 'Планёрка с Иваном', at: at(11), tags: ['встреча', 'работа'], data: { people: ['Петя', 'Иван'] } },
    { kind: 'event', source: 'draw-guess', title: 'Рисуй — угадаю', at: at(21), data: { rounds: 6 } },
    { kind: 'event', source: 'stranger', title: 'Чужое событие', at: at(12) },
    { kind: 'expense', source: 'hat', title: 'Пицца', amount: 900, at: at(19) }
  ];
  var links = {
    holiday: { id: 'victory-day', title: 'День Победы' },
    sign: { title: 'Сова в доме Скроллера' },
    pet: { name: 'Листик', stage: 'Два листа', items: ['Шарф'] },
    inbox: ['Мама', 'Петя Иванов', 'Сбербанк', 'Оля'],
    drawn: ['маяк', 'Кот', 'маяк']
  };
  var all = ['holidays', 'hat', 'rpg', 'meetings', 'inbox', 'horoscope', 'pet', 'draw'];
  var got = details.collect({ events: events, links: links, since: at(0), sources: all, people: ['Петя', 'мама'], known: [], max: 20, names: 3 });
  var texts = got.details.map(function (d) { return d.text; });
  assert.ok(texts.indexOf('праздник: День Победы') >= 0, texts.join(' | '));
  assert.ok(texts.indexOf('знак недели в шуточном гороскопе: Сова в доме Скроллера') >= 0, texts.join(' | '));
  assert.ok(texts.some(function (t) { return /питомец .*по имени Листик, сейчас «два листа», при нём: шарф/.test(t); }), texts.join(' | '));
  assert.ok(texts.indexOf('писали за день: мама, Петя') >= 0, 'только люди из списка, только имена: ' + texts.join(' | '));
  assert.ok(texts.indexOf('новый уровень в жизни-игре: 15') >= 0, 'один, самый высокий уровень');
  assert.ok(texts.indexOf('встреча: Планёрка с [человек]; были Петя') >= 0, texts.join(' | '));
  assert.ok(texts.indexOf('вечер игры в «Шляпу» с компанией, игроков 5, партий 2; играли Петя') >= 0, texts.join(' | '));
  assert.ok(texts.indexOf('играли в «Рисуй — угадаю», раундов 6; рисовали: маяк, кот') >= 0, texts.join(' | '));
  assert.ok(!/Оля|Сергей|Сбербанк|Иван|Пицца|Чужое/.test(texts.join(' ')), 'лишнее: ' + texts.join(' | '));
  assert.deepStrictEqual(got.removed, ['Иваном']);
  assert.strictEqual(texts.length, 8);
  assert.ok(/особый день \(праздник: День Победы\)/.test(details.occasionLine(got.details)));
  assert.strictEqual(details.occasionLine([]), '');
  // The birthday of the owner.
  var birthday = details.collect({ links: { holiday: { id: 'birthday-owner', title: 'Ваш день рождения' } }, sources: ['holidays'] });
  assert.strictEqual(birthday.details[0].text, 'день рождения слушателя');
  // Nothing of it without its source.
  var none = details.collect({ events: events, links: links, since: at(0), sources: ['calendar', 'note'], people: ['Петя'], max: 20 });
  assert.deepStrictEqual(none.details, []);
  // Draw words without a record of the game.
  var drawOnly = details.collect({ links: { drawn: ['маяк'] }, sources: ['draw'] });
  assert.deepStrictEqual(drawOnly.details.map(function (d) { return d.text; }), ['играли в «Рисуй — угадаю»; рисовали: маяк']);
  // Names and words off (details.names = 0): no names, no words.
  var off = details.collect({ links: { drawn: ['маяк'], inbox: ['Петя'] }, sources: ['draw', 'inbox'], people: ['Петя'], names: 0 });
  assert.deepStrictEqual(off.details, []);
});

test('бюджет деталей: праздник остаётся, питомец и знак уходят первыми, не больше N из источника, длина', function () {
  var notes = [];
  for (var i = 0; i < 6; i++) notes.push({ kind: 'note', title: 'заметка номер ' + i, at: at(9, i) });
  var links = { holiday: { id: 'new-year', title: 'Новый год' }, sign: { title: 'Сова в доме Скроллера' }, pet: { name: 'Листик' } };
  var got = details.collect({
    records: notes.concat([{ kind: 'trip', amount: 20, unit: 'min', at: at(8) }]), links: links, since: at(0),
    sources: ['note', 'trip', 'holidays', 'horoscope', 'pet'], max: 5, perSource: 3
  });
  var texts = got.details.map(function (d) { return d.text; });
  assert.deepStrictEqual(texts, ['праздник: Новый год', 'поездка 20 мин', 'заметка: заметка номер 0', 'заметка: заметка номер 1', 'заметка: заметка номер 2'], texts.join(' | '));
  var roomy = details.collect({ records: notes, links: links, since: at(0), sources: ['note', 'holidays', 'horoscope', 'pet'], max: 20, perSource: 2 });
  assert.strictEqual(roomy.details.filter(function (d) { return d.source === 'note'; }).length, 2);
  assert.strictEqual(roomy.details.length, 5);
  var long = details.collect({ records: [{ kind: 'note', title: 'очень длинная заметка о том как прошёл день и что было потом и ещё много слов', at: at(9) }], sources: ['note'], chars: 40 });
  assert.ok(long.details[0].text.length <= 41, long.details[0].text);
  assert.deepStrictEqual(details.allowedNames(['Петя Иванов', 'Мама', 'Вася'], ['мама', 'Петя'], 1), ['Петя']);
});

// ---- prompts ------------------------------------------------------------------------------------------

test('промпт серии: библия, три последних пересказа, детали, выборы, пределы', function () {
  var template = fs.readFileSync(path.join(ROOT, 'prompts', 'episode.md'), 'utf8');
  var summaries = [1, 2, 3, 4].map(function (n) { return { episode: n, summary: 'Пересказ ' + n + '.\nВторая строка.', ending: 'Конец ' + n }; });
  var text = prompts.episodePrompt(template, {
    season: { title: 'Город под мостами', genre: 'тихая городская мистика', tone: 'тёплый', length: 10 },
    bible: { world: 'Ночной город', characters: ['смотритель'], realPeople: { 'Петя': 'посыльный Петя' } },
    summaries: summaries, details: '- в 15:00 — обед с Петей', lastChoices: 'В прошлой серии слушатель выбрал: «медный».',
    number: 5, total: 12
  }, { sceneMin: 900, sceneMax: 1600, branchMin: 250, branchMax: 900, asleepMax: 600, recapEpisodes: 3 });
  assert.ok(/Сезон: «Город под мостами»/.test(text));
  assert.ok(/Серия 5 из 12, около 10 минут/.test(text));
  assert.ok(!/Пересказ 1\./.test(text) && /Серия 2: Пересказ 2\. Вторая строка\./.test(text) && /Серия 4:/.test(text), text);
  assert.ok(/- Конец 4/.test(text));
  assert.ok(/обед с Петей/.test(text));
  assert.ok(/Петя — посыльный Петя/.test(text));
  assert.ok(/выбрал: «медный»/.test(text));
  assert.ok(/от 900 до 1600/.test(text) && /от 250 до 900/.test(text) && /до 600 знаков/.test(text));
  assert.ok(!/\{\{/.test(text), 'остались места для подстановки');
  var first = prompts.episodePrompt(template, { season: {}, bible: {}, summaries: [], number: 1, total: 12 }, { sceneMin: 1 });
  assert.ok(/это первая серия сезона/.test(first) && /придумай название сезона/.test(first));
});

test('промпт: выборы прошлой серии, библия растёт, бриф живого режима', function () {
  var said = prompts.choicesText(sample, { choices: { A: 1, B: 0 }, defaults: { B: true }, asleepAt: null });
  assert.ok(/«стальной»/.test(said) && /«фонарщик» \(выбрал рассказчик/.test(said), said);
  assert.ok(/уснул/.test(prompts.choicesText(sample, { choices: {}, asleepAt: 'A' })));
  var bible = prompts.mergeBible({ title: 'Город под мостами', characters: ['смотритель'] },
    { title: 'Другое имя', world: 'Ночной город', characters: ['смотритель', 'фонарщик'], realPeople: { 'Петя': 'посыльный' } });
  assert.strictEqual(bible.title, 'Город под мостами', 'название сезона не меняется');
  assert.deepStrictEqual(bible.characters, ['смотритель', 'фонарщик']);
  assert.strictEqual(bible.realPeople['Петя'], 'посыльный');
  var ep = graph.normalize(sample);
  ep.number = 3;
  var brief = prompts.liveBrief({ title: 'Город под мостами', tone: 'тёплый' }, bible, ep);
  assert.ok(/серия 3: «Смотритель моста»/.test(brief));
  assert.ok(/Развилка A: Какой ключ/.test(brief) && /«медный» → s2a/.test(brief) && /выбери «медный»/.test(brief), brief);
  assert.ok(/Если слушатель уснул: Рассказчик говорит совсем тихо/.test(brief));
  assert.strictEqual(prompts.readyLine(12, 'Ключ под мостом'), 'Серия 12 готова: «Ключ под мостом»');
  assert.deepStrictEqual(prompts.parseJson('```json\n{"a": 1}\n```'), { a: 1 });
  assert.ok(/Исправь/.test(prompts.fixPrompt(['раз', 'два'])));
});

// ---- plan -------------------------------------------------------------------------------------------------

test('план: окно вечера, повтор без сети, номер сезона', function () {
  assert.ok(plan.inWindow(at(20, 0), '20:00', '22:30'));
  assert.ok(plan.inWindow(at(22, 29), '20:00', '22:30'));
  assert.ok(!plan.inWindow(at(22, 30), '20:00', '22:30'));
  assert.ok(!plan.inWindow(at(9), '20:00', '22:30'));
  assert.ok(plan.inWindow(at(0, 30), '23:00', '01:00'), 'окно через полночь');
  assert.ok(!plan.inWindow(at(2), '23:00', '01:00'));
  assert.strictEqual(plan.retryAt(at(20, 0), 30, '20:00', '22:30'), at(20, 30));
  assert.strictEqual(plan.retryAt(at(22, 10), 30, '20:00', '22:30'), null, 'после напоминания не повторяем');
  assert.strictEqual(plan.retryAt(at(12), 30, '20:00', '22:30'), null);
  assert.strictEqual(plan.seasonId(at(20, 5)), 's20261114-2005');
  assert.ok(plan.validId('s20261114-2005') && !plan.validId('../x'));
  assert.strictEqual(plan.dayWord(at(23) - 86400000, at(21)), 'Вчера');
  assert.strictEqual(plan.dayWord(at(1), at(21)), 'Сегодня');
  assert.strictEqual(plan.dayWord(at(1) - 3 * 86400000, at(21)), 'В прошлый раз');
});

test('план: когда писать новую серию', function () {
  var season = { id: 's1', written: 0, listened: 0, episodes: 12 };
  assert.deepStrictEqual(plan.writeNeed(season, null, '2026-11-14'), { need: true, number: 1 });
  season.written = 1;
  season.preparedOn = '2026-11-13';
  assert.ok(!plan.writeNeed(season, null, '2026-11-14').need, 'первая ещё не начата — вторую не пишем');
  assert.ok(plan.writeNeed(season, { season: 's1', episode: 1, done: false, asleepAt: 'A' }, '2026-11-14').need, 'уснул в первой — пишем вторую');
  season.listened = 1;
  assert.deepStrictEqual(plan.writeNeed(season, null, '2026-11-14'), { need: true, number: 2 });
  season.preparedOn = '2026-11-14';
  assert.ok(!plan.writeNeed(season, null, '2026-11-14').need, 'одна серия в день');
  assert.ok(plan.writeNeed(season, null, '2026-11-14', true).need, 'кнопка «Написать сейчас»');
  assert.ok(!plan.writeNeed({ id: 's1', written: 12, listened: 12, episodes: 12 }, null, '2026-11-14').need);
  assert.ok(!plan.writeNeed(null).need);
});

test('план: что играть — новая, продолжение, «продолжим или новую?»', function () {
  var season = { id: 's1', written: 2, listened: 1, episodes: 12 };
  var now = at(22, 40);
  assert.deepStrictEqual(plan.toPlay(season, null, now, 3), { mode: 'new', episode: 2, node: 's1' });
  var killed = { season: 's1', episode: 2, node: 's3', done: false };
  assert.deepStrictEqual(plan.toPlay(season, killed, now, 3), { mode: 'resume', episode: 2, node: 's3' });
  var asleep = { season: 's1', episode: 1, node: 'B', done: false, asleepAt: 'A', asleepTime: now - 86400000 };
  season.listened = 0;
  assert.strictEqual(plan.toPlay(season, asleep, now, 3).mode, 'ask');
  assert.deepStrictEqual(plan.toPlay(season, asleep, now, 3, 'continue'), { mode: 'continue', episode: 1, node: 's1' });
  assert.deepStrictEqual(plan.toPlay(season, asleep, now, 3, 'new'), { mode: 'new', episode: 2, node: 's1', skipped: 1 });
  assert.strictEqual(plan.toPlay(season, asleep, now + 5 * 86400000, 3).mode, 'new', 'давно уснул — сразу новая');
  var lastAsleep = { season: 's1', episode: 2, node: 'B', done: false, asleepAt: 'B', asleepTime: now };
  assert.deepStrictEqual(plan.toPlay(season, lastAsleep, now, 3), { mode: 'continue', episode: 2, node: 's3' });
  assert.strictEqual(plan.toPlay(season, lastAsleep, now, 3, 'new').note, 'Новой серии пока нет.');
  var done = { season: 's1', episode: 2, node: 'final', done: true };
  season.listened = 2;
  assert.ok(/Серия 3 ещё не готова/.test(plan.toPlay(season, done, now, 3).why));
  assert.ok(plan.toPlay({ id: 's1', written: 12, listened: 12, episodes: 12 }, null, now, 3).finished);
  assert.ok(plan.toPlay(season, { season: 'other', episode: 2, node: 's3' }, now, 3).why, 'чужой сезон не продолжаем');
});

test('план: текст напоминания и отмотка к развилке', function () {
  assert.strictEqual(plan.reminder({ play: { mode: 'new', episode: 12 }, title: 'Ключ под мостом' }).text, 'Серия 12 готова: «Ключ под мостом»');
  assert.strictEqual(plan.reminder({ play: { why: 'нет' }, error: 'нет сети' }).text, 'Сегодня без новой серии: нет сети');
  assert.ok(!plan.reminder({ play: { why: 'нет' }, error: '' }).ready);
  assert.ok(/вы уснули, когда/.test(plan.reminder({ play: { mode: 'ask', episode: 3 }, moment: 'когда смотритель протянул ключи' }).text));
  assert.strictEqual(plan.reminder({ play: { finished: true } }).send, false);
  var back = plan.rewind({ node: 'B', choices: { A: 1, B: 0 }, defaults: { B: true }, asked: { A: 2, B: 2 }, missed: 2, asleepAt: 'B', slow: true }, 'B');
  assert.strictEqual(back.node, 's3');
  assert.deepStrictEqual(back.choices, { A: 1 });
  assert.deepStrictEqual(back.defaults, {});
  assert.strictEqual(back.missed, 0);
  assert.strictEqual(back.asleepAt, null);
  assert.strictEqual(plan.rewind({ choices: { A: 0, B: 1 } }, 'A').node, 's1');
});

// ---- settings ---------------------------------------------------------------------------------------------

test('настройки: пределы, время, люди, источники, длинные серии', function () {
  var values = settingsLib.values(schema.SCHEMA, { choiceWaitSec: 1, remindAt: '24:00', prepareAt: '7:05', sources: ['note', 'x'] });
  assert.strictEqual(values.choiceWaitSec, 5);
  assert.strictEqual(values.remindAt, '22:30');
  assert.strictEqual(values.prepareAt, '07:05');
  assert.deepStrictEqual(schema.sourceList(values.sources), ['note']);
  assert.deepStrictEqual(schema.peopleList('Петя, мама;  Петя,\nОля'), ['Петя', 'мама', 'Оля']);
  var base = settingsLib.values(schema.SCHEMA, {});
  assert.deepStrictEqual(schema.sourceList(base.sources),
    ['calendar', 'trip', 'workout', 'note', 'place', 'holidays', 'hat', 'rpg', 'horoscope', 'pet', 'draw'], 'Входящие и встречи — только когда владелец разрешит');
  assert.deepStrictEqual(schema.SCHEMA.sources.options.map(function (o) { return o[0]; }), schema.SOURCE_IDS);
  assert.deepStrictEqual(details.SOURCES.map(function (o) { return o[0]; }), schema.SOURCE_IDS);
  assert.strictEqual(base['details.max'], 8);
  assert.strictEqual(base['details.perSource'], 3);
  assert.strictEqual(base['art.on'], false);
  var ten = schema.episodeLimits(base, 10);
  var fifteen = schema.episodeLimits(base, 15);
  assert.strictEqual(ten.sceneMin, 900);
  assert.strictEqual(fifteen.sceneMax, Math.round(1600 * 1.4));
  var swapped = schema.episodeLimits(settingsLib.values(schema.SCHEMA, { 'scene.min': 2000, 'scene.max': 1000 }), 10);
  assert.ok(swapped.sceneMin <= swapped.sceneMax);
  var voice = schema.voiceOptions(base);
  assert.strictEqual(voice.listenSec, 15);
  assert.strictEqual(voice.pushToTalk, 'never');
  assert.strictEqual(voice.slowFactor, 0.85);
});

console.log('parts: прошло ' + passed + ', не прошло ' + failed);
if (failed) process.exit(1);
