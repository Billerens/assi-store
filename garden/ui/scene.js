// Read-only rendering: no RNG, timers, persistence, or economy changes.
(function (root, make) {
  const api = make();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GardenScene = api;
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
  function leaf(c, x, y, w, h, angle, color, vein = '#bad29a66') {
    c.save(); c.translate(x, y); c.rotate(angle);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-w, -h * .34, -w * .6, -h * .88, 0, -h); c.bezierCurveTo(w * .65, -h * .76, w * .8, -h * .22, 0, 0); c.closePath(); c.fillStyle = color; c.fill();
    curve(c, [0, 0], [2, -h * .3], [-2, -h * .6], [0, -h * .9], vein, 1.1);
    for (let i = 1; i < 4; i++) line(c, [[0, -h * i / 5], [(i % 2 ? 1 : -1) * w * .45, -h * (i + 1) / 5]], vein, .8);
    c.restore();
  }
  function bloom(c, x, y, s, color, t, kind = 0, open = 1) {
    c.save(); c.translate(x, y); c.scale(s, s);
    const sway = Math.sin(t * .9 + x * .05) * 3;
    curve(c, [0, 0], [-3, -36], [sway + 5, -63], [sway, -92], '#477c50', 3.5);
    leaf(c, -1, -22, 12, 34, -.9, '#5e934e'); leaf(c, 1, -46, 10, 31, .8, '#78a659');
    c.translate(sway, -92); c.scale(Math.max(.08, open), Math.max(.08, open));
    const petals = kind === 1 ? 5 : kind === 2 ? 10 : 8;
    for (let j = 0; j < petals; j++) {
      c.save(); c.rotate(j / petals * TAU);
      if (kind === 1) {
        poly(c, [[0, 5], [-12, -10], [-2, -33], [10, -14]], color, '#ffffff42', .7);
        line(c, [[0, 0], [0, -27]], '#ffffff69', 1);
      } else {
        ellipse(c, 0, -15, kind === 2 ? 5 : 9, kind === 2 ? 19 : 17, color, -.08);
        ellipse(c, -2, -18, 2.5, 10, '#ffffff2c');
      } c.restore();
    }
    ellipse(c, 0, 0, 8, 8, '#c5903e'); ellipse(c, -1, -2, 5, 5, '#f0d273');
    for (let j = 0; j < 9; j++) ellipse(c, Math.cos(j * 2.4) * 5, Math.sin(j * 2.4) * 5, .8, .8, '#8c633b');
    c.restore();
  }
  function butterfly(c, x, y, s, t, color = '#d89d62') {
    c.save(); c.translate(x, y); c.rotate(Math.sin(t) * .16); const flap = .3 + Math.abs(Math.sin(t * 4)) * .7;
    ellipse(c, -7 * flap * s, -3 * s, 9 * flap * s, 10 * s, color, -.5); ellipse(c, 7 * flap * s, -3 * s, 9 * flap * s, 10 * s, color, .5);
    ellipse(c, -5 * flap * s, 6 * s, 6 * flap * s, 6 * s, '#f6d99a', -.3); ellipse(c, 5 * flap * s, 6 * s, 6 * flap * s, 6 * s, '#f6d99a', .3);
    line(c, [[0, -7 * s], [0, 10 * s]], '#514b3b', 2 * s); c.restore();
  }
  function bed(c, x, y, w, d) {
    poly(c, [[x, y], [x + w, y], [x + w + d, y - d * .55], [x + d, y - d * .55]], '#755841');
    poly(c, [[x, y], [x + w, y], [x + w, y + 17], [x, y + 17]], '#b58b60');
    poly(c, [[x + w, y], [x + w + d, y - d * .55], [x + w + d, y + 17 - d * .55], [x + w, y + 17]], '#856347');
    line(c, [[x, y], [x + w, y], [x + w + d, y - d * .55]], '#d8b488', 4);
    for (let i = 0; i < 25; i++) ellipse(c, x + hash(i + x) * w + 12, y - hash(i + y) * d * .4 - 1, 1.5, .7, '#c7a0746a');
  }

  const PETALS = { red: '#e86669', yellow: '#f0ce67', blue: '#79a8ea', orange: '#eea466', purple: '#ae85d5', green: '#84bc75', white: '#f5efde', glow: '#d7ed94', black: '#5c4b69', clear: '#d4efecaa' };
  function model(state, config = {}, content = {}) {
    const r = state.run || {}, meta = state.meta || {}, layers = state.layers || {}, now = num(content.now, num(state.lastTick));
    const up = r.up || {}, ev = r.ev || {}, sim = content.sim || {};
    const beds = (r.beds || []).slice(0, 48).map((b, i) => {
      const p = b.p, out = { index: i, water: num(b.w) > now, slug: !!b.slug, plant: null };
      if (!p) return out;
      const phenotype = typeof sim.phenotype === 'function' ? sim.phenotype(p.f, p.g, p.m || '', p.ch) : {};
      const bud = num(config[p.f + '.budMin'], 3) * 60, bloomTime = num(config[p.f + '.bloomMin'], 5) * 60;
      const stage = typeof sim.stageOf === 'function' ? sim.stageOf(p, config) : p.dead ? 4 : num(p.gr) >= bud + bloomTime ? 3 : num(p.gr) >= bud ? 2 : num(p.gr) >= bud * num(config['sprout.share'], .2) ? 1 : 0;
      out.plant = { id: String(p.id), family: String(p.f), genotype: String(p.g || ''), stage, dead: !!p.dead,
        progress: typeof sim.stageProgress === 'function' ? clamp(sim.stageProgress(p, config), 0, 1) : 0,
        color: String(phenotype.color || 'green'), color2: String(phenotype.color2 || ''), shape: String(phenotype.shape || 'round'), leaf: String(phenotype.leaf || ''),
        pattern: String(phenotype.pattern || phenotype.varieg || ''), size: num(phenotype.size, 1), berry: String(phenotype.berry || ''),
        veins: String(phenotype.veins || ''), thorns: phenotype.thorns === 'thorny', giant: !!phenotype.giant, night: !!phenotype.night, chimera: !!phenotype.chimera,
        pod: !!p.pod, seen: !!p.seen };
      return out;
    });
    const date = new Date(now || 0), hour = date.getHours(), night = content.night === true || (content.night == null && (hour < 6 || hour >= 20));
    const planted = beds.filter(b => b.plant).length, mature = beds.filter(b => b.plant && b.plant.stage === 3).length;
    return { cycle: num(layers.move && layers.move.count) + ':' + String(r.seed || ''), beds, bedTotal: (r.beds || []).length,
      planted, mature, night, greenhouse: num(up.greenhouse), hive: num(up.hive), hiveActive: r.hive !== false,
      barrel: num(up.barrel), lamp: num(up.lamp), lampOn: num(r.lamp) > now, meteo: num(up.meteo), lens: num(up.lens),
      storm: num(ev.storm) > now, swarm: num(ev.swarm) > now, warm: num(ev.warm) > now,
      harvested: num(r.harvested), crossed: num(r.crossed), sold: num(r.sold), move: num(layers.move && layers.move.count),
      archive: Object.keys(meta.album || {}).length, pollen: Number.isInteger(content.pollen) ? content.pollen : -1,
      mode: num(up.greenhouse) > 0 && (night || content.mode === 'greenhouse') ? 'greenhouse' : 'plot',
      label: 'Грядок ' + (r.beds || []).length + ' · растений ' + planted + ' · цветут ' + mature };
  }
  function changes(a, b) {
    if (!a) return [];
    if (a.cycle !== b.cycle) return ['prestige'];
    const out = [];
    if (a.harvested < b.harvested || a.sold < b.sold) out.push('harvest');
    if (a.crossed < b.crossed) out.push('pollen');
    if (a.planted !== b.planted || a.bedTotal !== b.bedTotal || a.greenhouse !== b.greenhouse || a.hive !== b.hive || a.barrel !== b.barrel || a.lamp !== b.lamp) out.push('grow');
    if (a.beds.some((bed, i) => b.beds[i] && ((bed.plant && b.beds[i].plant && bed.plant.stage !== b.beds[i].plant.stage) || (!bed.water && b.beds[i].water)))) out.push('grow');
    return out.slice(0, 2);
  }
  function plant(c, p, x, y, scale, t, night) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    if (p.stage === 0) { ellipse(c, 0, -3, 6, 3, '#c5a779'); line(c, [[0, -1], [0, -7]], '#92a576', 2); c.restore(); return; }
    if (p.dead || p.stage === 4) {
      curve(c, [0, 0], [-3, -28], [5, -43], [16, -30], '#8b8263', 4);
      leaf(c, 0, -12, 9, 21, -1.7, '#928468'); leaf(c, 12, -30, 8, 15, 2.5, '#9d8a73'); c.restore(); return;
    }
    if (p.stage === 1) { leaf(c, 0, -3, 11, 27, -.65, '#8db476'); leaf(c, 0, -3, 9, 22, .7, '#6c9b65'); c.restore(); return; }
    const sway = Math.sin(t * .65 + x * .03) * 2.5, color = PETALS[p.color] || '#82b485';
    if (p.night && night) glow(c, 0, -66, 60, '#d8eccf', .24);
    c.scale(p.giant ? 1.22 : 1, p.giant ? 1.22 : 1);
    if (p.family === 'fan') {
      for (let j = 0; j < 5; j++) {
        const angle = (j - 2) * .34 + sway * .007, len = 49 + Math.sin(j * 1.8) * 13;
        c.save(); c.rotate(angle);
        if (p.leaf === 'e') {
          line(c, [[0, 0], [0, -len]], '#71a16e', 4);
          for (let k = 0; k < 4; k++) { leaf(c, 0, -k * len / 5, 6, len * .33, -.8, '#7da770'); leaf(c, 0, -k * len / 5, 6, len * .33, .8, '#8db67b'); }
        } else {
          c.beginPath(); c.moveTo(0, 0);
          if (p.leaf === 'a') { c.lineTo(-21, -len * .65); c.quadraticCurveTo(0, -len * 1.2, 21, -len * .65); }
          else if (p.leaf === 'b') { c.bezierCurveTo(-33, -len * .45, -29, -len * 1.2, 0, -len * .68); c.bezierCurveTo(29, -len * 1.2, 33, -len * .45, 0, 0); }
          else if (p.leaf === 'd') { for (let k = 0; k < 7; k++) c.lineTo(-15 - (k % 2) * 9, -len * k / 8); c.lineTo(0, -len); for (let k = 6; k >= 0; k--) c.lineTo(15 + (k % 2) * 9, -len * k / 8); }
          else { c.bezierCurveTo(-13, -len * .45, -10, -len * .8, 0, -len); c.bezierCurveTo(10, -len * .8, 13, -len * .45, 0, 0); }
          c.closePath(); c.fillStyle = j % 2 ? '#72a06c' : '#8bb27b'; c.fill();
          if (p.pattern === 'rim') { c.strokeStyle = '#d4dba6'; c.lineWidth = 2.5; c.stroke(); }
          if (p.pattern === 'varieg') { ellipse(c, -5, -len * .4, 4, 7, '#d8dcb0'); ellipse(c, 4, -len * .65, 3, 5, '#d8dcb0'); }
        }
        line(c, [[0, 0], [0, -len * .84]], p.veins === 'red' ? '#bd7967' : '#436b49', 1.5); c.restore();
      }
    } else if (p.family === 'sun') {
      line(c, [[0, 0], [sway, -60]], '#71905b', 5);
      for (let j = 0; j < 9; j++) { const angle = j * 2.4, yy = -16 - j * 5; leaf(c, sway * j / 9, yy, 16, 30, angle, j % 2 ? '#789a58' : '#91ac62'); }
      if (p.stage === 3) for (let j = 0; j < 7; j++) {
        const xx = Math.sin(j * 2.4) * 23, yy = -25 - (j % 4) * 11;
        if (p.berry === 'star') spark(c, xx, yy, 8, color); else ellipse(c, xx, yy, 6, p.berry === 'long' ? 10 : 6, color);
        ellipse(c, xx - 2, yy - 2, 2, 2, '#ffffff55');
      }
      if (p.thorns) for (let i = 0; i < 4; i++) poly(c, [[0, -10 - i * 11], [i % 2 ? -8 : 8, -16 - i * 11], [0, -18 - i * 11]], '#c4bb8a');
    } else {
      curve(c, [0, 0], [-4, -25], [sway + 3, -47], [sway, -69], '#638c5c', 3.5);
      leaf(c, 0, -19, 12, 29, -.9, '#82a867'); leaf(c, 1, -35, 9, 25, .9, '#9abb78');
      c.translate(sway, -69);
      if (p.stage === 2) { ellipse(c, 0, 0, 9, 15, color); leaf(c, -5, 12, 6, 22, -.3, '#719e6d'); }
      else {
        const petals = p.shape === 'star' ? 5 : p.shape === 'crystal' ? 6 : 8;
        const flowerScale = .85 + Math.min(3, p.size) * .09; c.scale(flowerScale, flowerScale);
        for (let j = 0; j < petals; j++) {
          c.save(); c.rotate(j / petals * TAU);
          const fill = p.chimera && j >= petals / 2 ? PETALS[p.color2] || '#e8dab3' : color;
          if (p.shape === 'star' || p.shape === 'crystal') poly(c, [[-3, 3], [-11, -11], [0, -32], [11, -11], [3, 3]], fill, '#ffffff45', .8);
          else if (p.shape === 'bell') { c.beginPath(); c.moveTo(-5, 0); c.quadraticCurveTo(-14, -17, -13, -25); c.quadraticCurveTo(0, -19, 13, -25); c.quadraticCurveTo(14, -17, 5, 0); c.fillStyle = fill; c.fill(); }
          else ellipse(c, 0, -14, 10, 19, fill);
          if (p.pattern === 'dots') { ellipse(c, 0, -18, 2, 2, '#ffffff96'); ellipse(c, -3, -10, 1.5, 1.5, '#613d6266'); }
          if (p.pattern === 'stripes') line(c, [[-2, -5], [-2, -26]], '#ffffff6a', 2);
          if (p.pattern === 'net') { line(c, [[-6, -10], [6, -20]], '#ffffff7a'); line(c, [[6, -10], [-6, -20]], '#ffffff7a'); }
          c.restore();
        }
        ellipse(c, 0, 0, 7, 7, '#edce7c'); ellipse(c, -1, -1, 3, 3, '#aa8451');
      }
    }
    c.restore();
    if (p.pod) { ellipse(c, x + scale * 18, y - scale * 18, 6 * scale, 9 * scale, '#bca36a'); line(c, [[x + scale * 18, y - scale * 25], [x + scale * 18, y - scale * 11]], '#e3cf93', 1); }
  }
  function gardenBeds(c, m, t, greenhouse) {
    const cols = m.bedTotal <= 8 ? 4 : m.bedTotal <= 18 ? 6 : 8;
    const rows = Math.ceil(m.beds.length / cols), dx = 692 / cols, dy = Math.min(127, 315 / Math.max(1, rows));
    const startY = greenhouse ? 323 : 315, plantScale = Math.min(1, dx / 132, dy / 92);
    m.beds.forEach((b, i) => {
      const x = 150 + i % cols * dx, y = startY + Math.floor(i / cols) * dy;
      bed(c, x, y, dx - 25, 35);
      if (b.water) { poly(c, [[x + 5, y - 2], [x + dx - 29, y - 2], [x + dx - 5, y - 18], [x + 30, y - 18]], '#355f652c'); for (let j = 0; j < 3; j++) ellipse(c, x + 20 + j * 19, y - 9 - j % 2 * 4, 3, 1.5, '#a3c6cf'); }
      if (b.plant) plant(c, b.plant, x + (dx - 25) / 2 + 12, y - 6, plantScale, t, m.night);
      if (b.slug) { ellipse(c, x + dx - 37, y - 6, 10, 4, '#c1b1a2'); line(c, [[x + dx - 29, y - 7], [x + dx - 27, y - 13]], '#ded2c1', 1.5); }
      if (i === m.pollen) { ellipse(c, x + dx / 2, y - 9, dx * .39, 16, null, 0, '#f2dc8e', 2); spark(c, x + dx - 20, y - 42, 7, '#f7df91'); }
      c.fillStyle = '#614e3d'; c.font = '600 14px system-ui'; c.fillText(String(i + 1), x + 9, y + 14);
    });
  }
  function plot(c, m, t) {
    sky(c, m.night ? '#1c3348' : '#96c7bd', m.night ? '#66847a' : '#e9ddae');
    if (m.night) { stars(c, t, '#e5e2c5', 33, 230); ellipse(c, 815, 98, 30, 30, '#f4e9bf'); } else { glow(c, 805, 90, 124, '#ffefb9', .35); ellipse(c, 805, 90, 32, 32, '#f8e6b4'); cloud(c, 210, 85, 1.5, '#ffffff46'); }
    poly(c, [[0, 228], [117, 165], [267, 210], [438, 152], [610, 217], [827, 177], [1000, 218], [1000, 620], [0, 620]], m.night ? '#466c61' : '#7b9c72');
    poly(c, [[0, 305], [280, 245], [624, 252], [1000, 303], [1000, 620], [0, 620]], m.night ? '#728575' : '#abc28c');
    curve(c, [-50, 550], [256, 524], [153, 237], [1050, 514], m.night ? '#9b9b7a' : '#d6c994', 63);
    for (let i = 0; i < 9; i++) { const x = 23 + i * 122; line(c, [[x, 243], [x, 279]], '#cfc399', 8); if (i < 8) { line(c, [[x, 251], [x + 122, 251]], '#c1b58d', 5); line(c, [[x, 268], [x + 122, 268]], '#c1b58d', 4); } }
    tree(c, 55, 330, 1.2, '#577e65', t); tree(c, 951, 302, 1.1, '#658960', t);
    if (m.greenhouse) { arch(c, 687, 123, 181, 110, '#b4cfc34d', '#e2dcc0', 4); line(c, [[747, 127], [747, 233]], '#e2dcc0', 3); line(c, [[807, 127], [807, 233]], '#e2dcc0', 3); }
    gardenBeds(c, m, t, false);
    if (m.hive) { rect(c, 865, 333, 53, 54, '#bc965d', 5); for (let i = 0; i < 4; i++) line(c, [[865, 345 + i * 10], [918, 345 + i * 10]], '#e8c88b', 3); poly(c, [[859, 331], [891, 310], [925, 331]], '#d6b477'); ellipse(c, 892, 375, 8, 3, '#665038'); if (m.hiveActive && m.planted) for (let i = 0; i < 4; i++) { const x = 840 + Math.sin(t * .6 + i * 2) * 42, y = 302 + Math.cos(t * .5 + i) * 22; ellipse(c, x, y, 4, 2, '#dec278'); ellipse(c, x, y - 3, 3, 2, '#f0ead59a'); } }
    if (m.barrel) { ellipse(c, 100, 426, 24, 12, '#8a714f'); rect(c, 76, 383, 48, 43, '#9b7c55', 7); ellipse(c, 100, 383, 24, 11, '#9dbfbc'); line(c, [[77, 395], [123, 395]], '#c7b68e', 3); line(c, [[77, 416], [123, 416]], '#c7b68e', 3); }
    if (m.lamp) { line(c, [[897, 471], [897, 412], [875, 412]], '#796c4d', 4); rect(c, 866, 415, 17, 22, m.lampOn ? '#f5d78c' : '#918c71', 4); if (m.lampOn) glow(c, 875, 426, 74, '#f9d587', .24); }
    if (m.meteo) { line(c, [[85, 255], [85, 181]], '#cbbd93', 4); line(c, [[62, 190], [109, 190]], '#dbcc9b', 3); flag(c, 84, 190, .55, '#ce8e79', t); }
    if (m.storm) for (let i = 0; i < 42; i++) { const x = hash(i) * 1000, y = (hash(i + 100) * 620 + t * 120) % 620; line(c, [[x, y], [x - 4, y + 14]], '#dae7e65a', 1.5); }
    if (m.swarm) for (let i = 0; i < 6; i++) butterfly(c, 250 + i * 93 + Math.sin(t + i) * 20, 195 + Math.sin(t * .7 + i) * 35, .65, t + i);
    caption(c, m.move ? 'Новый участок · переезд ' + m.move : 'Сад начинается с первого семени', 44, 590, m.night ? '#e6e3c5' : '#475e47');
  }
  function greenhouse(c, m, t) {
    sky(c, m.night ? '#183248' : '#9db9aa', m.night ? '#5a7975' : '#e6d7aa'); if (m.night) stars(c, t, '#e5e2c5', 60, 300);
    poly(c, [[0, 353], [1000, 353], [1000, 620], [0, 620]], '#807e61');
    poly(c, [[81, 263], [500, 47], [919, 263], [919, 564], [81, 564]], '#b0c7b029', '#d5ceaa', 6);
    for (let i = 0; i < 7; i++) { const x = 81 + i * 139.7, roof = 47 + Math.abs(x - 500) * .515; line(c, [[x, roof], [x, 564]], '#c6c2a1', 4); }
    line(c, [[81, 263], [919, 263]], '#ddd6b8', 6); line(c, [[81, 381], [919, 381]], '#ccc5a4', 3);
    for (let i = 0; i < 8; i++) line(c, [[110 + i * 112, 564], [180 + i * 92, 294]], '#b7a98144', 2);
    if (m.lamp) { line(c, [[500, 48], [500, 158]], '#b7aa80', 3); poly(c, [[462, 175], [487, 151], [513, 151], [538, 175]], '#d2bd84'); if (m.lampOn) { glow(c, 500, 180, 220, '#f4d796', .22); ellipse(c, 500, 178, 27, 7, '#f5dfaa'); } }
    gardenBeds(c, m, t, true);
    if (m.barrel) { rect(c, 96, 471, 36, 52, '#947b55', 5); ellipse(c, 114, 471, 18, 7, '#97bdb8'); }
    if (m.hive) { rect(c, 867, 466, 49, 44, '#b69a65', 5); poly(c, [[860, 465], [890, 444], [922, 465]], '#d5ba7e'); ellipse(c, 891, 500, 7, 3, '#6d573c'); }
    caption(c, 'Теплица · уровень ' + m.greenhouse + (m.night ? ' · ночной сад' : ''), 73, 599, '#ece3bc');
  }
  function draw(c, m, t, effects) { if (!m) return; if (m.mode === 'greenhouse') greenhouse(c, m, t); else plot(c, m, t); paintEffects(c, effects, 490, 385, '#f2df9d'); }
  return { model, changes, draw, budget: { beds: 48, effects: 3, particles: 42 } };
});
