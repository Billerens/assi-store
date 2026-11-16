// Образцы рисунков-векторов (поле 0..1000): для проверок на телефоне (снимок, анимация) и как
// начало набора для сравнения моделей, пока владелец не нарисовал свои двадцать.
// Чистые данные: движок (require('./samples')), node (тесты), экран (window.dgSamples).
(function (exports) {
  function circle(cx, cy, r, n, t0) {
    var points = [];
    for (let i = 0; i <= n; i++) {
      var a = i / n * Math.PI * 2;
      points.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), (t0 || 0) + i * 20]);
    }
    return points;
  }

  function line(points, t0) {
    return points.map(function (p, i) { return [p[0], p[1], (t0 || 0) + i * 40]; });
  }

  function sun() {
    var strokes = [{ points: circle(500, 500, 170, 36, 0), width: 12 }];
    for (let i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2;
      strokes.push({ points: line([
        [Math.round(500 + Math.cos(a) * 220), Math.round(500 + Math.sin(a) * 220)],
        [Math.round(500 + Math.cos(a) * 330), Math.round(500 + Math.sin(a) * 330)]
      ], 800 + i * 300), width: 12 });
    }
    return strokes;
  }

  function house() {
    return [
      { points: line([[250, 500], [250, 850], [750, 850], [750, 500], [250, 500]], 0), width: 12 },
      { points: line([[220, 520], [500, 230], [780, 520]], 500), width: 12 },
      { points: line([[440, 850], [440, 680], [560, 680], [560, 850]], 900), width: 12 },
      { points: line([[300, 560], [400, 560], [400, 640], [300, 640], [300, 560]], 1300), width: 12 },
      { points: line([[620, 330], [620, 220], [680, 220], [680, 400]], 1700), width: 12 }
    ];
  }

  function fish() {
    var body = [];
    for (let i = 0; i <= 30; i++) {
      var a = i / 30 * Math.PI * 2;
      body.push([Math.round(450 + Math.cos(a) * 260), Math.round(500 + Math.sin(a) * 150), i * 20]);
    }
    return [
      { points: body, width: 12 },
      { points: line([[700, 500], [880, 360], [880, 640], [700, 500]], 700), width: 12 },
      { points: circle(300, 460, 22, 12, 1100), width: 12 },
      { points: line([[420, 380], [480, 300], [560, 370]], 1400), width: 12 }
    ];
  }

  /** [{ word, strokes }] — рисунки «как пальцем», с метками времени. */
  exports.list = function () {
    return [
      { word: 'солнце', strokes: sun() },
      { word: 'дом', strokes: house() },
      { word: 'рыба', strokes: fish() }
    ];
  };

  /** Рисунок модели в формате ответа draw.paint — для проверки разбора и анимации. */
  exports.painting = function () {
    return {
      word: 'маяк',
      strokes: [
        { d: 'M 420 900 L 460 300 L 540 300 L 580 900 Z' },
        { d: 'M 440 300 L 500 220 L 560 300' },
        { d: 'M 470 300 L 470 240 L 530 240 L 530 300' },
        { points: [[300, 900], [700, 900]] },
        { d: 'M 560 250 L 760 200 L 760 300 Z' },
        { d: 'M 440 450 L 560 450' },
        { d: 'M 445 600 L 555 600' },
        { d: 'M 450 750 L 550 750' },
        { d: 'M 200 950 Q 350 900 500 950 Q 650 1000 800 950' },
        { d: 'M 120 980 C 300 930 700 1000 880 960' },
        { d: 'M 480 900 L 480 840 L 520 840 L 520 900' },
        { d: 'M 600 120 L 640 160 M 650 210 L 700 210' },
        { d: 'M 360 180 L 420 220' },
        { d: 'M 380 240 L 430 250' },
        { d: 'M 500 220 L 500 180' }
      ]
    };
  };
})(typeof exports !== 'undefined' ? exports : (window.dgSamples = {}));
