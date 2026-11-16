(function (root, make) {
  const api = make();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DungeonScene = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const W = 1000, H = 620, TAU = Math.PI * 2;
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number(n) || 0));
  const rand = n => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
  const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
  function model(state, targets, width) {
    const run = state.run || {}, meta = state.meta || {}, pref = meta.pref || {};
    const camp = run.phase === 'hub' || run.phase === 'over';
    const pos = Math.max(0, Math.min(8, Number(run.pos) || 0));
    return {
      camp, phase: run.phase, hero: camp && run.phase === 'hub' ? pref.hero || 'guard' : run.hero,
      pos, floor: run.floor || 1, depth: camp ? pref.depth || 0 : run.depth || 0,
      hp: Number(run.hp) || 0, maxHp: Math.max(1, Number(run.maxHp) || 1),
      weapon: !camp && !!run.wpn, shield: !camp && Number(run.shield) > 0,
      grid: camp ? [] : Array.from({ length: 9 }, (_, i) => copy((run.grid || [])[i] || null)),
      targets: targets ? targets.filter(i => i >= 0 && i < 9).slice(0, 9) : null,
      gap: Math.min(30, 6000 / Math.max(240, width || 320)),
      gifts: camp ? (pref.hand || []).filter(id => ((meta.shop || {}).gifts || []).includes(id)).slice(0, 4) : []
    };
  }
  function ellipse(c, x, y, rx, ry, color, rotation = 0) {
    c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, TAU); c.fillStyle = color; c.fill();
  }
  function poly(c, points, color, line, width = 1) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.closePath(); c.fillStyle = color; c.fill();
    if (line) { c.strokeStyle = line; c.lineWidth = width; c.stroke(); }
  }
  function line(c, points, color, width = 2) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  }
  function round(c, x, y, w, h, r, color, stroke) {
    c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = color; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
  }
  function sky(c, a, b, stop = H) {
    const g = c.createLinearGradient(0, 0, 0, stop); g.addColorStop(0, a); g.addColorStop(1, b);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function glow(c, x, y, radius, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  function shadow(c, x, y, w, h = w * .2) { ellipse(c, x, y, w, h, 'rgba(5,12,15,.3)'); }
  function motes(c, t, n, color, y0 = 0, y1 = H, seed = 1) {
    for (let i = 0; i < n; i++) {
      const x = rand(i + seed) * W + Math.sin(t * .35 + i) * 9;
      const y = y0 + ((rand(i * 3 + seed) * (y1 - y0) - t * (3 + rand(i) * 4)) % (y1 - y0) + y1 - y0) % (y1 - y0);
      c.globalAlpha = .25 + .4 * (.5 + .5 * Math.sin(t + i));
      ellipse(c, x, y, 1 + rand(i + 2) * 2, 1 + rand(i + 2) * 2, color);
    }
    c.globalAlpha = 1;
  }
  function impact(c, x, y, e, color, seed = 0) {
    if (e < 0 || e > 1.65) return;
    const k = 1 - e / 1.65;
    glow(c, x, y, 100 * k + 20, 'rgba(255,224,155,' + k * .3 + ')');
    c.globalAlpha = k;
    c.beginPath(); c.ellipse(x, y, 18 + e * 88, 10 + e * 35, -.12, 0, TAU);
    c.strokeStyle = color; c.lineWidth = 3 * k + .5; c.stroke();
    for (let i = 0; i < 17; i++) {
      const a = rand(seed + i) * TAU, speed = 40 + rand(i + 50) * 110;
      const xx = x + Math.cos(a) * speed * e, yy = y + Math.sin(a) * speed * e - 45 * e + 38 * e * e;
      line(c, [[xx, yy], [xx - Math.cos(a) * 8 * k, yy - Math.sin(a) * 8 * k]], color, 2.5);
    }
    c.globalAlpha = 1;
  }
  function torch(c, x, y, t, size = 1) {
    c.save(); c.translate(x, y); c.scale(size, size);
    glow(c, 0, -20, 95, 'rgba(255,164,68,.18)');
    line(c, [[0, 12], [0, -5]], '#786350', 6);
    poly(c, [[-11, -7], [11, -7], [6, 9], [-6, 9]], '#403d3c', '#a08b64');
    const flicker = Math.sin(t * 7 + x) * 4;
    poly(c, [[-7, -8], [-11, -21], [0, -44 - flicker], [2, -26], [9, -34 + flicker], [10, -13], [4, -6]], '#ed994e');
    poly(c, [[-4, -8], [-5, -21], [2, -31], [5, -14], [1, -7]], '#ffe1a1'); c.restore();
  }
  function arch(c, x, y, w, h, stone, inside) {
    c.save(); c.translate(x, y);
    c.beginPath(); c.moveTo(0, h); c.lineTo(0, w * .48); c.quadraticCurveTo(w * .04, 0, w / 2, -15); c.quadraticCurveTo(w * .96, 0, w, w * .48); c.lineTo(w, h); c.closePath();
    c.fillStyle = inside; c.fill(); c.strokeStyle = stone; c.lineWidth = 17; c.stroke();
    for (let j = 1; j < 5; j++) { line(c, [[-7, h - j * (h - w * .5) / 5], [6, h - j * (h - w * .5) / 5]], '#263b42', 2); line(c, [[w - 6, h - j * (h - w * .5) / 5], [w + 7, h - j * (h - w * .5) / 5]], '#263b42', 2); }
    c.restore();
  }
  const cache = new Map();
  let assetsReady = function () {};
  function token(c, kind, id, x, y, size, t, danger) {
    if (typeof window === 'undefined' || !window.DungeonArt || typeof Image === 'undefined') return;
    const key = kind + ':' + id;
    let img = cache.get(key);
    if (!img) {
      img = new Image();
      img.onload = function () { assetsReady(); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.DungeonArt[kind](id));
      if (cache.size >= 64) cache.delete(cache.keys().next().value);
      cache.set(key, img);
    }
    shadow(c, x, y, size * .32, size * .075);
    if (img.complete && img.naturalWidth) {
      c.save(); c.translate(x, y); c.rotate(danger ? Math.sin(t * 1.7) * .018 : 0);
      c.drawImage(img, -size / 2, -size + Math.sin(t * 1.8) * 2, size, size); c.restore();
    }
  }
  function adventurer(c, x, y, size, t, m) {
    const color = { guard: '#89a8b4', thief: '#a99b79', priestess: '#b9b1cb', smith: '#bb886a', madman: '#ad8178' }[m.hero] || '#89a8b4';
    const hood = m.hero === 'thief' || m.hero === 'priestess';
    c.save(); c.translate(x, y); c.scale(size / 172, size / 172);
    shadow(c, 0, 2, 47, 11);
    const b = Math.sin(t * 2) * 1.7;
    poly(c, [[-24, -111], [-43, -20], [-7, -31], [33, -18], [27, -110]], '#233b43');
    line(c, [[-16, -56], [-18, -9], [-29, -6]], '#26353b', 17);
    line(c, [[14, -56], [21, -9], [32, -6]], '#26353b', 17);
    poly(c, [[-26, -109 + b], [24, -109 + b], [32, -53], [-31, -53]], color, '#314d54', 2.5);
    line(c, [[-28, -59], [30, -59]], '#d0ae72', 7);
    round(c, -7, -65, 14, 13, 2, '#d9c590', '#465354');
    ellipse(c, 0, -132 + b, 22, 26, '#dbc6a1');
    if (hood) {
      poly(c, [[-27, -119 + b], [-23, -153 + b], [0, -173 + b], [25, -152 + b], [28, -119 + b], [15, -145 + b], [-14, -145 + b]], color, '#3d4e54', 2);
    } else if (m.hero === 'madman') {
      poly(c, [[-23, -138 + b], [-29, -163 + b], [-9, -157 + b], [0, -177 + b], [10, -156 + b], [28, -164 + b], [23, -138 + b], [12, -151 + b], [-12, -151 + b]], '#baa58a', '#465254', 2);
    } else {
      c.fillStyle = '#a9c0c4'; c.beginPath(); c.arc(0, -132 + b, 25, Math.PI, TAU); c.fill();
      line(c, [[-28, -130 + b], [28, -130 + b]], '#d1d5c5', 6);
      line(c, [[0, -158 + b], [0, -132 + b]], '#6e919f', 4);
    }
    line(c, [[-10, -128 + b], [-6, -128 + b]], '#354247', 2.5);
    line(c, [[7, -128 + b], [11, -128 + b]], '#354247', 2.5);
    line(c, [[-25, -100 + b], [-39, -76], [-32, -63]], color, 12);
    line(c, [[24, -99 + b], [38, -77], [42, -64]], color, 12);
    ellipse(c, -32, -63, 7, 8, '#dbc6a1'); ellipse(c, 42, -64, 7, 8, '#dbc6a1');
    if (m.weapon) {
      poly(c, [[39, -67], [40, -132], [46, -147], [51, -132], [48, -67]], '#dce9e4', '#668c9b', 2);
      line(c, [[29, -71], [59, -71]], '#d2b577', 6);
    }
    if (m.shield) {
      poly(c, [[-56, -100], [-31, -108], [-12, -93], [-16, -60], [-35, -42], [-56, -65]], '#6a91a0', '#c3d3c6', 3);
      line(c, [[-35, -96], [-35, -56]], '#e0c28a', 3);
    }
    c.restore();
  }
  function camp(c, m, t) {
    sky(c, '#142d36', '#677a70');
    for (let i = 0; i < 6; i++) poly(c, [[i * 220 - 160, 395], [i * 220, 32 + rand(i) * 160], [i * 220 + 180, 395]], i % 2 ? '#354c50' : '#293f48');
    poly(c, [[0, 395], [470, 340], [1000, 410], [1000, 620], [0, 620]], '#424e46');
    round(c, 570, 150, 281, 358, 7, '#626e69', '#9b9d85');
    for (let row = 0; row < 7; row++) line(c, [[574, 163 + row * 48], [846, 163 + row * 48]], '#3e514e', 2);
    arch(c, 617, 233, 187, 280, '#8f9782', '#142a34');
    for (let i = 0; i < 6; i++) round(c, 625 + i * 9, 489 - i * 15, 171 - i * 18, 19, 2, '#5a6c65', '#819087');
    for (let i = 0; i < 11; i++) { const x = rand(i + 30) * 1000; ellipse(c, x, 510 + rand(i) * 110, 19 + rand(i + 1) * 30, 10, '#697369'); }
    torch(c, 579, 351, t, 1.2); torch(c, 844, 351, t + 2, 1.2);
    poly(c, [[81, 469], [207, 285], [343, 475]], '#7a7561', '#a99d7a', 3);
    poly(c, [[207, 285], [223, 471], [299, 472]], '#3a4948');
    line(c, [[207, 285], [208, 486]], '#b1a47f', 5);
    torch(c, 420, 508, t, 1.4);
    line(c, [[385, 539], [453, 517]], '#ac8f68', 10); line(c, [[388, 516], [454, 540]], '#ac8f68', 10);
    adventurer(c, 346, 540, 181, t, m);
    m.gifts.forEach((gift, i) => token(c, 'gift', gift, 122 + i * 66, 570, 48, 0, false));
    motes(c, t, 20, '#d7c48a', 200, 610, 70);
  }
  function center(i, gap) {
    const size = (1000 - gap * 2) / 3;
    return { x: i % 3 * (size + gap) + size / 2, y: Math.floor(i / 3) * (size + gap) + size / 2, size };
  }
  function board(c, m, t, effects) {
    const shade = m.floor % 3;
    c.fillStyle = ['#263a3d', '#27343f', '#3f363a'][shade]; c.fillRect(0, 0, 1000, 1000);
    const action = effects.filter(e => e.kind === 'step').slice(-1)[0];
    for (let i = 0; i < 9; i++) {
      const p = center(i, m.gap), half = p.size / 2, x = p.x - half, y = p.y - half;
      const cell = m.grid[i], hero = i === m.pos;
      const near = Math.abs(i % 3 - m.pos % 3) + Math.abs(Math.floor(i / 3) - Math.floor(m.pos / 3)) === 1;
      const target = m.targets ? m.targets.includes(i) : near;
      round(c, x, y + 9, p.size, p.size - 9, 15, '#10242e');
      round(c, x + 2, y + 2, p.size - 4, p.size - 18, 15, ['#4d6260', '#4b5b63', '#645a59'][shade], target || hero ? '#97baa8' : '#657977');
      line(c, [[x + 19, y + 18], [x + p.size - 20, y + 18]], target ? '#bcc5a3' : '#78857a', 3);
      for (let j = 0; j < 3; j++) {
        const xx = x + 23 + rand(i * 19 + j + m.floor) * (p.size - 46), yy = y + 25 + rand(i * 9 + j + 82) * (p.size - 55);
        line(c, [[xx, yy], [xx + 7, yy + 17], [xx + 1, yy + 28]], '#334c4c', 2);
      }
      if (hero) {
        glow(c, p.x, p.y, p.size * .54, m.hp <= 3 ? 'rgba(224,130,105,.32)' : 'rgba(121,212,183,.27)');
        c.beginPath(); c.ellipse(p.x, p.y + p.size * .23, p.size * .31, p.size * .1, 0, 0, TAU); c.strokeStyle = '#badac0'; c.lineWidth = 3; c.stroke();
        adventurer(c, p.x, p.y + p.size * .29, p.size * .72, t, m);
      } else if (cell) {
        const bad = cell.k === 'foe' || cell.k === 'boss';
        if (bad) glow(c, p.x, p.y + 16, p.size * .38, 'rgba(162,90,67,.25)');
        if (cell.k === 'stairs') {
          round(c, p.x - p.size * .25, p.y - p.size * .3, p.size * .5, p.size * .44, 6, '#18333b');
          for (let j = 0; j < 5; j++) line(c, [[p.x - p.size * .22 + j * 5, p.y + 20 - j * 20], [p.x + p.size * .22 - j * 5, p.y + 20 - j * 20]], '#8caa9c', 6);
        } else token(c, bad ? 'foe' : 'card', bad ? cell.k === 'boss' ? 'boss' : cell.e : cell.k, p.x, p.y + p.size * .12, p.size * .58, t + i, bad);
        if (cell.k === 'potion' || cell.k === 'altar') {
          c.globalAlpha = .4;
          for (let j = 0; j < 3; j++) ellipse(c, p.x - 22 + j * 22, p.y - ((t * 18 + j * 19) % 60), 2, 2, '#dbf5d2');
          c.globalAlpha = 1;
        }
      }
    }
    if (action && action.payload) {
      const a = action.payload, end = center(m.pos, m.gap), start = center(a.from >= 0 ? a.from : m.pos, m.gap);
      c.globalAlpha = Math.max(0, 1 - action.age / 1.3);
      if (a.from !== m.pos) line(c, [[start.x, start.y], [end.x, end.y]], '#e0d6a4', 7);
      c.globalAlpha = 1;
      const hurt = a.ev && (a.ev.fight || a.ev.trap || a.ev.bite);
      impact(c, end.x, end.y, action.age, hurt ? '#ffc4a0' : '#d4f3b9', m.floor);
    }
  }
  function draw(c, m, t, effects) {
    if (!m) return;
    c.save(); c.globalAlpha = 1;
    if (m.camp) camp(c, m, t);
    else board(c, m, t, Array.isArray(effects) ? effects : []);
    c.restore();
  }
  return { model, center, draw, onAssetsReady: fn => { assetsReady = fn; } };
});
