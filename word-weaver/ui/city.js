// The city of «Словоплёт» drawn as flat isometry from simple SVG shapes: every quarter is a block
// of plots; a house is a box with a roof (изба — a hip roof, каменный и доходный — flat, higher),
// windows light up in houses with residents; the special building of the quarter stands at its
// back. No shadows, colours from the kit's tokens (game.css). window.WWCity.
//   WWCity.svg({quarters: [{id, title, special, open, houses: ['izba' | 'stone' | 'tenement' | null]}]},
//              {a: half width of a plot, cols: quarters a row, labels: true})
(function () {
  // The SVG namespace, taken from the parser so the code carries no address.
  var NS = (function () { var box = document.createElement('div'); box.innerHTML = '<svg></svg>'; return box.firstChild.namespaceURI; })();
  var HEIGHT = { izba: 0.8, stone: 1.35, tenement: 2.1, special: 2.5 };
  var FLOORS = { izba: 1, stone: 2, tenement: 3, special: 2 };

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function pts(list) {
    return list.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
  }

  function rhombus(x, y, a) {
    var b = a / 2;
    return [[x, y - b], [x + a, y], [x, y + b], [x - a, y]];
  }

  /** A box standing on the plot whose centre is (x, y): faces, roof and windows. */
  function house(g, x, y, a, kind, lit) {
    var b = a / 2;
    var hgt = HEIGHT[kind] * a;
    var cls = 'ww-h ww-h-' + kind;
    var left = [[x - a, y - hgt], [x, y + b - hgt], [x, y + b], [x - a, y]];
    var right = [[x, y + b - hgt], [x + a, y - hgt], [x + a, y], [x, y + b]];
    el('polygon', { points: pts(left), class: cls + ' ww-face-l' }, g);
    el('polygon', { points: pts(right), class: cls + ' ww-face-r' }, g);
    var top = rhombus(x, y - hgt, a);
    if (kind === 'izba') {
      var apex = [x, y - hgt - a * 0.75];
      el('polygon', { points: pts([top[3], top[2], apex]), class: 'ww-roof-l' }, g);
      el('polygon', { points: pts([top[2], top[1], apex]), class: 'ww-roof-r' }, g);
    } else {
      el('polygon', { points: pts(top), class: kind === 'special' ? 'ww-roof-special' : 'ww-roof-flat' }, g);
      if (kind === 'special') {
        // A small tower on the roof: the sign of the quarter.
        var t = a * 0.35;
        var th = a * 0.9;
        var ty = y - hgt;
        el('polygon', { points: pts([[x - t, ty - th], [x, ty + t / 2 - th], [x, ty + t / 2], [x - t, ty]]), class: 'ww-h ww-face-l' }, g);
        el('polygon', { points: pts([[x, ty + t / 2 - th], [x + t, ty - th], [x + t, ty], [x, ty + t / 2]]), class: 'ww-h ww-face-r' }, g);
        el('polygon', { points: pts(rhombus(x, ty - th, t)), class: 'ww-roof-special' }, g);
      }
    }
    // Windows: on both faces, rows by floors, two a row (one on the hut).
    var floors = FLOORS[kind];
    var per = kind === 'izba' ? 1 : 2;
    for (var f = 0; f < floors; f++) {
      var v1 = (f + 0.3) / floors;
      var v2 = (f + 0.65) / floors;
      for (var w = 0; w < per; w++) {
        var u1 = per === 1 ? 0.38 : 0.18 + w * 0.42;
        var u2 = u1 + (per === 1 ? 0.26 : 0.22);
        var onL = lit ? ' on' : '';
        el('polygon', { points: pts([pl(u1, v1), pl(u2, v1), pl(u2, v2), pl(u1, v2)]), class: 'ww-win' + onL }, g);
        el('polygon', { points: pts([pr(u1, v1), pr(u2, v1), pr(u2, v2), pr(u1, v2)]), class: 'ww-win' + onL }, g);
      }
    }
    function pl(u, v) { return [x - a + u * a, y + u * b - v * hgt]; }
    function pr(u, v) { return [x + u * a, y + b - u * b - v * hgt]; }
  }

  /** One quarter: plots in rows of three, the special building behind them. Returns its size. */
  function quarter(g, q, ox, oy, a, labels) {
    var b = a / 2;
    var n = q.houses.length;
    var rows = Math.max(1, Math.ceil(n / 3));
    var items = [];
    for (var p = 0; p < n; p++) items.push({ i: p % 3, j: Math.floor(p / 3), kind: q.houses[p] });
    items.push({ i: 3, j: (rows - 1) / 2, kind: 'special' });
    items.sort(function (m, k) { return (m.i + m.j) - (k.i + k.j); });
    var group = el('g', { class: q.open ? 'ww-q' : 'ww-q ww-q-locked' }, g);
    items.forEach(function (it) {
      var x = ox + (it.i - it.j) * a;
      var y = oy + (it.i + it.j) * b;
      if (!q.open) {
        el('polygon', { points: pts(rhombus(x, y, a * 0.92)), class: 'ww-plot' }, group);
        return;
      }
      if (it.kind) house(group, x, y, a * 0.82, it.kind, true);
      else el('polygon', { points: pts(rhombus(x, y, a * 0.82)), class: 'ww-plot' }, group);
    });
    if (labels) {
      var text = el('text', { x: ox + a, y: oy + (3 + rows) * b + a * 0.9, class: 'ww-qlabel', 'text-anchor': 'middle' }, group);
      text.textContent = q.title;
    }
    return { w: (3 + rows + 1) * a, h: (3 + rows) * b + a * 3.6 + (labels ? a * 1.2 : 0) };
  }

  function svg(model, o) {
    o = o || {};
    var a = o.a || 14;
    var cols = o.cols || model.quarters.length || 1;
    var b = a / 2;
    var root = el('svg', { class: 'ww-city-svg', role: 'img' });
    var list = model.quarters;
    var cellW = 6.5 * a;
    var cellH = 0;
    var top = a * 3.4;
    var sizes = [];
    list.forEach(function (q, i) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var ox = col * cellW + 2 * a;
      var oy = top + row * (cellH || 7.2 * a + (o.labels ? 1.6 * a : 0)) + b;
      sizes.push(quarter(root, q, ox, oy, a, o.labels));
    });
    var rowsN = Math.ceil(list.length / cols);
    var w = Math.min(cols, list.length) * cellW + a;
    var h = top + rowsN * (7.2 * a + (o.labels ? 1.6 * a : 0)) - a * 1.4;
    root.setAttribute('viewBox', '0 0 ' + w.toFixed(0) + ' ' + h.toFixed(0));
    root.setAttribute('width', w.toFixed(0));
    root.setAttribute('height', h.toFixed(0));
    return root;
  }

  window.WWCity = { svg: svg };
})();
