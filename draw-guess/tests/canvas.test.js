// node tests/canvas.test.js — векторы, снимок, упрощение, пути модели, анимация, очки, отправки.
var assert = require('assert');
var h = require('./harness.js');
var K = require('../canvas.js');
var samples = require('../samples.js');

h.test('касание → поле 0..1000 по стороне квадрата', function () {
  var rect = { left: 100, top: 50, width: 800, height: 800 };
  assert.deepStrictEqual(K.toField(100, 50, rect), [0, 0]);
  assert.deepStrictEqual(K.toField(500, 450, rect), [500, 500]);
  assert.deepStrictEqual(K.toField(2000, -40, rect), [1000, 0], 'за краем — к краю');
});

h.test('рамка и вписывание с полями 5%', function () {
  var strokes = [{ points: [[100, 200, 0], [300, 400, 10]], width: 0 }];
  assert.deepStrictEqual(K.bounds(strokes), { minX: 100, minY: 200, maxX: 300, maxY: 400 });
  var f = K.fit(strokes, 384, 0.05, 100);
  var x0 = 100 * f.scale + f.dx;
  var x1 = 300 * f.scale + f.dx;
  var y0 = 200 * f.scale + f.dy;
  assert.ok(Math.abs(x0 - 384 * 0.05) < 0.01, 'левое поле ' + x0);
  assert.ok(Math.abs(x1 - 384 * 0.95) < 0.01, 'правое поле ' + x1);
  assert.ok(Math.abs(y0 - 384 * 0.05) < 0.01);
  assert.deepStrictEqual(K.fit([], 384, 0.05), { scale: 0.384, dx: 0, dy: 0 });
  var dot = K.fit([{ points: [[500, 500, 0]], width: 10 }], 384, 0.05, 4);
  assert.ok(dot.scale <= 0.384 * 4 + 1e-9, 'точку не раздуваем без меры');
});

h.test('толщина линии на снимке в разумных пределах', function () {
  assert.ok(K.snapshotWidth(8, 384, 0.384) >= 384 / 160);
  assert.ok(K.snapshotWidth(200, 384, 3) <= 384 / 30);
});

h.test('упрощение линии', function () {
  var straight = [];
  for (let i = 0; i <= 50; i++) straight.push([i * 10, 500 + (i % 2 ? 0.4 : -0.4)]);
  assert.strictEqual(K.simplify(straight, 1.5).length, 2);
  var corner = [[0, 0], [100, 0], [200, 0], [200, 100], [200, 200]];
  assert.deepStrictEqual(K.simplify(corner, 1), [[0, 0], [200, 0], [200, 200]]);
  var many = [];
  for (let i = 0; i < 200; i++) many.push([Math.round(500 + 300 * Math.cos(i / 10)), Math.round(500 + 300 * Math.sin(i / 10))]);
  assert.ok(K.limitPoints(many, 30).length <= 30);
});

h.test('разбор путей: M, L, Q, C, Z, H, V, относительные, повтор пар', function () {
  var p = K.parsePath('M 10 10 L 100 10 100 100 Z');
  assert.ok(p.ok, p.why);
  assert.deepStrictEqual(p.segments.map(function (s) { return s.type; }), ['M', 'L', 'L', 'Z']);
  assert.ok(K.parsePath('M10,10Q50,0 90,10C100,20 100,80 90,90').ok);
  var rel = K.parsePath('m 100 100 l 50 0 v 50 h -50 z');
  assert.ok(rel.ok, rel.why);
  assert.deepStrictEqual(rel.segments[2].pts[0], [150, 150]);
  assert.ok(K.parsePath('M 0 0 L 1000 1000').ok);
});

h.test('разбор путей: запрещённое отбрасывается', function () {
  assert.ok(!K.parsePath('M 10 10 A 5 5 0 0 1 20 20').ok, 'дуга');
  assert.ok(!K.parsePath('M 10 10 T 20 20').ok, 'T');
  assert.ok(!K.parsePath('M 10 10 S 20 20 30 30').ok, 'S');
  assert.ok(!K.parsePath('L 10 10').ok, 'не с M');
  assert.ok(!K.parsePath('M 10 10 L 1200 10').ok, 'вне поля');
  assert.ok(!K.parsePath('M 10 10 L -5 10').ok, 'вне поля');
  assert.ok(!K.parsePath('M 10 10 L 20').ok, 'не хватает чисел');
  assert.ok(!K.parsePath('M 10 10 привет').ok, 'текст');
  assert.ok(!K.parsePath('').ok);
});

h.test('длина путей', function () {
  assert.strictEqual(K.pathLength('M 0 0 L 300 400'), 500);
  assert.strictEqual(K.pathLength('M 0 0 L 100 0 L 100 100 Z'), 100 + 100 + Math.sqrt(20000));
  var arc = K.pathLength('M 0 500 Q 500 0 1000 500');
  assert.ok(arc > 1000 && arc < 1300, 'кривая длиннее хорды: ' + arc);
});

h.test('проверка рисунка модели', function () {
  var good = K.validatePainting(samples.painting(), { minStrokes: 15, maxStrokes: 40, maxPoints: 30 });
  assert.ok(good.ok, good.why);
  assert.strictEqual(good.strokes.length, 15);
  assert.ok(good.strokes.every(function (s) { return s.length > 0 && /^M/.test(s.d); }));
  var few = K.validatePainting({ strokes: [{ d: 'M 0 0 L 10 10' }] }, { minStrokes: 15, maxStrokes: 40 });
  assert.ok(!few.ok && few.count, 'мало штрихов');
  var arc = K.validatePainting({ strokes: [{ d: 'M 0 0 A 1 1 0 0 1 5 5' }] }, { minStrokes: 1 });
  assert.ok(!arc.ok && /A/.test(arc.why));
  assert.ok(!K.validatePainting({ strokes: [{ d: 'M 0 0 L 10 10' }], text: 'МАЯК' }, { minStrokes: 1 }).ok, 'текст');
  assert.ok(!K.validatePainting('маяк', {}).ok);
  var long = [];
  for (let i = 0; i < 100; i++) long.push([i * 10, 500 + Math.round(100 * Math.sin(i / 5))]);
  var trimmed = K.validatePainting({ strokes: [{ points: long }] }, { minStrokes: 1, maxPoints: 30 });
  assert.ok(trimmed.ok, trimmed.why);
  assert.ok(trimmed.strokes[0].d.split(/[ML]/).length - 1 <= 30, 'ломаная упрощена до 30 точек');
});

h.test('расписание анимации: ровно заданное время, паузы, пропорционально длине', function () {
  var plan = K.schedule([100, 300, 600], 45000, { pauseMin: 150, pauseMax: 400 }, function () { return 0.5; });
  var end = plan[2].start + plan[2].duration;
  assert.ok(Math.abs(end - 45000) < 1e-6, 'конец ' + end);
  var pause1 = plan[1].start - plan[0].start - plan[0].duration;
  assert.ok(Math.abs(pause1 - 275) < 1e-6, 'пауза ' + pause1);
  assert.ok(Math.abs(plan[1].duration / plan[0].duration - 3) < 1e-6, 'пропорционально длине');
  var tight = K.schedule([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 1000, { pauseMin: 300, pauseMax: 300 });
  var pauses = 0;
  for (let i = 1; i < tight.length; i++) pauses += tight[i].start - tight[i - 1].start - tight[i - 1].duration;
  assert.ok(pauses <= 1000 / 3 + 1e-6, 'паузы не съедают рисунок');
  assert.deepStrictEqual(K.progressAt(plan, 0), [0, 0, 0]);
  assert.deepStrictEqual(K.progressAt(plan, 45000), [1, 1, 1]);
});

h.test('анимация рисунка модели укладывается в 45 с', function () {
  var good = K.validatePainting(samples.painting(), { minStrokes: 1 });
  var plan = K.schedule(good.strokes.map(function (s) { return s.length; }), 45000, { pauseMin: 150, pauseMax: 400 });
  var end = plan[plan.length - 1].start + plan[plan.length - 1].duration;
  assert.ok(Math.abs(end - 45000) < 1);
});

h.test('очки за скорость', function () {
  assert.strictEqual(K.speedScore(0, 90000), 10);
  assert.strictEqual(K.speedScore(9000, 90000), 9);
  assert.strictEqual(K.speedScore(45000, 90000), 5);
  assert.strictEqual(K.speedScore(89000, 90000), 1);
  assert.strictEqual(K.speedScore(120000, 90000), 1);
  assert.strictEqual(K.speedScore(17000, 45000), 7);
});

var OPTS = { minInterval: 3, pause: 1.5, minNew: 1, maxRequests: 25 };

h.test('отправки: после штриха — не чаще интервала', function () {
  var s = K.sender(OPTS);
  assert.ok(!K.decide(s, 0, 'stroke'), 'пустой рисунок не отправляется');
  K.changed(s, 1, 1000);
  assert.ok(K.decide(s, 1000, 'stroke'), 'первый штрих');
  K.sent(s, 1000);
  K.answered(s);
  K.changed(s, 2, 2500);
  assert.ok(!K.decide(s, 2500, 'stroke'), 'рано: 1,5 с после отправки');
  K.changed(s, 3, 4100);
  assert.ok(K.decide(s, 4100, 'stroke'), '3,1 с — можно');
});

h.test('отправки: пауза в рисовании', function () {
  var s = K.sender(OPTS);
  K.changed(s, 1, 1000);
  K.sent(s, 1000);
  K.answered(s);
  K.changed(s, 2, 2000);
  assert.ok(!K.decide(s, 3000, 'tick'), 'пауза 1 с — рано');
  s.drawing = true;
  assert.ok(!K.decide(s, 3600, 'tick'), 'палец на экране — ждём');
  s.drawing = false;
  assert.ok(K.decide(s, 3600, 'tick'), 'пауза 1,6 с');
  K.sent(s, 3600);
  K.answered(s);
  assert.ok(!K.decide(s, 9000, 'tick'), 'нового нет — не отправляем');
});

h.test('отправки: один запрос в полёте, следующий — по приходе ответа', function () {
  var s = K.sender(OPTS);
  K.changed(s, 1, 0);
  K.sent(s, 0);
  K.changed(s, 2, 3500);
  assert.ok(!K.decide(s, 3500, 'stroke'), 'ответа ещё нет');
  assert.ok(!K.decide(s, 6000, 'tick'));
  K.answered(s);
  assert.ok(K.decide(s, 6100, 'answer'), 'сразу по приходе ответа');
});

h.test('отправки: предел запросов и порог новых штрихов', function () {
  var s = K.sender({ minInterval: 0, pause: 0, minNew: 2, maxRequests: 3 });
  K.changed(s, 1, 0);
  assert.ok(!K.decide(s, 0, 'stroke'), 'нужно 2 новых');
  K.changed(s, 2, 10);
  assert.ok(K.decide(s, 10, 'stroke'));
  for (let i = 0; i < 3; i++) {
    K.sent(s, i * 100);
    K.answered(s);
    K.changed(s, 3 + i * 2, i * 100 + 50);
    K.changed(s, 4 + i * 2, i * 100 + 60);
  }
  assert.strictEqual(s.requests, 3);
  assert.ok(!K.decide(s, 1000, 'stroke'), 'предел исчерпан');
});

h.test('отправки: живой рисунок 60 с — в разумных пределах', function () {
  var s = K.sender(OPTS);
  var count = 0;
  var maxFlight = 0;
  var answerAt = null;
  // Штрих каждые 2,5 с длиной 1 с; ответ модели через 2 с.
  for (let t = 0; t <= 60000; t += 100) {
    if (answerAt !== null && t >= answerAt) {
      K.answered(s);
      answerAt = null;
      if (K.decide(s, t, 'answer')) { K.sent(s, t); count++; answerAt = t + 2000; }
    }
    var phase = t % 2500;
    s.drawing = phase < 1000 && t < 50000;
    if (phase === 1000 && t <= 50000) {
      K.changed(s, s.strokes + 1, t);
      if (K.decide(s, t, 'stroke')) { K.sent(s, t); count++; answerAt = t + 2000; }
    }
    if (K.decide(s, t, 'tick')) { K.sent(s, t); count++; answerAt = t + 2000; }
    maxFlight = Math.max(maxFlight, s.inFlight ? 1 : 0);
  }
  assert.ok(count >= 8 && count <= 20, 'запросов: ' + count);
  assert.strictEqual(maxFlight, 1);
});
