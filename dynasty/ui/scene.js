// Read-only rendering: no RNG, timers, persistence, or economy changes.
(function (root, make) {
  const api = make();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DynastyScene = api;
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

  // Progression: run.h owns buildings; court/family are current people. Laws, generation,
  // epoch and tree history survive only when the simulation leaves them in the save.
  const HOLDINGS = ['Хутор', 'Деревня', 'Мельница', 'Ярмарка', 'Рудник', 'Город', 'Порт', 'Столица', 'Фабрика'];
  function model(state, config = {}, content = {}) {
    const r = state.run || {}, meta = state.meta || {}, layers = state.layers || {};
    const epoch = num((layers.epoch || {}).count), generation = num((layers.generation || {}).count);
    const holdings = Array.from({ length: 9 }, (_, i) => num((r.h || [])[i]));
    const names = content.world && content.world.holdings || [];
    const tiles = holdings.map((count, kind) => ({ kind, count, title: names[kind] && names[kind].title || HOLDINGS[kind], density: count ? Math.min(5, 1 + Math.floor(Math.log10(count))) : 0 }))
      .filter(x => x.count > 0 && (x.kind < 8 || epoch >= 5));
    const ruler = r.ruler || {}, generationState = (layers.generation || {}).state || {};
    return {
      cycle: String(epoch) + ':' + generation + ':' + String(ruler.id || ''), seed: num(r.seed, 1), epoch, generation,
      holdings, tiles, total: sum(holdings), signature: (r.h || []).map(String).join('|'), scale: Math.floor(Math.log10(1 + sum(holdings)) / 3),
      ruler: { age: num(ruler.age), name: String(ruler.name || ''), dead: Boolean(r.dead), ill: Boolean(r.ill), regent: Boolean(ruler.regent) },
      court: num(r.court), spouse: Boolean(r.spouse), children: (r.children || []).slice(0, 8).map(x => ({ id: String(x.id), age: num(x.age), heir: x.id === r.heir })),
      familyTotal: (r.children || []).length, lands: num(r.lands), laws: Object.keys(generationState.laws || {}).filter(k => generationState.laws[k]).sort(),
      colonies: (generationState.colonies || []).length, campaign: r.campaign ? { kind: String(r.campaign.kind || r.campaign.id || 'war') } : null,
      fire: num((r.fx || {}).fireUntil) > num(ruler.age), event: r.card ? String(r.card.id || r.card.kind || 'card') : '',
      wealth: magnitude(r.gold), mode: content.mode === 'court' ? 'court' : 'realm', ancestors: (meta.tree || []).length,
      label: tiles.length ? 'Владения: ' + tiles.map(x => x.title + ' ×' + x.count).join(' · ') : 'Земля ещё не освоена. Первое владение появится после покупки.'
    };
  }
  function changes(before, after) {
    if (!before) return [];
    if (before.cycle !== after.cycle) return ['prestige'];
    const out = [];
    if (before.signature !== after.signature || before.court !== after.court || before.lands !== after.lands || !same(before.laws, after.laws)) out.push('build');
    if (before.spouse !== after.spouse || before.familyTotal !== after.familyTotal || before.ruler.dead !== after.ruler.dead || before.event !== after.event || Boolean(before.campaign) !== Boolean(after.campaign)) out.push('story');
    return out.slice(0, 2);
  }
  function realm(c, m, t) {
    sky(c, ['#a7cdc1', '#a9bcbf', '#cebfa0', '#9fbcc7', '#b5bcc1', '#aeb8b4'][m.epoch % 6], '#e9dfb7');
    glow(c, 791, 97, 130, '#fff1bd85'); ellipse(c, 791, 97, 38, 38, '#ffefc5');
    cloud(c, 226 + Math.sin(t * .04) * 21, 104, 1.1, '#faf1d580'); cloud(c, 840, 171, .8, '#fff3d570');
    poly(c, [[0, 300], [142, 183], [271, 299], [422, 177], [620, 310], [791, 229], [1000, 299], [1000, 620], [0, 620]], '#86a293');
    poly(c, [[0, 373], [138, 289], [370, 332], [613, 272], [806, 339], [1000, 300], [1000, 620], [0, 620]], '#668d73');
    c.beginPath(); c.moveTo(1000, 321); c.bezierCurveTo(715, 377, 926, 471, 664, 620); c.lineTo(1000, 620); c.closePath(); c.fillStyle = '#7db0af'; c.fill();
    for (let i = 0; i < 15; i++) line(c, [[815 + hash(i) * 115, 372 + i * 13], [837 + hash(i) * 115, 372 + i * 13]], '#c6e0c66a', 1.5);
    poly(c, [[120, 385], [354, 247], [748, 297], [827, 457], [593, 561], [265, 521]], '#506d5c');
    poly(c, [[120, 360], [354, 226], [748, 277], [827, 427], [593, 532], [265, 492]], '#a0b67b');
    for (let i = 0; i < 12; i++) { const x = 184 + i * 48; line(c, [[x, 474 + Math.sin(i * .42) * 22], [x - 8, 509 + Math.sin(i * .42) * 23]], '#35594c55', 2.5); }
    curve(c, [246, 452], [399, 348], [565, 429], [729, 335], '#d9c394', 22);
    for (let i = 0; i < 9; i++) tree(c, 156 + hash(i * 3) * 601, 312 + hash(i + 15) * 150, .45 + hash(i) * .3, '#4c7e59', t);
    const places = [[320, 394], [442, 327], [258, 453], [541, 436], [672, 331], [625, 463], [752, 422], [506, 303], [371, 473]];
    if (!m.tiles.length) {
      poly(c, [[415, 422], [471, 350], [531, 422]], '#d7c19a', '#846f55'); poly(c, [[471, 350], [475, 422], [531, 422]], '#ac956f');
      poly(c, [[463, 422], [474, 386], [488, 422]], '#544e40'); flag(c, 471, 342, .7, '#a76556', t);
      ellipse(c, 544, 445, 19, 7, '#6c6650'); line(c, [[532, 444], [552, 439]], '#775748', 4); glow(c, 544, 434, 35, '#f5ce6033');
    }
    m.tiles.forEach(b => {
      const [x, y] = places[b.kind];
      for (let j = b.density - 1; j >= 0; j--) {
        const dx = (j % 3) * 27 - Math.floor(j / 3) * 14, dy = -Math.floor(j / 3) * 29;
        if (b.kind === 7) { castleTower(c, x + dx, y + dy, .58, t); }
        else if (b.kind === 4) {
          poly(c, [[x + dx - 35, y + dy], [x + dx - 20, y + dy - 47], [x + dx + 8, y + dy - 64], [x + dx + 41, y + dy]], '#748675');
          arch(c, x + dx - 11, y + dy - 30, 29, 33, '#344f47', '#b5b095', 3);
        } else {
          house(c, x + dx, y + dy, b.kind === 5 ? .7 : .6, ['#b97a58', '#a86854', '#698a7b', '#bf8b60'][b.kind % 4]);
          if (b.kind === 2) { const bx = x + dx + 1, by = y + dy - 41; for (let k = 0; k < 4; k++) { const a = (m.ruler.dead ? 0 : t * .5) + k * Math.PI / 2; line(c, [[bx, by], [bx + Math.cos(a) * 32, by + Math.sin(a) * 32]], '#ede0b4', 5); } }
          if (b.kind === 3) poly(c, [[x + dx - 35, y + dy - 12], [x + dx + 13, y + dy - 12], [x + dx + 23, y + dy + 6], [x + dx - 26, y + dy + 6]], '#af5d5c');
          if (b.kind === 8) { rect(c, x + dx + 12, y + dy - 80, 11, 58, '#877965'); for (let k = 0; k < (m.ruler.dead ? 0 : 3); k++) { const q = (t * .08 + k / 3) % 1; c.globalAlpha = (1 - q) * .25; ellipse(c, x + dx + 18 + q * 13, y + dy - 88 - q * 36, 7 + q * 11, 6 + q * 7, '#c4ceba'); } c.globalAlpha = 1; }
        }
      }
      if (b.count > 5) caption(c, '×' + b.count, x - 20, y + 25, '#324d3c');
      if (m.fire && b.kind === 5) { glow(c, x, y - 18, 55, '#e8884d66'); for (let k = 0; k < 4; k++) ellipse(c, x - 20 + k * 13, y - 25 + Math.sin(t * 5 + k) * 4, 7, 18, '#d99750'); }
    });
    if (m.holdings[0]) for (let i = 0; i < 6; i++) line(c, [[201 + i * 10, 372], [252 + i * 10, 351]], '#d2bb7188', 4);
    if (m.holdings[6] || m.colonies) { line(c, [[796, 438], [880, 468]], '#b5a477', 9); poly(c, [[825, 469], [889, 469], [876, 484], [839, 480]], '#6f5142'); line(c, [[857, 472], [857, 409]], '#977c55', 3); poly(c, [[859, 410], [859, 457], [889, 452]], '#e0ce9c'); }
    const py = m.total ? 450 : 444;
    if (!m.ruler.dead) { person(c, 465, py, .83, m.ruler.ill ? '#8d8880' : '#a95f50', 0); if (m.spouse) person(c, 491, py + 1, .75, '#6a8182', 0); }
    else { rect(c, 455, py - 26, 21, 29, '#9a9e8c', 6); line(c, [[461, py - 12], [471, py - 12]], '#687a6d'); }
    m.children.slice(0, 6).forEach((child, i) => person(c, 439 + i * 18, py + 28, child.age < 12 ? .42 : .6, child.heir ? '#c7a95d' : '#7c8e76', Math.sin(t + i) * .3));
    if (m.campaign && !m.ruler.dead) { for (let i = 0; i < 4; i++) person(c, 624 + i * 17 + Math.sin(t * .1) * 28, 484 - i * 6, .52, '#636e75', t * 3); flag(c, 661, 427, .5, '#b46955', t); }
    if (m.generation) { for (let i = 0; i < Math.min(7, m.ancestors); i++) ellipse(c, 345 + i * 16, 511, 5, 7, '#c0a568'); }
    if (m.scale > 0) caption(c, 'Обзор владений · масштаб 10' + String(m.scale * 3).replace(/\d/g, x => '⁰¹²³⁴⁵⁶⁷⁸⁹'[x]), 230, 574, '#e6deaf');
    tree(c, 83, 553, 1.5, '#3c6d52', t); tree(c, 944, 555, 1.4, '#557c5a', t); pine(c, 985, 586, 1.1, '#3d6453');
  }
  function court(c, m, t) {
    const royal = m.holdings[7] > 0, stone = royal || m.holdings[5] > 0;
    sky(c, stone ? '#354c52' : '#a79d7e', stone ? '#56646a' : '#7f8567');
    rect(c, 70, 52, 860, 449, stone ? '#536b6b' : '#ad9771', 16);
    for (let i = 0; i < 4; i++) { arch(c, 115 + i * 207, 90, 119, 252, '#a9c6b2', stone ? '#b8b292' : '#78684c', 7); line(c, [[175 + i * 207, 95], [175 + i * 207, 342]], '#d2c69e', 4); }
    poly(c, [[70, 432], [930, 432], [1000, 620], [0, 620]], '#9b8a6e');
    for (let i = 0; i < 12; i++) line(c, [[100 + i * 73, 432], [-130 + i * 110, 620]], '#6f665440');
    if (royal) { poly(c, [[610, 421], [742, 421], [817, 620], [503, 620]], '#985b57'); arch(c, 623, 239, 93, 166, '#bd965e', '#e7c98a', 5); arch(c, 635, 253, 68, 125, '#7e4b58'); }
    else { rect(c, 644, 341, 50, 79, '#786348', 4); rect(c, 635, 378, 69, 13, '#b39261', 3); }
    if (!m.ruler.dead) { person(c, 668, 407, 2, m.ruler.ill ? '#868779' : '#aa5c57', 0, m.ruler.age > 55 ? '#c7c5ac' : '#59443a'); crown(c, 668, 304, royal ? .8 : .52); }
    if (m.spouse) person(c, 739, 427, 1.55, '#718a8b', 0);
    m.children.slice(0, 5).forEach((x, i) => person(c, 703 + i * 35, 473 + i % 2 * 14, x.age < 12 ? .75 : 1.08, x.heir ? '#bea165' : '#8b8b78', 0));
    for (let i = 0; i < Math.min(12, m.court); i++) person(c, 175 + i % 6 * 58, 420 + Math.floor(i / 6) * 70, 1.3, ['#6c8a83', '#a4765f', '#78879b'][i % 3], Math.sin(t + i) * .12);
    ellipse(c, 425, 472, 131, 30, '#8f6c4a'); line(c, [[330, 486], [318, 551]], '#68503c', 9); line(c, [[518, 486], [530, 551]], '#68503c', 9);
    for (let i = 0; i < Math.min(9, m.laws.length); i++) { const x = 343 + i % 5 * 32, y = 454 + Math.floor(i / 5) * 19; rect(c, x, y, 25, 16, '#e5d4a7', 1); ellipse(c, x + 20, y + 13, 3, 3, '#b16359'); }
    if (m.event) { rect(c, 399, 437, 78, 45, '#ead8ac', 3); for (let i = 0; i < 4; i++) line(c, [[410, 447 + i * 7], [465 - i * 4, 447 + i * 7]], '#a48c68'); }
    for (const x of [94, 901]) { line(c, [[x, 245], [x, 451]], '#b79b66', 5); flag(c, x, 250, 1.1, '#a96359', t); }
    motes(c, t, '#f2dca2', 140, 110, 701, 377, 24);
  }
  function draw(c, m, t, effects) { if (!m) return; if (m.mode === 'court') court(c, m, t); else realm(c, m, t); paintEffects(c, effects, m.mode === 'court' ? 424 : 496, m.mode === 'court' ? 427 : 361); }
  return { model, changes, draw, budget: { buildings: 45, people: 20, effects: 3 } };
});
