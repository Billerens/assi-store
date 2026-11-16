// The stage scenes of «Эволюция»: eight background paintings, one per stage, and the cells of the
// biome map. Each painting is an SVG 320×200 in several layers of depth with its own palette.
//   EvoScenes.build(stage)        the markup of a scene (stage 5 gives the sea and the island under the map)
//   EvoScenes.update(root, info)  info = {level: 0..10, flags: {name: true}}: shows what has grown so far
//   EvoScenes.hex(biome, o)       a map cell 44×50: o = {water, owned, open, selected, n}
// Parts marked data-lv / data-flag fade in as the stage grows; motion is CSS (ui/game.css, classes
// sa-*), so reduced motion stops it in one place.
(function () {
  'use strict';

  function rnd(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function o(v) { return v === undefined || v === 1 ? '' : ' opacity="' + v + '"'; }
  function c(x, y, r, fill, op) { return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="' + fill + '"' + o(op) + '/>'; }
  function el(x, y, rx, ry, fill, op, rot) {
    return '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="' + fill + '"' + o(op) + (rot ? ' transform="rotate(' + f(rot) + ' ' + f(x) + ' ' + f(y) + ')"' : '') + '/>';
  }
  function p(d, fill, op) { return '<path d="' + d + '" fill="' + fill + '"' + o(op) + '/>'; }
  function ln(d, stroke, w, op, dash) {
    return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 1) + '" stroke-linecap="round" stroke-linejoin="round"' + o(op) + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }
  function ring(x, y, r, stroke, w, op) { return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 1) + '"' + o(op) + '/>'; }
  function rect(x, y, w, h, fill, op, rx) { return '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" fill="' + fill + '"' + o(op) + (rx ? ' rx="' + rx + '"' : '') + '/>'; }
  function at(x, y, body, more) { return '<g transform="translate(' + f(x) + ' ' + f(y) + ')' + (more ? ' ' + more : '') + '">' + body + '</g>'; }
  function lv(n, body) { return n <= 0 ? body : '<g data-lv="' + n + '">' + body + '</g>'; }
  function flag(name, body) { return '<g data-flag="' + name + '">' + body + '</g>'; }
  // An animated group: the class picks the motion, d its period, shift where in the period it starts.
  function an(kind, d, shift, body, vars) {
    return '<g class="sa sa-' + kind + '" style="--d:' + f(d) + 's;--dl:-' + f(d * (shift || 0)) + 's' + (vars ? ';' + vars : '') + '">' + body + '</g>';
  }
  function lg(id, stops, horizontal) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (horizontal ? 1 : 0) + '" y2="' + (horizontal ? 0 : 1) + '">' + stopsOf(stops) + '</linearGradient>';
  }
  function rg(id, cx, cy, r, stops) {
    return '<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + cx + '" cy="' + cy + '" r="' + r + '">' + stopsOf(stops) + '</radialGradient>';
  }
  function stopsOf(stops) {
    return stops.map(function (s) {
      return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] === undefined ? '' : ' stop-opacity="' + s[2] + '"') + '/>';
    }).join('');
  }
  function bg(fill) { return '<rect x="-40" y="-40" width="400" height="280" fill="' + fill + '"/>'; }
  function rays(list, id, period) {
    return list.map(function (r, i) {
      return an('twinkle', period + i * 1.7, i * 0.23, p('M' + r[0] + ' -40L' + (r[0] + r[1]) + ' -40L' + (r[2] + r[3]) + ' 190L' + r[2] + ' 190Z', 'url(#' + id + ')'));
    }).join('');
  }
  function bubbles(R, n, x0, x1, y0, col, rise) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var x = x0 + R() * (x1 - x0);
      out += an('rise', 5 + R() * 6, R(), ring(x, y0 - R() * 12, 1 + R() * 2.4, col, 0.8, 0.8), '--ty:-' + f(rise * (0.7 + R() * 0.5)) + 'px;--tx:' + f(R() * 14 - 7) + 'px');
    }
    return out;
  }

  // ---- 1. the broth: warm murky water, light from above, vents, molecules, the first protocells ----
  function broth() {
    var R = rnd(11);
    var s = '<defs>' +
      lg('evs1-bg', [[0, '#7d8a4c'], [0.14, '#4d6a4c'], [0.5, '#22403b'], [1, '#0b181b']]) +
      rg('evs1-sun', 160, -20, 190, [[0, '#f6e7a6', 0.7], [0.5, '#e2cf86', 0.18], [1, '#e2cf86', 0]]) +
      lg('evs1-ray', [[0, '#f4ecc0', 0.3], [1, '#f4ecc0', 0]]) +
      rg('evs1-vent', 0, 0, 30, [[0, '#ffbe6a', 0.75], [1, '#ff8a3a', 0]]) +
      rg('evs1-cell', 0, 0, 14, [[0, '#d9f2c8', 0.1], [0.75, '#9fdcc0', 0.28], [1, '#d9f2c8', 0.55]]) +
      '</defs>';
    s += bg('url(#evs1-bg)') + bg('url(#evs1-sun)');
    s += an('drift', 9, 0.2, p('M-40 -40H360V9Q330 15 300 9T240 9T180 9T120 9T60 9T0 9T-40 9Z', '#e6dc98', 0.4), '--tx:16px;--ty:0px');
    s += rays([[40, 34, -30, 70], [118, 22, 96, 60], [176, 40, 190, 84], [262, 26, 300, 66]], 'evs1-ray', 8);
    // The lightning strikes the surface: the bolt above, the flash below.
    s += flag('p0', an('flash', 7, 0.1, ln('M112 -40L104 -16L113 -14L100 12', '#fff8d2', 2.4) + el(100, 12, 46, 9, '#fff6c4', 0.5)) +
      an('flash', 11, 0.6, ln('M236 -40L242 -14L233 -12L244 10', '#fff8d2', 2) + el(244, 10, 36, 7, '#fff6c4', 0.45)));
    // Far ridge with the vents.
    s += p('M-40 152Q-6 128 30 140T96 132T150 146T214 126T270 140T360 124V240H-40Z', '#19342f', 0.9);
    function vent(x, y, h, w) {
      return at(x, y, c(0, -h, 22, 'url(#evs1-vent)') +
        p('M' + -w + ' 6L' + f(-w * 0.45) + ' ' + -h + 'Q0 ' + f(-h - 5) + ' ' + f(w * 0.45) + ' ' + -h + 'L' + w + ' 6Z', '#2b2c26') +
        p('M' + f(-w * 0.45) + ' ' + -h + 'Q0 ' + f(-h - 5) + ' ' + f(w * 0.45) + ' ' + -h + 'Q0 ' + f(-h + 4) + ' ' + f(-w * 0.45) + ' ' + -h + 'Z', '#ffb760', 0.9) +
        ln('M' + f(-w * 0.6) + ' ' + f(-h * 0.5) + 'h' + f(w * 0.7) + 'M' + f(-w * 0.2) + ' ' + f(-h * 0.2) + 'h' + f(w * 0.8), '#4a4a3c', 1.2) +
        [0, 1, 2, 3].map(function (i) {
          return an('rise', 4.5 + i * 0.8, i * 0.27, c(i * 2 - 3, -h - 4, 3 + i, '#f0b070', 0.35), '--ty:-' + (40 + i * 9) + 'px;--tx:' + (i * 4 - 6) + 'px');
        }).join(''));
    }
    s += vent(214, 132, 30, 9);
    s += flag('p1', vent(62, 140, 38, 11) + vent(84, 144, 22, 8) + lv(6, vent(282, 136, 26, 8)));
    s += bubbles(R, 5, 204, 224, 100, '#e8e6c0', 96);
    s += flag('p1', bubbles(R, 6, 52, 90, 100, '#e8e6c0', 96));
    // Far molecules: small and dim.
    var cols = ['#f0d27a', '#f3ead0', '#e8a384', '#9fdcc0'];
    function mol(kind, col, k) {
      var b;
      if (kind === 0) b = ln('M-6 3L0 -2L6 3', col, 1, 0.7) + c(0, -2, 2.6, col) + c(-6, 3, 1.7, '#f3ead0') + c(6, 3, 1.7, '#f3ead0');
      else if (kind === 1) b = ln('M-9 2L-3 -3L3 2L9 -3', col, 1, 0.7) + c(-9, 2, 2, col) + c(-3, -3, 2.4, '#f3ead0') + c(3, 2, 2, col) + c(9, -3, 2.4, '#e8a384');
      else if (kind === 2) b = ln('M0 -6L5.2 -3V3L0 6L-5.200 3V-3ZM5.2 -3L10 -6', col, 1, 0.7) + c(0, -6, 1.8, col) + c(5.2, 3, 1.8, col) + c(-5.2, 3, 1.8, col) + c(10, -6, 2.2, '#f3ead0') + c(-5.2, -3, 1.6, '#9fdcc0') + c(5.2, -3, 1.6, col) + c(0, 6, 1.6, '#e8a384');
      else b = ln('M-4 0H4', col, 1, 0.7) + c(-4, 0, 2.6, col) + c(4, 0, 2, '#f3ead0');
      return '<g transform="scale(' + k + ')">' + b + '</g>';
    }
    function mols(n, y0, y1, k, op, levels) {
      var out = '';
      for (var i = 0; i < n; i++) {
        var one = at(14 + R() * 292, y0 + R() * (y1 - y0), an('drift', 7 + R() * 8, R(), '<g opacity="' + op + '" transform="rotate(' + f(R() * 360) + ')">' + mol(i % 4, cols[(i + n) % 4], k) + '</g>', '--tx:' + f(R() * 18 - 9) + 'px;--ty:' + f(R() * 14 - 7) + 'px'));
        out += lv(levels ? levels[i % levels.length] : 0, one);
      }
      return out;
    }
    s += mols(4, 34, 110, 0.6, 0.5) + mols(8, 30, 120, 0.6, 0.5, [1, 3, 5, 7, 2, 4, 8, 9]);
    // Middle ridge with clay beds.
    s += p('M-40 176Q0 152 44 166T120 160T190 170T262 154T360 168V240H-40Z', '#11241f');
    function clay(x, y, k) {
      return at(x, y, '<g transform="scale(' + k + ')">' + p('M-30 6Q-26 -14 -6 -17Q18 -20 30 6Z', '#8d5b3d') + p('M-30 6Q-26 -14 -6 -17Q2 -18 8 -16Q-12 -10 -16 6Z', '#a9744e') +
        ln('M-22 -2Q-4 -8 20 -3M-26 3Q-2 -3 26 2', '#c99468', 1, 0.7) + c(-6, -10, 1.3, '#e9c79a') + c(10, -8, 1, '#e9c79a') + '</g>');
    }
    s += flag('p2', clay(150, 166, 1) + lv(5, clay(268, 160, 0.75)) + lv(8, clay(18, 168, 0.8)));
    // Protocells: a membrane with something inside.
    function proto(x, y, r, i) {
      var k = r / 12;
      return at(x, y, an('drift', 10 + i * 1.3, i * 0.19, an('pulse', 3.6 + i * 0.5, i * 0.3,
        '<g transform="scale(' + f(k) + ')">' + c(0, 0, 12, 'url(#evs1-cell)') + ring(0, 0, 12, '#dff5d2', 1.3, 0.9) + ring(0, 0, 9.6, '#9fdcc0', 0.6, 0.5) +
        c(-3, 2, 2.4, '#f0d27a') + c(4, -2, 1.6, '#e8a384') + c(1, 5, 1.2, '#f3ead0') + ln('M-8 -5Q-5 -9 0 -9.500', '#ffffff', 1.2, 0.7) + '</g>', '--s:1.07'), '--tx:' + (i % 2 ? 9 : -8) + 'px;--ty:' + (i % 3 ? -6 : 7) + 'px'));
    }
    s += flag('p3', proto(128, 92, 13, 0) + proto(246, 74, 9, 1) + lv(4, proto(58, 78, 10, 2)) + lv(7, proto(188, 118, 15, 3) + proto(96, 126, 8, 4)) + lv(9, proto(286, 108, 11, 5)));
    // Near molecules: bigger and brighter.
    s += mols(3, 50, 140, 1, 0.95) + mols(8, 40, 150, 1, 0.95, [2, 4, 6, 8, 10, 3, 5, 9]);
    // Foreground rocks and drifting specks.
    s += p('M-40 240V178Q-18 160 4 176Q22 190 40 240Z', '#07110f') + p('M360 240V170Q332 156 312 176Q296 196 286 240Z', '#07110f') + p('M96 240Q110 186 136 190Q160 194 172 240Z', '#091513');
    for (var i = 0; i < 22; i++) s += c(R() * 320, 20 + R() * 160, 0.5 + R() * 0.7, '#f3ead0', 0.18 + R() * 0.3);
    return s;
  }

  // ---- 2. the cell: a living cell in its medium, daughters gather round as it divides ----
  function cellScene() {
    var R = rnd(23);
    var s = '<defs>' +
      rg('evs2-bg', 160, 96, 230, [[0, '#23736c'], [0.45, '#12474b'], [1, '#061a20']]) +
      rg('evs2-cyto', 160, 100, 62, [[0, '#7fd9c2', 0.75], [0.7, '#3c9f93', 0.7], [1, '#1f6f6b', 0.8]]) +
      rg('evs2-nuc', -4, -5, 24, [[0, '#8fb8e6'], [0.7, '#3d6ea2'], [1, '#27507a']]) +
      rg('evs2-small', -2, -2, 12, [[0, '#a7ecd8', 0.8], [1, '#2f8f86', 0.7]]) +
      '</defs>';
    s += bg('url(#evs2-bg)');
    // Out of focus: other cells far away.
    for (var i = 0; i < 9; i++) {
      var r = 12 + R() * 26;
      s += an('drift', 14 + R() * 10, R(), c(R() * 320, R() * 200, r, '#7fe0cf', 0.05 + R() * 0.05) + '', '--tx:' + f(R() * 16 - 8) + 'px;--ty:' + f(R() * 12 - 6) + 'px');
    }
    for (i = 0; i < 6; i++) {
      var x = R() * 320, y = R() * 200;
      r = 10 + R() * 18;
      s += ring(x, y, r, '#9fe6d6', 1, 0.1) + c(x - r * 0.2, y - r * 0.2, r * 0.3, '#9fe6d6', 0.06);
    }
    // Currents of the medium.
    s += an('drift', 12, 0.3, ln('M-40 40Q40 20 110 44T250 36T360 52M-40 168Q60 150 130 172T270 160T360 176M-40 104Q10 96 40 108', '#9fe6d6', 1.2, 0.13), '--tx:22px;--ty:3px');
    // Nutrients drifting towards the cell.
    for (i = 0; i < 18; i++) {
      x = R() * 320; y = R() * 200;
      if (Math.abs(x - 160) < 70 && Math.abs(y - 100) < 66) continue;
      s += lv(i < 8 ? 0 : i - 7, an('drift', 6 + R() * 6, R(), c(x, y, 1 + R() * 1.4, i % 3 ? '#f1d98a' : '#f3ead0', 0.75), '--tx:' + f((160 - x) * 0.12) + 'px;--ty:' + f((100 - y) * 0.12) + 'px'));
    }
    // Daughter cells: they gather round with every division.
    function small(x, y, r, pair, i) {
      var k = r / 10;
      var one = c(0, 0, 10, 'url(#evs2-small)') + ring(0, 0, 10, '#c4f5e6', 1.2, 0.85) + c(-1.5, 0.5, 3.6, '#3d6ea2') + c(-2.2, -0.3, 1.3, '#c9a0dc') + c(4.5, -3, 1.2, '#e8a384') + c(3.5, 4.5, 1, '#f1d98a');
      var body = pair ? at(-7, 0, one) + at(7, 0, one, 'scale(-1 1)') + ln('M0 -6.5V6.5', '#c4f5e6', 0.8, 0.6) : one;
      return at(x, y, an('drift', 9 + (i % 5) * 1.4, (i % 7) / 7, '<g transform="rotate(' + (i * 47 % 360) + ') scale(' + f(k) + ')">' + body + '</g>', '--tx:' + (i % 2 ? 7 : -6) + 'px;--ty:' + (i % 3 ? -5 : 6) + 'px'));
    }
    var spots = [[52, 52, 9, 0], [268, 150, 11, 1], [276, 48, 8, 0], [44, 150, 10, 0], [236, 22, 7, 1], [86, 180, 8, 0], [24, 98, 7, 0], [300, 100, 9, 1], [96, 20, 7, 0], [216, 184, 8, 0], [14, 30, 6, 0], [306, 178, 7, 0]];
    spots.forEach(function (q, i) { s += lv(i < 2 ? 0 : i - 1, small(q[0], q[1], q[2], q[3], i)); });
    // The cell itself.
    var cell = '';
    var outline = 'M160 44C196 40 222 62 222 98C224 134 198 160 162 160C124 162 98 138 98 102C96 66 122 46 160 44Z';
    var cilia = '';
    for (i = 0; i < 34; i++) {
      var a = i / 34 * Math.PI * 2;
      var bx = 160 + Math.cos(a) * 62, by = 101 + Math.sin(a) * 58;
      cilia += 'M' + f(bx) + ' ' + f(by) + 'q' + f(Math.cos(a + 0.5) * 5) + ' ' + f(Math.sin(a + 0.5) * 5) + ' ' + f(Math.cos(a) * 9) + ' ' + f(Math.sin(a) * 9);
    }
    cell += an('sway', 3.4, 0, ln(cilia, '#a6f0dc', 1, 0.55), '--a:2.5deg;transform-origin:50% 50%');
    cell += p(outline, 'url(#evs2-cyto)') + ln(outline, '#c4f5e6', 2.6) + '<g transform="translate(160 101) scale(0.93) translate(-160 -101)">' + ln(outline, '#2f8f86', 1.4, 0.8) + '</g>';
    // Organelles.
    cell += ln('M182 84q8 -6 14 2t-4 12M186 92q6 -2 8 4M130 124q-8 6 -4 14t12 6M136 130q-4 4 0 8', '#a7ecd8', 1.4, 0.6);
    function mito(x, y, rot) {
      return at(x, y, an('drift', 8, (x % 7) / 7, '<g transform="rotate(' + rot + ')">' + rect(-9, -4.5, 18, 9, '#e39a78', 1, 4.5) + ln('M-6 0l2 -2.500l2 5l2 -5l2 5l2 -5l2 2.500', '#a8563f', 1) + '<rect x="-9" y="-4.5" width="18" height="9" rx="4.5" fill="none" stroke="#f3c2a8" stroke-width="0.8"/></g>', '--tx:3px;--ty:-2px'));
    }
    cell += mito(188, 122, 30) + mito(128, 80, -25) + mito(196, 70, 70) + lv(3, mito(150, 142, 5)) + lv(6, mito(114, 108, 80));
    cell += c(186, 100, 7, '#d6f3ea', 0.35) + ring(186, 100, 7, '#d6f3ea', 0.8, 0.6) + c(142, 62, 5, '#d6f3ea', 0.3) + ring(142, 62, 5, '#d6f3ea', 0.8, 0.5) + c(170, 140, 4, '#d6f3ea', 0.3);
    for (i = 0; i < 20; i++) {
      a = R() * Math.PI * 2; r = 28 + R() * 24;
      cell += c(160 + Math.cos(a) * r, 101 + Math.sin(a) * r * 0.92, 0.9, '#f3ead0', 0.7);
    }
    // The nucleus; from the middle of the stage it shows the spindle of a coming division.
    cell += at(154, 98, c(0, 0, 21, 'url(#evs2-nuc)') + ring(0, 0, 21, '#b9d6f2', 1.4) + ring(0, 0, 17.5, '#8fb8e6', 0.6, 0.5) +
      ln('M-10 -6q4 -5 8 0t8 0M-9 6q5 5 9 0t9 1M-13 0q3 -2 5 1', '#c9a0dc', 1.5, 0.8) + c(4, -1, 5.5, '#c9a0dc') + c(2.5, -2.500, 2, '#eed7f6'));
    cell += lv(5, ln('M108 101Q132 84 154 77M108 101Q132 96 133 98M108 101Q132 118 154 120M212 99Q190 84 154 77M212 99Q186 96 175 98M212 99Q190 116 154 120', '#eed7f6', 0.8, 0.5, '2 3') + c(108, 101, 2, '#eed7f6') + c(212, 99, 2, '#eed7f6'));
    cell += ln('M118 74Q134 54 158 51', '#ffffff', 2, 0.35);
    s += an('pulse', 5, 0, cell, '--s:1.035;transform-origin:160px 101px;transform-box:view-box');
    return s;
  }

  // ---- 3. the multicellular: a shallow garden of fronds, sponges, jellies, worms and first swimmers ----
  function garden() {
    var R = rnd(37);
    var s = '<defs>' +
      lg('evs3-bg', [[0, '#5fb3a0'], [0.2, '#2f8580'], [0.6, '#17525a'], [1, '#0a2830']]) +
      rg('evs3-sun', 190, -30, 200, [[0, '#f2f6c6', 0.65], [0.5, '#bfe6c0', 0.15], [1, '#bfe6c0', 0]]) +
      lg('evs3-ray', [[0, '#eefad6', 0.26], [1, '#eefad6', 0]]) +
      lg('evs3-sand', [[0, '#55745c'], [1, '#1c3331']]) +
      '</defs>';
    s += bg('url(#evs3-bg)') + bg('url(#evs3-sun)');
    s += an('drift', 8, 0.4, p('M-40 -40H360V7Q326 13 296 7T236 7T176 7T116 7T56 7T-4 7T-40 7Z', '#dff3cf', 0.4), '--tx:18px;--ty:0px');
    s += rays([[70, 30, 20, 76], [150, 26, 138, 70], [214, 44, 236, 90], [286, 22, 318, 60]], 'evs3-ray', 7);
    // A frond: a stem with paired leaflets, like the first large fixed animals.
    function frond(h, col, dark) {
      var body = ln('M0 0Q' + f(h * 0.06) + ' ' + f(-h * 0.5) + ' 0 ' + -h, dark, Math.max(1, h / 28));
      var n = Math.max(4, Math.round(h / 7));
      for (var i = 1; i <= n; i++) {
        var y = -h * i / (n + 0.6), w = (h * 0.24) * (1 - Math.abs(i / n - 0.45) * 1.1) + 2;
        body += el(-w * 0.55, y - w * 0.3, w * 0.62, w * 0.24, col, 1, 28) + el(w * 0.55, y - w * 0.3, w * 0.62, w * 0.24, col, 1, -28);
      }
      return body + el(0, -h - 1, h * 0.05 + 1, h * 0.09 + 1.5, col);
    }
    function sway(x, y, body, i, a) { return at(x, y, an('sway', 4 + (i % 5) * 0.7, (i % 6) / 6, body, '--a:' + (a || 4) + 'deg')); }
    // Far layer: silhouettes.
    s += p('M-40 150Q10 132 60 142T160 136T240 146T360 130V240H-40Z', '#174a4c', 0.9);
    for (var i = 0; i < 9; i++) s += sway(10 + i * 37 + R() * 14, 142 + R() * 6, '<g opacity="0.75">' + frond(26 + R() * 30, '#1f5e5c', '#174a4c') + '</g>', i, 3);
    // Swimmers far away.
    function swimmer(col, dark) {
      return el(0, 0, 10, 3.6, col) + p('M-9 0L-16 -5L-14 0L-16 5Z', col) + ln('M-5 -3.5l-2 -4M-1 -3.800l-2 -4.500M3 -3.500l-2 -4M-5 3.500l-2 4M-1 3.800l-2 4.500M3 3.500l-2 4', dark, 1) +
        ln('M9 -1q5 -3 6 -7M9 1q5 3 6 7', col, 1) + c(6, -1, 1.2, '#10262a');
    }
    s += flag('p4', an('swim', 26, 0.3, at(-40, 62, '<g opacity="0.55" transform="scale(0.7)">' + swimmer('#bfd8a0', '#7fa070') + '</g>'), '--tx:420px') +
      lv(6, an('swim', 34, 0.7, at(360, 40, '<g opacity="0.5" transform="scale(-0.6 0.6)">' + swimmer('#bfd8a0', '#7fa070') + '</g>'), '--tx:-420px')));
    // Jellies.
    function jelly(x, y, k, col, i) {
      var bell = p('M-13 0Q-14 -17 0 -18Q14 -17 13 0Q9 3 6.500 0Q3 3 0 0Q-3 3 -6.500 0Q-9 3 -13 0Z', col, 0.6) + ln('M-13 0Q-14 -17 0 -18Q14 -17 13 0', '#fbeefc', 1, 0.8) +
        el(0, -9, 6, 4, '#fbeefc', 0.35) + ln('M-8 -10Q-6 -15 -1 -15.500', '#ffffff', 1, 0.6);
      var legs = ln('M-9 2q-3 8 0 14t-1 10M-3 2q2 9 -1 15t1 12M3 2q-2 9 1 15t-1 12M9 2q3 8 0 14t1 10', col, 1, 0.75);
      return at(x, y, an('drift', 9 + i * 2, i * 0.3, '<g transform="scale(' + k + ')">' + an('sway', 3 + i * 0.4, 0.2, legs, '--a:5deg;transform-origin:50% 0%') + an('jelly', 3 + i * 0.4, 0, bell) + '</g>', '--tx:' + (i % 2 ? 12 : -10) + 'px;--ty:-16px'));
    }
    s += flag('p2', jelly(236, 64, 1, '#e7c2ee', 0) + jelly(84, 46, 0.65, '#c9d6f4', 1) + lv(5, jelly(150, 78, 0.8, '#f2c4c8', 2)) + lv(8, jelly(292, 104, 0.55, '#e7c2ee', 3)));
    // The seabed.
    s += p('M-40 170Q20 154 70 164T170 160T260 168T360 156V240H-40Z', 'url(#evs3-sand)');
    s += ln('M-40 170Q20 154 70 164T170 160T260 168T360 156', '#8fae84', 1.2, 0.6);
    for (i = 0; i < 14; i++) s += el(R() * 320, 174 + R() * 22, 2 + R() * 4, 1 + R() * 1.5, i % 2 ? '#3f5f50' : '#6f8f72', 0.7);
    // Colonies: clumps of round cells on stones.
    function colony(x, y, k) {
      var b = el(0, 4, 17, 6, '#24403b');
      [[-9, -1, 5], [0, -4, 6.5], [9, -1, 5], [-4, -9, 4.5], [5, -10, 4], [0, -14, 3]].forEach(function (q) {
        b += c(q[0], q[1], q[2], '#a9cf7c') + c(q[0] - q[2] * 0.25, q[1] - q[2] * 0.25, q[2] * 0.45, '#d7ecab') + c(q[0] + q[2] * 0.2, q[1] + q[2] * 0.2, q[2] * 0.3, '#5f8748');
      });
      return at(x, y, '<g transform="scale(' + k + ')">' + b + '</g>');
    }
    s += flag('p0', colony(118, 168, 1) + lv(4, colony(214, 172, 0.75)) + lv(8, colony(22, 172, 0.8)));
    // Sponges: tubes with a dark mouth.
    function sponge(x, y, k) {
      function tube(dx, h, w, col, dark) {
        return p('M' + (dx - w * 0.7) + ' 2Q' + (dx - w * 1.1) + ' ' + f(-h * 0.5) + ' ' + (dx - w) + ' ' + -h + 'H' + (dx + w) + 'Q' + (dx + w * 1.1) + ' ' + f(-h * 0.5) + ' ' + (dx + w * 0.7) + ' 2Z', col) +
          el(dx, -h, w, w * 0.4, dark) + el(dx, -h, w * 0.7, w * 0.24, '#3a2420') + c(dx - w * 0.3, -h * 0.6, 0.9, dark) + c(dx + w * 0.3, -h * 0.35, 0.9, dark) + c(dx, -h * 0.2, 0.8, dark);
      }
      return at(x, y, '<g transform="scale(' + k + ')">' + tube(-9, 22, 5, '#d98a6a', '#a8563f') + tube(8, 30, 6, '#e6b072', '#b0832a') + tube(0, 16, 4.5, '#e39a78', '#a8563f') + '</g>');
    }
    s += flag('p1', sponge(262, 170, 1) + lv(5, sponge(60, 170, 0.75)) + lv(9, sponge(168, 166, 0.6)));
    // Fronds near: green and rose.
    var near = [[34, 172, 46, 0], [300, 168, 54, 0], [146, 172, 34, 0], [88, 176, 40, 2], [232, 176, 36, 4], [190, 178, 28, 6], [6, 178, 34, 8], [276, 180, 26, 10]];
    near.forEach(function (q, i) {
      var rose = i % 3 === 1;
      s += lv(q[3], sway(q[0], q[1], frond(q[2], rose ? '#e3a3b4' : i % 2 ? '#c9dc8c' : '#9bd08a', rose ? '#a8647a' : '#5f8748'), i, 5));
    });
    // Worms on the sand.
    function worm(x, y, k, flip) {
      var b = '';
      for (var i = 0; i < 9; i++) b += c(-16 + i * 4, Math.sin(i * 0.9) * 2.4, 3.2 - Math.abs(i - 4) * 0.22, i % 2 ? '#d98a8a' : '#e9a9a0');
      b += c(18, Math.sin(8 * 0.9) * 2.4 - 0.8, 0.8, '#3a2420') + ln('M19 1q4 -2 6 -5M19 2q4 1 7 0', '#e9a9a0', 0.8);
      return at(x, y, an('drift', 7, k, '<g transform="scale(' + (flip ? -k : k) + ' ' + k + ')">' + b + '</g>', '--tx:' + (flip ? -9 : 9) + 'px;--ty:0px'));
    }
    s += flag('p3', worm(186, 186, 1, false) + lv(6, worm(76, 190, 0.8, true)));
    // Swimmers near.
    s += flag('p4', an('swim', 18, 0.1, at(-40, 112, an('drift', 2.4, 0, swimmer('#f0d68a', '#b0832a'), '--tx:0px;--ty:-5px')), '--tx:420px') +
      lv(7, an('swim', 22, 0.55, at(360, 134, '<g transform="scale(-0.8 0.8)">' + swimmer('#f3c2a8', '#a8563f') + '</g>'), '--tx:-420px')));
    // Spores rising.
    for (i = 0; i < 12; i++) s += lv(i < 5 ? 0 : i - 2, an('rise', 9 + R() * 6, R(), c(R() * 320, 150 + R() * 30, 0.8 + R() * 0.8, '#eefad6', 0.7), '--ty:-' + f(90 + R() * 50) + 'px;--tx:' + f(R() * 20 - 10) + 'px'));
    return s;
  }

  // ---- 4. the ocean: blue depth, kelp, shoals, a hunter passing in the distance ----
  function ocean() {
    var R = rnd(53);
    var s = '<defs>' +
      lg('evs4-bg', [[0, '#3f97c4'], [0.2, '#1f6a9c'], [0.6, '#0d3a66'], [1, '#051426']]) +
      rg('evs4-sun', 120, -30, 210, [[0, '#dff4ff', 0.6], [0.5, '#8fd0f0', 0.14], [1, '#8fd0f0', 0]]) +
      lg('evs4-ray', [[0, '#e6f7ff', 0.24], [1, '#e6f7ff', 0]]) +
      lg('evs4-kelp', [[0, '#8fc46a'], [1, '#2f6a4a']]) +
      '</defs>';
    s += bg('url(#evs4-bg)') + bg('url(#evs4-sun)');
    s += an('drift', 7, 0.1, p('M-40 -40H360V8Q328 15 296 8T232 8T168 8T104 8T40 8T-40 8Z', '#d9f1ff', 0.45), '--tx:20px;--ty:0px');
    s += rays([[20, 30, -20, 60], [92, 24, 60, 64], [150, 40, 150, 90], [228, 24, 262, 60], [290, 30, 340, 70]], 'evs4-ray', 6);
    function fish(col, belly, k) {
      return '<g transform="scale(' + k + ')">' + p('M-10 0Q-3 -6 6 -3Q10 -1.500 11 0Q10 1.500 6 3Q-3 6 -10 0Z', col) + p('M-9 0L-16 -5.500Q-13.500 0 -16 5.500Z', col) + p('M-2 -4.200L2 -8L4 -3.500Z', col) +
        p('M-8 0.5Q-2 4.800 6 2.600Q-2 2.500 -8 0.5Z', belly, 0.8) + c(7, -0.8, 1, '#061a2c') + '</g>';
    }
    function hunter(col, dark) {
      return p('M-46 0Q-20 -15 14 -10Q36 -7 48 0Q36 7 14 9Q-20 13 -46 0Z', col) + p('M-44 0L-66 -16Q-58 -2 -64 14Z', col) + p('M-6 -12L8 -30L14 -10Z', col) + p('M2 8L-8 22L16 9Z', col) +
        p('M-40 1Q-10 9 30 5Q44 3 48 0Q36 7 14 9Q-20 13 -46 0Z', dark, 0.6) + ln('M26 -4v8M30 -4v8M34 -3.500v7', dark, 1, 0.8) + c(40, -2.500, 1.6, '#e6f7ff') + ln('M36 3.500Q42 4 47 1', dark, 1);
    }
    // Far: the hunter and the far kelp.
    s += flag('p2', an('swim', 40, 0.3, at(420, 70, '<g transform="scale(-0.9 0.9)" opacity="0.7">' + hunter('#0f3d66', '#0a2c4c') + '</g>'), '--tx:-520px'));
    s += p('M-40 150Q0 130 46 142T130 134T210 146T290 132T360 140V240H-40Z', '#0b3157', 0.95);
    function kelp(h, w, col, n) {
      var d = 'M0 0', y = 0, body = '';
      for (var i = 0; i < n; i++) {
        var step = h / n, side = i % 2 ? 1 : -1;
        d += 'Q' + f(side * w) + ' ' + f(y - step / 2) + ' 0 ' + f(y - step);
        body += el(side * w * 0.85, y - step / 2, w * 0.85, step * 0.2, col, 1, side * -35);
        y -= step;
      }
      return ln(d, col, Math.max(1.4, w * 0.3)) + body;
    }
    function sway(x, y, body, i, a) { return at(x, y, an('sway', 4.5 + (i % 5) * 0.8, (i % 6) / 6, body, '--a:' + (a || 4) + 'deg')); }
    for (var i = 0; i < 8; i++) s += sway(8 + i * 42 + R() * 16, 144 + R() * 6, '<g opacity="0.8">' + kelp(34 + R() * 40, 4, '#12456a', 5) + '</g>', i, 3);
    // Shoals of grazers.
    function shoal(n, col, belly, seed) {
      var Q = rnd(seed), b = '';
      for (var i = 0; i < n; i++) b += at(Q() * 70 - 35, Q() * 34 - 17, an('drift', 1.6 + Q(), Q(), fish(col, belly, 0.55 + Q() * 0.3), '--tx:0px;--ty:' + f(Q() * 4 - 2) + 'px'));
      return b;
    }
    s += flag('p1', an('swim', 24, 0.35, at(-60, 78, shoal(9, '#f1d98a', '#fff6d2', 5)), '--tx:460px') +
      lv(4, an('swim', 30, 0.8, at(390, 46, '<g transform="scale(-0.8 0.8)" opacity="0.85">' + shoal(8, '#9fd8e8', '#e6f7ff', 9) + '</g>'), '--tx:-470px')) +
      lv(8, an('swim', 20, 0.05, at(-60, 124, '<g transform="scale(0.9)">' + shoal(7, '#f3a98a', '#ffe2d2', 13) + '</g>'), '--tx:460px')));
    // The reef.
    s += p('M-40 174Q-10 156 30 166T100 170T170 160T240 172T300 160T360 168V240H-40Z', '#0b2440');
    function coral(x, y, k, col, dark) {
      return at(x, y, '<g transform="scale(' + k + ')">' + ln('M0 2V-12M0 -6L-8 -16M0 -8L7 -18M-8 -16L-12 -22M-8 -16L-5 -24M7 -18L4 -26M7 -18L12 -24M0 -12V-22', col, 3) + ln('M0 2V-12M0 -6L-8 -16', dark, 1, 0.5) +
        c(-12, -22, 1.8, '#ffe2d2') + c(-5, -24, 1.8, '#ffe2d2') + c(4, -26, 1.8, '#ffe2d2') + c(12, -24, 1.8, '#ffe2d2') + c(0, -22, 1.8, '#ffe2d2') + '</g>');
    }
    function dome(x, y, k, col, light) {
      return at(x, y, '<g transform="scale(' + k + ')">' + p('M-14 3Q-14 -12 0 -12Q14 -12 14 3Z', col) + ln('M-9 -1q3 -4 6 0t6 0t6 0M-10 -6q4 -4 8 0t8 0', light, 1, 0.8) + '</g>');
    }
    function anemone(x, y, k, col) {
      var b = rect(-4, -4, 8, 8, '#7a3f58', 1, 2);
      for (var i = 0; i < 7; i++) b += ln('M' + (i - 3) * 1.3 + ' -4q' + (i - 3) * 2 + ' -6 ' + (i - 3) * 3 + ' -11', col, 1.6);
      return at(x, y, an('sway', 3, x % 5 / 5, '<g transform="scale(' + k + ')">' + b + '</g>', '--a:6deg'));
    }
    s += coral(58, 170, 1, '#e0917a', '#a8563f') + dome(96, 172, 0.9, '#cf7d96', '#f2c4d2') + anemone(206, 168, 1, '#f1d98a') + lv(3, coral(252, 172, 0.8, '#f1b06a', '#b0832a')) +
      lv(5, dome(168, 166, 0.7, '#8f7fc8', '#cfc6f0') + anemone(18, 170, 0.9, '#f3a98a')) + lv(7, coral(134, 172, 0.7, '#e7a0b8', '#a8647a')) + lv(9, dome(292, 166, 0.8, '#e0917a', '#ffd2c0') + coral(310, 170, 0.6, '#e0917a', '#a8563f'));
    // Kelp near.
    var near = [[20, 178, 96, 0], [296, 176, 110, 0], [120, 180, 60, 2], [230, 180, 74, 4], [50, 182, 66, 6], [270, 184, 56, 8], [186, 184, 46, 10]];
    near.forEach(function (q, i) { s += flag('p0', lv(q[3], sway(q[0], q[1], kelp(q[2], 6, 'url(#evs4-kelp)', Math.round(q[2] / 12)), i, 4))); });
    // A hunter close by when the sea is full.
    s += flag('p2', lv(6, an('swim', 28, 0.6, at(-90, 104, '<g transform="scale(0.62)">' + hunter('#5f86a8', '#34587c') + '</g>'), '--tx:520px')));
    s += bubbles(R, 5, 50, 70, 150, '#d9f1ff', 130) + bubbles(R, 4, 200, 214, 152, '#d9f1ff', 130);
    for (i = 0; i < 26; i++) s += lv(i < 10 ? 0 : Math.ceil((i - 9) / 1.6), c(R() * 320, 20 + R() * 150, 0.5 + R() * 0.8, '#bfe6f6', 0.25 + R() * 0.35));
    s += p('M-40 240V184Q-14 172 6 186Q20 200 30 240Z', '#04101e') + p('M360 240V188Q336 176 318 190Q306 204 300 240Z', '#04101e');
    return s;
  }

  // ---- 5. the land: the sea round the map of biomes; the island itself is drawn under the cells ----
  function land() {
    var R = rnd(71);
    var s = '<defs>' + rg('evs5-sea', 160, 100, 240, [[0, '#2b7f8c'], [0.5, '#195a70'], [1, '#0c2f47']]) + '</defs>';
    s += bg('url(#evs5-sea)');
    for (var i = 0; i < 34; i++) {
      var x = R() * 400 - 40, y = R() * 280 - 40;
      s += an('drift', 5 + R() * 4, R(), ln('M' + f(x) + ' ' + f(y) + 'q4 -3 8 0t8 0', '#9fd8e0', 1, 0.35), '--tx:7px;--ty:0px');
    }
    s += an('swim', 60, 0.2, at(-150, 30, el(0, 0, 60, 16, '#ffffff', 0.08) + el(34, 10, 44, 12, '#ffffff', 0.07)), '--tx:620px');
    s += an('swim', 80, 0.7, at(-150, 150, el(0, 0, 70, 18, '#ffffff', 0.07) + el(-30, -8, 40, 10, '#ffffff', 0.06)), '--tx:620px');
    return s;
  }
  // The island under the cells: shallows, surf, beach and soil round every cell centre (in map pixels).
  function island(centres) {
    function pass(r, fill, op) { return '<g' + o(op) + '>' + centres.map(function (q) { return c(q[0], q[1], r, fill); }).join('') + '</g>'; }
    return '<svg class="ev-island ev-scene-art" viewBox="0 0 310 286" width="310" height="286" aria-hidden="true">' +
      pass(46, '#4fb0b4', 0.3) + an('pulse', 5, 0, pass(39, '#d6efe6', 0.4), '--s:1.015') + pass(35, '#d3c49c') + pass(31, '#4a5a3c') + '</svg>';
  }

  // ---- 6. the tribe: dusk, a camp round the fire, the first people ----
  function tribe() {
    var R = rnd(89);
    var s = '<defs>' +
      lg('evs6-sky', [[0, '#15163a'], [0.3, '#3a2c5c'], [0.52, '#8a4a5a'], [0.66, '#d9824e'], [0.74, '#f2b566']]) +
      rg('evs6-fire', 160, 164, 120, [[0, '#ffb04a', 0.75], [0.35, '#ff7a2a', 0.3], [1, '#ff7a2a', 0]]) +
      rg('evs6-moon', 258, 34, 40, [[0, '#f6efd6', 0.35], [1, '#f6efd6', 0]]) +
      lg('evs6-ground', [[0, '#2a2a26'], [1, '#0d1110']]) +
      '</defs>';
    s += bg('url(#evs6-sky)');
    for (var i = 0; i < 44; i++) {
      var x = R() * 400 - 40, y = R() * 90 - 36, r = 0.4 + R() * 0.8;
      s += i % 3 ? c(x, y, r, '#f6efd6', 0.4 + R() * 0.5) : an('twinkle', 2.5 + R() * 3, R(), c(x, y, r + 0.2, '#fffbe6'));
    }
    s += c(258, 34, 40, 'url(#evs6-moon)') + p('M258 20A14 14 0 1 0 271 40A11 11 0 1 1 258 20Z', '#f6efd6');
    s += an('swim', 90, 0.4, at(-120, 62, el(0, 0, 50, 5, '#f2b566', 0.25) + el(30, 5, 36, 3.5, '#f2b566', 0.18)), '--tx:560px');
    // Mountains, hills, the plain.
    s += p('M-40 132L-6 104L20 118L58 84L84 106L120 92L150 116L196 86L230 110L262 96L300 118L332 100L360 114V240H-40Z', '#3a2c50');
    s += p('M58 84L66 96L52 98ZM196 86L206 99L188 100Z', '#b98a9a', 0.5);
    s += p('M-40 140Q10 120 60 132T160 128T250 136T360 122V240H-40Z', '#251f33');
    function pine(x, y, h, col) {
      return at(x, y, an('sway', 5 + (x % 4), (x % 7) / 7, rect(-1, -3, 2, 5, col) + p('M0 ' + -h + 'L' + f(h * 0.26) + ' ' + f(-h * 0.5) + 'H' + f(h * 0.13) + 'L' + f(h * 0.34) + ' -3H' + f(-h * 0.34) + 'L' + f(-h * 0.13) + ' ' + f(-h * 0.5) + 'H' + f(-h * 0.26) + 'Z', col), '--a:1.5deg'));
    }
    [[-8, 24], [12, 30], [30, 22], [286, 26], [304, 34], [322, 24], [338, 30]].forEach(function (q) { s += pine(q[0], 142, q[1], '#17161f'); });
    s += p('M-40 150Q40 138 110 146T230 144T360 148V240H-40Z', 'url(#evs6-ground)');
    s += bg('url(#evs6-fire)');
    // Standing stones and a drying rack.
    s += lv(7, at(258, 150, p('M-12 4L-10 -22L-4 -24L-2 4Z', '#3a3640') + p('M2 4L4 -30L11 -32L13 4Z', '#46424c') + p('M-13 -22L14 -31L15 -27L-12 -18Z', '#524e58') + ln('M4 -30L4 4', '#ffb04a', 1, 0.5)));
    s += lv(5, at(70, 160, ln('M-14 4L-10 -16M14 4L10 -16M-12 -14H12', '#3a2a20', 1.6) + p('M-8 -14l1.500 8l1.500 -8ZM-1 -14l1.500 9l1.500 -9ZM6 -14l1.500 7l1.500 -7Z', '#b0684a')));
    // Tents: the far ones small, the near ones lit by the fire.
    function tent(x, y, k, side) {
      var lit = side > 0 ? 'M0 -30L-22 4H-4Z' : 'M0 -30L22 4H4Z';
      return at(x, y, '<g transform="scale(' + k + ')">' + p('M0 -30L22 4H-22Z', '#4f3a2c') + p(lit, '#a8704a') + p('M0 -12L5 4H-5Z', '#140e0c') +
        ln('M-3 -35L3 -26M3 -35L-3 -26', '#2a1e18', 1.4) + ln('M-12 -8L-7 -9M9 -4L13 -3M-14 0h5', '#d9a070', 0.9, 0.6) + '</g>');
    }
    s += tent(96, 150, 0.7, 1) + tent(228, 150, 0.75, -1) + lv(3, tent(48, 152, 0.55, 1)) + lv(6, tent(276, 152, 0.5, -1)) + lv(9, tent(134, 146, 0.42, 1) + tent(196, 146, 0.4, -1));
    s += lv(2, tent(58, 176, 1.1, 1)) + lv(4, tent(268, 178, 1.15, -1)) + lv(8, tent(16, 184, 0.9, 1) + tent(310, 186, 0.85, -1));
    // People: dark figures with the fire on one side.
    function person(x, y, k, side, kind) {
      var rim = side > 0 ? '#ffb468' : '#ffb468', sx = side > 0 ? 1 : -1;
      var b;
      if (kind === 2) b = c(0, -11, 2.8, '#0c0d0e') + p('M-4 0Q-4.500 -8 0 -8.500Q5 -8 6 -2L8 0Z', '#0c0d0e') + ln('M2.6 -12.500A2.800 2.800 0 0 1 2.4 -9.500M4.6 -7Q6 -5 6.500 -1.500', rim, 0.9);
      else b = c(0, -19, 2.8, '#0c0d0e') + p('M-3 -16H3L4 -6L2.500 0H0.6L0 -5L-0.6 0H-2.500L-4 -6Z', '#0c0d0e') + ln('M2.6 -20.500A2.800 2.800 0 0 1 2.4 -17.500M3.2 -15.500L4.2 -6.500L2.8 -0.5', rim, 0.9) +
        (kind === 1 ? ln('M6 2L6 -28', '#0c0d0e', 1.2) + p('M6 -32L7.500 -27H4.500Z', '#c9c2b0') + ln('M3 -13L6 -11', '#0c0d0e', 1.4) : ln('M3 -14L7 -9', '#0c0d0e', 1.4));
      return at(x, y, '<g transform="scale(' + f(sx * k) + ' ' + k + ')">' + b + '</g>');
    }
    s += person(132, 174, 1, 1, 2) + person(190, 176, 1, -1, 0) + lv(1, person(118, 168, 0.9, 1, 1)) + lv(2, person(204, 168, 0.85, -1, 2)) + lv(3, person(144, 186, 1.15, 1, 0)) +
      lv(4, person(180, 188, 1.1, -1, 2)) + lv(5, person(86, 166, 0.8, 1, 0)) + lv(6, person(236, 170, 0.85, -1, 1)) + lv(7, person(102, 182, 1.05, 1, 2)) +
      lv(8, person(222, 186, 1.1, -1, 0)) + lv(9, person(244, 158, 0.7, -1, 0) + person(74, 158, 0.65, 1, 1)) + lv(10, person(160, 194, 1.2, 1, 2) + person(40, 164, 0.7, 1, 0));
    // The fire.
    var fire = el(0, 2, 16, 4, '#1a1210') + ln('M-11 2L9 -3M11 2L-9 -3', '#3a241a', 3) +
      an('flicker', 0.9, 0, p('M0 -30Q10 -18 8 -8Q7 0 0 1Q-8 0 -9 -9Q-9 -18 0 -30Z', '#e2562c')) +
      an('flicker', 0.7, 0.4, p('M1 -22Q7 -13 5.500 -7Q4.500 -1 0 0Q-5.500 -1 -6 -8Q-5 -14 1 -22Z', '#f5a03a')) +
      an('flicker', 0.5, 0.2, p('M0 -13Q3.500 -8 3 -4Q2.500 -1 0 -0.5Q-3 -1 -3 -5Q-2.500 -9 0 -13Z', '#ffe9a0'));
    for (i = 0; i < 7; i++) fire += an('rise', 2.6 + i * 0.5, i * 0.17, c(i * 3 - 9, -22, 0.9, '#ffd27a'), '--ty:-' + (46 + i * 8) + 'px;--tx:' + (i * 5 - 14) + 'px');
    for (i = 0; i < 4; i++) fire += an('rise', 7 + i, i * 0.25, c(i * 2 - 3, -34, 6 + i * 2, '#c9b8c0', 0.12), '--ty:-' + (70 + i * 10) + 'px;--tx:' + (10 + i * 5) + 'px');
    s += at(160, 172, fire);
    // A dark rise in front and fireflies.
    s += p('M-40 240V196Q10 186 60 194T170 200T270 194T360 190V240Z', '#0a0d0c');
    for (i = 0; i < 9; i++) s += lv(i < 3 ? 0 : i, an('twinkle', 1.8 + R() * 2, R(), an('drift', 5 + R() * 4, R(), c(R() * 320, 120 + R() * 60, 1, '#eaf2a0'), '--tx:' + f(R() * 16 - 8) + 'px;--ty:' + f(R() * 12 - 6) + 'px')));
    return s;
  }

  // ---- 7. the civilization: a valley that changes its skyline with every epoch ----
  function civ() {
    var R = rnd(97);
    var s = '<defs>' +
      lg('evs7-sky', [[0, '#27304f'], [0.3, '#565a86'], [0.5, '#b98488'], [0.6, '#f0c088']]) +
      rg('evs7-sun', 236, 118, 90, [[0, '#fff0c0', 0.9], [0.3, '#f8c880', 0.4], [1, '#f8c880', 0]]) +
      lg('evs7-sea', [[0, '#e8b890'], [1, '#4f7f9c']]) +
      lg('evs7-ground', [[0, '#35443a'], [1, '#141c19']]) +
      lg('evs7-glass', [[0, '#bfe0ea'], [1, '#4a7088']]) +
      '</defs>';
    var WIN = '#ffd98a';
    s += bg('url(#evs7-sky)') + bg('url(#evs7-sun)') + c(236, 118, 15, '#fff2c8');
    for (var i = 0; i < 16; i++) s += an('twinkle', 3 + R() * 3, R(), c(R() * 320, R() * 50 - 30, 0.5 + R() * 0.5, '#f6efd6', 0.7));
    s += an('swim', 70, 0.3, at(-120, 40, el(0, 0, 40, 6, '#e8c0b0', 0.4) + el(26, 5, 30, 4, '#e8c0b0', 0.3) + el(-20, 4, 24, 3.5, '#e8c0b0', 0.3)), '--tx:560px');
    s += an('swim', 95, 0.75, at(-120, 74, el(0, 0, 34, 4.5, '#f6d8b8', 0.4) + el(22, 4, 24, 3, '#f6d8b8', 0.3)), '--tx:560px');
    // The orbital ring and the lift to it: the last epochs.
    s += flag('e8', ln('M-40 30Q160 -22 360 30', '#d6d0f0', 1.4, 0.7) + an('twinkle', 2, 0, c(100, 12, 1.4, '#fffbe6') + c(220, 12, 1.4, '#fffbe6')) + ln('M152 138V4', '#d6d0f0', 1, 0.8) +
      an('rise', 9, 0.2, rect(150, 126, 4, 6, '#fffbe6'), '--ty:-120px;--tx:0px'));
    s += flag('e9', an('rise', 12, 0.5, at(60, 120, p('M0 -10Q4 -4 3 4H-3Q-4 -4 0 -10Z', '#f3ead0') + p('M-3 4L-5 8H5L3 4Z', '#cf7d96') + p('M-2 8Q0 18 2 8Z', '#ffd27a')), '--ty:-150px;--tx:26px'));
    // The sea and the mountains.
    s += rect(-40, 116, 400, 32, 'url(#evs7-sea)');
    s += p('M-40 124L-10 96L14 108L50 78L78 104L110 90L136 112L170 122H-40Z', '#434a6c') + p('M50 78L60 92L44 94ZM-10 96L-2 106L-16 107Z', '#e8d0c8', 0.6);
    s += an('drift', 5, 0, ln('M214 124h18M226 129h26M204 134h14M250 122h20M282 128h24M240 138h30M296 136h20', '#fff2c8', 1, 0.6), '--tx:6px;--ty:0px');
    // Sails: a ship and a lighthouse on the cape.
    s += flag('e3', at(270, 130, an('drift', 6, 0, p('M-11 0H11L8 5H-8Z', '#3a2a22') + ln('M0 0V-18', '#3a2a22', 1.2) + p('M1 -17Q9 -12 10 -2H1Z', '#f3ead0') + p('M-1 -14Q-7 -10 -8 -2H-1Z', '#d9c9a8'), '--tx:10px;--ty:-1px')));
    s += p('M286 150Q300 128 322 124T360 118V160H280Z', '#2f3d3a');
    s += flag('e3', at(318, 124, p('M-4 0L-2.500 -24H2.500L4 0Z', '#e8dcc8') + rect(-2.5, -16, 5, 4, '#b0584a') + rect(-3.5, -29, 7, 5, '#3a3a40') + an('twinkle', 2.4, 0, c(0, -26.500, 2.2, '#fff2a0') + p('M0 -26.500L-34 -32V-22Z', '#fff2a0', 0.25))));
    // Far plain: the monuments of the early epochs and the giants of the late ones.
    s += p('M-40 136Q20 124 80 130T200 132T290 140T360 134V240H-40Z', '#2f3d3a');
    s += flag('e1', at(44, 132, p('M-26 0H26L20 -8H-20ZM-18 -8H18L13 -16H-13ZM-11 -16H11L7 -23H-7Z', '#b89a6c') + p('M0 0H26L20 -8H0ZM0 -8H18L13 -16H0ZM0 -16H11L7 -23H0Z', '#8a7250') + rect(-2.5, -6, 5, 6, '#3a2e22') + rect(-3, -27, 6, 4, '#d9c08a')));
    s += flag('e2', at(108, 134, rect(-22, -14, 44, 3, '#a89c8c') + p('M-22 -11V0H-18V-6Q-14 -11 -10 -6V0H-6V-6Q-2 -11 2 -6V0H6V-6Q10 -11 14 -6V0H18V-11Z', '#8a8072')));
    s += flag('e6', at(86, 134, p('M-11 0Q-6 -14 -8 -28H8Q6 -14 11 0Z', '#8f96a4') + p('M0 0Q3 -14 2 -28H8Q6 -14 11 0Z', '#6c7382') + p('M10 0Q14 -11 12.500 -22H25.500Q24 -11 28 0Z', '#7d8494') +
      [0, 1, 2].map(function (i) { return an('rise', 8 + i, i * 0.33, c(i * 3 - 2, -30, 6 + i * 2, '#f3ead0', 0.3), '--ty:-44px;--tx:' + (14 + i * 6) + 'px'); }).join('')));
    s += flag('e5', ln('M178 134L182 110L186 134M176 116H188M179 122H185M232 138L236 114L240 138M230 120H242M233 126H239M182 112Q209 122 236 116M176 116Q203 127 230 120M188 116Q214 127 242 120', '#1f2630', 1, 0.9));
    // Glass towers of the network epoch.
    function tower(x, w, h, seed) {
      var Q = rnd(seed), b = rect(x, 146 - h, w, h, 'url(#evs7-glass)') + rect(x + w * 0.62, 146 - h, w * 0.38, h, '#22384a', 0.45);
      for (var y = 150 - h; y < 142; y += 5) for (var k = 0; k < Math.floor(w / 4); k++) if (Q() > 0.45) b += rect(x + 1.5 + k * 4, y, 2, 2.4, WIN, 0.9);
      return b;
    }
    s += flag('e7', tower(140, 14, 74, 3) + tower(158, 18, 92, 4) + tower(180, 12, 60, 5) + ln('M167 54V40', '#cfd6e0', 1) + an('twinkle', 1.4, 0, c(167, 39, 1.5, '#ff8a7a')) + lv(6, tower(122, 12, 50, 6) + tower(196, 14, 44, 7)));
    // The middle ground: the town.
    s += p('M-40 152Q40 140 120 146T250 148T360 144V240H-40Z', 'url(#evs7-ground)');
    function house(x, y, w, h, wall, roof, lit) {
      return rect(x - w / 2, y - h, w, h, wall) + rect(x, y - h, w / 2, h, '#000000', 0.18) + p('M' + f(x - w / 2 - 1.5) + ' ' + f(y - h) + 'L' + f(x) + ' ' + f(y - h - w * 0.45) + 'L' + f(x + w / 2 + 1.5) + ' ' + f(y - h) + 'Z', roof) +
        rect(x - w * 0.28, y - h * 0.7, w * 0.2, h * 0.28, lit ? WIN : '#2a2a26') + rect(x + w * 0.1, y - h * 0.5, w * 0.18, h * 0.5, '#2a2018');
    }
    // Steam: a works with smoking stacks, and a train on the viaduct.
    s += flag('e4', at(262, 150, rect(-24, -14, 48, 14, '#6a4a40') + p('M-24 -14L-16 -22V-14ZM-12 -14L-4 -22V-14ZM0 -14L8 -22V-14Z', '#8a6254') + rect(12, -40, 6, 40, '#5a3e36') + rect(22, -32, 5, 32, '#4f3630') + rect(11, -42, 8, 3, '#3a2a26') +
      rect(-20, -9, 5, 5, WIN) + rect(-10, -9, 5, 5, WIN) + rect(0, -9, 5, 5, WIN) +
      [0, 1, 2, 3].map(function (i) { return an('rise', 6 + i, i * 0.26, c(15 + (i % 2) * 9, -44 + (i % 2) * 8, 4 + i * 1.5, '#c9c2c8', 0.35), '--ty:-50px;--tx:' + (-16 - i * 5) + 'px'); }).join('')));
    s += flag('e4', at(0, 158, rect(-40, -1.5, 400, 3, '#2a2420') + p('M-40 2V14H-34V8Q-28 2 -22 8V14H-16V8Q-10 2 -4 8V14H2V8Q8 2 14 8V14H20V8Q26 2 32 8V14H38V2Z', '#4a443c', 0.9) +
      an('swim', 16, 0.2, at(-70, -1.5, rect(0, -6, 10, 6, '#3a3a40') + rect(11, -6, 10, 6, '#7a4a40') + rect(22, -6, 10, 6, '#7a4a40') + rect(33, -8, 9, 8, '#22262a') + rect(40, -11, 2.5, 4, '#22262a') + c(41, -14, 2, '#d9d2d8', 0.6) + c(37, -17, 2.6, '#d9d2d8', 0.4)), '--tx:470px')));
    // The first houses are always here.
    s += house(74, 154, 11, 8, '#b89a6c', '#7a4a3a', false) + house(88, 156, 13, 9, '#c9ae80', '#8a563f', true) + house(60, 157, 10, 7, '#a88a60', '#7a4a3a', false);
    s += flag('p0', house(104, 154, 11, 8, '#c9ae80', '#7a4a3a', true) + house(46, 154, 10, 8, '#b89a6c', '#8a563f', false) + house(118, 157, 12, 9, '#b89a6c', '#7a4a3a', false) + lv(4, house(32, 157, 11, 8, '#c9ae80', '#7a4a3a', true)));
    // The town: a wall with towers and a gate.
    s += flag('p1', at(160, 156, rect(-30, -11, 60, 11, '#9a8f80') + p('M-30 -11v-3h4v3h4v-3h4v3h4v-3h4v3h4v-3h4v3h4v-3h4v3h4v-3h4v3h4v-3h4v3h4v-3h4v3Z', '#9a8f80') + rect(-34, -18, 8, 18, '#aea392') + rect(26, -18, 8, 18, '#857b6e') +
      p('M-35 -18L-30 -25L-25 -18ZM25 -18L30 -25L35 -18Z', '#8a563f') + p('M-5 0V-6Q0 -11 5 -6V0Z', '#2a2018') + rect(0, -11, 30, 11, '#000000', 0.15) + rect(-31, -13, 2, 3, WIN) + rect(29, -13, 2, 3, WIN)));
    // Iron: a forge with a glowing mouth and a water wheel.
    s += flag('e2', at(206, 158, rect(-8, -9, 16, 9, '#5a5550') + p('M-10 -9L0 -15L10 -9Z', '#3a3632') + rect(-3, -5, 6, 5, '#ff9a4a') + rect(5, -19, 3, 10, '#3a3632') + an('rise', 5, 0.3, c(6.5, -21, 3, '#c9c2c8', 0.3), '--ty:-30px;--tx:-8px') +
      at(-14, -5, an('spin', 9, 0, ring(0, 0, 5, '#6a4a34', 1.4) + ln('M-5 0H5M0 -5V5M-3.500 -3.500L3.500 3.500M-3.500 3.500L3.500 -3.500', '#6a4a34', 1)))));
    // The academy: a dome on columns.
    s += flag('p2', at(228, 152, rect(-15, -12, 30, 12, '#e8dcc8') + p('M-17 -12H17L0 -20Z', '#d0c2a8') + p('M-7 -16Q-7 -25 0 -25Q7 -25 7 -16Z', '#9fb8c8') + ln('M0 -25V-29', '#d9c08a', 1.2) +
      rect(-12, -10, 2.5, 10, '#b8ac98') + rect(-6, -10, 2.5, 10, '#b8ac98') + rect(3.5, -10, 2.5, 10, '#b8ac98') + rect(9.5, -10, 2.5, 10, '#b8ac98') + rect(-17, -1.5, 34, 2.5, '#b8ac98')));
    // The metropolis: tall blocks with lit windows.
    function block(x, w, h, col, seed) {
      var Q = rnd(seed), b = rect(x, 154 - h, w, h, col) + rect(x + w * 0.6, 154 - h, w * 0.4, h, '#000000', 0.2);
      for (var y = 157 - h; y < 150; y += 5) for (var k = 0; k < Math.floor(w / 4); k++) if (Q() > 0.4) b += rect(x + 1.5 + k * 4, y, 2, 2.6, WIN, 0.95);
      return b;
    }
    s += flag('p3', block(126, 12, 30, '#6c7382', 11) + block(196, 10, 26, '#7d8494', 12) + lv(5, block(110, 10, 22, '#7d8494', 13) + block(246, 12, 34, '#6c7382', 14)) + lv(8, block(140, 9, 40, '#59606e', 15)));
    // Fields, the river and the road in front.
    s += p('M-40 172Q30 160 100 166T230 168T360 162V240H-40Z', '#1f2a22');
    s += p('M-40 240L-20 176L40 170L30 240Z', '#7d8442', 0.8) + p('M38 240L48 170L96 168L104 240Z', '#a8974c', 0.8) + p('M250 240L240 170L292 168L318 240Z', '#6f7a3a', 0.8) + p('M326 240L300 168L360 164V240Z', '#9a8f4a', 0.8);
    s += ln('M-24 190L32 184M-28 204L32 198M-32 220L32 212M56 180L98 178M54 194L100 192M52 210L102 208M246 182L296 180M248 198L304 196M250 214L312 212', '#141c19', 1, 0.5);
    s += p('M150 146Q170 156 160 170T176 240H232Q200 190 204 172T180 146Z', '#5a8fae') + an('drift', 4, 0, ln('M166 160q6 2 12 0M172 180q8 3 16 0M184 204q10 3 20 0M196 226q10 3 20 0', '#bfe0ea', 1, 0.6), '--tx:0px;--ty:5px');
    s += flag('e1', ln('M104 240Q112 200 150 186M112 240Q122 204 152 192', '#5a8fae', 1.6, 0.9));
    // Houses near the river grow with the stage.
    var nearHouses = [[122, 186, 16, 12, 1], [232, 184, 15, 11, 2], [98, 196, 18, 13, 3], [262, 196, 17, 13, 4], [136, 200, 14, 11, 6], [228, 202, 16, 12, 7], [290, 190, 14, 10, 9], [74, 190, 13, 10, 10]];
    nearHouses.forEach(function (q, i) { s += lv(q[4], house(q[0], q[1], q[2], q[3], i % 2 ? '#d6c4a0' : '#c2a878', i % 3 ? '#8a4f3c' : '#6a5a52', i % 2 === 0)); });
    s += flag('e5', [[112, 180], [146, 192], [216, 190], [250, 182]].map(function (q) { return ln('M' + q[0] + ' ' + q[1] + 'v-10', '#22262a', 1) + an('twinkle', 3, q[0] % 5 / 5, c(q[0], q[1] - 11, 1.8, '#fff2a0') + c(q[0], q[1] - 11, 5, '#fff2a0', 0.2)); }).join(''));
    s += flag('e6', at(58, 148, an('spin', 14, 0, ln('M0 0V-9M0 0L7.800 4.500M0 0L-7.800 4.500', '#e8e8f0', 1.2)) + ln('M0 0V10', '#e8e8f0', 1.2)));
    return s;
  }

  // ---- 8. the cosmos: the home star, six worlds and the ships between them ----
  var WORLDS = [
    { id: 'near', x: 132, y: 136, r: 7, a: '#d9c9a0', b: '#8a7650' },
    { id: 'ocean', x: 176, y: 160, r: 10, a: '#74b1cf', b: '#2f5a7a' },
    { id: 'stone', x: 196, y: 98, r: 8, a: '#a8acb6', b: '#5d616c' },
    { id: 'garden', x: 244, y: 138, r: 11, a: '#a3c47a', b: '#4f7440' },
    { id: 'remote', x: 266, y: 62, r: 9, a: '#ada0dc', b: '#5a4f92' },
    { id: 'frontier', x: 300, y: 24, r: 6, a: '#e0917a', b: '#7a4034' }
  ];
  function cosmos() {
    var R = rnd(131);
    var HX = 88, HY = 152;
    var s = '<defs>' +
      lg('evs8-bg', [[0, '#0c0b24'], [0.6, '#0a0c1c'], [1, '#12102c']]) +
      rg('evs8-n1', 236, 44, 130, [[0, '#7a66c0', 0.5], [1, '#7a66c0', 0]]) +
      rg('evs8-n2', 60, 60, 110, [[0, '#2f8f96', 0.3], [1, '#2f8f96', 0]]) +
      rg('evs8-n3', 300, 180, 100, [[0, '#cf7d96', 0.25], [1, '#cf7d96', 0]]) +
      rg('evs8-star', 30, 178, 80, [[0, '#fff6d0'], [0.22, '#ffd27a'], [0.4, '#f0a04a', 0.45], [1, '#f0a04a', 0]]) +
      '</defs>';
    s += bg('url(#evs8-bg)') + bg('url(#evs8-n1)') + bg('url(#evs8-n2)') + bg('url(#evs8-n3)');
    // The band of the galaxy and the stars.
    for (var i = 0; i < 70; i++) {
      var t = R(), x = -40 + t * 400 + R() * 30 - 15, y = 150 - t * 170 + (R() - 0.5) * 60;
      s += c(x, y, 0.3 + R() * 0.5, '#d6d0f0', 0.2 + R() * 0.4);
    }
    for (i = 0; i < 60; i++) {
      x = R() * 400 - 40; y = R() * 280 - 40;
      var r = 0.4 + R() * 0.9, col = i % 5 === 0 ? '#ffd9b0' : i % 4 === 0 ? '#bfd8ff' : '#f6f2ff';
      s += i % 4 === 1 ? an('twinkle', 2 + R() * 4, R(), c(x, y, r + 0.2, col)) : c(x, y, r, col, 0.5 + R() * 0.5);
    }
    [[52, 30], [214, 16], [150, 64], [292, 110]].forEach(function (q, i) {
      s += an('twinkle', 3 + i, i * 0.3, p('M' + q[0] + ' ' + (q[1] - 5) + 'l1.200 3.800l3.800 1.200l-3.800 1.200l-1.200 3.800l-1.200 -3.800l-3.800 -1.200l3.800 -1.200Z', '#fffbe6'));
    });
    // A comet now and then.
    s += an('fly', 23, 0.5, at(340, -10, ln('M0 0L26 -10', '#d6f0ff', 1.4, 0.5) + c(0, 0, 1.6, '#ffffff')), '--tx:-260px;--ty:100px');
    // The home star and the orbits round it.
    s += c(30, 178, 80, 'url(#evs8-star)');
    s += an('pulse', 4, 0, c(30, 178, 20, '#fff2c0') + c(30, 178, 15, '#fffbe8'), '--s:1.06');
    [62, 112, 168, 232, 300].forEach(function (rx, i) {
      s += '<ellipse cx="30" cy="178" rx="' + rx + '" ry="' + f(rx * 0.56) + '" fill="none" stroke="#ada0dc" stroke-width="0.8" opacity="' + f(0.34 - i * 0.04) + '" transform="rotate(-24 30 178)"/>';
    });
    // The swarm of collectors round the star: late in the stage.
    s += lv(9, an('spin', 60, 0, ln('M30 148A30 30 0 0 1 60 178', '#ffd27a', 2.4, 0.9, '3 4') + ln('M30 208A30 30 0 0 1 0 178', '#ffd27a', 2.4, 0.9, '3 4'), 'transform-box:view-box;transform-origin:30px 178px'));
    // Routes to the worlds that are settled or on the way.
    WORLDS.forEach(function (w, i) {
      s += '<g data-flag="r' + i + '">' + ln('M' + HX + ' ' + HY + 'Q' + f((HX + w.x) / 2) + ' ' + f((HY + w.y) / 2 - 16) + ' ' + w.x + ' ' + w.y, '#cfc6f0', 0.9, 0.5, '2 4') + '</g>';
    });
    // The home world.
    function globe(x, y, r, a, b, extra) {
      return at(x, y, c(0, 0, r, a) + (extra || '') + p('M' + f(r * 0.3) + ' ' + f(-r * 0.95) + 'A' + r + ' ' + r + ' 0 0 1 ' + f(r * 0.3) + ' ' + f(r * 0.95) + 'A' + f(r * 1.5) + ' ' + f(r * 1.5) + ' 0 0 0 ' + f(r * 0.3) + ' ' + f(-r * 0.95) + 'Z', b, 0.85) +
        ln('M' + f(-r * 0.72) + ' ' + f(-r * 0.6) + 'A' + r + ' ' + r + ' 0 0 0 ' + f(-r * 0.72) + ' ' + f(r * 0.6), '#ffffff', 0.9, 0.5));
    }
    s += c(HX, HY, 19, '#74b1cf', 0.12) + globe(HX, HY, 13, '#5f9fc4', '#1f3f66', p('M-9 -4Q-4 -9 2 -6Q5 -2 0 1Q-6 3 -9 -4ZM-3 6Q3 4 6 8Q2 12 -3 10Z', '#8fc07a') + ln('M-11 0Q-4 -3 4 0M-8 7Q-2 5 3 7', '#ffffff', 1, 0.5));
    s += at(HX, HY, an('spin', 11, 0, at(0, -19, rect(-3, -1, 6, 2, '#e8e8f0') + rect(-1, -2.5, 2, 5, '#9fb8c8'))));
    s += lv(3, at(HX, HY, an('spin', 17, 0.4, at(23, 0, ring(0, 0, 3, '#e8e8f0', 1.2) + c(0, 0, 0.9, '#ffd27a')))));
    // The worlds.
    WORLDS.forEach(function (w, i) {
      var extra = '';
      if (w.id === 'ocean') extra = ln('M-8 -3Q-2 -6 6 -3M-9 2Q-1 -1 8 2M-6 6Q0 4 6 6', '#d6efff', 1, 0.6);
      if (w.id === 'stone') extra = c(-3, -2, 2, '#7d818c') + c(2, 3, 1.5, '#7d818c') + c(-4, 4, 1, '#7d818c');
      if (w.id === 'garden') extra = p('M-8 -2Q-3 -8 2 -5Q4 0 -2 2Q-7 3 -8 -2ZM-2 7Q2 4 6 6Q4 10 0 10Z', '#d6ec9a') + ln('M-10 3Q-4 1 0 4', '#ffffff', 0.9, 0.5);
      if (w.id === 'near') extra = ln('M-6 -2H3M-5 2H5', '#b89a6c', 1, 0.8);
      if (w.id === 'frontier') extra = ln('M-4 -4Q0 -6 4 -4', '#ffd27a', 1.2);
      var body = globe(w.x, w.y, w.r, w.a, w.b, extra);
      if (w.id === 'remote') body += '<ellipse cx="' + w.x + '" cy="' + w.y + '" rx="16" ry="4" fill="none" stroke="#e8dcc0" stroke-width="1.6" opacity="0.85" transform="rotate(-20 ' + w.x + ' ' + w.y + ')"/>';
      s += '<g class="evs-world" data-world="' + i + '">' + body + '</g>';
      // A settled world: a halo, lights on the night side and a station in orbit.
      s += '<g data-flag="w' + i + '">' + an('pulse', 3.5, i * 0.17, ring(w.x, w.y, w.r + 3.5, '#ffe9a0', 1, 0.8), '--s:1.1') +
        c(w.x + w.r * 0.55, w.y - w.r * 0.3, 0.8, '#ffe9a0') + c(w.x + w.r * 0.7, w.y + w.r * 0.15, 0.8, '#ffe9a0') + c(w.x + w.r * 0.45, w.y + w.r * 0.5, 0.7, '#ffe9a0') +
        at(w.x, w.y, an('spin', 7 + i * 1.3, i * 0.2, at(w.r + 6.5, 0, rect(-2, -0.8, 4, 1.6, '#f6f2ff') + c(0, 0, 1, '#9fd8e8')))) + '</g>';
      // A ship on the way there.
      var ang = Math.atan2(w.y - HY, w.x - HX) * 180 / Math.PI;
      s += '<g data-flag="f' + i + '">' + an('fly', 6 + i * 1.5, i * 0.13, at(HX, HY, '<g transform="rotate(' + f(ang) + ')">' + p('M6 0L-3 -3L-1.500 0L-3 3Z', '#f6f2ff') + p('M-2 0L-9 -1.200V1.200Z', '#ffd27a', 0.9) + '</g>'), '--tx:' + f(w.x - HX) + 'px;--ty:' + f(w.y - HY) + 'px') + '</g>';
    });
    // Later: a great ark leaves for the far stars.
    s += lv(6, an('swim', 70, 0.35, at(-60, 96, rect(-14, -2.5, 28, 5, '#cfd6e0', 1, 2.5) + ring(-2, 0, 6, '#9fb8c8', 1.2) + rect(12, -1.5, 5, 3, '#9fb8c8') + p('M-14 -1.500L-22 0L-14 1.500Z', '#9fd8ff', 0.8) + c(4, 0, 0.8, '#ffd27a') + c(8, 0, 0.8, '#ffd27a')), '--tx:470px'));
    return s;
  }

  var MAKERS = [broth, cellScene, garden, ocean, land, tribe, civ, cosmos];

  function build(stage) {
    var make = MAKERS[stage - 1] || broth;
    return '<svg class="ev-scene-art" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + make() + '</svg>';
  }

  function update(root, info) {
    if (!root) return;
    var level = info && info.level || 0;
    var flags = info && info.flags || {};
    var list = root.querySelectorAll('[data-lv]');
    for (var i = 0; i < list.length; i++) list[i].classList.toggle('on', Number(list[i].getAttribute('data-lv')) <= level);
    list = root.querySelectorAll('[data-flag]');
    for (i = 0; i < list.length; i++) list[i].classList.toggle('on', !!flags[list[i].getAttribute('data-flag')]);
  }

  // ---- the cells of the biome map ----
  var HEX = '22,1.5 42.700,13.300 42.700,36.700 22,48.500 1.300,36.700 1.300,13.300';
  var BIOMES = {
    forest: function (n) {
      function fir(x, y, k) { return at(x, y, '<g transform="scale(' + k + ')">' + rect(-1, 0, 2, 4, '#3a2e22') + p('M0 -15L5 -7H2.500L6.500 0H-6.500L-2.500 -7H-5Z', '#2f6a4a') + p('M0 -15L5 -7H2.500L6.500 0H0Z', '#1f4f38') + '</g>'); }
      return rect(0, 0, 44, 50, '#4f8060') + el(22, 40, 26, 12, '#3f6e52') + (n % 2 ? fir(13, 27, 1) + fir(30, 24, 0.85) + fir(22, 39, 1.1) : fir(31, 28, 1) + fir(14, 23, 0.85) + fir(21, 40, 1.1)) +
        c(n % 2 ? 34 : 9, 38, 4, '#6fa070') + c(n % 2 ? 35 : 10, 37, 2, '#8fbf88');
    },
    steppe: function (n) {
      var tufts = n % 2 ? 'M9 26l1 -6M11 26l2 -5M13 26l-1 -6M27 21l1 -6M29 21l2 -5M31 21l-1 -6M20 41l1 -6M22 41l2 -5M24 41l-1 -6' : 'M28 28l1 -6M30 28l2 -5M32 28l-1 -6M12 21l1 -6M14 21l2 -5M16 21l-1 -6M19 42l1 -6M21 42l2 -5M23 42l-1 -6';
      return rect(0, 0, 44, 50, '#b0a05c') + p('M0 30Q11 23 22 29T44 27V50H0Z', '#9a8a4a') + p('M0 40Q12 34 24 39T44 37V50H0Z', '#84763e') + ln(tufts, '#e6d88a', 1.2) + c(n % 2 ? 33 : 10, 12, 3.5, '#f2e2a0', 0.9);
    },
    swamp: function (n) {
      return rect(0, 0, 44, 50, '#4f7a70') + el(n % 2 ? 17 : 27, 30, 15, 8, '#2f5f66') + el(n % 2 ? 19 : 25, 29, 9, 4, '#5f97a0', 0.7) + el(n % 2 ? 31 : 12, 40, 7, 3, '#2f5f66') +
        ln('M10 38V24M14 39V21M33 30V17M37 31V20M23 44V34', '#a9c47a', 1.2) + el(10, 23, 1.4, 3.2, '#6a4a34') + el(14, 20, 1.4, 3.2, '#6a4a34') + el(33, 16, 1.4, 3.2, '#6a4a34') + el(37, 19, 1.4, 3.2, '#6a4a34') +
        el(n % 2 ? 20 : 26, 32, 3, 1.4, '#9fd08a');
    },
    mountains: function (n) {
      var a = n % 2 ? 0 : 3;
      return rect(0, 0, 44, 50, '#7d7a86') + p('M' + (2 + a) + ' 40L' + (15 + a) + ' 14L' + (26 + a) + ' 40Z', '#a9a6b2') + p('M' + (15 + a) + ' 14L' + (26 + a) + ' 40H' + (17 + a) + 'Z', '#6a6772') +
        p('M' + (17 - a) + ' 42L' + (30 - a) + ' 20L' + (42 - a) + ' 42Z', '#bab7c2') + p('M' + (30 - a) + ' 20L' + (42 - a) + ' 42H' + (32 - a) + 'Z', '#77747f') +
        p('M' + (15 + a) + ' 14L' + (19 + a) + ' 23L' + (15 + a) + ' 21L' + (11.5 + a) + ' 22Z', '#f6f6fa') + p('M' + (30 - a) + ' 20L' + (33.5 - a) + ' 27L' + (30 - a) + ' 25.500L' + (27 - a) + ' 26.500Z', '#f6f6fa') + rect(0, 42, 44, 8, '#5d5a66');
    },
    tundra: function (n) {
      return rect(0, 0, 44, 50, '#8fa8aa') + p('M0 26Q10 20 22 25T44 22V50H0Z', '#a9c0c2') + el(n % 2 ? 14 : 30, 31, 9, 3.5, '#eef4f4') + el(n % 2 ? 31 : 13, 39, 8, 3, '#eef4f4') + el(22, 20, 6, 2.2, '#eef4f4', 0.8) +
        ln(n % 2 ? 'M30 30v-6M30 26l-3 -3M30 27l3 -3M12 42v-4M12 40l-2 -2M12 40l2 -2' : 'M14 30v-6M14 26l-3 -3M14 27l3 -3M32 44v-4M32 42l-2 -2M32 42l2 -2', '#5f7a66', 1.2) + c(22, 40, 1.2, '#cf7d96') + c(25, 41.500, 1, '#cf7d96');
    },
    desert: function (n) {
      var x = n % 2 ? 30 : 13;
      return rect(0, 0, 44, 50, '#c9a476') + p('M0 28Q10 18 22 26T44 22V50H0Z', '#b88e60') + p('M0 39Q12 30 26 37T44 34V50H0Z', '#a67c50') + ln('M4 31q5 -4 10 -2M26 41q6 -4 12 -2', '#e6c698', 1, 0.8) +
        ln('M' + x + ' 34V20M' + x + ' 28h-4v-4M' + x + ' 25h4v-3', '#5f8748', 2.2) + c(n % 2 ? 12 : 32, 13, 4, '#f6dc8a');
    },
    water: function () {
      return rect(0, 0, 44, 50, '#3f7f96') + ln('M6 18q4 -3 8 0t8 0t8 0t8 0M4 28q4 -3 8 0t8 0t8 0t8 0M8 38q4 -3 8 0t8 0t8 0', '#a9dcea', 1.3, 0.8) + p('M17 24Q22 19 28 23Q22 27 17 24Z', '#d9f1ff', 0.6);
    }
  };
  function hex(biome, opts) {
    var q = opts || {};
    var draw = q.water ? BIOMES.water : BIOMES[biome] || BIOMES.steppe;
    var id = 'evh' + (q.n || 0);
    var s = '<svg class="ev-hex-art" viewBox="0 0 44 50" width="44" height="50" aria-hidden="true"><defs><clipPath id="' + id + '"><polygon points="' + HEX + '"/></clipPath></defs>';
    s += '<g clip-path="url(#' + id + ')">' + draw(q.n || 0);
    if (!q.owned) s += rect(0, 0, 44, 50, '#10161a', q.open ? 0.2 : 0.5);
    // A settled cell: a house with a lit window and a flag.
    if (q.owned) s += rect(16.5, 27, 11, 8, '#f3ead0') + p('M14.500 27.500L22 20.500L29.500 27.500Z', '#b0584a') + rect(20.5, 30, 3, 5, '#6a4a34') + rect(24.5, 29, 2, 2, '#ffd27a') + ln('M29 27V17', '#f3ead0', 1) + p('M29 17l5 2l-5 2Z', '#ffd27a');
    s += '</g>';
    s += '<polygon points="' + HEX + '" fill="none" stroke="' + (q.selected ? '#ffd27a' : q.owned ? '#f3ead0' : q.open ? '#d9d2b8' : '#10161a') + '" stroke-width="' + (q.selected ? 3.6 : q.owned ? 1.6 : 1.2) + '"' +
      (q.open && !q.selected && !q.owned ? ' stroke-dasharray="3 3"' : '') + ' opacity="' + (q.selected || q.owned ? 1 : q.open ? 0.9 : 0.6) + '"/>';
    return s + '</svg>';
  }

  var api = { build: build, update: update, hex: hex, island: island, worlds: WORLDS.map(function (w) { return w.id; }) };
  if (typeof window !== 'undefined') window.EvoScenes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
