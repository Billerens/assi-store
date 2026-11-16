// The creature as simple shapes in a 320×320 frame, from a look (look.js). Pure.
// One list of primitives feeds both renderers: svg.js (the screen, with CSS animation) and the
// Canvas walker of the widget picture (draw.js) — so the two pictures cannot drift apart.
//
// A primitive: { t: 'path', d, fill, stroke, sw, cap, op, cls, anim }
//            | { t: 'ellipse', cx, cy, rx, ry, fill, stroke, sw, op, cls, anim }
//            | { t: 'g', cls, tf: { x, y, rot, ox, oy, s }, kids: [...], anim }
// Paths use absolute M, L, C, Q and Z only. Colours 'BODY' and 'DARK' are the palette's (the
// screen may turn them into the theme accent). anim: true — exists only for the animation
// (blink lids, steam): the still picture leaves it out.

var CX = 160;
var GROUND = 296;
var LEAF = '#79B072';
var LEAF_DARK = '#4F8049';
var EYE_WHITE = '#F4F1EA';
var INK = '#1F1F1F';
var BROW = '#2A2A2A';
var RARITY = { common: '#B9B4A8', uncommon: '#8DBF7F', rare: '#6FA8DC', epic: '#B48CE0', legendary: '#E6C46C' };
exports.RARITY = RARITY;

function f1(n) {
  return String(Math.round(n * 10) / 10);
}

function pt(x, y) {
  return f1(x) + ' ' + f1(y);
}

function path(d, style) {
  var p = { t: 'path', d: d };
  Object.keys(style || {}).forEach(function (k) { p[k] = style[k]; });
  return p;
}

function ellipse(cx, cy, rx, ry, style) {
  var p = { t: 'ellipse', cx: cx, cy: cy, rx: rx, ry: ry };
  Object.keys(style || {}).forEach(function (k) { p[k] = style[k]; });
  return p;
}

function group(cls, kids, tf, anim) {
  return { t: 'g', cls: cls || '', kids: kids.filter(function (k) { return k; }), tf: tf || null, anim: Boolean(anim) };
}

// ---- the body: a superellipse, wider below ----------------------------------------------------

var POSTURES = {
  stand: { h: 168, w: 1, base: 282 },
  stretch: { h: 178, w: 0.97, base: 282 },
  sink: { h: 150, w: 1.06, base: 284 },
  sit: { h: 156, w: 1.03, base: 286 },
  curl: { h: 122, w: 1.14, base: 290 },
  lean: { h: 166, w: 1, base: 282 }
};

/** The body's measures: { cx, cy, top, base, h, aTop, aBot, points }. */
function body(posture) {
  var p = POSTURES[posture] || POSTURES.stand;
  var h = p.h;
  var aTop = 70 * p.w;
  var aBot = 101 * p.w;
  var bTop = 0.56 * h;
  var bBot = 0.44 * h;
  var cy = p.base - bBot;
  var n = 2.5;
  var ex = 2 / n;
  var points = [];
  var N = 72;
  for (var i = 0; i < N; i++) {
    var th = 2 * Math.PI * i / N;
    var c = Math.cos(th);
    var s = Math.sin(th);
    var a = (aTop + aBot) / 2 + (aBot - aTop) / 2 * s;
    var x = CX + a * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), ex);
    var y = cy + (s < 0 ? bTop : bBot) * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), ex);
    points.push([x, y]);
  }
  return { cx: CX, cy: cy, top: cy - bTop, base: p.base, h: h, aTop: aTop, aBot: aBot, points: points };
}
exports.body = body;

function polygon(points) {
  return points.map(function (p, i) { return (i ? 'L' : 'M') + pt(p[0], p[1]); }).join(' ') + ' Z';
}

/** Half the body's width at a height (for the scarf and the blanket). */
function halfWidthAt(b, y) {
  var best = 0;
  for (var i = 0; i < b.points.length; i++) {
    var p = b.points[i];
    var q = b.points[(i + 1) % b.points.length];
    if ((p[1] - y) * (q[1] - y) <= 0 && p[1] !== q[1]) {
      var x = p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]);
      best = Math.max(best, Math.abs(x - CX));
    }
  }
  return best;
}
exports.halfWidthAt = halfWidthAt;

// ---- eyes and brows -----------------------------------------------------------------------------

// Every part of an eye — the white, the pupil, the lids — is made from one ellipse { x, y, rx, ry }
// (the white itself, 'wide' included), so a lid cannot slip off the eye whatever its size.

/** The point of an eye's ellipse at an angle (radians, 0 — right, π/2 — down). */
function onEye(e, a) {
  return [e.x + e.rx * Math.cos(a), e.y + e.ry * Math.sin(a)];
}

/** The ellipse's arc from angle a0 to a1 as cubic Béziers (no SVG 'A': the Canvas walker takes C). */
function arc(e, a0, a1) {
  var n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)));
  var step = (a1 - a0) / n;
  var k = 4 / 3 * Math.tan(step / 4);
  var d = '';
  for (var i = 0; i < n; i++) {
    var t0 = a0 + step * i;
    var t1 = t0 + step;
    var p0 = onEye(e, t0);
    var p1 = onEye(e, t1);
    var c0 = [p0[0] - k * e.rx * Math.sin(t0), p0[1] + k * e.ry * Math.cos(t0)];
    var c1 = [p1[0] + k * e.rx * Math.sin(t1), p1[1] - k * e.ry * Math.cos(t1)];
    d += ' C' + pt(c0[0], c0[1]) + ' ' + pt(c1[0], c1[1]) + ' ' + pt(p1[0], p1[1]);
  }
  return d;
}

/** Where a horizontal line y = cut meets the eye: [left x, right x]. */
function chord(e, cut) {
  var v = (cut - e.y) / e.ry;
  var w = e.rx * Math.sqrt(Math.max(0, 1 - v * v));
  return [e.x - w, e.x + w];
}

function qAt(q, t) {
  var u = 1 - t;
  return [u * u * q[0][0] + 2 * u * t * q[1][0] + t * t * q[2][0], u * u * q[0][1] + 2 * u * t * q[1][1] + t * t * q[2][1]];
}

/** The part t0…t1 of a quadratic Bézier [p0, c, p1], again as a quadratic one. */
function qPart(q, t0, t1) {
  var a = (1 - t0) * (1 - t1);
  var b = (1 - t0) * t1 + t0 * (1 - t1);
  var c = t0 * t1;
  return [qAt(q, t0), [a * q[0][0] + b * q[1][0] + c * q[2][0], a * q[0][1] + b * q[1][1] + c * q[2][1]], qAt(q, t1)];
}

/** Inside an ellipse (1 — on it). */
function inside(e, p) {
  var u = (p[0] - e.x) / e.rx;
  var v = (p[1] - e.y) / e.ry;
  return u * u + v * v;
}

/**
 * The upper lid of a half-closed eye: the eye's own arc over the top, closed by the lid's edge (a
 * curve sagging a little, both ends on the eye). The dark edge line is the same curve, its ends
 * pulled in by half its width so that the round caps stop at the eye's rim.
 */
function halfLid(e, cut, sag, sw) {
  var ends = chord(e, cut);
  // The right end at the angle aR, the left one at π − aR; over the top runs from π − aR to 2π + aR.
  var aR = Math.asin(Math.max(-1, Math.min(1, (cut - e.y) / e.ry)));
  var edge = [[ends[1], cut], [e.x, cut + sag], [ends[0], cut]];
  var lid = 'M' + pt(ends[0], cut) + arc(e, Math.PI - aR, 2 * Math.PI + aR) + ' Q' + pt(edge[1][0], edge[1][1]) + ' ' + pt(ends[0], cut) + ' Z';
  // The line: from t to 1 − t of the edge, t where the curve meets the eye shrunk by half the width.
  var inner = { x: e.x, y: e.y, rx: e.rx - sw / 2, ry: e.ry - sw / 2 };
  var lo = 0;
  var hi = 0.5;
  for (var i = 0; i < 30; i++) {
    var mid = (lo + hi) / 2;
    if (inside(inner, qAt(edge, mid)) > 1) lo = mid;
    else hi = mid;
  }
  var line = qPart(edge, hi, 1 - hi);
  return {
    fill: lid,
    line: 'M' + pt(line[0][0], line[0][1]) + ' Q' + pt(line[1][0], line[1][1]) + ' ' + pt(line[2][0], line[2][1])
  };
}

/** The pupil's horizontal shift, kept so that the pupil stays inside the white at rest. */
function pupilShift(e, want, prx, pry, py) {
  var fits = function (dx) {
    for (var i = 0; i < 24; i++) {
      var a = 2 * Math.PI * i / 24;
      if (inside(e, [e.x + dx + prx * Math.cos(a), py + pry * Math.sin(a)]) > 0.92) return false;
    }
    return true;
  };
  var dx = want;
  while (Math.abs(dx) > 0 && !fits(dx)) dx -= dx > 0 ? Math.min(0.5, dx) : Math.max(-0.5, dx);
  return dx;
}

function clipOf(e, grow) {
  return { cx: e.x, cy: e.y, rx: e.rx + grow, ry: e.ry + grow };
}

function eye(x, y, rx, ry, kind, pupil) {
  var out = [];
  var line = { fill: 'none', stroke: INK, sw: 4.5, cap: 'round' };
  if (kind === 'closed') {
    out.push(path('M' + pt(x - rx * 0.85, y) + ' Q' + pt(x, y + ry * 0.55) + ' ' + pt(x + rx * 0.85, y), line));
    return out;
  }
  if (kind === 'happy') {
    out.push(path('M' + pt(x - rx * 0.85, y + 5) + ' Q' + pt(x, y - ry * 0.75) + ' ' + pt(x + rx * 0.85, y + 5), line));
    return out;
  }
  var wide = kind === 'wide' ? 1.08 : 1;
  var e = { x: x, y: y, rx: rx * wide, ry: ry * wide };
  out.push(ellipse(e.x, e.y, e.rx, e.ry, { fill: EYE_WHITE }));
  var prx = 10.5 * wide;
  var pry = 11 * wide;
  var dx = pupilShift(e, (pupil || 0) * 7, prx, pry, y + 3);
  // The pupils look around (animation): the eye's ellipse clips them, they never leave the white.
  var pupils = group('pt-pupils', [
    ellipse(x + dx, y + 3, prx, pry, { fill: INK }),
    ellipse(x + dx + 4, y - 3, 3.6, 3.6, { fill: '#FFFFFF' })
  ]);
  var held = group('pt-iris', [pupils]);
  held.clip = clipOf(e, 0);
  out.push(held);
  if (kind === 'half') {
    // The upper lid, in the body's colour, down to the middle of the eye; a thin rim of the same
    // colour hides the white's anti-aliased edge under it.
    var lid = halfLid(e, y - e.ry * 0.05, 2, 3);
    out.push(path(lid.fill, { fill: 'BODY', stroke: 'BODY', sw: 1.2, cls: 'pt-lid' }));
    out.push(path(lid.line, { fill: 'none', stroke: 'DARK', sw: 3, cap: 'round', cls: 'pt-lid-line' }));
  }
  // The blink: a lid in the body's colour with a rounded lower edge, folded up to the eye's top
  // until the animation lowers it; the eye's ellipse (a hair larger, for the anti-aliased rim)
  // clips it, so the lid never covers anything but the eye.
  var top = e.y - e.ry - 1;
  var bottom = e.y + e.ry + 1;
  var blink = group('pt-blink-eye', [path('M' + pt(e.x - e.rx - 1, top) + ' L' + pt(e.x + e.rx + 1, top) + ' L' + pt(e.x + e.rx + 1, bottom) +
    ' Q' + pt(e.x, bottom + e.ry * 0.5) + ' ' + pt(e.x - e.rx - 1, bottom) + ' Z', { fill: 'BODY', cls: 'pt-blink', anim: true })], null, true);
  blink.clip = clipOf(e, 1);
  out.push(blink);
  return out;
}

function brow(x, y, tilt, side) {
  // side −1 — the left brow (its outer end is on the left), 1 — the right one.
  var L = 13;
  var r = tilt * Math.PI / 180;
  var outerY = y - L * Math.sin(r);
  var innerY = y + L * Math.sin(r);
  var outerX = x + side * L * Math.cos(r);
  var innerX = x - side * L * Math.cos(r);
  return path('M' + pt(outerX, outerY) + ' L' + pt(innerX, innerY), { fill: 'none', stroke: BROW, sw: 4, cap: 'round' });
}

// ---- the stem, the leaves, the bud, the flower ----------------------------------------------------

var STEMS = {
  straight: { d: [[0, 0], [0, -12], [-3, -24], [0, -36]], tip: [0, -36], pairs: [[[0, -25], -25, 205], [[0, -13], -10, 190]] },
  droop: { d: [[0, 0], [0, -16], [8, -28], [22, -26]], tip: [22, -26], pairs: [[[7, -21], 15, 150], [[2, -11], 5, 175]] },
  curl: { d: [[0, 0], [0, -20], [18, -28], [16, -14]], tip: [16, -14], pairs: [[[5, -19], -5, 180], [[1, -9], 10, 185]] }
};

function leaf(x, y, rot, s) {
  return group('', [path('M0 0 C7 -11 22 -13 29 -4 C20 4 7 6 0 0 Z', { fill: LEAF, stroke: LEAF_DARK, sw: 1.6 })],
    { x: x, y: y, rot: rot, ox: 0, oy: 0, s: s || 1 });
}

function stem(kind, stage, bx, by) {
  var st = STEMS[kind] || STEMS.straight;
  var d = st.d;
  var kids = [path('M' + pt(bx + d[0][0], by + d[0][1]) + ' C' + pt(bx + d[1][0], by + d[1][1]) + ' ' + pt(bx + d[2][0], by + d[2][1]) + ' ' +
    pt(bx + d[3][0], by + d[3][1]), { fill: 'none', stroke: LEAF_DARK, sw: 4.5, cap: 'round' })];
  var tx = bx + st.tip[0];
  var ty = by + st.tip[1];
  if (stage === 0) kids.push(leaf(tx, ty, -40, 0.75));
  if (stage >= 1) {
    var p1 = st.pairs[0];
    kids.push(leaf(bx + p1[0][0], by + p1[0][1], p1[1], 1));
    kids.push(leaf(bx + p1[0][0], by + p1[0][1], p1[2], 1));
  }
  if (stage >= 2) {
    var p2 = st.pairs[1];
    kids.push(leaf(bx + p2[0][0], by + p2[0][1], p2[1], 0.8));
    kids.push(leaf(bx + p2[0][0], by + p2[0][1], p2[2], 0.8));
  }
  if (stage === 3) {
    kids.push(ellipse(tx, ty - 9, 7.5, 10.5, { fill: '#C77E9C', stroke: '#9A5A75', sw: 1.6 }));
    kids.push(path('M' + pt(tx - 7, ty - 3) + ' L' + pt(tx, ty + 3) + ' L' + pt(tx + 7, ty - 3), { fill: 'none', stroke: LEAF_DARK, sw: 2.2, cap: 'round' }));
  }
  if (stage >= 4) {
    for (var i = 0; i < 5; i++) {
      var a = Math.PI * 2 * i / 5 - Math.PI / 2;
      kids.push(ellipse(tx + Math.cos(a) * 9.5, ty - 9 + Math.sin(a) * 9.5, 7, 7, { fill: '#E6C46C', stroke: '#B8923F', sw: 1.3 }));
    }
    kids.push(ellipse(tx, ty - 9, 5.5, 5.5, { fill: '#C98A3E' }));
  }
  return group('pt-stem', kids);
}

// ---- things ---------------------------------------------------------------------------------------

var LIFT = { 'hiking-hat': 18, 'party-hat': 44, 'pumpkin-hat': 20, 'winter-hat': 26, panama: 16, cap: 14 };

function hat(id, top) {
  var y = top + 8;
  if (id === 'panama') {
    return group('pt-hat', [
      ellipse(CX, y, 60, 10, { fill: '#E3D3A8', stroke: '#A8976A', sw: 2 }),
      path('M' + pt(CX - 31, y) + ' C' + pt(CX - 29, y - 18) + ' ' + pt(CX + 29, y - 18) + ' ' + pt(CX + 31, y) + ' Z', { fill: '#EFE3BF', stroke: '#A8976A', sw: 2 }),
      path('M' + pt(CX - 30, y - 4) + ' L' + pt(CX + 30, y - 4), { fill: 'none', stroke: '#C9784F', sw: 3.5 })
    ]);
  }
  if (id === 'hiking-hat') {
    return group('pt-hat', [
      ellipse(CX, y, 52, 8, { fill: '#9C8A5E', stroke: '#6E6040', sw: 2 }),
      path('M' + pt(CX - 28, y) + ' C' + pt(CX - 26, y - 18) + ' ' + pt(CX - 12, y - 24) + ' ' + pt(CX, y - 24) + ' C' + pt(CX + 12, y - 24) + ' ' +
        pt(CX + 26, y - 18) + ' ' + pt(CX + 28, y) + ' Z', { fill: '#B4A270', stroke: '#6E6040', sw: 2 }),
      path('M' + pt(CX - 27, y - 6) + ' L' + pt(CX + 27, y - 6), { fill: 'none', stroke: '#6E6040', sw: 3 })
    ]);
  }
  if (id === 'party-hat') {
    return group('pt-hat', [
      path('M' + pt(CX - 25, y) + ' L' + pt(CX, y - 46) + ' L' + pt(CX + 25, y) + ' Z', { fill: '#E07A8B', stroke: '#A8505E', sw: 2 }),
      path('M' + pt(CX - 17, y - 14) + ' L' + pt(CX + 17, y - 14) + ' M' + pt(CX - 9, y - 30) + ' L' + pt(CX + 9, y - 30), { fill: 'none', stroke: '#F3E9C6', sw: 3.5, cap: 'round' }),
      ellipse(CX, y - 47, 6.5, 6.5, { fill: '#F3E9C6', stroke: '#C9BE98', sw: 1.4 })
    ]);
  }
  if (id === 'pumpkin-hat') {
    return group('pt-hat', [
      ellipse(CX, y - 8, 36, 19, { fill: '#E8893A', stroke: '#B0602A', sw: 2 }),
      path('M' + pt(CX - 12, y - 26) + ' Q' + pt(CX - 20, y - 8) + ' ' + pt(CX - 12, y + 10) + ' M' + pt(CX + 12, y - 26) + ' Q' + pt(CX + 20, y - 8) + ' ' + pt(CX + 12, y + 10),
        { fill: 'none', stroke: '#B0602A', sw: 2 }),
      path('M' + pt(CX - 3, y - 26) + ' L' + pt(CX - 2, y - 36) + ' L' + pt(CX + 5, y - 36) + ' L' + pt(CX + 3, y - 26) + ' Z', { fill: '#5E8A4A', stroke: '#3F6232', sw: 1.6 })
    ]);
  }
  var winter = id === 'winter-hat';
  return group('pt-hat', [
    path('M' + pt(CX - 34, y) + ' C' + pt(CX - 32, y - (winter ? 34 : 26)) + ' ' + pt(CX + 32, y - (winter ? 34 : 26)) + ' ' + pt(CX + 34, y) + ' Z',
      { fill: winter ? '#C8564B' : '#6F8FB5', stroke: winter ? '#933B33' : '#4C6A8E', sw: 2 }),
    winter ? path('M' + pt(CX - 36, y) + ' L' + pt(CX + 36, y), { fill: 'none', stroke: '#F1ECE0', sw: 8, cap: 'round' }) : null,
    winter ? ellipse(CX, y - 30, 8, 8, { fill: '#F1ECE0', stroke: '#C9C2B2', sw: 1.4 }) : null
  ]);
}

function nightcap(top) {
  var y = top + 10;
  return group('pt-hat', [
    path('M' + pt(CX - 46, y + 4) + ' C' + pt(CX - 30, y - 34) + ' ' + pt(CX + 30, y - 40) + ' ' + pt(CX + 56, y - 18) + ' C' + pt(CX + 70, y - 6) + ' ' +
      pt(CX + 80, y + 8) + ' ' + pt(CX + 86, y + 26) + ' L' + pt(CX + 72, y + 32) + ' C' + pt(CX + 64, y + 16) + ' ' + pt(CX + 50, y + 4) + ' ' + pt(CX + 34, y + 4) + ' Z',
      { fill: '#5E6FA8', stroke: '#3F4C7A', sw: 2 }),
    ellipse(CX + 80, y + 34, 8, 8, { fill: '#E9E4D4', stroke: '#B0A990', sw: 1.4 }),
    path('M' + pt(CX - 50, y + 6) + ' C' + pt(CX - 20, y - 6) + ' ' + pt(CX + 20, y - 6) + ' ' + pt(CX + 40, y + 4), { fill: 'none', stroke: '#E9E4D4', sw: 9, cap: 'round' })
  ]);
}

function scarf(id, b, y) {
  var w = halfWidthAt(b, y) + 3;
  var winter = id === 'winter-scarf';
  var fill = winter ? '#5E8FC8' : id === 'scarf' ? '#C8564B' : '#8F7BB8';
  var line = winter ? '#3E6795' : id === 'scarf' ? '#933B33' : '#66558A';
  var kids = [
    path('M' + pt(CX - w, y) + ' C' + pt(CX - w * 0.5, y + 16) + ' ' + pt(CX + w * 0.5, y + 16) + ' ' + pt(CX + w, y) + ' L' + pt(CX + w, y + 14) + ' C' +
      pt(CX + w * 0.5, y + 30) + ' ' + pt(CX - w * 0.5, y + 30) + ' ' + pt(CX - w, y + 14) + ' Z', { fill: fill, stroke: line, sw: 2 }),
    path('M' + pt(CX + 34, y + 20) + ' L' + pt(CX + 44, y + 58) + ' L' + pt(CX + 60, y + 54) + ' L' + pt(CX + 52, y + 18) + ' Z', { fill: fill, stroke: line, sw: 2 })
  ];
  if (winter) {
    kids.push(path('M' + pt(CX + 38, y + 34) + ' L' + pt(CX + 55, y + 30) + ' M' + pt(CX + 41, y + 46) + ' L' + pt(CX + 58, y + 42), { fill: 'none', stroke: '#F1ECE0', sw: 3 }));
  }
  return group('pt-neck', kids);
}

function handThing(id) {
  var x = CX - 116;
  var y = 236;
  if (id === 'lantern') {
    return group('pt-hand', [
      path('M' + pt(x, y - 28) + ' L' + pt(x, y - 14), { fill: 'none', stroke: '#6B6B6B', sw: 2.5, cap: 'round' }),
      path('M' + pt(x - 12, y - 14) + ' L' + pt(x + 12, y - 14) + ' L' + pt(x + 10, y + 16) + ' L' + pt(x - 10, y + 16) + ' Z', { fill: '#F0D27A', stroke: '#7A6532', sw: 2.5 }),
      path('M' + pt(x - 11, y - 4) + ' L' + pt(x + 11, y - 4) + ' M' + pt(x - 10, y + 6) + ' L' + pt(x + 10, y + 6), { fill: 'none', stroke: '#7A6532', sw: 1.8 }),
      ellipse(x, y + 1, 4, 5, { fill: '#FFF4C8' })
    ]);
  }
  return group('pt-hand', [
    path('M' + pt(x, y + 30) + ' L' + pt(x, y - 30), { fill: 'none', stroke: '#8A7A5E', sw: 3, cap: 'round' }),
    path('M' + pt(x, y - 30) + ' L' + pt(x + 28, y - 21) + ' L' + pt(x, y - 12) + ' Z', { fill: '#D9A441', stroke: '#9C7428', sw: 2 })
  ]);
}

function badge(holding, b, y) {
  var color = RARITY[(holding && holding.rarity) || 'common'] || RARITY.common;
  var x = CX + 58;
  return group('pt-badge', [
    path('M' + pt(x - 10, y - 26) + ' L' + pt(x - 2, y - 4) + ' L' + pt(x + 2, y - 4) + ' L' + pt(x + 10, y - 26), { fill: 'none', stroke: '#B85C5C', sw: 4, cap: 'round' }),
    ellipse(x, y + 8, 15, 15, { fill: color, stroke: '#6B5E3E', sw: 2 }),
    path('M' + pt(x, y - 1) + ' L' + pt(x + 3, y + 5) + ' L' + pt(x + 9, y + 6) + ' L' + pt(x + 4.5, y + 10) + ' L' + pt(x + 6, y + 16) + ' L' + pt(x, y + 13) + ' L' +
      pt(x - 6, y + 16) + ' L' + pt(x - 4.5, y + 10) + ' L' + pt(x - 9, y + 6) + ' L' + pt(x - 3, y + 5) + ' Z', { fill: '#FFF8E0', stroke: '#6B5E3E', sw: 1.2 })
  ]);
}

function blanket(b, y) {
  var w = 112;
  return group('pt-blanket', [
    path('M' + pt(CX - w, GROUND - 2) + ' C' + pt(CX - w - 6, y + 30) + ' ' + pt(CX - 84, y) + ' ' + pt(CX - 46, y + 10) + ' C' + pt(CX - 20, y + 18) + ' ' +
      pt(CX + 20, y + 18) + ' ' + pt(CX + 46, y + 10) + ' C' + pt(CX + 84, y) + ' ' + pt(CX + w + 6, y + 30) + ' ' + pt(CX + w, GROUND - 2) + ' Z',
      { fill: '#A8574E', stroke: '#7D3E37', sw: 2.5 }),
    path('M' + pt(CX - 96, y + 40) + ' C' + pt(CX - 30, y + 58) + ' ' + pt(CX + 30, y + 58) + ' ' + pt(CX + 96, y + 40) + ' M' + pt(CX - 104, y + 66) + ' C' +
      pt(CX - 30, y + 84) + ' ' + pt(CX + 30, y + 84) + ' ' + pt(CX + 104, y + 66), { fill: 'none', stroke: '#C9776C', sw: 3.5 }),
    path('M' + pt(CX - 50, y + 16) + ' L' + pt(CX - 56, GROUND - 4) + ' M' + pt(CX + 50, y + 16) + ' L' + pt(CX + 56, GROUND - 4), { fill: 'none', stroke: '#C9776C', sw: 3.5 })
  ]);
}

function mug(y) {
  var x = CX + 24;
  return group('pt-mug', [
    group('pt-steam pt-anim', [
      path('M' + pt(x + 9, y - 6) + ' C' + pt(x + 4, y - 14) + ' ' + pt(x + 14, y - 18) + ' ' + pt(x + 9, y - 27), { fill: 'none', stroke: '#B8B2A6', sw: 2.2, cap: 'round', op: 0.8 }),
      path('M' + pt(x + 21, y - 6) + ' C' + pt(x + 16, y - 14) + ' ' + pt(x + 26, y - 18) + ' ' + pt(x + 21, y - 27), { fill: 'none', stroke: '#B8B2A6', sw: 2.2, cap: 'round', op: 0.8 })
    ], null, true),
    ellipse(x + 36, y + 14, 7, 8, { fill: 'none', stroke: '#9A9488', sw: 3 }),
    path('M' + pt(x, y) + ' L' + pt(x + 31, y) + ' L' + pt(x + 29, y + 30) + ' Q' + pt(x + 15.5, y + 35) + ' ' + pt(x + 2, y + 30) + ' Z', { fill: '#E9E4D4', stroke: '#9A9488', sw: 2.2 }),
    path('M' + pt(x + 5, y + 12) + ' L' + pt(x + 26, y + 12), { fill: 'none', stroke: '#C77E9C', sw: 3 })
  ]);
}

function glass(y) {
  var x = CX - 92;
  return group('pt-glass', [
    path('M' + pt(x, y) + ' L' + pt(x + 26, y) + ' L' + pt(x + 22, y + 38) + ' L' + pt(x + 4, y + 38) + ' Z', { fill: '#2E3A44', stroke: '#9FB6C8', sw: 2.2 }),
    path('M' + pt(x + 2, y + 12) + ' L' + pt(x + 24, y + 12) + ' L' + pt(x + 22, y + 37) + ' L' + pt(x + 4, y + 37) + ' Z', { fill: '#7DB6E8', op: 0.9 })
  ], { x: 0, y: 0, rot: -14, ox: x + 13, oy: y + 38 });
}

function zzz(top) {
  var marks = [[CX + 70, top + 6, 14], [CX + 94, top - 20, 18], [CX + 120, top - 50, 22]];
  return group('pt-zzz', marks.map(function (m, i) {
    var x = m[0];
    var y = m[1];
    var s = m[2];
    return group('pt-z pt-anim pt-z' + i, [path('M' + pt(x, y) + ' L' + pt(x + s, y) + ' L' + pt(x, y + s) + ' L' + pt(x + s, y + s),
      { fill: 'none', stroke: '#C9C6E8', sw: 3, cap: 'round' })]);
  }));
}

function backpack(b) {
  var x = CX + 62;
  var y = b.cy - 26;
  return group('pt-pack', [
    path('M' + pt(x + 10, y) + ' L' + pt(x + 38, y) + ' Q' + pt(x + 48, y) + ' ' + pt(x + 48, y + 10) + ' L' + pt(x + 48, y + 58) + ' Q' + pt(x + 48, y + 68) + ' ' +
      pt(x + 38, y + 68) + ' L' + pt(x + 10, y + 68) + ' Q' + pt(x, y + 68) + ' ' + pt(x, y + 58) + ' L' + pt(x, y + 10) + ' Q' + pt(x, y) + ' ' + pt(x + 10, y) + ' Z',
      { fill: '#8B6F50', stroke: '#65503A', sw: 2.5 }),
    path('M' + pt(x + 8, y + 16) + ' L' + pt(x + 40, y + 16) + ' L' + pt(x + 40, y + 40) + ' L' + pt(x + 8, y + 40) + ' Z', { fill: '#D8C9A3', stroke: '#65503A', sw: 1.8 }),
    path('M' + pt(x + 12, y + 22) + ' L' + pt(x + 18, y + 34) + ' L' + pt(x + 26, y + 24) + ' L' + pt(x + 34, y + 33), { fill: 'none', stroke: '#65503A', sw: 1.8, cap: 'round' })
  ]);
}

function strap(b) {
  // Along the right side of the body, clear of the eye.
  var y1 = b.top + 0.3 * b.h;
  var y2 = b.base - 24;
  var x1 = CX + halfWidthAt(b, y1) - 12;
  var x2 = CX + halfWidthAt(b, y2) - 14;
  return path('M' + pt(x1, y1) + ' C' + pt(x1 + 8, y1 + 30) + ' ' + pt(x2 + 6, y2 - 30) + ' ' + pt(x2, y2),
    { fill: 'none', stroke: '#65503A', sw: 6, cap: 'round', cls: 'pt-strap' });
}

function party() {
  var colors = ['#E07A8B', '#E6C46C', '#79B072', '#6FA8DC', '#B48CE0'];
  var kids = [path('M10 24 Q160 74 310 24', { fill: 'none', stroke: '#9A9488', sw: 2 })];
  for (var i = 0; i < 9; i++) {
    var t = (i + 0.5) / 9;
    var x = 10 + 300 * t;
    var y = (1 - t) * (1 - t) * 24 + 2 * (1 - t) * t * 74 + t * t * 24;
    kids.push(path('M' + pt(x - 9, y) + ' L' + pt(x + 9, y) + ' L' + pt(x, y + 18) + ' Z', { fill: colors[i % colors.length] }));
  }
  var dots = [[40, 120], [282, 104], [64, 200], [262, 176], [30, 248], [296, 236], [100, 70], [226, 66]];
  dots.forEach(function (d, i) {
    kids.push(ellipse(d[0], d[1], 3 + (i % 2), 3 + (i % 2), { fill: colors[(i + 2) % colors.length] }));
  });
  return group('pt-party', kids);
}

// ---- the whole creature ---------------------------------------------------------------------------

/** The primitives of the creature for a look. */
exports.creature = function (look) {
  var b = body(look.posture);
  var ey = b.cy - 0.06 * b.h;
  var rx = 19;
  var ry = look.posture === 'curl' ? 20 : 23;
  var lx = CX - 34;
  var rx2 = CX + 34;
  var items = {};
  (look.items || []).forEach(function (item) { items[item.slot] = item.id; });
  var extras = {};
  (look.extras || []).forEach(function (x) { extras[x] = true; });
  var out = [];
  var under = [];

  if (extras.party) out.push(party());

  // Behind the body: the backpack, the legs.
  if (extras.backpack) under.push(backpack(b));
  if (look.posture !== 'curl' && !extras.blanket) {
    var legRx = look.sturdy ? 22 : 17;
    var legRy = look.sturdy ? 12 : 9.5;
    under.push(ellipse(CX - 38, GROUND - 10, legRx, legRy, { fill: 'DARK' }));
    under.push(ellipse(CX + 38, GROUND - 10, legRx, legRy, { fill: 'DARK' }));
  }

  // The body breathes; the face lives on it.
  var eyes;
  if (look.eyes === 'one') eyes = eye(lx, ey, rx, ry, 'closed', 0).concat(eye(rx2, ey, rx, ry, 'half', 0.3));
  else eyes = eye(lx, ey, rx, ry, look.eyes, look.pupil).concat(eye(rx2, ey, rx, ry, look.eyes, look.pupil));
  var browY = ey - ry - 13 + (look.browLift || 0);
  var face = [
    path(polygon(b.points), { fill: 'BODY', stroke: 'DARK', sw: 3 }),
    group('pt-eyes', eyes),
    group('pt-brows', [brow(lx, browY, look.brows, -1), brow(rx2, browY, look.brows, 1)])
  ];
  if (extras.backpack) face.push(strap(b));
  if (items.neck) face.push(scarf(items.neck, b, ey + ry + 16));

  var above = [];
  if (extras.blanket) above.push(blanket(b, ey + ry + 8));
  if (extras.mug) above.push(mug(ey + ry + 42));
  // The hat first, the stem through it: the stage of growth is always seen.
  var hatId = extras.panama ? 'panama' : items.head || null;
  var lift = 0;
  if (extras.nightcap) above.push(nightcap(b.top));
  else if (hatId) {
    above.push(hat(hatId === 'hiking-hat' || hatId === 'party-hat' || hatId === 'pumpkin-hat' || hatId === 'winter-hat' || hatId === 'panama' ? hatId : 'cap', b.top));
    lift = LIFT[hatId] || LIFT.cap;
  }
  above.push(stem(look.stem, look.stage, CX, b.top + 4 - lift));
  if (items.hand) above.push(handThing(items.hand));
  if (extras.badge) above.push(badge(look.holding, b, ey + ry + 40));
  if (look.drink) above.push(glass(ey + 10));
  if (extras.zzz) above.push(zzz(b.top));

  var tf = look.posture === 'lean' ? { x: 0, y: 0, rot: -5, ox: CX, oy: GROUND } : null;
  out.push(group('', [group('pt-all pt-anim pt-m-' + look.motion, [
    group('', under),
    group('pt-body pt-anim', face),
    group('', above)
  ])], tf));
  return out;
};

/** The room of the screen (behind the creature): wall, floor, shelf with things, window, door. */
exports.room = function (opts) {
  opts = opts || {};
  var out = [
    path('M0 0 L320 0 L320 238 L0 238 Z', { fill: 'WALL' }),
    path('M0 238 L320 238 L320 320 L0 320 Z', { fill: 'FLOOR' }),
    path('M0 238 L320 238', { fill: 'none', stroke: 'LINE', sw: 2 }),
    ellipse(CX, GROUND + 2, 124, 13, { fill: 'RUG' })
  ];
  // The window: night or day.
  var night = Boolean(opts.night);
  out.push(path('M196 36 L266 36 L266 100 L196 100 Z', { fill: night ? '#1A2233' : '#34465A', stroke: 'LINE', sw: 3 }));
  out.push(path('M231 36 L231 100 M196 68 L266 68', { fill: 'none', stroke: 'LINE', sw: 2.5 }));
  if (night) out.push(path('M250 46 C242 48 240 60 248 64 C240 64 236 54 242 48 C244 46 247 45 250 46 Z', { fill: 'none', stroke: '#C9C6E8', sw: 2 }));
  // The door on the right: the restless one looks there.
  out.push(path('M282 106 L320 106 L320 238 L282 238 Z', { fill: 'DOOR', stroke: 'LINE', sw: 3 }));
  out.push(ellipse(292, 176, 3.5, 3.5, { fill: 'LINE' }));
  // The shelf with the things from achievements.
  out.push(path('M16 100 L124 100', { fill: 'none', stroke: 'LINE', sw: 5, cap: 'round' }));
  out.push(path('M30 100 L30 112 M110 100 L110 112', { fill: 'none', stroke: 'LINE', sw: 3 }));
  (opts.shelf || []).slice(0, 4).forEach(function (item, i) {
    var x = 30 + i * 26;
    var color = RARITY[item.rarity] || RARITY.common;
    if (item.id === 'trophy' || /trophy|cup|кубок/.test(String(item.id))) {
      out.push(path('M' + pt(x - 8, 70) + ' L' + pt(x + 8, 70) + ' Q' + pt(x + 8, 86) + ' ' + pt(x, 88) + ' Q' + pt(x - 8, 86) + ' ' + pt(x - 8, 70) + ' Z',
        { fill: '#E6C46C', stroke: '#9C7428', sw: 1.6 }));
      out.push(path('M' + pt(x, 88) + ' L' + pt(x, 94) + ' M' + pt(x - 6, 97) + ' L' + pt(x + 6, 97), { fill: 'none', stroke: '#9C7428', sw: 2.5, cap: 'round' }));
    } else {
      out.push(ellipse(x, 86, 9, 9, { fill: color, stroke: '#6B5E3E', sw: 1.6 }));
      out.push(path('M' + pt(x - 4, 95) + ' L' + pt(x - 7, 100) + ' M' + pt(x + 4, 95) + ' L' + pt(x + 7, 100), { fill: 'none', stroke: '#B85C5C', sw: 2.5 }));
    }
  });
  return out;
};
