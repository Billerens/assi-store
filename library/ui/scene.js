// Read-only rendering: no RNG, timers, persistence, or economy changes.
(function (root, make) {
  const api = make();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LibraryScene = api;
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
  function shelf(c, x, y, w, rows, seed = 1) {
    rect(c, x - 8, y - 8, w + 16, rows * 53 + 17, '#463b36', 4, '#c19a63');
    rect(c, x, y, w, rows * 53, '#2d3432');
    const palette = ['#b97460', '#557c78', '#d3ad71', '#677d8c', '#976c78', '#b7b18b', '#794d47'];
    for (let row = 0; row < rows; row++) {
      let xx = x + 4, i = 0;
      while (xx < x + w - 10) {
        const n = seed * 100 + row * 32 + i, bw = 6 + hash(n) * 12, bh = 25 + hash(n + 2) * 19;
        const yy = y + row * 53 + 47 - bh;
        rect(c, xx, yy, bw, bh, palette[Math.floor(hash(n + 30) * palette.length)], 1);
        line(c, [[xx + 2, yy + 5], [xx + bw - 2, yy + 5]], '#f5ddb77a');
        line(c, [[xx + 2, yy + bh - 5], [xx + bw - 2, yy + bh - 5]], '#e8c48c80');
        if (bw > 12) line(c, [[xx + bw / 2, yy + 10], [xx + bw / 2, yy + bh - 9]], '#e5c28290', 1.2);
        xx += bw + 2; i++;
      }
      rect(c, x - 4, y + row * 53 + 47, w + 8, 7, '#a47c52', 1); rect(c, x, y + row * 53 + 54, w, 2, '#1a2a2a66');
    }
  }
  function openBook(c, x, y, w, h, tilt = 0, glowColor) {
    c.save(); c.translate(x, y); c.rotate(tilt);
    if (glowColor) glow(c, 0, -h * .3, w * .9, glowColor);
    poly(c, [[-w / 2 - 8, -h + 8], [0, -h + 23], [w / 2 + 8, -h + 8], [w / 2 + 15, 13], [0, 30], [-w / 2 - 15, 13]], '#80594b', '#c3a16a', 2);
    for (let i = 3; i >= 0; i--) {
      const d = i * 2;
      c.beginPath(); c.moveTo(0, 15 + d); c.bezierCurveTo(-w * .15, -2 + d, -w * .36, -5 + d, -w / 2, 4 + d);
      c.lineTo(-w / 2, -h + d); c.bezierCurveTo(-w * .29, -h - 11 + d, -w * .16, -h + 1 + d, 0, -h + 16 + d);
      c.bezierCurveTo(w * .15, -h + 1 + d, w * .3, -h - 10 + d, w / 2, -h + d); c.lineTo(w / 2, 4 + d);
      c.bezierCurveTo(w * .3, -5 + d, w * .15, -1 + d, 0, 15 + d); c.closePath(); c.fillStyle = i ? '#cdbf98' : '#f3e4ba'; c.fill();
      c.strokeStyle = '#ac9c7355'; c.lineWidth = .8; c.stroke();
    }
    curve(c, [0, -h + 17], [-3, -h * .5], [3, -8], [0, 15], '#ab946c', 2);
    for (let i = 0; i < 6; i++) {
      const yy = -h + 25 + i * (h - 35) / 6;
      curve(c, [-w / 2 + 12, yy], [-w * .32, yy - 4], [-w * .2, yy + 1], [-12, yy + 9], '#b6a37d70', 1.2);
      curve(c, [12, yy + 9], [w * .2, yy + 1], [w * .32, yy - 4], [w / 2 - 12, yy], '#b6a37d70', 1.2);
    }
    c.restore();
  }
  function lamp(c, x, y, t) {
    line(c, [[x, 0], [x, y - 10]], '#57544c', 2);
    glow(c, x, y + 18, 92, '#ffd89030');
    poly(c, [[x - 23, y + 12], [x - 10, y - 14], [x + 10, y - 14], [x + 23, y + 12]], '#c49859', '#6f5941');
    ellipse(c, x, y + 12, 23, 5, '#ffe5a3'); ellipse(c, x, y + 17, 4, 5, '#fff2c9');
  }

  // Only run.halls are built rooms. own/rd are current books; occupied desks are actual readers.
  // Permanent vault/catalog do not refill shelves after a new-building prestige.
  const COLORS = ['#6f9b7a', '#bc8e69', '#9a7c9c', '#b77272', '#adab71', '#748bb0'];
  function model(state, config = {}, content = {}) {
    const r = state.run || {}, meta = state.meta || {}, layers = state.layers || {};
    const halls = copyList(r.halls, 64), definitions = content.halls || [];
    const groups = Array.from({ length: 48 }, (_, i) => ({ kind: Math.floor(i / 6), branch: i % 6, count: num((r.own || [])[i]), read: num((r.rd || [])[i]) })).filter(x => x.count > 0);
    const branches = Array.from({ length: 6 }, (_, branch) => ({ branch, count: sum(groups.filter(x => x.branch === branch).map(x => x.count)), level: num((r.levels || [])[branch]) }));
    const desks = (r.desks || []).slice(0, 32).map((d, i) => ({ index: i, busy: Boolean(d), branch: d ? num(d.b) % 6 : 0,
      progress: d ? clamp(num(d.p) / Math.max(.001, num(d.w, 1))) : 0, id: d ? String(d.id || '') : '' }));
    const building = num((layers.building || {}).count) + 1;
    return {
      cycle: String(building) + ':' + String(r.seed || ''), building, halls,
      rooms: halls.slice(0, 12).map(id => ({ id, title: (definitions.find(x => x.id === id) || {}).title || (id === 'reading' ? 'Читальный зал' : id) })),
      groups, branches, total: sum(groups.map(x => x.count)), signature: (r.own || []).map(String).join('|'),
      desks, deskTotal: (r.desks || []).length, active: (r.desks || []).filter(Boolean).length,
      tomes: copyList(r.tomes, 32), readTotal: num(r.readTotal), knowledge: magnitude(r.knEarned),
      vault: copyList(meta.vault, 32), catalog: (meta.catalog || []).length, collection: (meta.collection || []).length,
      cats: num(meta.cats), event: r.event ? String(r.event.id || '') : '', damaged: num(r.damaged),
      restoring: num(r.restoreUntil) > num(content.now), leaks: num(r.roofUntil) > num(content.now),
      lamp: num((r.upgrades || {}).lamp), librarian: halls.includes('lending') || num((meta.council || {}).librarian) > 0,
      mode: halls.includes('observatory') && content.mode === 'observatory' ? 'observatory' : 'house',
      label: 'Залов: ' + halls.length + ' · книг: ' + sum(groups.map(x => x.count)) + ' · читают: ' + (r.desks || []).filter(Boolean).length + '/' + (r.desks || []).length
    };
  }
  function changes(a, b) {
    if (!a) return [];
    if (a.cycle !== b.cycle) return ['prestige'];
    const out = [];
    if (a.signature !== b.signature || !same(a.halls, b.halls) || a.deskTotal !== b.deskTotal || a.lamp !== b.lamp) out.push('build');
    if (b.readTotal > a.readTotal || !same(a.tomes, b.tomes)) out.push('read');
    if (a.event !== b.event || a.restoring !== b.restoring) out.push('event');
    return out.slice(0, 2);
  }
  function bookcase(c, x, y, w, h, groups, offset) {
    rect(c, x, y, w, h, '#664f3c', 3, '#b99362'); rect(c, x + 7, y + 7, w - 14, h - 14, '#35403a');
    const all = groups.filter(g => g.count > 0), rows = 2;
    for (let row = 0; row < rows; row++) {
      const yy = y + 12 + row * (h / 2 - 4), bottom = yy + h / 2 - 18;
      let xx = x + 12;
      const shown = all.slice(offset + row * Math.floor((w - 26) / 12), offset + (row + 1) * Math.floor((w - 26) / 12)).slice(0, Math.floor((w - 26) / 12));
      shown.forEach((g, i) => {
        const bh = 20 + hash(i + offset * 7) * Math.max(5, h / 2 - 40);
        rect(c, xx, bottom - bh, 8 + i % 3, bh, COLORS[g.branch], 1);
        line(c, [[xx + 1, bottom - bh + 5], [xx + 7, bottom - bh + 5]], '#e2ca8c', 1); xx += 12;
      });
      rect(c, x + 4, bottom, w - 8, 6, '#b18a5c', 1);
    }
  }
  function houseScene(c, m, t, effects) {
    sky(c, '#314b50', '#99856b'); stars(c, t, '#e5d5aa', 35, 215); ellipse(c, 871, 80, 31, 31, '#e2ddbb');
    pine(c, 52, 545, 2.1, '#2c5147'); pine(c, 948, 550, 1.8, '#3b5c4e');
    const roomCount = Math.max(1, Math.min(6, m.rooms.length)), floors = Math.ceil(roomCount / 3), columns = Math.min(3, roomCount);
    const width = columns === 1 ? 490 : columns === 2 ? 700 : 800, left = (1000 - width) / 2;
    const floorY = 520, roomH = floors === 1 ? 250 : 183, top = floorY - floors * roomH;
    ellipse(c, 501, 548, width / 2 + 48, 30, '#1e363c50');
    poly(c, [[left - 22, top + 6], [500, top - 100], [left + width + 22, top + 6]], '#79594b', '#c39b6a', 3);
    poly(c, [[left, top + 8], [500, top - 80], [left + width, top + 8]], '#a58057');
    ellipse(c, 500, top - 35, 22, 22, '#71958b', 0, '#e2c993'); line(c, [[478, top - 35], [522, top - 35]], '#d4ba85', 3);
    rect(c, left - 7, top, width + 14, floorY - top + 20, '#9c7956', 3); rect(c, left + 8, top + 10, width - 16, floorY - top, '#d4bb8f');
    const spines = [];
    m.groups.forEach(g => { for (let n = 0; n < Math.min(18, g.count) && spines.length < 216; n++) spines.push(g); });
    for (let i = 0; i < roomCount; i++) {
      const col = i % 3, row = Math.floor(i / 3), rw = width / columns;
      const x = left + col * rw, y = top + row * roomH;
      rect(c, x + 12, y + 13, rw - 24, roomH - 25, ['#c9b691', '#c2b38e', '#b9b195'][i % 3]);
      const room = m.rooms[i] || { id: 'reading', title: 'Читальный зал' };
      bookcase(c, x + 24, y + 28, Math.min(137, rw * .45), roomH - 73, spines, i * 36);
      arch(c, x + rw - 84, y + 28, 54, roomH - 78, '#6d9088', '#a68a63', 4); line(c, [[x + rw - 57, y + 31], [x + rw - 57, y + roomH - 50]], '#d6c49a', 3);
      rect(c, x + rw - 99, y + roomH - 49, 86, 8, '#9b7653');
      if (room.id === 'herbarium') { for (let k = 0; k < 3; k++) { line(c, [[x + rw - 87 + k * 25, y + roomH - 52], [x + rw - 87 + k * 25, y + roomH - 86]], '#567951', 3); ellipse(c, x + rw - 84 + k * 25, y + roomH - 78, 8, 12, '#79925d', .5); } }
      if (room.id === 'maps') { rect(c, x + rw - 100, y + 53, 72, 44, '#e8d8b0', 2); curve(c, [x + rw - 91, y + 81], [x + rw - 67, y + 64], [x + rw - 58, y + 94], [x + rw - 37, y + 65], '#819c87', 3); }
      if (room.id === 'gallery') { rect(c, x + rw - 96, y + 49, 63, 47, '#96774f', 2); rect(c, x + rw - 91, y + 54, 53, 37, '#73968a'); poly(c, [[x + rw - 90, y + 88], [x + rw - 69, y + 61], [x + rw - 39, y + 88]], '#4e7168'); }
      if (room.id === 'music') { ellipse(c, x + rw - 65, y + 85, 13, 20, '#aa7c51', -.3); line(c, [[x + rw - 62, y + 74], [x + rw - 48, y + 38]], '#a57e52', 7); }
      caption(c, room.title, x + 24, y + roomH - 13, '#665641');
      rect(c, x, y + roomH - 4, rw, 11, '#8b684b'); if (col) rect(c, x - 6, y, 12, roomH, '#9c7b55');
    }
    if (floors > 1) {
      for (let i = 0; i < 10; i++) line(c, [[left + width - 162 + i * 13, 510 - i * 19], [left + width - 125 + i * 13, 510 - i * 19]], '#e2c28f', 5);
      line(c, [[left + width - 170, 486], [left + width - 50, 311]], '#886648', 4);
    }
    // The real desk count is compressed spatially; only occupied desks have readers/books.
    const shownDesks = m.desks.slice(0, 8);
    shownDesks.forEach((d, i) => {
      const x = 294 + (i % 4) * 135, y = 538 + Math.floor(i / 4) * 38;
      line(c, [[x - 25, y], [x - 29, y + 24]], '#654d3c', 5); line(c, [[x + 25, y], [x + 29, y + 24]], '#654d3c', 5); ellipse(c, x, y - 3, 41, 11, '#ac8358');
      if (d.busy) { openBook(c, x, y - 4, 41, 20, Math.sin(t * .8 + i) * .025); person(c, x + 31, y + 3, .62, COLORS[d.branch], 0); line(c, [[x - 16, y - 8], [x - 16 + d.progress * 29, y - 8]], '#d5b968', 2); }
    });
    if (m.librarian) person(c, 204 + Math.sin(t * .15) * 24, 535, 1.05, '#788b80', t * .8);
    if (m.lamp) { lamp(c, 486, top + 24, t); glow(c, 500, 389, 148, '#f1ce8122'); }
    // A cat is a real event/permanent visitor, never awarded by the scenery.
    if (m.cats || m.event === 'cat') { ellipse(c, 210, 544, 21, 10, '#b8825d'); ellipse(c, 227, 538, 9, 10, '#c59668'); poly(c, [[220, 532], [221, 524], [226, 530], [232, 524], [234, 533]], '#bf8b60'); }
    m.tomes.slice(0, 9).forEach((id, i) => { rect(c, 423 + i * 14, top + 25, 11, 31, COLORS[i % 6], 2, '#e4d29a'); });
    if (m.vault.length) { rect(c, 100, 461, 87, 71, '#506862', 6, '#b3a477'); for (let i = 0; i < Math.min(8, m.vault.length); i++) rect(c, 111 + i % 4 * 17, 476 + Math.floor(i / 4) * 23, 12, 18, COLORS[i % 6], 1); }
    if (m.damaged) { rect(c, 807, 534, 70, 9, '#92735b', 2); for (let i = 0; i < Math.min(5, m.damaged); i++) rect(c, 811 + i * 11, 512, 9, 21, '#9b9279', 1); }
    if (m.restoring) { person(c, 843, 551, .8, '#b9a370', 0); glow(c, 838, 518, 35, '#edd19a3b'); }
    if (m.leaks) for (let i = 0; i < 12; i++) { const q = (t * .55 + i * .13) % 1; line(c, [[607 + i % 3 * 8, top + 25 + q * 170], [607 + i % 3 * 8, top + 31 + q * 170]], '#7eaab284', 2); }
    if (m.total > 1000) caption(c, 'Отделы ×' + Math.pow(10, Math.floor(Math.log10(m.total)) - 2), left + 20, 592, '#dfd2ac');
    if (m.rooms.length > 6) caption(c, 'Ещё залов: ' + (m.rooms.length - 6), left + width - 168, 592, '#dfd2ac');
    const read = (effects || []).find(x => x.kind === 'read');
    if (read) { const p = Math.sin(clamp(read.age / read.duration) * Math.PI); openBook(c, 500, 413 - p * 70, 119, 58, p * .08, '#f1cf7930'); }
    motes(c, t, '#f5dcaa', left + 20, top + 20, width - 40, floorY - top, 26);
  }
  function observatory(c, m, t) {
    sky(c, '#192f3d', '#3b555c'); stars(c, t, '#d9dfb7', 85, 480); glow(c, 501, 275, 230, '#89b1a526');
    ellipse(c, 819, 101, 39, 39, '#bdcfb0'); ellipse(c, 834, 88, 34, 34, '#203a48');
    c.beginPath(); c.arc(500, 490, 342, Math.PI * 1.05, Math.PI * 1.95); c.strokeStyle = '#aeb29370'; c.lineWidth = 8; c.stroke();
    ellipse(c, 500, 509, 276, 48, '#334f54', 0, '#bdba8a'); ellipse(c, 500, 534, 259, 28, '#223a43');
    rect(c, 464, 413, 80, 91, '#63796a'); ellipse(c, 504, 413, 90, 18, '#a1a482');
    const titleTome = m.tomes.includes('atlas');
    if (m.tomes.length) openBook(c, 505, 376 + Math.sin(t * .6) * 3, 300, 145, -.03, '#b8dfab25');
    if (titleTome) { poly(c, [[383, 310], [424, 241], [459, 281], [493, 258], [514, 320]], '#8bad8d'); curve(c, [493, 306], [536, 321], [442, 344], [521, 350], '#a5d6c6', 10); }
    const volumes = m.tomes.slice(0, 16);
    volumes.forEach((id, i) => {
      const a = i / Math.max(1, volumes.length) * TAU + t * .025, x = 505 + Math.cos(a) * 297, y = 285 + Math.sin(a) * 143;
      c.save(); c.translate(x, y); c.rotate(Math.sin(a) * .2); rect(c, -16, -25, 34, 48, COLORS[i % 6], 3, '#dec898'); rect(c, -12, 19, 27, 7, '#dfd5b0'); spark(c, 2, -3, 7, '#f1ddb0'); c.restore();
    });
    for (let i = 0; i < 6; i++) if (m.branches[i].level > 0) { const a = i / 6 * TAU; ellipse(c, 502 + Math.cos(a) * 148, 261 + Math.sin(a) * 90, 10 + Math.min(9, Math.log10(m.branches[i].level + 1) * 3), 10, COLORS[i]); }
    line(c, [[271, 444], [244, 528]], '#b39c70', 5); line(c, [[271, 444], [305, 528]], '#b39c70', 5);
    c.save(); c.translate(273, 428); c.rotate(-.4); rect(c, -40, -13, 90, 26, '#b49a69', 5); ellipse(c, 49, 0, 5, 15, '#92c4b9'); c.restore();
    if (m.active) person(c, 316, 522, 1.05, '#c4b28b', 0);
    caption(c, 'Обсерватория · уникальных томов ' + m.tomes.length, 281, 575, '#d9dbb8'); motes(c, t, '#cee6cc', 200, 170, 590, 350, 25);
  }
  function draw(c, m, t, effects) { if (!m) return; if (m.mode === 'observatory') observatory(c, m, t); else houseScene(c, m, t, effects); paintEffects(c, effects, 500, 363, '#edd9a0'); }
  return { model, changes, draw, budget: { rooms: 6, books: 216, readers: 8, tomes: 16, effects: 3 } };
});
