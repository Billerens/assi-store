// The pace of «Подземка» against «Темп» of docs/games/subway.md: the greedy bot (payback + waiting,
// active play, two taps a second in the first five minutes) prints the table; a deviation of more
// than 1.5 times from the target curve fails. Then the trips (two 25-minute trips a day, offline
// between) and the long run by days. node tests/pace.test.js
'use strict';
const path = require('node:path');
const assert = require('assert');
const { setup, pace, trips } = require('./env');
const { test, done } = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));

const x = setup();
const { Big } = x;
const MARKS = [5, 15, 30, 60, 120, 180, 240];
const fmt = (v) => (v >= 1e4 ? v.toExponential(2) : v.toFixed(1));

function table(title, r) {
  console.log('  ' + title);
  Object.keys(r.rows).forEach((m) => {
    const row = r.rows[m];
    console.log('    ' + m + ' мин: ' + row.lines + ' линий, ' + fmt(row.income) + ' ₽/с, ОИ за город ' + row.oi);
  });
  console.log('    метка «выгодно»: ' + (r.hintMin === null ? '—' : r.hintMin.toFixed(1) + ' мин'));
}

function near(got, want, what) {
  const k = got / want;
  assert.ok(k <= 1.5 && k >= 1 / 1.5, what + ': ' + fmt(got) + ' против ~' + fmt(want) + ' (×' + k.toFixed(2) + ')');
}

test('город 1: таблица «Темпа», 10 линий к 4 часам, переезд на 50–70 минуте', () => {
  const r = pace(x, 240, MARKS);
  table('Город 1 (бот из «Темпа»)', r);
  const want = { 5: [2, 60], 15: [3, 2.6e3], 30: [4, 2.4e5], 60: [6, 1e7], 120: [8, 1.7e8] };
  Object.keys(want).forEach((m) => {
    assert.strictEqual(r.rows[m].lines, want[m][0], m + ' мин: линий');
    near(r.rows[m].income, want[m][1], m + ' мин: доход');
  });
  assert.strictEqual(r.rows[240].lines, 10, '4 ч: все 10 линий');
  assert.ok(r.rows[180].lines < 10, 'плато не раньше 4 часов');
  assert.ok(r.rows[60].oi >= 12 && r.rows[60].oi <= 27, '60 мин: около 18 ОИ, а не ' + r.rows[60].oi);
  assert.ok(r.hintMin >= 50 && r.hintMin <= 70, 'метка «выгодно» на ' + r.hintMin + ' мин');
});

test('колонка «Город 2 (20 ОИ)» таблицы: бонус 20 ОИ на ценах первого города', () => {
  // The spec's column is the bot with +40 % income and the first city's prices (as its author
  // computed it): Холмск's own rule and the dearer next city are not in it — see the next test.
  const c = Object.assign({}, x.cfg, { 'city.costGrowth': 1, 'city2.growth': x.cfg['station.growth'], 'city2.demand': 1 });
  const r = pace(Object.assign({}, x, { cfg: c }), 120, [5, 15, 30, 60, 120], (s) => {
    s.layers.city.currency = '20';
    s.layers.city.state.city = 2;
  });
  table('Город 2 по таблице (20 ОИ)', r);
  const want = { 5: [2, 190], 15: [3, 1.7e4], 30: [5, 1.7e6], 60: [7, 9e7] };
  Object.keys(want).forEach((m) => {
    assert.strictEqual(r.rows[m].lines, want[m][0], m + ' мин: линий');
    near(r.rows[m].income, want[m][1], m + ' мин: доход');
  });
  assert.strictEqual(r.rows[120].lines, 9, '2 ч: 9 линий');
});

test('настоящий Холмск (правило города и рост цен городов) — для сведения', () => {
  const r = pace(x, 120, [5, 15, 30, 60, 120], (s) => {
    s.layers.city.currency = '20';
    s.layers.city.state.city = 2;
  });
  table('Холмск с 20 ОИ: рост станций ×1,11, спрос ×1,5, цены города ×' + x.cfg['city.costGrowth'], r);
  assert.ok(r.rows[120].lines >= 6, 'Холмск слишком медленный');
});

test('поездки: первый переезд, города по дням, Генеральный конструктор на третьей-четвёртой неделе', () => {
  // Two 25-minute trips a day, offline between (9 h and 15 h − 50 min); the bot takes the Бюро and
  // the patents in order, moves at the game's mark «выгодно», becomes the Генеральный конструктор
  // at the engine's mark. The spec's goal is «на третьей-четвёртой неделе»: four weeks are run. ~30 s.
  const r = trips(x, 28);
  const cities = r.moves.filter((m) => m.layer === 'city');
  const generals = r.moves.filter((m) => m.layer === 'general');
  console.log('  Переезды до третьего: ' + cities.slice(0, 3).map((m) => 'поездка ' + m.trip + ' (' + Math.round(m.playMin) + ' мин игры) → город ' + m.city + ' +' + m.gain + ' ОИ').join('; '));
  console.log('  По дням: ' + r.days.map((d) => d.day + ': город ' + d.city + (d.generals ? ' (Г' + d.generals + ', патентов ' + d.patents + ')' : '')).join(', '));
  console.log('  Первый Генеральный конструктор: поездка ' + (generals[0] ? generals[0].trip + ', день ' + Math.ceil(generals[0].trip / 2) + ', +' + generals[0].gain + ' патента' : '—'));
  const first = cities[0];
  assert.ok(first, 'ни одного переезда');
  // After the first night (9 h at 0.5, dispatchers) the move comes before 60 minutes of play.
  assert.ok(first.trip >= 2 && first.trip <= 4, 'первый переезд в поездке ' + first.trip);
  const day = (n) => r.days[n - 1].city;
  assert.ok(day(1) >= 2 && day(1) <= 3, 'первый день: 2–3 города, а не ' + day(1));
  assert.ok(day(7) >= 4 && day(7) <= 6, 'первая неделя: города 4–6, а не ' + day(7));
  assert.ok(r.days[13].generals === 0, 'Генеральный конструктор раньше третьей недели');
  assert.ok(generals.length > 0, 'за четыре недели нет Генерального конструктора');
  const gDay = Math.ceil(generals[0].trip / 2);
  assert.ok(gDay >= 15 && gDay <= 28, 'первый Генеральный конструктор на ' + gDay + '-й день');
  for (let i = 1; i < 14; i++) assert.ok(r.days[i].city >= r.days[i - 1].city, 'город уменьшился без второго слоя');
  assert.ok(Big.valid(r.state.run.money) && Big.valid(r.state.layers.general.currency), 'числа испортились');
});

done('Подземка, темп');
