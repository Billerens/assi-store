// Logic and drawing of the pet on a computer: node tests/pet.test.js
var assert = require('assert');
var Settings = require('../settings.js');
var Mood = require('../mood.js');
var Look = require('../look.js');
var Shapes = require('../shapes.js');
var Svg = require('../svg.js');
var Draw = require('../draw.js');
var Phrases = require('../phrases.js');
var History = require('../history.js');
var BOOK = require('../phrases.json');

var passed = 0;
var failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n  ') : error));
  }
}

var S = Settings.merge({});
var GOALS = { stepsGoal: 8000, sleepGoal: 450, waterGoal: 2000, glassMl: 250, dayEnd: '05:00', nightStart: '00:30', nightEnd: '05:00' };

/** A health.today()-like day: a good one by default, at hh:mm. */
function day(hm, patch) {
  var m = /^(\d+):(\d+)$/.exec(hm);
  var out = {
    date: '2026-11-14', hour: Number(m[1]), minute: Number(m[1]) * 60 + Number(m[2]), night: false, screenOn: true,
    known: { sleep: true, steps: true, screen: true }, sleepMin: 460, bedtime: '23:40', steps: 8000, stepsGoal: 8000, sleepGoal: 450,
    prevLateMin: 0, prevKnownScreen: true, habitsDue: 0, habitsDone: 0, medsDue: 0, medsTaken: 0, waterMl: 2000, waterGoal: 2000,
    newPlaces: 0, left: [], paused: null, goals: GOALS
  };
  Object.keys(patch || {}).forEach(function (key) { out[key] = patch[key]; });
  return out;
}

function stateOf(t, s) {
  return Mood.compute(t, s || S).state;
}

// ---- settings ----
test('settings: defaults and cleaning', function () {
  assert.strictEqual(S.name, 'Листик');
  assert.strictEqual(S.palette, 'moss');
  assert.deepStrictEqual(S.stages, [1, 5, 15, 30, 50]);
  assert.strictEqual(S.lateLimit, 60);
  assert.strictEqual(S.unrestedUntil, '14:00');
  var c = Settings.clean({ name: '  ', palette: 'neon', stages: '15, 1, 5, 50, 30, 70', lateLimit: '1000', notifyFrom: '9:05', voiceOn: 'true', junk: 1, wSleep: 'x' });
  assert.strictEqual('name' in c, false, 'an empty name is not saved');
  assert.strictEqual('palette' in c, false, 'an unknown palette is not saved');
  assert.deepStrictEqual(c.stages, [1, 5, 15, 30, 50]);
  assert.strictEqual(c.lateLimit, 240);
  assert.strictEqual(c.notifyFrom, '09:05');
  assert.strictEqual(c.voiceOn, true);
  assert.strictEqual('junk' in c, false);
  assert.strictEqual('wSleep' in c, false);
  assert.strictEqual(Settings.merge({ name: 'Бублик' }).name, 'Бублик');
});

test('settings: every number of the mood is a setting', function () {
  ['wSleep', 'wLate', 'wActivity', 'wCare', 'lateLimit', 'unrestedLate', 'unrestedSleep', 'wakeSteps', 'sleepyBelow', 'restlessBelow',
    'cheerfulFrom', 'calmFrom', 'minKnown', 'welcomeDays', 'partyHours', 'holdDays', 'reactSeconds', 'tickEvery', 'historyDays', 'stripDays',
    'playBonus', 'playFull', 'focusRecheck']
    .forEach(function (key) { assert.strictEqual(typeof S[key], 'number', key); });
  Settings.SCHEMA.forEach(function (item) {
    assert.ok(item.label && item.section, 'no label: ' + item.key);
    if (item.type === 'select') assert.ok(item.options.some(function (o) { return o[0] === item.def; }), item.key);
  });
});

// ---- mood: formulas ----
test('mood: dayShare from 08:00 to 21:00, after midnight it is the evening', function () {
  assert.strictEqual(Mood.dayShare(7 * 60, S, '05:00'), 0);
  assert.strictEqual(Mood.dayShare(8 * 60, S, '05:00'), 0);
  assert.ok(Math.abs(Mood.dayShare(14 * 60 + 30, S, '05:00') - 0.5) < 1e-9);
  assert.strictEqual(Mood.dayShare(22 * 60, S, '05:00'), 1);
  assert.strictEqual(Mood.dayShare(60, S, '05:00'), 1);
});

test('mood: the energy formula of the description', function () {
  var t = day('21:30', { sleepMin: 405, prevLateMin: 30, steps: 6000, habitsDue: 2, habitsDone: 1, waterMl: 1000 });
  var f = Mood.factors(t, S);
  assert.ok(Math.abs(f.sleepScore - 0.9) < 1e-9);
  assert.ok(Math.abs(f.lateScore - 0.5) < 1e-9);
  assert.ok(Math.abs(f.activityScore - 0.75) < 1e-9);
  assert.ok(Math.abs(f.careScore - 0.5) < 1e-9, 'care: (1 + 0.5) / 3 = 0.5');
  var e = Mood.energy(f, S);
  assert.strictEqual(e.energy, Math.round(100 * (0.40 * 0.9 + 0.20 * 0.5 + 0.25 * 0.75 + 0.15 * 0.5)));
  assert.strictEqual(e.known, 1);
});

test('mood: what is unknown is not bad — its weight goes to the others', function () {
  var t = day('21:30', { known: { sleep: false, steps: false, screen: false }, sleepMin: null, steps: null, prevLateMin: null, prevKnownScreen: false });
  var f = Mood.factors(t, S);
  assert.strictEqual(f.sleepScore, null);
  assert.strictEqual(f.lateScore, null);
  assert.strictEqual(f.activityScore, null);
  assert.strictEqual(f.careScore, 1);
  var e = Mood.energy(f, S);
  assert.strictEqual(e.energy, 100);
  assert.ok(Math.abs(e.known - 0.15) < 1e-9);
  assert.strictEqual(stateOf(t), 'calm', 'little data → calm');
});

test('mood: care against the part of the day gone', function () {
  var t = day('14:30', { habitsDue: 2, habitsDone: 1, waterMl: 500 });
  var f = Mood.factors(t, S);
  // done = 1 + 0.25 of 3 due, half the day gone → 1.25 / 1.5
  assert.ok(Math.abs(f.careScore - 1.25 / 1.5) < 1e-9);
  assert.strictEqual(Mood.factors(day('07:00', { habitsDue: 2 }), S).careScore, null, 'before the day starts care is not known');
});

// ---- mood: the table ----
test('mood: the check of the description — 300 min of sleep and 60 min at night → unrested, 3 000 steps lift it', function () {
  var t = day('09:30', { sleepMin: 300, prevLateMin: 60, steps: 400 });
  assert.strictEqual(stateOf(t), 'unrested');
  t.steps = 3000;
  var after = stateOf(t);
  assert.notStrictEqual(after, 'unrested');
  assert.strictEqual(after, 'sleepy', 'still short of sleep');
});

test('mood: unrested by the night screen alone, and not after 14:00', function () {
  assert.strictEqual(stateOf(day('10:00', { prevLateMin: 45, steps: 100 })), 'unrested');
  assert.strictEqual(stateOf(day('10:00', { prevLateMin: 44, steps: 100 })) !== 'unrested', true);
  assert.notStrictEqual(stateOf(day('14:00', { prevLateMin: 90, steps: 100 })), 'unrested');
});

test('mood: pauses come first and are cosy', function () {
  assert.strictEqual(stateOf(day('09:00', { paused: 'sick', sleepMin: 200 })), 'blanket');
  assert.strictEqual(stateOf(day('09:00', { paused: 'vacation', night: true })), 'vacation');
  assert.strictEqual(stateOf(day('19:00', { paused: 'rest', steps: 100 })), 'vacation');
});

test('mood: the night — asleep, or woken with the phone in hand', function () {
  assert.strictEqual(stateOf(day('01:30', { night: true, screenOn: false })), 'asleep');
  assert.strictEqual(stateOf(day('01:30', { night: true, screenOn: true })), 'woken');
  assert.strictEqual(stateOf(day('01:30', { night: true, screenOn: true }), Settings.merge({ nightWoken: false })), 'asleep');
});

test('mood: sleepy, restless, curious, content, cheerful, calm, quiet', function () {
  assert.strictEqual(stateOf(day('16:00', { sleepMin: 380 })), 'sleepy');
  assert.strictEqual(stateOf(day('19:00', { steps: 1000 })), 'restless');
  assert.strictEqual(stateOf(day('01:00', { steps: 2000 })), 'restless', 'after midnight it is still the evening');
  assert.strictEqual(stateOf(day('12:00', { newPlaces: 1 })), 'curious');
  assert.strictEqual(stateOf(day('20:00', { habitsDue: 2, habitsDone: 2, left: [] })), 'content');
  assert.notStrictEqual(stateOf(day('20:00', { habitsDue: 2, habitsDone: 1, left: ['Зарядка'] })), 'content');
  assert.strictEqual(stateOf(day('15:00')), 'cheerful');
  assert.strictEqual(stateOf(day('15:00', { sleepMin: 420, prevLateMin: 40, steps: 2500, waterMl: 0, waterGoal: 2000 })), 'calm');
  assert.strictEqual(stateOf(day('15:00', { sleepMin: 400, prevLateMin: 60, steps: 500, waterMl: 0, habitsDue: 3, left: ['Зарядка', 'Чтение', 'Растяжка'] })), 'quiet');
});

test('mood: «Почему так» shows the numbers', function () {
  var t = day('15:00', { sleepMin: 340, sleepGoal: 450, prevLateMin: 50, steps: 3100 });
  var f = Mood.factors(t, S);
  var lines = Mood.why(t, f, S).map(function (x) { return x.text.replace(/ /g, ' '); });
  assert.ok(lines[0].indexOf('Сон 5 ч 40 мин из 7 ч 30 мин') === 0, lines[0]);
  assert.strictEqual(lines[1], '50 мин экрана после 00:30');
  assert.ok(lines[2].indexOf('Шаги 3 100 к 15:00 из 8 000') === 0, lines[2]);
  var none = Mood.why(day('15:00', { known: { sleep: false, steps: false }, prevKnownScreen: false }), Mood.factors(day('15:00', { known: {}, prevKnownScreen: false }), S), S);
  assert.ok(none[0].text.indexOf('не в минус') > 0);
});

test('mood: the widget line and the window', function () {
  assert.strictEqual(Mood.widgetLine(day('15:00', { sleepMin: 460, steps: 6100 }), 82).replace(/ /g, ' '), 'Энергия 82 · сон 7:40 · 6 100 шагов');
  assert.strictEqual(Mood.widgetLine(day('15:00', { sleepMin: 479.7 }), 80).indexOf('сон 8:00') > 0, true);
  assert.strictEqual(Mood.widgetLine({ known: {} }, null), 'Энергия —');
  assert.strictEqual(Mood.inWindow(30, '00:30', '05:00'), true);
  assert.strictEqual(Mood.inWindow(29, '00:30', '05:00'), false);
  assert.strictEqual(Mood.inWindow(23 * 60, '21:00', '07:00'), true);
  assert.strictEqual(Mood.inWindow(6 * 60, '21:00', '07:00'), true);
  assert.strictEqual(Mood.inWindow(12 * 60, '21:00', '07:00'), false);
});

// ---- look ----
test('look: every state has its look', function () {
  assert.strictEqual(Mood.STATES.length, 12);
  Mood.STATES.forEach(function (s) {
    var look = Look.look(s.id, {});
    assert.strictEqual(look.state, s.id);
    assert.ok(look.eyes && look.stem && look.posture && look.motion, s.id);
    assert.ok(look.brows >= -20 && look.brows <= 20, s.id);
  });
  assert.strictEqual(Look.look('asleep').eyes, 'closed');
  assert.ok(Look.look('asleep').extras.indexOf('zzz') >= 0);
  assert.ok(Look.look('blanket').extras.indexOf('mug') >= 0);
  assert.ok(Look.look('vacation').extras.indexOf('panama') >= 0);
  assert.strictEqual(Look.look('woken').eyes, 'one');
  assert.strictEqual(Look.look('unrested').stem, 'droop');
});

test('look: stages by level', function () {
  assert.strictEqual(Look.stageFor(1, S.stages), 0);
  assert.strictEqual(Look.stageFor(4, S.stages), 0);
  assert.strictEqual(Look.stageFor(5, S.stages), 1);
  assert.strictEqual(Look.stageFor(29, S.stages), 2);
  assert.strictEqual(Look.stageFor(30, S.stages), 3);
  assert.strictEqual(Look.stageFor(99, S.stages), 4);
});

test('look: things — one a slot, the owner over the season, the panama and the blanket win', function () {
  var items = [{ id: 'scarf', slot: 'neck', worn: true }, { id: 'hiking-hat', slot: 'head', worn: true }, { id: 'lantern', slot: 'hand', worn: false }, { id: 'trophy', slot: 'shelf', worn: true }];
  var season = Look.season('halloween', 12, [12, 1, 2]);
  assert.deepStrictEqual(season.map(function (x) { return x.id; }), ['pumpkin-hat', 'winter-scarf']);
  var calm = Look.look('calm', { items: items, season: season });
  assert.deepStrictEqual(calm.items, [{ id: 'hiking-hat', slot: 'head' }, { id: 'scarf', slot: 'neck' }]);
  assert.deepStrictEqual(Look.look('calm', { season: season }).items.map(function (x) { return x.id; }), ['pumpkin-hat', 'winter-scarf']);
  assert.strictEqual(Look.look('vacation', { items: items }).items.some(function (x) { return x.slot === 'head'; }), false);
  assert.strictEqual(Look.look('blanket', { items: items }).items.some(function (x) { return x.slot === 'neck'; }), false);
  assert.deepStrictEqual(Look.season(null, 7, [12, 1, 2]), []);
  assert.deepStrictEqual(Look.season('birthday-owner', 5, []).map(function (x) { return x.id; }), ['party-hat']);
});

test('look: traits, badge, party, reactions', function () {
  var look = Look.look('calm', { traits: ['backpack', 'sturdy', 'nightcap'], holding: { rarity: 'rare' }, party: true });
  assert.ok(look.extras.indexOf('backpack') >= 0 && look.extras.indexOf('badge') >= 0 && look.extras.indexOf('party') >= 0);
  assert.strictEqual(look.sturdy, true);
  assert.ok(Look.look('asleep', { traits: ['nightcap'] }).extras.indexOf('nightcap') >= 0);
  assert.ok(Look.look('asleep', { holding: { rarity: 'rare' } }).extras.indexOf('badge') < 0, 'no badge in sleep');
  var drink = Look.look('calm', { reaction: 'water' });
  assert.strictEqual(drink.motion, 'drink');
  assert.strictEqual(drink.drink, true);
  assert.strictEqual(drink.eyes, 'happy');
  assert.strictEqual(Look.look('calm', { reaction: 'med' }).motion, 'nod');
  assert.strictEqual(Look.look('calm', { reaction: 'achievement' }).motion, 'bounce');
  assert.strictEqual(Look.look('calm', { palette: 'nope' }).palette, 'moss');
  assert.strictEqual(Look.look('calm', { palette: 'dusk' }).colors.body, '#8E88C4');
});

// ---- drawing ----
function allLooks() {
  var out = [];
  var items = [{ id: 'scarf', slot: 'neck', worn: true }, { id: 'hiking-hat', slot: 'head', worn: true }, { id: 'lantern', slot: 'hand', worn: true }];
  Mood.STATES.forEach(function (s) {
    [0, 1, 2, 3, 4].forEach(function (stage) {
      out.push(Look.look(s.id, { stage: stage }));
    });
    out.push(Look.look(s.id, { stage: 2, items: items, traits: ['backpack', 'sturdy', 'nightcap'], party: true, holding: { rarity: 'epic' } }));
    out.push(Look.look(s.id, { stage: 4, season: Look.season('new-year', 1, [12, 1, 2]), palette: 'accent', reaction: 'water' }));
    out.push(Look.look(s.id, { stage: 1, season: Look.season('birthday-owner', 6, []), palette: 'clay', reaction: 'habit' }));
    out.push(Look.look(s.id, { stage: 3, season: Look.season('halloween', 10, []), palette: 'dusk', reaction: 'med' }));
  });
  return out;
}

function flatten(prims, out) {
  prims.forEach(function (p) {
    if (p.t === 'g') flatten(p.kids, out);
    else out.push(p);
  });
  return out;
}

test('svg: every look renders, balanced, without NaN', function () {
  var shelf = [{ id: 'trophy', slot: 'shelf' }, { id: 'medal', slot: 'shelf', rarity: 'legendary' }];
  allLooks().forEach(function (look) {
    var text = Svg.render(look, { room: true, night: look.state === 'asleep', shelf: shelf, label: 'Листик: <проверка>' });
    assert.ok(text.indexOf('<svg') === 0 && /<\/svg>$/.test(text), look.state);
    assert.ok(text.indexOf('NaN') < 0 && text.indexOf('undefined') < 0, look.state + ': NaN/undefined');
    assert.strictEqual((text.match(/<g[ >]/g) || []).length, (text.match(/<\/g>/g) || []).length, look.state + ': groups');
    assert.ok(text.indexOf('&lt;проверка&gt;') > 0, 'the label is escaped');
    var still = Svg.render(look, { still: true });
    assert.ok(still.indexOf('<style>') < 0 && still.indexOf('pt-blink') < 0, 'still: no animation');
  });
  var open = Svg.render(Look.look('calm'), {});
  assert.ok(open.indexOf('pt-blink') > 0, 'open eyes blink');
  assert.ok(open.indexOf('prefers-reduced-motion') > 0);
  assert.ok(Svg.render(Look.look('calm', { palette: 'accent' }), {}).indexOf('var(--accent') > 0, 'accent palette on screen');
});

test('svg: the CSS has one declaration a line', function () {
  Svg.css(4.5).split('\n').forEach(function (line) {
    var semis = (line.match(/;/g) || []).length;
    assert.ok(semis <= 1, 'two declarations on a line: ' + line);
  });
});

test('draw: the same shapes walk through a Canvas-like adapter', function () {
  allLooks().forEach(function (look) {
    var prims = Shapes.creature(look);
    var calls = { path: 0, ellipse: 0, save: 0, restore: 0, bad: 0 };
    var colors = [];
    var count = Draw.walk(prims, {
      save: function () { calls.save++; },
      restore: function () { calls.restore++; },
      translate: function (x, y) { if (isNaN(x) || isNaN(y)) calls.bad++; },
      rotate: function (d) { if (isNaN(d)) calls.bad++; },
      scale: function (s) { if (isNaN(s)) calls.bad++; },
      path: function (cmds, paint) {
        calls.path++;
        cmds.forEach(function (c) { c.slice(1).forEach(function (n) { if (typeof n !== 'number' || isNaN(n)) calls.bad++; }); });
        if (paint.fill) colors.push(paint.fill);
        if (paint.stroke) colors.push(paint.stroke);
      },
      ellipse: function (cx, cy, rx, ry, paint) {
        calls.ellipse++;
        [cx, cy, rx, ry].forEach(function (n) { if (isNaN(n)) calls.bad++; });
        if (paint.fill) colors.push(paint.fill);
      }
    }, look.colors);
    assert.strictEqual(calls.bad, 0, look.state + ': NaN in the drawing');
    assert.strictEqual(calls.save, calls.restore);
    assert.ok(count >= 6, look.state + ': too few shapes: ' + count);
    var all = flatten(prims, []);
    assert.ok(count <= all.length);
    colors.forEach(function (c) { assert.ok(/^#[0-9A-Fa-f]{6}$/.test(c), look.state + ': colour the Canvas cannot take: ' + c); });
  });
  Shapes.room({ night: true, shelf: [{ id: 'trophy' }, { id: 'x', rarity: 'rare' }] }).forEach(function (p) {
    if (p.d) Draw.parse(p.d);
  });
});

test('draw: path parsing', function () {
  assert.deepStrictEqual(Draw.parse('M0 0 L10 0 Q5 5 0 0 Z'), [['M', 0, 0], ['L', 10, 0], ['Q', 5, 5, 0, 0], ['Z']]);
  assert.deepStrictEqual(Draw.parse('M1.5 -2 3 4'), [['M', 1.5, -2], ['L', 3, 4]]);
  assert.deepStrictEqual(Draw.parse('M0 0 C1 2 3 4 5 6'), [['M', 0, 0], ['C', 1, 2, 3, 4, 5, 6]]);
  assert.throws(function () { Draw.parse('M0'); });
});

// ---- phrases ----
test('phrases: 5–8 a state, every reaction, all of them pass the word filter', function () {
  Mood.STATES.forEach(function (s) {
    var list = BOOK[s.id];
    assert.ok(Array.isArray(list) && list.length >= 5 && list.length <= 8, s.id + ': ' + (list && list.length));
  });
  ['welcome', 'level', 'achievement', 'water', 'habit', 'med', 'tap', 'focus'].forEach(function (kind) {
    assert.ok(Array.isArray(BOOK[kind]) && BOOK[kind].length >= 3, kind);
  });
  Object.keys(BOOK).forEach(function (kind) {
    BOOK[kind].forEach(function (text) {
      var filled = Phrases.fill(text, { name: 'Листик', title: 'Неделя сна' });
      assert.ok(Phrases.clean(filled, Settings.BANNED), kind + ': «' + filled + '» не проходит фильтр');
      assert.ok(filled.length <= 90, kind + ': too long: ' + filled);
      assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(filled), kind + ': emoji: ' + filled);
    });
  });
});

test('phrases: the filter catches reproach in any case and with ё', function () {
  ['Ты опять не спал', 'ТЫ СНОВА в телефоне', 'Я голоден', 'Ты меня забыл', 'Это плохо', 'Вам нужно пройтись', 'Я скучал', 'Надо было лечь раньше']
    .forEach(function (text) { assert.strictEqual(Phrases.clean(text, Settings.BANNED), false, text); });
  assert.strictEqual(Phrases.clean('Тоже не спится?', Settings.BANNED), true);
  assert.strictEqual(Phrases.clean('', Settings.BANNED), false);
  assert.strictEqual(Phrases.clean('Я весёлый', ['веселый']), false, 'ё and е are the same');
});

test('phrases: a stable pick, filled, only clean ones', function () {
  var book = { calm: ['Раз', 'Два', 'Три'], achievement: ['Значок «{title}»'], bad: ['Ты опять не спал'] };
  assert.strictEqual(Phrases.pick(book, 'calm', '2026-11-14|0', []), Phrases.pick(book, 'calm', '2026-11-14|0', []));
  assert.strictEqual(Phrases.pick(book, 'achievement', 'x', [], { title: 'Ранняя пташка' }), 'Значок «Ранняя пташка»');
  assert.strictEqual(Phrases.pick(book, 'bad', 'x', Settings.BANNED), null);
  assert.strictEqual(Phrases.pick(book, 'none', 'x', []), null);
  var seen = {};
  for (var i = 0; i < 30; i++) seen[Phrases.pick(book, 'calm', '2026-11-14|' + i, [])] = true;
  assert.ok(Object.keys(seen).length >= 2, 'turns give other phrases');
});

test('phrases: the model\'s lines — numbering off, reproach out, at most three', function () {
  var text = '1. «Я сегодня как облачко»\n2) Ты опять не спал\n- Сижу и жмурюсь на солнце\n\n* Тихо шуршу листиком\nЕщё одна фраза';
  assert.deepStrictEqual(Phrases.fromModel(text, Settings.BANNED, 3), ['Я сегодня как облачко', 'Сижу и жмурюсь на солнце', 'Тихо шуршу листиком']);
  assert.deepStrictEqual(Phrases.fromModel('', Settings.BANNED, 3), []);
  var prompt = Phrases.prompt({ name: 'Листик', title: 'бодрый', paused: null, stage: 'росток', items: ['шарф'], season: null, weekday: 'суббота' });
  assert.ok(prompt.indexOf('Листик') > 0 && prompt.indexOf('шарф') > 0 && !/\d/.test(prompt), prompt);
  assert.ok(Phrases.SYSTEM.indexOf('первого лица') > 0);
});

// ---- history ----
test('history: one line a day, morning and evening, averages from the regular recount only', function () {
  var opts = { morningUntil: '12:00', eveningFrom: '18:00', dayEnd: '05:00', keepDays: 3 };
  var h = [];
  h = History.add(h, { date: '2026-11-14', minute: 9 * 60, state: 'unrested', energy: 40, tick: true }, opts);
  h = History.add(h, { date: '2026-11-14', minute: 10 * 60, state: 'unrested', energy: 50, tick: true }, opts);
  h = History.add(h, { date: '2026-11-14', minute: 10 * 60 + 5, state: 'cheerful', energy: 99, tick: false }, opts);
  h = History.add(h, { date: '2026-11-14', minute: 19 * 60, state: 'calm', energy: 60, tick: true }, opts);
  h = History.add(h, { date: '2026-11-14', minute: 60, state: 'restless', energy: 60, tick: true }, opts);
  h = History.add(h, { date: '2026-11-14', minute: 2 * 60, state: 'asleep', energy: 60, tick: true }, opts);
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].morning, 'cheerful');
  assert.strictEqual(h[0].evening, 'restless', 'after midnight it is still the evening; sleep is not the evening');
  assert.strictEqual(h[0].energyAvg, Math.round((40 + 50 + 60 + 60 + 60) / 5));
  assert.strictEqual(History.main(h[0]), 'unrested');
  ['2026-11-11', '2026-11-12', '2026-11-13'].forEach(function (date) {
    h = History.add(h, { date: date, minute: 600, state: 'calm', energy: 60, tick: true }, opts);
  });
  assert.deepStrictEqual(h.map(function (r) { return r.date; }), ['2026-11-12', '2026-11-13', '2026-11-14'], 'sorted and trimmed');
  assert.strictEqual(History.main(null), null);
  assert.strictEqual(History.gap('2026-11-10', '2026-11-14'), 4);
  assert.strictEqual(History.gap(null, '2026-11-14'), 0);
});

console.log('pet logic: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
