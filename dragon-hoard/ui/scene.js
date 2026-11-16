// Read-only rendering: no RNG, timers, persistence, or economy changes.
(function (root, make) {
  const api = make();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DragonScene = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const hash = n => { const k = Math.sin(n * 127.13 + 74.17) * 43758.5453; return k - Math.floor(k); };
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);
  const ink = '#26383a';
  function poly(c, p, fill, stroke, width = 1) {
    c.beginPath(); p.forEach((v, i) => i ? c.lineTo(v[0], v[1]) : c.moveTo(v[0], v[1])); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }
  function rect(c, x, y, w, h, fill, r = 0, stroke) {
    c.beginPath(); c.roundRect(x, y, w, h, r); if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  function ellipse(c, x, y, rx, ry, fill, angle = 0, stroke) {
    c.beginPath(); c.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), angle, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  function line(c, points, color, width = 1) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  }
  function curve(c, start, cp1, cp2, end, color, width = 1) {
    c.beginPath(); c.moveTo(...start); c.bezierCurveTo(...cp1, ...cp2, ...end);
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.stroke();
  }
  function gradient(c, x, y, x2, y2, stops) {
    const g = c.createLinearGradient(x, y, x2, y2); stops.forEach((color, i) => g.addColorStop(i / (stops.length - 1), color)); return g;
  }
  function glow(c, x, y, radius, color, opacity = 1) {
    const oldAlpha = c.globalAlpha; c.globalAlpha *= opacity;
    const g = c.createRadialGradient(x, y, 0, x, y, radius); g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    rect(c, x - radius, y - radius, radius * 2, radius * 2, g); c.globalAlpha = oldAlpha;
  }
  function spark(c, x, y, size, color) {
    poly(c, [[x, y - size], [x + size * .22, y - size * .22], [x + size, y], [x + size * .22, y + size * .22], [x, y + size], [x - size * .22, y + size * .22], [x - size, y], [x - size * .22, y - size * .22]], color);
  }
  function sky(c, top, bottom) { rect(c, 0, 0, 1000, 620, gradient(c, 0, 0, 0, 620, [top, bottom])); }
  function cloud(c, x, y, s, color) {
    c.save(); c.translate(x, y); c.scale(s, s);
    ellipse(c, 0, 0, 75, 17, color); ellipse(c, -26, -9, 33, 20, color); ellipse(c, 17, -20, 39, 29, color); ellipse(c, 55, -4, 30, 17, color); c.restore();
  }
  function stars(c, t, color = '#f5dfad', n = 80, height = 430) {
    for (let i = 0; i < n; i++) {
      c.globalAlpha = .25 + .45 * (.5 + .5 * Math.sin(t * .6 + i));
      const x = hash(i + 2) * 1000, y = hash(i + 84) * height;
      if (i % 11 === 0) spark(c, x, y, 3, color); else ellipse(c, x, y, .7 + hash(i) * 1.2, .7 + hash(i) * 1.2, color);
    } c.globalAlpha = 1;
  }
  function motes(c, t, color, x, y, w, h, n = 22) {
    for (let i = 0; i < n; i++) {
      const px = x + hash(i * 7 + 3) * w + Math.sin(t * .35 + i) * 7;
      const py = y + ((hash(i * 11 + 5) * h - t * (3 + hash(i) * 4)) % h + h) % h;
      c.globalAlpha = .22 + .38 * Math.sin((py - y) / h * Math.PI);
      ellipse(c, px, py, 1.2 + hash(i + 20), 1.2 + hash(i + 20), color);
    } c.globalAlpha = 1;
  }
  function burst(c, state, x, y, color, n = 30, reach = 150) {
    const q = state.elapsed / 2.4; if (q < 0 || q > 1 || !state.count) return;
    for (let i = 0; i < n; i++) {
      const a = i * 2.3999, d = reach * (.35 + hash(i) * .65) * ease(q);
      c.globalAlpha = (1 - q) * .9;
      spark(c, x + Math.cos(a) * d, y + Math.sin(a) * d * .66 - q * 36, (2 + hash(i + 40) * 4) * (1 - q), color);
    } c.globalAlpha = 1;
  }
  function tree(c, x, y, s, color = '#397b61', t = 0) {
    c.save(); c.translate(x, y); c.scale(s, s); ellipse(c, 8, 4, 26, 8, '#1b3c382a');
    line(c, [[0, 0], [-2, -49]], '#715548', 8);
    const sway = Math.sin(t * .65 + x) * 1.8;
    ellipse(c, -12 + sway, -48, 25, 28, color); ellipse(c, 12 + sway, -55, 23, 33, color);
    ellipse(c, -5 + sway, -70, 22, 25, color); ellipse(c, -13 + sway, -65, 12, 14, '#b3d68e55');
    c.restore();
  }
  function pine(c, x, y, s, color) {
    rect(c, x - 3 * s, y - 30 * s, 6 * s, 32 * s, '#705447');
    for (let i = 0; i < 3; i++) poly(c, [[x, y - (75 - i * 16) * s], [x + (20 + i * 7) * s, y - (22 - i * 8) * s], [x - (20 + i * 7) * s, y - (22 - i * 8) * s]], color);
  }
  function person(c, x, y, s, color, pose = 0, hair = '#42383a') {
    c.save(); c.translate(x, y); c.scale(s, s);
    ellipse(c, 0, 0, 11, 3, '#172e3325');
    line(c, [[-4, -17], [-5 - Math.sin(pose) * 3, -2]], '#323b44', 5);
    line(c, [[4, -17], [5 + Math.sin(pose) * 3, -2]], '#323b44', 5);
    poly(c, [[-9, -37], [8, -37], [11, -15], [-11, -15]], color);
    line(c, [[-7, -34], [-13, -22 + Math.sin(pose) * 3]], color, 5);
    line(c, [[8, -33], [14, -23 - Math.sin(pose) * 3]], color, 5);
    ellipse(c, 0, -43, 7, 9, '#edc39d'); ellipse(c, -1, -48, 7.4, 4.5, hair);
    ellipse(c, 3, -43, 1, 1, '#2d3437'); c.restore();
  }
  function flag(c, x, y, s, color, t) {
    line(c, [[x, y + 36 * s], [x, y - 30 * s]], '#d5bb88', 2.3 * s);
    const q = Math.sin(t * 1.5 + x) * 4 * s;
    c.beginPath(); c.moveTo(x, y - 30 * s); c.bezierCurveTo(x + 15 * s, y - 38 * s + q, x + 24 * s, y - 24 * s - q, x + 39 * s, y - 30 * s + q);
    c.lineTo(x + 35 * s, y - 9 * s + q); c.bezierCurveTo(x + 20 * s, y - 4 * s, x + 14 * s, y - 16 * s + q, x, y - 10 * s); c.closePath(); c.fillStyle = color; c.fill();
  }
  function arch(c, x, y, w, h, fill, stroke, lineWidth = 1) {
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, TAU); c.lineTo(x + w, y + h); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lineWidth; c.strokeStyle = stroke; c.stroke(); }
  }
  function crown(c, x, y, s) {
    poly(c, [[x - 13 * s, y], [x - 16 * s, y - 15 * s], [x - 6 * s, y - 8 * s], [x, y - 21 * s], [x + 6 * s, y - 8 * s], [x + 16 * s, y - 15 * s], [x + 13 * s, y]], '#e7bf5f', '#a97c35');
    rect(c, x - 13 * s, y - 3 * s, 26 * s, 7 * s, '#f3d78a', 2); ellipse(c, x, y, 2 * s, 3 * s, '#b75554');
  }
  function house(c, x, y, s, roof = '#bd6954', lit = true) {
    c.save(); c.translate(x, y); c.scale(s, s);
    ellipse(c, 10, 5, 49, 14, '#203d3320');
    poly(c, [[-34, -35], [5, -20], [5, 15], [-34, 0]], '#e8d3a8', '#8a806152');
    poly(c, [[5, -20], [40, -39], [40, -3], [5, 15]], '#bda77c');
    poly(c, [[-42, -37], [-6, -69], [14, -57], [5, -17]], roof, '#4f4b4430');
    poly(c, [[-6, -69], [32, -57], [49, -39], [5, -17]], '#934c43');
    line(c, [[-6, -69], [32, -57], [49, -39]], '#edaf85', 2);
    poly(c, [[-17, -21], [-7, -17], [-7, -5], [-17, -9]], lit ? '#ffe7a6' : '#657c77');
    poly(c, [[17, -13], [28, -19], [28, -7], [17, -1]], '#e2c887');
    line(c, [[-26, -30], [-26, 3]], '#997b62', 3); line(c, [[-34, -12], [4, 3]], '#997b62', 2);
    rect(c, 20, -77, 10, 23, '#d9bc91'); poly(c, [[18, -77], [27, -83], [32, -79], [24, -73]], '#715c4d');
    c.restore();
  }
  function castleTower(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    rect(c, -28, -115, 56, 120, gradient(c, -28, 0, 28, 0, ['#dccdb3', '#aaa590']), 5);
    ellipse(c, 0, -115, 28, 9, '#efe1c6');
    poly(c, [[-35, -115], [0, -173], [35, -115]], '#377c7a', '#255b5c');
    line(c, [[0, -173], [13, -116]], '#76b0a1', 2);
    for (let i = 0; i < 3; i++) { arch(c, -6, -94 + i * 30, 12, 20, i === 0 ? '#f5d78b' : '#526d6a'); line(c, [[-26, -68 + i * 31], [26, -68 + i * 31]], '#8a938450'); }
    flag(c, 0, -184, .8, '#bd5c54', t); c.restore();
  }

  function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1e15, n)) : fallback; }
  function magnitude(value) {
    let m = 0, e = 0;
    if (value && typeof value === 'object' && 'm' in value) { m = Number(value.m); e = Number(value.e); }
    else { const match = String(value == null ? 0 : value).match(/^([+-]?[\d.]+)(?:e([+-]?\d+))?$/i); if (match) { m = Number(match[1]); e = Number(match[2] || 0); } }
    if (!(m > 0) || !Number.isFinite(m) || !Number.isFinite(e)) return { positive: false, order: 0, band: 0, label: '0' };
    const order = Math.max(-15, Math.min(9e15, Math.log10(m) + e));
    return { positive: true, order, band: Math.max(0, Math.floor(order / 3)), label: order < 6 && order > -3 ? String(Math.round(m * Math.pow(10, e) * 100) / 100) : m.toPrecision(3) + 'e' + e };
  }
  function sum(values) { return (values || []).reduce((n, x) => Math.min(1e15, n + num(x)), 0); }
  function copyList(values, limit = 64) { return (Array.isArray(values) ? values : []).slice(0, limit).map(x => typeof x === 'string' ? x : String(x == null ? '' : x)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function paintEffects(c, effects, x = 500, y = 350, color = '#f5d7a0') {
    (effects || []).slice(-3).forEach(e => burst(c, { count: 1, elapsed: Math.max(0, e.age) / Math.max(.1, e.duration) * 2.4 }, e.payload && Number.isFinite(e.payload.x) ? e.payload.x : x, e.payload && Number.isFinite(e.payload.y) ? e.payload.y : y, color, 22, e.kind === 'prestige' ? 235 : 125));
  }
  function caption(c, text, x, y, color = '#e9dfb9') { c.fillStyle = color; c.font = '500 19px system-ui, sans-serif'; c.fillText(String(text), x, y); }
  function gem(c, x, y, s, color = '#8ab5ac') {
    poly(c, [[x - 8 * s, y], [x - 4 * s, y - 9 * s], [x + 5 * s, y - 9 * s], [x + 10 * s, y], [x, y + 12 * s]], color, '#f2e4c28a', .8);
    poly(c, [[x - 4 * s, y - 9 * s], [x + 2 * s, y], [x, y + 12 * s], [x - 8 * s, y]], '#ffffff35');
    line(c, [[x - 8 * s, y], [x + 10 * s, y]], '#e3e8d9a0', .9);
  }
  function coins(c, x, y, rx, ry, n, seed = 4) {
    ellipse(c, x, y, rx, ry, '#9a773d');
    const list = Array.from({ length: n }, (_, i) => {
      const a = hash(i * 4 + seed) * TAU, r = Math.sqrt(hash(i * 4 + seed + 1));
      return [x + Math.cos(a) * r * rx, y + Math.sin(a) * r * ry, 5 + hash(i + 83) * 5];
    }).sort((a, b) => a[1] - b[1]);
    list.forEach(([px, py, s], i) => {
      ellipse(c, px, py + 3, s, s * .39, '#9e713d');
      ellipse(c, px, py, s, s * .38, ['#d1a451', '#e3bf70', '#edcd88', '#b68b45'][i % 4], .07, '#8d6a3e');
      ellipse(c, px, py, s * .61, s * .23, null, 0, '#f9dfa78a');
    });
  }
  function dragon(c, x, y, s, t, awake, paper = false, species = 'cave') {
    c.save(); c.translate(x, y); c.scale(s, s);
    const breath = Math.sin(t * .8) * 1.4;
    const palette = { cave: ['#508578', '#56877a', '#a3a477', '#526a71', '#2b535c'], ice: ['#8cb8c7', '#a2cbd4', '#d1e3dc', '#b7d3df', '#66879c'], storm: ['#77739b', '#8b83af', '#c8bd93', '#9b8dab', '#4b456a'], sand: ['#bd986b', '#c5a77b', '#e0c899', '#b6a081', '#8b654d'], sea: ['#429496', '#62aba4', '#b3d4b1', '#4d8d9e', '#2d607e'], shadow: ['#5b5576', '#716184', '#a79d9e', '#786b86', '#3c334d'] }[species] || ['#508578', '#56877a', '#a3a477', '#526a71', '#2b535c'];
    if (paper) {
      // Faceted folded-paper silhouette: deliberately different from the rounded cave creature.
      const wing = Math.sin(t * .8) * 3 + (awake ? -9 : 0);
      poly(c, [[-23, -42], [-152, -168 + wing], [-103, -145], [-88, -218 + wing], [-43, -166], [5, -197 + wing], [36, -59]], '#a6545c', '#e4a18a', 1.2);
      poly(c, [[-23, -42], [-88, -218 + wing], [-43, -166], [36, -59]], '#c6736c');
      line(c, [[-88, -218 + wing], [-23, -42], [-152, -168 + wing]], '#f1b89988', 1.3);
      poly(c, [[-108, -13], [-166, -43], [-187, -109], [-167, -81], [-130, -51], [-50, -42]], '#954956');
      poly(c, [[-102, -28], [-51, -75], [43, -67], [91, -38], [60, -2], [-39, 8]], '#c47770', '#773d4d');
      poly(c, [[-51, -75], [-39, 8], [60, -2], [43, -67]], '#de9981');
      poly(c, [[49, -56], [80, -105], [104, -145], [150, -155], [190, -127], [151, -112], [113, -83], [89, -29]], '#bf6a67', '#733f4b');
      poly(c, [[104, -145], [151, -112], [190, -127], [150, -155]], '#e4a58b');
      poly(c, [[124, -145], [125, -178], [145, -151]], '#e9d5a9');
      poly(c, [[-24, -7], [-40, 29], [-5, 29], [12, -4]], '#9e505b');
      poly(c, [[55, -15], [55, 28], [88, 28], [76, -20]], '#b46162');
      ellipse(c, 151, -137, 5, 3, '#f4dfa8'); ellipse(c, 153, -137, 1.5, 3, '#463d45');
      line(c, [[156, -119], [181, -126]], '#673847', 2);
      c.restore(); return;
    }
    const wingRise = Math.sin(t * .55) * 2 + (awake ? -13 : 0);
    c.beginPath(); c.moveTo(-4, -48); c.bezierCurveTo(-59, -117, -109, -125, -142, -185 + wingRise);
    c.lineTo(-91, -158 + wingRise); c.lineTo(-79, -213 + wingRise); c.lineTo(-30, -166 + wingRise); c.lineTo(12, -191 + wingRise);
    c.bezierCurveTo(16, -137, 40, -111, 31, -57); c.closePath(); c.fillStyle = gradient(c, -100, -210, 20, -50, [palette[3], palette[4]]); c.fill();
    line(c, [[-79, -213 + wingRise], [-42, -133], [-4, -48]], '#86a397', 3);
    line(c, [[-142, -185 + wingRise], [-42, -133], [12, -191 + wingRise]], '#6c8b84', 2);
    curve(c, [-76, -16], [-182, 22], [-224, -46], [-176, -98], '#315a5c', 30);
    curve(c, [-76, -13], [-177, 25], [-219, -43], [-176, -98], '#629185', 17);
    poly(c, [[-175, -97], [-176, -123], [-194, -105]], '#719b88');
    ellipse(c, -8, -42 + breath, 109, 54, palette[0], -.08, '#2b5557');
    ellipse(c, 17, -22 + breath, 72, 27, palette[2], -.08);
    c.save(); c.beginPath(); c.ellipse(-8, -43 + breath, 104, 49, -.08, 0, TAU); c.clip();
    for (let j = 0; j < 4; j++) for (let i = 0; i < 13; i++) {
      const xx = -104 + i * 15 + j % 2 * 7, yy = -77 + j * 16;
      c.beginPath(); c.arc(xx, yy, 6, .2, Math.PI - .2); c.strokeStyle = j < 2 ? '#a0bb8b54' : '#2d665d55'; c.lineWidth = 1.1; c.stroke();
    } c.restore();
    for (let i = 0; i < 7; i++) poly(c, [[-96 + i * 23, -62 - Math.sin(i / 6 * Math.PI) * 32 + breath], [-89 + i * 23, -80 - Math.sin(i / 6 * Math.PI) * 34 + breath], [-78 + i * 23, -66 - Math.sin(i / 6 * Math.PI) * 29 + breath]], '#8da98a');
    // A long arched neck and a large expressive head.
    c.beginPath(); c.moveTo(54, -45); c.bezierCurveTo(70, -73, 67, -108, 110, -135);
    c.bezierCurveTo(130, -151, 156, -148, 176, -132); c.lineTo(203, -117); c.quadraticCurveTo(208, -109, 191, -105);
    c.lineTo(165, -100); c.bezierCurveTo(133, -91, 123, -54, 93, -25); c.closePath(); c.fillStyle = palette[1]; c.fill(); c.strokeStyle = '#2b5557'; c.lineWidth = 2; c.stroke();
    curve(c, [88, -29], [115, -66], [121, -95], [166, -107], '#abb78c', 12);
    poly(c, [[129, -140], [116, -176], [139, -154]], '#d5c7a0'); poly(c, [[151, -144], [157, -173], [166, -141]], '#e5d6ac');
    ellipse(c, 164, -127, 9, 5, '#d9bd65', -.15); ellipse(c, 168, -127, 2, 4, '#263d3e'); ellipse(c, 170, -129, 1, 1, '#fff1c0');
    ellipse(c, 195, -114, 2, 1.8, '#294b4d'); line(c, [[166, -105], [201, -109]], '#24464c', 2);
    if (awake) { poly(c, [[166, -103], [203, -108], [196, -95], [165, -95]], '#b98b75'); poly(c, [[176, -103], [179, -97], [181, -104]], '#f1dfb4'); }
    // Folded feet and ivory claws rest on the pile.
    ellipse(c, -42, -3, 25, 13, '#3a6a66', -.17); ellipse(c, 62, -7, 29, 13, '#477870', -.18);
    for (let i = 0; i < 3; i++) { poly(c, [[-47 + i * 10, 2], [-42 + i * 10, 13], [-36 + i * 10, 2]], '#dccba3'); poly(c, [[61 + i * 9, -1], [68 + i * 9, 9], [72 + i * 9, -2]], '#dccba3'); }
    c.restore();
  }


  function model(state, config = {}, content = {}) {
    const r = state.run || {}, meta = state.meta || {}, layers = state.layers || {}, sl = layers.sleep || {}, cl = layers.clutch || {};
    const sleep = sl.state || {}, clutch = cl.state || {}, halls = sleep.halls || {}, now = num(content.now, num(state.lastTick)), gold = magnitude(r.gold);
    const sleeps = num(sleep.sleeps), thresholds = ['age.adult', 'age.old', 'age.ancient', 'age.great', 'age.legend'];
    let age = 0; thresholds.forEach((key, i) => { if (Number.isFinite(Number(config[key])) && sleeps >= Number(config[key])) age = i + 1; });
    const hallList = Object.keys(halls).filter(k => num(halls[k]) > 0).map(id => ({ id, level: num(halls[id]) }));
    const servants = (r.servants || []).slice(0, 8).map(x => num(x)), q = r.q || {}, quality = ['claws', 'scale', 'flame', 'wings'].map(id => ({ id, level: num(q[id]) }));
    const fx = r.fx || {}, history = (meta.chronicle || []).slice(-12).map(e => ({ kind: String(e.kind || 'sleep'), age: String(e.age || ''), n: num(e.n), wins: num(e.wins), hmax: magnitude(e.hmax), species: String(e.species || '') }));
    return { cycle: num(cl.count) + ':' + num(sl.count), gold, pile: gold.positive ? Math.min(7, Math.max(1, Math.ceil((gold.order + 1) / 2))) : 0,
      record: magnitude(r.hmax), age, sleeps, species: String(clutch.species || 'cave'), hallList, halls: hallList.map(x => x.id),
      servants, servantTotal: sum(servants), quality, signature: servants.join(':') + '/' + quality.map(x => x.level).join(':') + '/' + hallList.map(x => x.id + x.level).join(':'),
      curled: !!r.curled, wounded: num(r.woundedUntil) > now, raid: r.raid ? { target: String(r.raid.target || r.raid.id || ''), end: num(r.raid.end) } : null,
      knight: r.knight ? { type: String(r.knight.type || r.knight.id || 'wanderer'), at: num(r.knight.at), arrived: num(r.knight.at) <= now } : null,
      wins: num(r.wins), losses: num(r.losses), fights: num(r.fightCount), raids: num(r.raids), raidWins: num(r.raidWins),
      trophies: copyList(r.trophies, 12), archiveTrophies: Object.keys(meta.trophies || {}).length, history,
      gems: magnitude(meta.gems), fear: Math.min(1, num(r.fear) / Math.max(1, num(config['fear.max'], 100))),
      rain: num(fx.rain) > now, eclipse: num(fx.eclipse) > now, quiet: num(fx.quiet) > now,
      breath: String(r.breath || ''), world: String((r.world || {}).id || ''), event: String((r.event || {}).id || ''),
      mode: content.mode === 'chronicle' && history.length ? 'chronicle' : 'cave',
      label: ['Молодой', 'Взрослый', 'Старый', 'Древний', 'Великий', 'Легендарный'][age] + ' дракон · золото ' + gold.label + ' · слуг ' + sum(servants) };
  }
  function changes(a, b) {
    if (!a) return [];
    if (a.cycle !== b.cycle) return ['prestige'];
    const out = [];
    if (a.signature !== b.signature) out.push('build');
    if (a.fights !== b.fights || a.wins !== b.wins || a.losses !== b.losses) out.push('battle');
    if (a.raid && !b.raid || a.raidWins < b.raidWins) out.push('raid');
    if (a.curled !== b.curled || a.event !== b.event || a.breath !== b.breath) out.push('story');
    return out.slice(0, 2);
  }
  function cave(c, m, t, effects) {
    const cold = m.species === 'ice' || m.species === 'sea';
    sky(c, '#202c35', cold ? '#4f6570' : '#6e6857');
    arch(c, 669, 98, 232, 263, gradient(c, 0, 100, 0, 370, m.eclipse ? ['#504962', '#b9987a'] : ['#789ca5', '#d1c8a1']));
    poly(c, [[665, 311], [731, 229], [781, 283], [835, 200], [904, 303], [904, 370], [665, 370]], '#617b78');
    if (!m.eclipse) ellipse(c, 833, 156, 22, 22, '#e5debb'); else { ellipse(c, 830, 155, 23, 23, '#d9bca0'); ellipse(c, 824, 151, 22, 22, '#504962'); }
    poly(c, [[0, 0], [1000, 0], [1000, 620], [909, 620], [916, 224], [877, 103], [812, 64], [719, 109], [666, 207], [650, 360], [630, 620], [0, 620]], '#354348');
    for (let i = 0; i < 13; i++) {
      const x = i * 87 - 25, depth = 55 + hash(i + 8) * 108;
      poly(c, [[x, 0], [x + 92, 0], [x + 58, depth], [x + 20, depth * .47]], i % 2 ? '#48524f' : '#3d4a4b');
    }
    poly(c, [[0, 398], [171, 355], [368, 369], [643, 350], [1000, 415], [1000, 620], [0, 620]], '#5e6254');
    poly(c, [[0, 532], [206, 481], [475, 521], [738, 450], [1000, 492], [1000, 620], [0, 620]], '#72735e');
    curve(c, [810, 346], [706, 440], [840, 535], [1015, 575], '#b0a58255', 76);
    for (let i = 0; i < 13; i++) ellipse(c, hash(i + 71) * 1000, 421 + hash(i + 23) * 169, 12 + hash(i) * 16, 5 + hash(i + 2) * 5, '#454f4a');
    if (m.halls.includes('grotto')) { arch(c, 81, 194, 165, 195, '#1f363b', '#7d8d7f', 7); for (let i = 0; i < 5; i++) line(c, [[89, 258 + i * 27], [105, 258 + i * 27]], '#a7b09a', 4); }
    if (m.halls.includes('mirror')) { arch(c, 286, 149, 97, 170, '#a4c3bb5a', '#a5a99a', 6); line(c, [[306, 264], [355, 185]], '#cce0d261', 10); }
    if (m.halls.includes('sanctum')) { poly(c, [[524, 264], [589, 264], [601, 326], [512, 326]], '#818f82'); gem(c, 556, 249, 1.8, '#b8b1d1'); glow(c, 556, 250, 65, '#b5a1d0', .18); }
    if (m.halls.includes('cache')) { rect(c, 113, 420, 74, 45, '#795d45', 5); line(c, [[123, 420], [123, 465]], '#c8ad70', 5); line(c, [[175, 420], [175, 465]], '#c8ad70', 5); rect(c, 144, 435, 12, 15, '#d4ba7e', 2); }
    if (m.halls.includes('nest')) { ellipse(c, 231, 465, 46, 16, '#8d7953'); for (let i = 0; i < 9; i++) line(c, [[193 + i * 8, 464], [205 + i * 6, 477]], '#b59c6c', 2); ellipse(c, 231, 450, 16, 22, '#c5bfa2', .3); }
    if (m.halls.includes('bones')) { for (let i = 0; i < 4; i++) { line(c, [[100 + i * 27, 306], [100 + i * 27, 354]], '#bdb69e', 6); ellipse(c, 100 + i * 27, 306, 7, 5, '#d2cab1'); } }
    if (m.pile) {
      const width = 65 + m.pile * 25, height = 17 + m.pile * 6;
      coins(c, 474, 439, width, height, 14 + m.pile * 19, 7);
      if (m.pile > 3) coins(c, 461, 412, width * .65, height * .6, m.pile * 9, 48);
      if (m.gold.order >= 12) { spark(c, 448, 400, 7 + Math.sin(t) * 2, '#e5cd83'); caption(c, 'Золото ' + m.gold.label, 351, 517, '#e8d497'); }
    }
    if (m.gems.positive) for (let i = 0; i < Math.min(9, 1 + Math.max(0, Math.floor(m.gems.order)) * 2); i++) gem(c, 300 + i * 35, 461 + Math.sin(i * 2) * 12, .9, ['#9bb9ba', '#bc929e', '#a6bea1'][i % 3]);
    const battle = (effects || []).find(e => e.kind === 'battle' && e.age < 1.8), size = .8 + m.age * .09;
    if (!m.raid) {
      c.save(); if (m.curled) { c.translate(0, 96); c.scale(1, .78); }
      dragon(c, 473, 405, size, t, !!battle && !m.curled, false, m.species); c.restore();
      if (m.wounded) { c.save(); c.translate(482, m.curled ? 390 : 366); c.rotate(.19); rect(c, -9, -21, 19, 43, '#d5d0b4', 3); for (let i = 0; i < 4; i++) line(c, [[-9, -16 + i * 9], [9, -12 + i * 9]], '#a5a58e', 1.5); c.restore(); }
      const armor = m.quality.find(q => q.id === 'scale').level;
      if (armor > 0) { const marks = Math.min(7, 1 + Math.floor(Math.log10(armor + 1))); for (let i = 0; i < marks; i++) gem(c, 435 + i * 10, m.curled ? 373 : 349, .4, '#b1c3a0'); }
      if (battle && !m.curled) { const p = battle.age / 1.8, alpha = Math.sin(p * Math.PI); c.save(); c.globalAlpha = alpha; const color = m.breath === 'frost' ? '#c2e6e7' : m.breath === 'storm' ? '#cbbff0' : '#e7b36f'; curve(c, [653, 310], [705, 286], [744, 342], [809, 329], color, 12 + alpha * 13); glow(c, 751, 320, 70, color, .24); c.restore(); }
    } else { dragon(c, 794 + Math.sin(t * .35) * 10, 236 + Math.sin(t * .6) * 5, .27, t, true, false, m.species); caption(c, 'Дракон в набеге', 686, 389, '#e3dfbe'); }
    m.servants.forEach((count, i) => { if (!count) return; const x = 102 + i * 109, y = 535 + i % 2 * 24; person(c, x, y, .65, ['#bcb48b', '#ad876e', '#8aa8a1', '#a5aa7f'][i % 4], m.curled || m.wounded ? 0 : Math.sin(t * .7 + i) * .5); poly(c, [[x - 6, y - 28], [x, y - 43], [x + 7, y - 28]], i % 2 ? '#ad8b6a' : '#93aa8e'); if (count > 1) { c.fillStyle = '#c9c9ae'; c.font = '13px system-ui'; c.fillText('×' + (count >= 1e6 ? count.toExponential(0) : count), x + 10, y - 4); } });
    if (m.knight) {
      const x = m.knight.arrived ? 748 : 827, y = m.knight.arrived ? 430 : 367;
      person(c, x, y, 1, '#b2b6aa', .2); rect(c, x - 7, y - 47, 14, 13, '#c8ccba', 4); line(c, [[x - 5, y - 41], [x + 5, y - 41]], '#50636a', 2);
      poly(c, [[x - 19, y - 27], [x - 7, y - 24], [x - 10, y - 8], [x - 20, y - 11]], '#b26d61', '#d9b58d', 1.5); line(c, [[x + 13, y], [x + 13, y - 60]], '#bda77b', 3);
    }
    if (m.rain) for (let i = 0; i < 22; i++) ellipse(c, hash(i + 38) * 900 + 50, (hash(i) * 580 + t * 44) % 580, 3, 5, '#edcc77');
    if (m.quiet) motes(c, t * .4, '#c7d8ba', 700, 120, 200, 240, 12);
    caption(c, m.curled ? 'Дракон свернулся на своей куче' : m.wounded ? 'Восстановление после боя' : 'Логово · век ' + (m.sleeps + 1), 39, 596, '#d4d1b2');
  }
  function chronicle(c, m, t) {
    sky(c, '#584844', '#8f7560');
    for (let i = 0; i < 11; i++) line(c, [[0, 70 + i * 55], [1000, 75 + i * 55]], '#403b3829', 3);
    ellipse(c, 501, 501, 411, 78, '#2f302a35');
    poly(c, [[90, 113], [485, 88], [500, 547], [88, 566]], '#a98c67'); poly(c, [[500, 88], [906, 109], [927, 565], [500, 547]], '#ab8d65');
    poly(c, [[105, 103], [481, 84], [500, 529], [105, 543]], '#dfcda5', '#a58c68', 2); poly(c, [[500, 84], [891, 106], [907, 542], [500, 529]], '#e7d8b4', '#a58c68', 2);
    line(c, [[490, 94], [500, 528]], '#b29c745c', 8);
    const entry = m.history[m.history.length - 1];
    caption(c, 'ЛЕТОПИСЬ ЛОГОВА', 150, 154, '#6a5947'); line(c, [[150, 168], [437, 168]], '#b6a17c', 2);
    poly(c, [[130, 432], [218, 310], [264, 367], [340, 250], [447, 437]], '#bbab8d'); poly(c, [[201, 432], [340, 250], [358, 438]], '#d3c49f');
    dragon(c, 302, 421, .65, t * .22, false, true);
    caption(c, entry.kind === 'clutch' ? 'Начало новой кладки' : entry.age + ' · завершённый век', 142, 485, '#6f5c47');
    caption(c, entry.hmax.positive ? 'Рекорд того века: ' + entry.hmax.label : entry.species || 'Память предков', 142, 513, '#7c6852');
    m.history.slice(-6).forEach((e, i) => {
      const y = 184 + i * 51; ellipse(c, 552, y - 4, 9, 9, e.kind === 'clutch' ? '#a87664' : '#91a28d'); line(c, [[552, y + 7], [552, y + 36]], '#b8a581', 2);
      c.fillStyle = '#715d49'; c.font = '17px Georgia, serif'; c.fillText(e.kind === 'clutch' ? 'Кладка ' + e.n + ' · ' + e.species : 'Сон ' + e.n + ' · ' + e.age, 578, y);
      c.fillStyle = '#9a805f'; c.font = '14px system-ui'; c.fillText(e.kind === 'sleep' ? 'Побед ' + e.wins + ' · рекорд ' + e.hmax.label : 'Новая ветвь рода', 578, y + 20);
    });
    rect(c, 836, 102, 21, 83, '#a76355'); poly(c, [[836, 183], [847, 173], [857, 183], [857, 102], [836, 102]], '#a76355');
    caption(c, 'История не меняет текущую кучу золота', 285, 590, '#e5d7b9');
  }
  function draw(c, m, t, effects) { if (!m) return; if (m.mode === 'chronicle') chronicle(c, m, t); else cave(c, m, t, effects); paintEffects(c, effects, 480, 388, '#f2d38f'); }
  return { model, changes, draw, budget: { servants: 8, coins: 210, history: 6, effects: 3 } };
});
