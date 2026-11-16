// Рисунок как векторы: поле 0..1000, снимок с полями, упрощение линии, разбор и проверка путей
// SVG от модели, длина путей, расписание анимации, очки за скорость, правила отправки снимков.
// Чистая логика: движок (require('./canvas')), node (тесты), экран (window.dgCanvas).
//
// Штрих: { points: [[x, y, t], …], width } — x, y в поле 0..1000, t — мс от начала рисунка.
(function (exports) {
  var FIELD = 1000;

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  /** Точка касания (в пикселях элемента) → поле 0..1000 по стороне квадрата. */
  function toField(x, y, rect) {
    var side = Math.min(rect.width, rect.height) || 1;
    return [
      Math.round(clamp((x - rect.left) / side * FIELD, 0, FIELD)),
      Math.round(clamp((y - rect.top) / side * FIELD, 0, FIELD))
    ];
  }

  /** Рамка рисунка с учётом толщины линий; пусто — null. */
  function bounds(strokes) {
    var box = null;
    (strokes || []).forEach(function (stroke) {
      var half = (stroke.width || 0) / 2;
      (stroke.points || []).forEach(function (p) {
        if (!box) box = { minX: p[0] - half, minY: p[1] - half, maxX: p[0] + half, maxY: p[1] + half };
        box.minX = Math.min(box.minX, p[0] - half);
        box.minY = Math.min(box.minY, p[1] - half);
        box.maxX = Math.max(box.maxX, p[0] + half);
        box.maxY = Math.max(box.maxY, p[1] + half);
      });
    });
    return box;
  }

  /**
   * Как вписать рисунок в квадрат size × size с полями margin (доля, 0.05 — 5%):
   * { scale, dx, dy } — точка поля (x, y) рисуется в (x * scale + dx, y * scale + dy).
   * Совсем маленький рисунок не раздувается больше чем в maxZoom раз против целого поля.
   */
  function fit(strokes, size, margin, maxZoom) {
    var box = bounds(strokes);
    var inner = size * (1 - 2 * (margin || 0));
    var base = size / FIELD;
    if (!box) return { scale: base, dx: 0, dy: 0 };
    var w = Math.max(1, box.maxX - box.minX);
    var h = Math.max(1, box.maxY - box.minY);
    var scale = Math.min(inner / w, inner / h, base * (maxZoom || 4));
    var dx = (size - w * scale) / 2 - box.minX * scale;
    var dy = (size - h * scale) / 2 - box.minY * scale;
    return { scale: scale, dx: dx, dy: dy };
  }

  /** Толщина линии на снимке: пропорционально размеру картинки, не тоньше и не толще разумного. */
  function snapshotWidth(width, size, scale) {
    return clamp(width * scale, size / 160, size / 30);
  }

  function distanceToSegment(p, a, b) {
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var len = dx * dx + dy * dy;
    var t = len ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len, 0, 1) : 0;
    var x = a[0] + t * dx - p[0];
    var y = a[1] + t * dy - p[1];
    return Math.sqrt(x * x + y * y);
  }

  /** Упрощение ломаной (Рамер — Дуглас — Пекер): точки ближе epsilon к прямой выбрасываются. */
  function simplify(points, epsilon) {
    if (!points || points.length < 3) return (points || []).slice();
    var keep = [];
    for (let i = 0; i < points.length; i++) keep.push(false);
    keep[0] = true;
    keep[points.length - 1] = true;
    var stack = [[0, points.length - 1]];
    while (stack.length) {
      var range = stack.pop();
      var far = -1;
      var index = -1;
      for (let i = range[0] + 1; i < range[1]; i++) {
        var d = distanceToSegment(points[i], points[range[0]], points[range[1]]);
        if (d > far) {
          far = d;
          index = i;
        }
      }
      if (far > epsilon && index > 0) {
        keep[index] = true;
        stack.push([range[0], index], [index, range[1]]);
      }
    }
    return points.filter(function (p, i) { return keep[i]; });
  }

  /** Упростить до не больше чем max точек, понемногу повышая допуск. */
  function limitPoints(points, max) {
    var out = points;
    var epsilon = 1;
    while (out.length > max && epsilon < 400) {
      out = simplify(points, epsilon);
      epsilon *= 1.6;
    }
    if (out.length > max) {
      var step = (out.length - 1) / (max - 1);
      var picked = [];
      for (let i = 0; i < max; i++) picked.push(out[Math.round(i * step)]);
      out = picked;
    }
    return out;
  }

  // ---- пути SVG от модели ---------------------------------------------------------------------

  var ARGS = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, Z: 0 };

  function tokenize(d) {
    var out = [];
    var re = /([A-Za-z])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
    var rest = String(d).replace(re, function (all, letter, number) {
      out.push(letter ? { cmd: letter } : { num: Number(number) });
      return ' ';
    });
    return /[^\s,]/.test(rest) ? null : out;
  }

  /**
   * Разбор пути: только M, L, Q, C, Z (и H, V как отрезки; строчные — относительные).
   * → { ok, why, segments: [{ type: 'M'|'L'|'Q'|'C'|'Z', pts: [[x, y], …] }] } в абсолютных координатах.
   */
  function parsePath(d, slack) {
    var tolerance = slack === undefined ? 0.5 : slack;
    var tokens = typeof d === 'string' && d.trim() ? tokenize(d) : null;
    if (!tokens || !tokens.length) return { ok: false, why: 'пустой или нечитаемый путь', segments: [] };
    if (!tokens[0].cmd || tokens[0].cmd.toUpperCase() !== 'M') return { ok: false, why: 'путь начинается не с M', segments: [] };
    var segments = [];
    var x = 0;
    var y = 0;
    var startX = 0;
    var startY = 0;
    var i = 0;
    var cmd = null;
    while (i < tokens.length) {
      if (tokens[i].cmd) {
        cmd = tokens[i].cmd;
        i += 1;
        var upper = cmd.toUpperCase();
        if (!(upper in ARGS)) return { ok: false, why: 'команда ' + cmd + ' не разрешена', segments: [] };
        if (upper === 'Z') {
          segments.push({ type: 'Z', pts: [[startX, startY]] });
          x = startX;
          y = startY;
          continue;
        }
      } else if (!cmd || cmd.toUpperCase() === 'Z') {
        return { ok: false, why: 'число без команды', segments: [] };
      }
      var type = cmd.toUpperCase();
      var relative = cmd !== type;
      var count = ARGS[type];
      var nums = [];
      for (let k = 0; k < count; k++) {
        if (i >= tokens.length || tokens[i].cmd) return { ok: false, why: 'не хватает чисел у ' + cmd, segments: [] };
        nums.push(tokens[i].num);
        i += 1;
      }
      var pts = [];
      if (type === 'H') pts.push([relative ? x + nums[0] : nums[0], y]);
      else if (type === 'V') pts.push([x, relative ? y + nums[0] : nums[0]]);
      else {
        for (let k = 0; k < nums.length; k += 2) pts.push(relative ? [x + nums[k], y + nums[k + 1]] : [nums[k], nums[k + 1]]);
      }
      for (let k = 0; k < pts.length; k++) {
        if (pts[k][0] < -tolerance || pts[k][1] < -tolerance || pts[k][0] > FIELD + tolerance || pts[k][1] > FIELD + tolerance) {
          return { ok: false, why: 'точка вне поля 0..1000', segments: [] };
        }
      }
      var last = pts[pts.length - 1];
      x = last[0];
      y = last[1];
      var kind = type === 'H' || type === 'V' ? 'L' : type;
      if (kind === 'M') {
        startX = x;
        startY = y;
        // Повтор пар после M — это L.
        if (!relative) cmd = 'L';
        else cmd = 'l';
      }
      segments.push({ type: kind, pts: pts });
    }
    return { ok: true, why: '', segments: segments };
  }

  function quad(p0, p1, p2, t) {
    var u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  }

  function cubic(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ];
  }

  /** Путь → ломаные (кривые — по steps точек), по одной на каждый подпуть. */
  function flatten(segments, steps) {
    var n = steps || 16;
    var lines = [];
    var current = null;
    var at = [0, 0];
    segments.forEach(function (segment) {
      if (segment.type === 'M') {
        current = [segment.pts[0]];
        lines.push(current);
        at = segment.pts[0];
        return;
      }
      if (!current) {
        current = [at];
        lines.push(current);
      }
      if (segment.type === 'L' || segment.type === 'Z') {
        current.push(segment.pts[0]);
      } else if (segment.type === 'Q') {
        for (let k = 1; k <= n; k++) current.push(quad(at, segment.pts[0], segment.pts[1], k / n));
      } else if (segment.type === 'C') {
        for (let k = 1; k <= n; k++) current.push(cubic(at, segment.pts[0], segment.pts[1], segment.pts[2], k / n));
      }
      at = segment.pts[segment.pts.length - 1];
    });
    return lines;
  }

  function polylineLength(points) {
    var total = 0;
    for (let i = 1; i < points.length; i++) {
      var dx = points[i][0] - points[i - 1][0];
      var dy = points[i][1] - points[i - 1][1];
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
  }

  /** Длина пути SVG (как getTotalLength, с точностью ломаной из 16 точек на кривую). */
  function pathLength(d) {
    var parsed = parsePath(d);
    if (!parsed.ok) return 0;
    return flatten(parsed.segments).reduce(function (sum, line) { return sum + polylineLength(line); }, 0);
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  /** Ломаная → путь «M x y L x y …». */
  function pointsToPath(points) {
    return points.map(function (p, i) { return (i ? 'L ' : 'M ') + round1(p[0]) + ' ' + round1(p[1]); }).join(' ');
  }

  /** Штрихи человека → пути SVG (для повтора рисунка и сохранения). */
  function strokesToPaths(strokes, epsilon) {
    return (strokes || []).filter(function (stroke) { return stroke.points && stroke.points.length; }).map(function (stroke) {
      var points = stroke.points.map(function (p) { return [p[0], p[1]]; });
      if (points.length === 1) points.push([points[0][0] + 0.5, points[0][1]]);
      return { d: pointsToPath(simplify(points, epsilon || 1.5)), width: stroke.width };
    });
  }

  /**
   * Проверка рисунка модели. answer — { word, strokes: [{ d } | { points } | 'M …'] }.
   * options: minStrokes, maxStrokes, maxPoints. → { ok, why, strokes: [{ d, length }] }.
   */
  function validatePainting(answer, options) {
    var o = options || {};
    var min = o.minStrokes || 1;
    var max = o.maxStrokes || 60;
    var maxPoints = o.maxPoints || 30;
    if (!answer || typeof answer !== 'object') return { ok: false, why: 'ответ не JSON', strokes: [] };
    var raw = JSON.stringify(answer);
    if (/<\s*text|"text"\s*:|font-|fill-text/i.test(raw)) return { ok: false, why: 'в рисунке есть текст', strokes: [] };
    var list = Array.isArray(answer.strokes) ? answer.strokes : Array.isArray(answer) ? answer : null;
    if (!list) return { ok: false, why: 'нет списка штрихов', strokes: [] };
    var strokes = [];
    for (let i = 0; i < list.length; i++) {
      var item = list[i];
      var d = typeof item === 'string' ? item : item && typeof item.d === 'string' ? item.d : null;
      if (!d && item && Array.isArray(item.points)) {
        var points = item.points.filter(function (p) { return Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]); })
          .map(function (p) { return [Number(p[0]), Number(p[1])]; });
        if (points.length < 2) return { ok: false, why: 'штрих ' + (i + 1) + ': меньше двух точек', strokes: [] };
        d = pointsToPath(limitPoints(points, maxPoints));
      }
      if (!d) return { ok: false, why: 'штрих ' + (i + 1) + ': нет пути', strokes: [] };
      var parsed = parsePath(d);
      if (!parsed.ok) return { ok: false, why: 'штрих ' + (i + 1) + ': ' + parsed.why, strokes: [] };
      var length = flatten(parsed.segments).reduce(function (sum, line) { return sum + polylineLength(line); }, 0);
      if (length < 1) continue;
      strokes.push({ d: d.trim(), length: round1(length) });
    }
    if (strokes.length < min) return { ok: false, why: 'штрихов ' + strokes.length + ', нужно не меньше ' + min, strokes: strokes, count: true };
    if (strokes.length > max) return { ok: false, why: 'штрихов ' + strokes.length + ', нужно не больше ' + max, strokes: strokes, count: true };
    return { ok: true, why: '', strokes: strokes };
  }

  function random(rnd) {
    return typeof rnd === 'function' ? rnd() : Math.random();
  }

  /**
   * Расписание анимации: всё рисование занимает totalMs, между штрихами паузы pauseMin..pauseMax
   * (не больше трети всего времени), остальное делится пропорционально длине штрихов.
   * → [{ start, duration }] в мс; конец последнего штриха — ровно totalMs.
   */
  function schedule(lengths, totalMs, options, rnd) {
    var o = options || {};
    var n = lengths.length;
    if (!n) return [];
    var pauses = [];
    var pauseSum = 0;
    for (let i = 0; i < n - 1; i++) {
      var pause = (o.pauseMin || 150) + random(rnd) * ((o.pauseMax || 400) - (o.pauseMin || 150));
      pauses.push(pause);
      pauseSum += pause;
    }
    var limit = totalMs / 3;
    if (pauseSum > limit) {
      var k = limit / pauseSum;
      pauses = pauses.map(function (p) { return p * k; });
      pauseSum = limit;
    }
    var drawMs = totalMs - pauseSum;
    var total = lengths.reduce(function (sum, len) { return sum + Math.max(len, 1); }, 0);
    var out = [];
    var at = 0;
    for (let i = 0; i < n; i++) {
      var duration = drawMs * Math.max(lengths[i], 1) / total;
      out.push({ start: at, duration: duration });
      at += duration + (i < n - 1 ? pauses[i] : 0);
    }
    out[n - 1].duration = totalMs - out[n - 1].start;
    return out;
  }

  /** Сколько каждого штриха нарисовано к моменту t (0..1). */
  function progressAt(plan, t) {
    return plan.map(function (item) {
      if (t <= item.start) return 0;
      if (t >= item.start + item.duration) return 1;
      return (t - item.start) / item.duration;
    });
  }

  /** Очки за скорость: угадано на секунде t из T — ceil(10 × (1 − t / T)), не меньше 1. */
  function speedScore(tMs, totalMs) {
    if (!(totalMs > 0)) return 1;
    return Math.max(1, Math.ceil(10 * (1 - Math.max(0, tMs) / totalMs)));
  }

  // ---- когда отправлять снимок модели ------------------------------------------------------------

  /**
   * Состояние отправок одного рисунка. options: minInterval (с), pause (с), minNew (штрихов),
   * maxRequests. Изменение рисунка (штрих, отмена, очистка) — changed(); решение — decide().
   */
  function sender(options) {
    return {
      opts: options,
      version: 0,
      sentVersion: 0,
      strokes: 0,
      lastSentAt: null,
      lastChangeAt: 0,
      drawing: false,
      inFlight: false,
      requests: 0
    };
  }

  function changed(state, strokeCount, now) {
    state.version += 1;
    state.strokes = strokeCount;
    state.lastChangeAt = now;
  }

  /**
   * Отправить ли сейчас. event: 'stroke' — закончен штрих; 'tick' — проверка по таймеру
   * (пауза в рисовании); 'answer' — пришёл ответ на прошлый снимок.
   */
  function decide(state, now, event) {
    var o = state.opts;
    if (state.inFlight || state.drawing || !state.strokes) return false;
    if (state.requests >= o.maxRequests) return false;
    if (state.version - state.sentVersion < (o.minNew || 1)) return false;
    if (event === 'answer') return true;
    if (event === 'stroke') return state.lastSentAt === null || now - state.lastSentAt >= o.minInterval * 1000;
    if (event === 'tick') return now - state.lastChangeAt >= o.pause * 1000;
    return false;
  }

  function sent(state, now) {
    state.inFlight = true;
    state.lastSentAt = now;
    state.sentVersion = state.version;
    state.requests += 1;
  }

  function answered(state) {
    state.inFlight = false;
  }

  exports.FIELD = FIELD;
  exports.toField = toField;
  exports.bounds = bounds;
  exports.fit = fit;
  exports.snapshotWidth = snapshotWidth;
  exports.simplify = simplify;
  exports.limitPoints = limitPoints;
  exports.parsePath = parsePath;
  exports.flatten = flatten;
  exports.pathLength = pathLength;
  exports.pointsToPath = pointsToPath;
  exports.strokesToPaths = strokesToPaths;
  exports.validatePainting = validatePainting;
  exports.schedule = schedule;
  exports.progressAt = progressAt;
  exports.speedScore = speedScore;
  exports.sender = sender;
  exports.changed = changed;
  exports.decide = decide;
  exports.sent = sent;
  exports.answered = answered;
})(typeof exports !== 'undefined' ? exports : (window.dgCanvas = {}));
