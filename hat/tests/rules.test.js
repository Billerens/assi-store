// node tests/rules.test.js — правила Шляпы: пары и команды, шляпа, зачёт и «Отмена», раунды, очки, итоги.
var assert = require('assert');
var h = require('./harness.js');
var R = require('../rules.js');
var C = require('../config.js');

function cards(n) {
  var out = [];
  for (let i = 0; i < n; i++) out.push({ word: 'слово' + i, forms: [], roots: [], difficulty: 3 });
  return out;
}

function game(n, cardCount, extra) {
  var settings = Object.assign(C.defaults(), { hotWord: false }, extra || {});
  var players = [];
  for (let i = 0; i < n; i++) players.push('Игрок ' + (i + 1));
  return R.create({ mode: 'pairs', players: players, teams: [], cards: cards(cardCount), settings: settings, now: 1 }, h.seeded(7));
}

h.test('пары: первый круг — сидящему напротив', function () {
  var g = game(6, 10);
  for (let i = 0; i < 6; i++) {
    var w = R.who(g, i);
    assert.strictEqual(w.explainer, i);
    assert.strictEqual(w.guesser, (i + 3) % 6);
  }
});

h.test('пары: за N−1 кругов каждый объяснил каждому', function () {
  [4, 6, 8, 12].forEach(function (n) {
    var g = game(n, 4);
    var seen = {};
    for (let index = 0; index < n * (n - 1); index++) {
      var w = R.who(g, index);
      assert.notStrictEqual(w.explainer, w.guesser);
      seen[w.explainer + '>' + w.guesser] = true;
    }
    assert.strictEqual(Object.keys(seen).length, n * (n - 1), 'N=' + n);
  });
});

h.test('состав: пары — чётное 4–12, команды — 2–4 по 2+', function () {
  assert.ok(!R.validate('pairs', ['a', 'b', 'c'], []).ok);
  assert.ok(!R.validate('pairs', ['a', 'b', 'c', 'd', 'e'], []).ok);
  assert.ok(R.validate('pairs', ['a', 'b', 'c', 'd'], []).ok);
  assert.ok(!R.validate('teams', ['a', 'b', 'c'], [{ members: [0, 1] }, { members: [2] }]).ok);
  assert.ok(R.validate('teams', ['a', 'b', 'c', 'd', 'e'], [{ members: [0, 1, 2] }, { members: [3, 4] }]).ok);
  assert.ok(!R.validate('teams', ['a'], [{ members: [0] }]).ok);
});

h.test('команды: объясняющий внутри команды меняется, ходят по очереди', function () {
  var teams = R.splitTeams(2, ['a', 'b', 'c', 'd', 'e'], h.seeded(3));
  assert.strictEqual(teams[0].members.length + teams[1].members.length, 5);
  var g = R.create({ mode: 'teams', players: ['a', 'b', 'c', 'd', 'e'], teams: teams, cards: cards(5), settings: C.defaults() }, h.seeded(1));
  var first = R.who(g, 0);
  var second = R.who(g, 1);
  var third = R.who(g, 2);
  assert.strictEqual(first.team, 0);
  assert.strictEqual(second.team, 1);
  assert.strictEqual(third.team, 0);
  assert.notStrictEqual(first.explainer, third.explainer);
  assert.ok(teams[0].members.indexOf(first.explainer) >= 0);
});

h.test('зачёт убирает слово из шляпы, пропуск возвращает — не первым', function () {
  var g = game(4, 5);
  var turn = { round: 1, explainer: 0, guesser: 2, results: [] };
  var card = R.draw(g);
  R.settle(g, turn, { card: card, result: 'guessed', ms: 1000 });
  assert.strictEqual(g.hat.length, 4);
  assert.ok(g.hat.indexOf(card) < 0);
  var next = R.draw(g);
  R.settle(g, turn, { card: next, result: 'skipped', ms: 1000 }, h.seeded(2));
  assert.strictEqual(g.hat.length, 4);
  assert.notStrictEqual(R.draw(g), next, 'пропущенное слово не идёт сразу снова');
});

h.test('«Отмена»: очко снимается, слово в шляпе', function () {
  var g = game(4, 3);
  var turn = { round: 1, explainer: 0, guesser: 2, results: [] };
  var card = R.draw(g);
  R.settle(g, turn, { card: card, result: 'guessed', ms: 900 });
  g.turns.push(turn);
  assert.strictEqual(R.scores(g).players[0], 1);
  var undone = R.undoLast(g, turn);
  assert.strictEqual(undone.result, 'undone');
  assert.ok(g.hat.indexOf(card) >= 0);
  assert.strictEqual(R.scores(g).players[0], 0);
  assert.strictEqual(R.undoLast(g, turn), null, 'отменять больше нечего');
});

h.test('исправление между ходами по кругу исходов', function () {
  var g = game(4, 3);
  var turn = { round: 1, explainer: 0, guesser: 2, results: [] };
  R.settle(g, turn, { card: R.draw(g), result: 'guessed', ms: 900 });
  g.turns.push(turn);
  assert.strictEqual(R.nextResult('guessed'), 'skipped');
  assert.strictEqual(R.nextResult('skipped'), 'undone');
  assert.strictEqual(R.nextResult('undone'), 'guessed');
  R.setResult(g, 0, 0, 'skipped');
  assert.strictEqual(g.hat.length, 3);
  R.setResult(g, 0, 0, 'guessed');
  assert.strictEqual(g.hat.length, 2);
  assert.strictEqual(R.scores(g).players[2], 1);
});

h.test('штраф за пропуск и горячее слово', function () {
  var g = game(4, 4, { skipPenalty: 1, hotWord: true, hotPoints: 3 });
  assert.ok(g.hot !== null, 'горячее слово выбрано');
  var turn = { round: 1, explainer: 1, guesser: 3, results: [] };
  R.settle(g, turn, { card: g.hot, result: 'guessed', ms: 500 });
  var other = g.hat[0];
  R.settle(g, turn, { card: other, result: 'skipped', ms: 500 });
  g.turns.push(turn);
  assert.strictEqual(R.scores(g).players[1], 2);
  assert.strictEqual(R.scores(g).players[3], 2);
});

h.test('три раунда с одной колодой, затем конец', function () {
  var g = game(4, 3, { rounds: 3 });
  var finished = false;
  var rounds = [];
  for (let index = 0; index < 20 && !finished; index++) {
    var w = R.who(g, index);
    var turn = { round: g.round, explainer: w.explainer, guesser: w.guesser, team: null, ms: 30000, results: [] };
    var card = R.draw(g);
    if (card !== null) R.settle(g, turn, { card: card, result: 'guessed', ms: 3000 + index });
    g.turns.push(turn);
    rounds.push(g.round);
    var after = R.afterTurn(g);
    finished = after.finished;
  }
  assert.ok(finished);
  assert.deepStrictEqual(rounds, [1, 1, 1, 2, 2, 2, 3, 3, 3]);
  assert.strictEqual(R.roundName(2), 'жестами');
  var total = R.scores(g).players.reduce(function (a, b) { return a + b; }, 0);
  assert.strictEqual(total, 18, 'по очку обоим в паре за 9 слов');
});

h.test('итоги: места, лучший объясняющий, быстрое и трудное слово', function () {
  var g = game(4, 4);
  var t1 = { round: 1, explainer: 0, guesser: 2, ms: 60000, results: [] };
  R.settle(g, t1, { card: 0, result: 'guessed', ms: 2100, latency: 800 });
  R.settle(g, t1, { card: 1, result: 'guessed', ms: 5000, latency: 1200 });
  R.settle(g, t1, { card: 2, result: 'skipped', ms: 9000 });
  var t2 = { round: 1, explainer: 1, guesser: 3, ms: 60000, results: [] };
  R.settle(g, t2, { card: 2, result: 'skipped', ms: 8000 });
  R.settle(g, t2, { card: 3, result: 'guessed', ms: 7000 });
  g.turns.push(t1, t2);
  var s = R.summary(g);
  assert.strictEqual(s.places[0].score, 2);
  assert.strictEqual(s.winner, 'Игрок 1 и Игрок 3');
  assert.strictEqual(s.bestExplainer.name, 'Игрок 1');
  assert.strictEqual(s.bestExplainer.perMinute, 2);
  assert.deepStrictEqual(s.fastest, { word: 'слово0', ms: 2100, by: 'Игрок 1' });
  assert.strictEqual(s.hardest.word, 'слово2');
  assert.strictEqual(s.hardest.skips, 2);
  assert.deepStrictEqual(s.neverGuessed, ['слово2']);
  assert.strictEqual(s.words, 3);
  assert.strictEqual(s.autoCount, 2);
  assert.strictEqual(s.latency, 1000);
});

h.test('итоги команд: места делят равные', function () {
  var teams = [{ name: 'Команда 1', members: [0, 1] }, { name: 'Команда 2', members: [2, 3] }];
  var g = R.create({ mode: 'teams', players: ['a', 'b', 'c', 'd'], teams: teams, cards: cards(2), settings: C.defaults() }, h.seeded(5));
  g.turns.push({ round: 1, explainer: 0, team: 0, ms: 30000, results: [{ card: 0, result: 'guessed', ms: 1000 }] });
  g.turns.push({ round: 1, explainer: 2, team: 1, ms: 30000, results: [{ card: 1, result: 'guessed', ms: 1000 }] });
  var s = R.summary(g);
  assert.strictEqual(s.places[0].place, 1);
  assert.strictEqual(s.places[1].place, 1);
  assert.strictEqual(s.winner, 'Команда 1 и Команда 2');
  assert.deepStrictEqual(s.places[0].members, ['a', 'b']);
});

h.test('перемешивание сохраняет состав', function () {
  var list = [1, 2, 3, 4, 5, 6, 7];
  assert.deepStrictEqual(R.shuffle(list, h.seeded(9)).sort(), list);
  assert.deepStrictEqual(R.pairOffsets(6), [3, 4, 5, 1, 2]);
});

h.test('«Телепат»: только обычный зачёт не дольше порога из настроек', function () {
  assert.strictEqual(C.defaults().telepathSeconds, 2);
  assert.strictEqual(C.normalize({ telepathSeconds: 30 }).telepathSeconds, 10);
  var results = [
    { word: 'а', result: 'skipped', ms: 500 },
    { word: 'б', result: 'last', ms: 800 },
    { word: 'в', result: 'guessed', ms: 2100 },
    { word: 'г', result: 'guessed', ms: 1900 }
  ];
  assert.strictEqual(R.telepath(results, 2).word, 'г');
  assert.strictEqual(R.telepath(results, 1), null);
  assert.strictEqual(R.telepath([{ word: 'д', result: 'guessed', ms: 0 }], 2), null, 'без времени не считается');
  assert.strictEqual(R.telepath(null, 2), null);
});
