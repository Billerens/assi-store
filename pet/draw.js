// Walks the same primitives as svg.js and draws them through an adapter: on the phone the
// adapter is android.graphics.Canvas (main.js), in the tests — a recorder. Pure.
//
// adapter: { save(), restore(), translate(x, y), rotate(deg, ox, oy), scale(s, ox, oy),
//            path(commands, paint), ellipse(cx, cy, rx, ry, paint), clip(cx, cy, rx, ry) — optional }
// commands: [['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y], ['Q', x1, y1, x, y], ['Z']]
// paint: { fill: '#RRGGBB' | null, stroke: '#RRGGBB' | null, width, round, opacity }

var SIZES = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };

/** 'M0 0 L10 0 Z' → [['M', 0, 0], ['L', 10, 0], ['Z']]. Only absolute M, L, C, Q, Z. */
exports.parse = function (d) {
  var tokens = String(d).match(/[MLCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  var out = [];
  var cmd = null;
  var i = 0;
  while (i < tokens.length) {
    var tok = tokens[i];
    if (/^[MLCQZ]$/i.test(tok)) {
      cmd = tok.toUpperCase();
      i++;
      if (cmd === 'Z') {
        out.push(['Z']);
        continue;
      }
    }
    if (!cmd || cmd === 'Z') throw new Error('path: числа без команды в «' + d + '»');
    var n = SIZES[cmd];
    var item = [cmd];
    for (var k = 0; k < n; k++) {
      if (i >= tokens.length) throw new Error('path: не хватает чисел в «' + d + '»');
      item.push(Number(tokens[i++]));
    }
    out.push(item);
    // Numbers after an M continue as L, as in SVG.
    if (cmd === 'M') cmd = 'L';
  }
  return out;
};

function paintOf(p, colors) {
  var pick = function (value) {
    if (!value || value === 'none') return null;
    if (value === 'BODY') return colors.body;
    if (value === 'DARK') return colors.dark;
    if (colors.room && colors.room[value]) return colors.room[value];
    return value;
  };
  return {
    fill: pick(p.fill),
    stroke: p.stroke ? pick(p.stroke) : null,
    width: p.sw || 1,
    round: p.cap === 'round',
    opacity: p.op === undefined ? 1 : p.op
  };
}

/** Draws a list of primitives; animation-only ones (blink lids, steam) are left out. Returns the count drawn. */
exports.walk = function (prims, adapter, colors) {
  var count = 0;
  var visit = function (p) {
    if (!p || p.anim) return;
    if (p.t === 'g') {
      adapter.save();
      if (p.tf) {
        if (p.tf.x || p.tf.y) adapter.translate(p.tf.x || 0, p.tf.y || 0);
        if (p.tf.rot) adapter.rotate(p.tf.rot, p.tf.ox || 0, p.tf.oy || 0);
        if (p.tf.s && p.tf.s !== 1) adapter.scale(p.tf.s, p.tf.ox || 0, p.tf.oy || 0);
      }
      // A group may be clipped to an ellipse (the pupils to their eye); an adapter without clip
      // draws it unclipped — the shapes fit at rest anyway.
      if (p.clip && typeof adapter.clip === 'function') adapter.clip(p.clip.cx, p.clip.cy, p.clip.rx, p.clip.ry);
      p.kids.forEach(visit);
      adapter.restore();
      return;
    }
    var paint = paintOf(p, colors);
    if (p.t === 'ellipse') adapter.ellipse(p.cx, p.cy, p.rx, p.ry, paint);
    else adapter.path(exports.parse(p.d), paint);
    count++;
  };
  prims.forEach(visit);
  return count;
};
