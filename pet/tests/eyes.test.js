// The eyes' geometry: every lid, pupil and blink is made from its eye's own ellipse and stays on it,
// the two eyes mirror each other, worn things keep off the face: node tests/eyes.test.js
var assert = require('assert');
var Look = require('../look.js');
var Shapes = require('../shapes.js');
var Svg = require('../svg.js');
var Draw = require('../draw.js');
var Mood = require('../mood.js');

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

var EYE_WHITE = '#F4F1EA';
var INK = '#1F1F1F';
var CX = 160;
var POSTURES = ['stand', 'stretch', 'sink', 'sit', 'curl', 'lean'];
var EYES = ['open', 'half', 'closed', 'happy', 'one', 'wide'];

// ---- geometry helpers ----

/** Points along a path: every segment sampled (curves by their real shape, not their control points). */
function samples(d, n) {
  n = n || 24;
  var out = [];
  var at = null;
  var start = null;
  Draw.parse(d).forEach(function (c) {
    var k;
    var t;
    var u;
    if (c[0] === 'M') {
      at = [c[1], c[2]];
      start = at;
      out.push(at);
    } else if (c[0] === 'L') {
      for (k = 1; k <= n; k++) out.push([at[0] + (c[1] - at[0]) * k / n, at[1] + (c[2] - at[1]) * k / n]);
      at = [c[1], c[2]];
    } else if (c[0] === 'Q') {
      for (k = 1; k <= n; k++) {
        t = k / n;
        u = 1 - t;
        out.push([u * u * at[0] + 2 * u * t * c[1] + t * t * c[3], u * u * at[1] + 2 * u * t * c[2] + t * t * c[4]]);
      }
      at = [c[3], c[4]];
    } else if (c[0] === 'C') {
      for (k = 1; k <= n; k++) {
        t = k / n;
        u = 1 - t;
        out.push([u * u * u * at[0] + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
          u * u * u * at[1] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6]]);
      }
      at = [c[5], c[6]];
    } else if (start) {
      for (k = 1; k <= n; k++) out.push([at[0] + (start[0] - at[0]) * k / n, at[1] + (start[1] - at[1]) * k / n]);
      at = start;
    }
  });
  return out;
}

function ellipsePoints(cx, cy, rx, ry, n) {
  var out = [];
  for (var i = 0; i < (n || 48); i++) {
    var a = 2 * Math.PI * i / (n || 48);
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

/** How far outside an ellipse a point is, in px (an upper bound; ≤ 0 — inside). */
function outside(e, p) {
  var u = (p[0] - e.cx) / e.rx;
  var v = (p[1] - e.cy) / e.ry;
  return (Math.sqrt(u * u + v * v) - 1) * Math.max(e.rx, e.ry);
}

function bbox(points) {
  var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  points.forEach(function (p) {
    b.x0 = Math.min(b.x0, p[0]);
    b.y0 = Math.min(b.y0, p[1]);
    b.x1 = Math.max(b.x1, p[0]);
    b.y1 = Math.max(b.y1, p[1]);
  });
  return b;
}

function inPolygon(poly, p) {
  var hit = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i];
    var b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

function find(prims, cls) {
  var out = null;
  prims.forEach(function (p) {
    if (out) return;
    if ((' ' + (p.cls || '') + ' ').indexOf(' ' + cls + ' ') >= 0) out = p;
    else if (p.t === 'g') out = find(p.kids, cls);
  });
  return out;
}

/** The eyes of a creature, each with its parts: { white, iris, lid, lidLine, blink, mark }. */
function eyesOf(prims) {
  var group = find(prims, 'pt-eyes');
  var eyes = [];
  var marks = [];
  var cur = null;
  group.kids.forEach(function (p) {
    if (p.t === 'ellipse' && p.fill === EYE_WHITE) {
      cur = { white: { cx: p.cx, cy: p.cy, rx: p.rx, ry: p.ry } };
      eyes.push(cur);
    } else if (p.t === 'path' && p.stroke === INK && !p.cls) {
      marks.push(p);
      cur = null;
    } else if (cur && p.cls === 'pt-iris') cur.iris = p;
    else if (cur && p.cls === 'pt-lid') cur.lid = p;
    else if (cur && p.cls === 'pt-lid-line') cur.lidLine = p;
    else if (cur && p.cls === 'pt-blink-eye') cur.blink = p;
    else assert.fail('a stray shape among the eyes: ' + JSON.stringify(p).slice(0, 120));
  });
  return { eyes: eyes, marks: marks };
}

// ---- the looks: every posture × eye kind × pupil, and every state as it really comes ----

function looks() {
  var out = [];
  POSTURES.forEach(function (posture) {
    EYES.forEach(function (kind) {
      [-1, 0, 0.3, 1].forEach(function (pupil) {
        var look = Look.look('calm', { stage: 2 });
        look.posture = posture;
        look.eyes = kind;
        look.pupil = pupil;
        out.push(look);
      });
    });
  });
  var things = [{ id: 'scarf', slot: 'neck', worn: true }, { id: 'hiking-hat', slot: 'head', worn: true }, { id: 'lantern', slot: 'hand', worn: true }];
  Mood.STATES.forEach(function (s) {
    [0, 4].forEach(function (stage) { out.push(Look.look(s.id, { stage: stage })); });
    out.push(Look.look(s.id, { stage: 2, items: things, traits: ['backpack', 'sturdy', 'nightcap'], holding: { rarity: 'epic' }, party: true }));
    out.push(Look.look(s.id, { stage: 4, season: Look.season('new-year', 1, [12, 1, 2]), palette: 'accent', reaction: 'water' }));
    out.push(Look.look(s.id, { stage: 1, season: Look.season('birthday-owner', 6, []), reaction: 'habit' }));
    out.push(Look.look(s.id, { stage: 3, season: Look.season('halloween', 10, []), items: [{ id: 'trophy', slot: 'hand', worn: true }] }));
  });
  return out;
}
var LOOKS = looks();

function name(look) {
  return look.state + '/' + look.posture + '/' + look.eyes + '/' + look.pupil;
}

// ---- tests ----

test('eyes: the pupils are clipped to their own eye and sit inside it at rest', function () {
  LOOKS.forEach(function (look) {
    eyesOf(Shapes.creature(look)).eyes.forEach(function (eye) {
      var e = eye.white;
      assert.ok(eye.iris && eye.iris.clip, name(look) + ': the pupils have no clip');
      assert.deepStrictEqual(eye.iris.clip, e, name(look) + ': the pupils\' clip is not their eye');
      var pupil = find([eye.iris], 'pt-pupils').kids[0];
      ellipsePoints(pupil.cx, pupil.cy, pupil.rx, pupil.ry).forEach(function (p) {
        assert.ok(outside(e, p) <= 0, name(look) + ': the pupil leaves the eye at rest by ' + outside(e, p).toFixed(2));
      });
    });
  });
});

test('eyes: the half lid is the eye\'s own top, its line ends at the rim', function () {
  var halves = 0;
  LOOKS.forEach(function (look) {
    eyesOf(Shapes.creature(look)).eyes.forEach(function (eye) {
      var e = eye.white;
      var half = look.eyes === 'half' || (look.eyes === 'one' && e.cx > CX);
      assert.strictEqual(Boolean(eye.lid), half, name(look) + ': a half lid where it should ' + (half ? '' : 'not ') + 'be');
      assert.strictEqual(Boolean(eye.lidLine), half, name(look) + ': the lid line');
      if (!half) return;
      halves++;
      // The fill (with its thin rim of the body's colour) stays on the eye.
      var pts = samples(eye.lid.d);
      var rim = (eye.lid.sw || 0) / 2 + 0.15;
      pts.forEach(function (p) {
        assert.ok(outside(e, p) <= rim, name(look) + ': the half lid leaves the eye by ' + outside(e, p).toFixed(2));
      });
      var box = bbox(pts);
      assert.ok(Math.abs(box.y0 - (e.cy - e.ry)) < 0.3, name(look) + ': the half lid does not reach the eye\'s top');
      assert.ok(Math.abs((box.x0 + box.x1) / 2 - e.cx) < 0.2, name(look) + ': the half lid is off the eye\'s centre');
      assert.ok(box.y1 > e.cy - 2 && box.y1 < e.cy + 4, name(look) + ': the half lid does not end at the middle');
      // The line: its round caps stop at the rim (the curve keeps half the width inside).
      var sw = eye.lidLine.sw;
      var inner = { cx: e.cx, cy: e.cy, rx: e.rx - sw / 2, ry: e.ry - sw / 2 };
      var line = samples(eye.lidLine.d);
      line.forEach(function (p) {
        assert.ok(outside(inner, p) <= 0.12, name(look) + ': the lid line leaves the eye by ' + outside(inner, p).toFixed(2));
      });
      [line[0], line[line.length - 1]].forEach(function (p) {
        assert.ok(outside(inner, p) > -0.6, name(look) + ': the lid line stops short of the rim');
      });
      // The line lies on the fill's lower edge: every line point is on or near the fill's outline.
      line.forEach(function (p) {
        var near = pts.some(function (q) { return Math.abs(q[0] - p[0]) < 1.2 && Math.abs(q[1] - p[1]) < 0.6; });
        assert.ok(near, name(look) + ': a gap between the lid and its line at ' + p.map(function (n) { return n.toFixed(1); }));
      });
    });
  });
  assert.ok(halves > 40, 'half lids checked: ' + halves);
});

test('eyes: the blink lid starts at the eye\'s top, covers the whole eye, is clipped to it', function () {
  LOOKS.forEach(function (look) {
    eyesOf(Shapes.creature(look)).eyes.forEach(function (eye) {
      var e = eye.white;
      var b = eye.blink;
      assert.ok(b && b.anim && b.clip, name(look) + ': no clipped blink');
      assert.deepStrictEqual([b.clip.cx, b.clip.cy], [e.cx, e.cy], name(look) + ': the blink\'s clip is off the eye\'s centre');
      assert.ok(b.clip.rx - e.rx >= 0 && b.clip.rx - e.rx <= 1.2 && b.clip.ry - e.ry >= 0 && b.clip.ry - e.ry <= 1.2, name(look) + ': the blink\'s clip is not the eye');
      var lid = b.kids[0];
      assert.strictEqual(lid.cls, 'pt-blink');
      var outline = samples(lid.d);
      var box = bbox(outline);
      // transform-origin: 50% 0% of the lid's box — the fold line is the eye's top, the centre its centre.
      assert.ok(box.y0 <= e.cy - e.ry && box.y0 >= e.cy - e.ry - 1.5, name(look) + ': the lid folds away off the eye\'s top');
      assert.ok(Math.abs((box.x0 + box.x1) / 2 - e.cx) < 0.2, name(look) + ': the lid is off the eye\'s centre');
      ellipsePoints(e.cx, e.cy, e.rx, e.ry, 72).forEach(function (p) {
        assert.ok(inPolygon(outline, p), name(look) + ': the closed lid leaves the eye open at ' + p.map(function (n) { return n.toFixed(1); }));
      });
    });
  });
});

test('eyes: left and right mirror each other, lids and pupils included', function () {
  LOOKS.forEach(function (look) {
    var found = eyesOf(Shapes.creature(look));
    if (found.eyes.length === 2) {
      var l = found.eyes[0];
      var r = found.eyes[1];
      assert.ok(Math.abs(l.white.cx + r.white.cx - 2 * CX) < 0.01 && l.white.cy === r.white.cy && l.white.rx === r.white.rx && l.white.ry === r.white.ry,
        name(look) + ': the eyes are not a mirrored pair');
      [['lid', 'd'], ['lidLine', 'd']].forEach(function (part) {
        if (!l[part[0]]) return;
        var a = bbox(samples(l[part[0]].d));
        var b = bbox(samples(r[part[0]].d));
        [[a.x0, 2 * CX - b.x1], [a.x1, 2 * CX - b.x0], [a.y0, b.y0], [a.y1, b.y1]].forEach(function (pair) {
          assert.ok(Math.abs(pair[0] - pair[1]) < 0.25, name(look) + ': the ' + part[0] + 's are not mirrored: ' + pair);
        });
      });
      var lp = find([l.iris], 'pt-pupils').kids[0];
      var rp = find([r.iris], 'pt-pupils').kids[0];
      assert.ok(Math.abs((lp.cx - l.white.cx) - (rp.cx - r.white.cx)) < 0.01 && lp.cy === rp.cy, name(look) + ': the pupils look different ways');
    }
    if (found.marks.length === 2) {
      var m0 = bbox(samples(found.marks[0].d));
      var m1 = bbox(samples(found.marks[1].d));
      assert.ok(Math.abs(m0.x0 + m1.x1 - 2 * CX) < 0.25 && Math.abs(m0.y0 - m1.y0) < 0.1 && Math.abs(m0.y1 - m1.y1) < 0.1, name(look) + ': the closed eyes are not mirrored');
    }
  });
});

test('eyes: the brows sit over their eyes, mirrored', function () {
  LOOKS.forEach(function (look) {
    var prims = Shapes.creature(look);
    var brows = find(prims, 'pt-brows').kids.map(function (p) { return bbox(samples(p.d)); });
    assert.ok(Math.abs(brows[0].x0 + brows[1].x1 - 2 * CX) < 0.25 && Math.abs(brows[0].y0 - brows[1].y0) < 0.1, name(look) + ': the brows are not mirrored');
    var found = eyesOf(prims);
    found.eyes.forEach(function (eye) {
      var brow = eye.white.cx < CX ? brows[0] : brows[1];
      assert.ok(Math.abs((brow.x0 + brow.x1) / 2 - eye.white.cx) < 0.25, name(look) + ': a brow off its eye');
      assert.ok(brow.y1 < eye.white.cy - eye.white.ry, name(look) + ': a brow on its eye');
    });
  });
});

/** Every primitive with its points in the frame of the creature (group transforms applied). */
function placed(prims, m, out) {
  prims.forEach(function (p) {
    var mm = m;
    if (p.t === 'g') {
      // Called on a thing's own group: the lean above it turns the face and the thing together.
      if (p.tf) mm = compose(m, p.tf);
      placed(p.kids, mm, out);
      return;
    }
    var pts = p.t === 'ellipse' ? ellipsePoints(p.cx, p.cy, p.rx, p.ry, 24) : samples(p.d, 8);
    out.push({ p: p, pts: pts.map(function (q) { return apply(mm, q); }) });
  });
  return out;
}

function compose(m, tf) {
  var t = [1, 0, 0, 1, tf.x || 0, tf.y || 0];
  var out = mul(m, t);
  if (tf.rot) {
    var a = tf.rot * Math.PI / 180;
    out = mul(out, [1, 0, 0, 1, tf.ox || 0, tf.oy || 0]);
    out = mul(out, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
    out = mul(out, [1, 0, 0, 1, -(tf.ox || 0), -(tf.oy || 0)]);
  }
  if (tf.s && tf.s !== 1) {
    out = mul(out, [1, 0, 0, 1, tf.ox || 0, tf.oy || 0]);
    out = mul(out, [tf.s, 0, 0, tf.s, 0, 0]);
    out = mul(out, [1, 0, 0, 1, -(tf.ox || 0), -(tf.oy || 0)]);
  }
  return out;
}

function mul(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

function apply(m, p) {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

test('things: hats, scarves, the strap, the badge, the glass and what is held keep off the eyes', function () {
  var THINGS = ['pt-hat', 'pt-neck', 'pt-hand', 'pt-badge', 'pt-glass', 'pt-strap', 'pt-blanket', 'pt-mug'];
  LOOKS.forEach(function (look) {
    var prims = Shapes.creature(look);
    var eyeBoxes = [];
    var found = eyesOf(prims);
    found.eyes.forEach(function (eye) { eyeBoxes.push(bbox(ellipsePoints(eye.white.cx, eye.white.cy, eye.white.rx, eye.white.ry))); });
    found.marks.forEach(function (m) { eyeBoxes.push(bbox(samples(m.d))); });
    THINGS.forEach(function (cls) {
      var thing = find(prims, cls);
      if (!thing) return;
      placed([thing], [1, 0, 0, 1, 0, 0], []).forEach(function (shape) {
        var pad = (shape.p.sw || 0) / 2;
        var b = bbox(shape.pts);
        eyeBoxes.forEach(function (e) {
          var overlap = b.x0 - pad < e.x1 && b.x1 + pad > e.x0 && b.y0 - pad < e.y1 && b.y1 + pad > e.y0;
          if (!overlap) return;
          // A box may overlap at a corner: then no point of the thing may be inside the eye's box.
          shape.pts.forEach(function (q) {
            assert.ok(!(q[0] > e.x0 - pad && q[0] < e.x1 + pad && q[1] > e.y0 - pad && q[1] < e.y1 + pad), name(look) + ': ' + cls + ' over an eye at ' + q.map(function (n) { return n.toFixed(1); }));
          });
        });
      });
    });
  });
});

test('svg: each clipped group has its <clipPath>, named after its own ellipse; still pictures keep the pupils clipped', function () {
  LOOKS.forEach(function (look) {
    [false, true].forEach(function (still) {
      var text = Svg.render(look, { still: still });
      var refs = text.match(/clip-path="url\(#[^)]+\)"/g) || [];
      var eyes = eyesOf(Shapes.creature(look)).eyes.length;
      assert.strictEqual(refs.length, eyes * (still ? 1 : 2), name(look) + ': clipped groups');
      refs.forEach(function (ref) {
        var id = /#([^)]+)/.exec(ref)[1];
        var def = new RegExp('<clipPath id="' + id + '"><ellipse cx="([\\d.]+)" cy="([\\d.]+)" rx="([\\d.]+)" ry="([\\d.]+)"/></clipPath>').exec(text);
        assert.ok(def, name(look) + ': no <clipPath> for ' + id);
        assert.strictEqual('pt-clip-' + def.slice(1).join('-').replace(/\./g, '_'), id, name(look) + ': the id is not its ellipse');
      });
      assert.strictEqual(text.indexOf('class="pt-blink"') >= 0, !still && eyes > 0, name(look) + ': blink lids');
    });
  });
});

test('draw: the Canvas walker clips the pupils too, and skips the blink', function () {
  var clips = [];
  var depth = 0;
  Draw.walk(Shapes.creature(Look.look('calm')), {
    save: function () { depth++; },
    restore: function () { depth--; },
    translate: function () {},
    rotate: function () {},
    scale: function () {},
    clip: function (cx, cy, rx, ry) { clips.push([cx, cy, rx, ry]); },
    path: function () {},
    ellipse: function () {}
  }, Look.PALETTES.moss);
  assert.strictEqual(depth, 0);
  assert.strictEqual(clips.length, 2, 'one clip an eye (the blink is not drawn)');
  assert.ok(Math.abs(clips[0][0] + clips[1][0] - 2 * CX) < 0.01);
});

console.log('pet eyes: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
