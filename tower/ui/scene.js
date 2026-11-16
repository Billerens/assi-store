(function (root, make) {
  const api = make();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TowerScene = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const W = 1000, H = 620, TAU = Math.PI * 2;
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number(n) || 0));
  const rand = n => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
  const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
  // Only the current room is exposed. Neither future encounters nor unreached floors are populated.
  function model(view, selectedClass) {
    const active = view.phase !== 'home' && view.phase !== 'ended';
    return {
      phase: view.phase, active, floor: Math.max(0, view.floor || 0),
      flight: Math.max(1, view.flight || 1), classId: active ? view.classId : selectedClass || 'guardian',
      hero: active ? copy(view.hero) : null, enemy: view.phase === 'combat' ? copy(view.enemy) : null,
      intent: view.phase === 'combat' ? copy(view.intent) : null,
      doors: view.phase === 'doors' ? copy((view.doors || []).slice(0, 4)) : [],
      event: view.phase === 'event' ? { id: view.event && view.event.id } : null,
      relics: active ? (view.relics || []).slice(0, 6).map(r => r.id) : [],
      bestFloor: view.bestFloor || 0, reward: view.phase === 'reward'
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
  function chest(c, x, y, open, scale = 1) {
    c.save(); c.translate(x, y); c.scale(scale, scale); shadow(c, 0, 1, 30, 7);
    round(c, -27, -31, 54, 32, 5, '#866345', '#cfad6c');
    c.save(); c.translate(-26, -29); c.rotate(open ? -.7 : 0); round(c, 0, -18, 54, 19, 7, '#ad8455', '#dec185'); line(c, [[11, -15], [11, -1]], '#d2b57c', 3); line(c, [[43, -15], [43, -1]], '#d2b57c', 3); c.restore();
    if (open) { glow(c, 0, -29, 60, 'rgba(249,204,100,.4)'); for (let i = 0; i < 7; i++) ellipse(c, -19 + i * 6, -28 - i % 2 * 5, 5, 2.5, '#f2cf78'); }
    else round(c, -5, -28, 10, 15, 2, '#dfc27e'); c.restore();
  }
  const pictures = new Map();
  let assetsReady = function () {};
  function picture(c, kind, id, x, y, size, t, hit) {
    if (typeof window === 'undefined' || !window.TowerArt || typeof Image === 'undefined') return;
    const key = kind + ':' + id;
    let img = pictures.get(key);
    if (!img) {
      img = new Image();
      img.onload = function () { assetsReady(); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.TowerArt.svg(kind, id).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
      if (pictures.size >= 64) pictures.delete(pictures.keys().next().value);
      pictures.set(key, img);
    }
    if (!img.complete || !img.naturalWidth) return;
    c.save(); c.translate(x, y); c.rotate(hit ? Math.sin(t * 27) * .025 : 0);
    c.drawImage(img, -size / 2, -size + Math.sin(t * 1.6) * 3, size, size); c.restore();
  }
  function traveler(c, x, y, id, t, action) {
    const colors = { guardian: '#93b6b0', archer: '#8eac78', scholar: '#8da9d2', firestarter: '#c78a68', nameless: '#a49dc4' };
    const color = colors[id] || colors.guardian;
    c.save(); c.translate(x, y); c.scale(1.15, 1.15);
    shadow(c, 0, 0, 49, 12);
    const breath = Math.sin(t * 2) * 2;
    poly(c, [[-29, -112], [-45, -15], [-9, -22], [16, -16], [34, -110]], '#253846');
    line(c, [[-15, -54], [-18, -7], [-30, -5]], '#262b33', 17);
    line(c, [[16, -54], [20, -7], [33, -5]], '#262b33', 17);
    poly(c, [[-28, -112 + breath], [22, -116 + breath], [34, -53], [-30, -51]], color, '#273b41', 3);
    line(c, [[-25, -58], [31, -58]], '#b89a6a', 7);
    ellipse(c, 0, -135 + breath, 25, 28, '#c2b397');
    if (id === 'guardian') {
      round(c, -26, -157 + breath, 52, 35, 13, '#7e9b9d', '#c0d2c2');
      round(c, -18, -137 + breath, 39, 7, 2, '#203c48');
      poly(c, [[-56, -96], [-24, -105], [-12, -64], [-37, -37], [-60, -64]], '#486a70', '#b2c9bc', 3);
    } else {
      poly(c, [[-28, -143 + breath], [0, -177 + breath], [29, -140 + breath], [18, -153 + breath], [-13, -152 + breath]], color, '#203340', 3);
      line(c, [[-13, -136 + breath], [-7, -136 + breath]], '#283336', 3);
      line(c, [[7, -136 + breath], [13, -136 + breath]], '#283336', 3);
    }
    line(c, [[23, -104], [46, -75], [61, -83]], color, 14);
    if (id === 'archer') {
      c.beginPath(); c.arc(35, -91, 52, -1.2, 1.2); c.strokeStyle = '#c6a06e'; c.lineWidth = 5; c.stroke();
      line(c, [[54, -140], [54, -42]], '#e2d7b4', 1.5);
      line(c, [[29, -92], [101, -92]], '#d5d9cb', 3);
    } else if (id === 'scholar') {
      poly(c, [[36, -111], [63, -119], [89, -105], [80, -73], [57, -87], [31, -80]], '#c2c2ad', '#567a92', 3);
      line(c, [[63, -119], [57, -87]], '#506e81', 3);
    } else if (id === 'firestarter') {
      line(c, [[66, -22], [66, -145]], '#ab8c61', 6);
      torch(c, 66, -151, t, .7);
    } else {
      c.save(); c.translate(61, -83); c.rotate(action ? -.8 : -.25);
      poly(c, [[-4, 10], [-5, -68], [0, -85], [5, -68], [4, 10]], '#d3e1d9', '#5c8990', 1.5);
      line(c, [[-16, 3], [16, 3]], '#c5a46c', 6); c.restore();
    }
    c.restore();
  }
  function exterior(c, m, t) {
    sky(c, '#15293c', '#657989');
    ellipse(c, 760, 104, 53, 53, '#c8d0bb');
    for (let i = 0; i < 7; i++) poly(c, [[i * 180 - 120, 400], [i * 180, 170 + rand(i) * 120], [i * 180 + 200, 400]], '#31495a');
    poly(c, [[0, 485], [420, 425], [1000, 488], [1000, 620], [0, 620]], '#263d43');
    round(c, 398, 114, 205, 361, 4, '#44535b', '#788583');
    for (let row = 0; row < 11; row++) for (let col = 0; col < 5; col++) line(c, [[399 + col * 48, 120 + row * 32], [446 + col * 48, 120 + row * 32]], '#657170', 1);
    for (let i = 0; i < 6; i++) round(c, 387 + i * 40, 93, 30, 37, 2, '#647171');
    for (let floor = 0; floor < 3; floor++) {
      const lit = m.bestFloor > floor * 10;
      arch(c, 469, 164 + floor * 65, 61, 43, '#71817c', lit ? '#bdaf7a' : '#263947');
    }
    arch(c, 454, 367, 92, 113, '#849087', '#172e38');
    poly(c, [[453, 480], [551, 480], [689, 620], [281, 620]], '#777d70');
    for (let j = 0; j < 5; j++) line(c, [[411 - j * 20, 511 + j * 22], [585 + j * 25, 511 + j * 22]], '#565e5b', 2);
    torch(c, 418, 392, t, .9); torch(c, 581, 392, t + 2, .9);
    traveler(c, 363, 555, m.classId, t, false);
    motes(c, t, 16, '#ddcda0', 300, 610, 11);
  }
  function hall(c, m, t) {
    const palettes = [['#192c3b', '#52616a', '#92b9b4'], ['#302739', '#645966', '#c9a6ac'], ['#26334a', '#596982', '#b2c2e0']];
    const pal = palettes[(m.flight - 1) % palettes.length];
    sky(c, pal[0], pal[1]);
    for (let i = 0; i < 3; i++) {
      const x = 115 + i * 300;
      arch(c, x, 32, 170, 306, '#647078', '#243946');
      arch(c, x + 21, 58, 128, 263, '#344550', pal[2]);
      line(c, [[x + 85, 65], [x + 85, 321]], '#4e5d66', 7);
      line(c, [[x + 25, 194], [x + 144, 194]], '#4e5d66', 7);
      c.globalAlpha = .085;
      poly(c, [[x + 22, 290], [x + 148, 290], [x + 285, 542], [x + 61, 542]], '#e6e1b4');
      c.globalAlpha = 1;
    }
    for (const x of [46, 330, 642, 954]) {
      round(c, x - 25, 0, 50, 447, 5, '#3a4651', '#697676');
      round(c, x - 37, 399, 74, 56, 4, '#626c70');
      round(c, x - 36, 16, 72, 31, 4, '#626c70');
      line(c, [[x - 8, 50], [x - 8, 389]], '#77817e', 2);
    }
    poly(c, [[0, 443], [1000, 443], [1000, 620], [0, 620]], '#484f54');
    for (let j = 0; j < 5; j++) line(c, [[0, 448 + j * j * 10], [1000, 448 + j * j * 10]], '#69706f', 2);
    for (let i = -3; i < 10; i++) line(c, [[500 + (i - 3) * 105, 443], [500 + (i - 3) * 216, 620]], '#292f36', 3);
    ellipse(c, 500, 513, 340, 66, 'rgba(11,22,31,.22)');
    torch(c, 79, 322, t, 1.2); torch(c, 920, 322, t + 2, 1.2);
    for (let i = 0; i < Math.min(6, m.relics.length); i++) {
      const x = 165 + i * 134;
      round(c, x - 13, 380, 26, 22, 3, '#87918b');
      picture(c, 'relics', m.relics[i], x, 378, 28, 0, false);
    }
    motes(c, t, 17, '#d0c9a9', 160, 560, m.floor);
  }
  function draw(c, m, t, effects) {
    if (!m) return;
    c.save(); c.globalAlpha = 1;
    if (!m.active) { exterior(c, m, t); c.restore(); return; }
    hall(c, m, t);
    const action = (Array.isArray(effects) ? effects : []).filter(e => e.kind === 'action').slice(-1)[0];
    const p = action && action.payload || {};
    const age = action ? action.age : 99;
    const lunge = p.type === 'play' && age < .55 ? Math.sin(age / .55 * Math.PI) * 65 : 0;
    if (m.phase === 'doors') {
      m.doors.forEach((door, i) => {
        const x = 420 + i * (440 / Math.max(1, m.doors.length - 1));
        arch(c, x - 58, 280, 116, 209, '#929486', '#182d3a');
        picture(c, 'doors', door.type || door.id, x, 400, 62, 0, false);
        glow(c, x, 469, 77, 'rgba(209,190,132,.16)');
      });
    } else if (m.enemy) {
      const foe = m.enemy;
      shadow(c, 711, 513, foe.boss ? 132 : 91, 22);
      picture(c, 'enemies', foe.template || foe.id, 713, 509, foe.boss ? 278 : 227, t, p.foeDamage > 0 && age < .8);
      if (foe.shield > 0 || foe.plates > 0) { c.strokeStyle = '#a6cbd6'; c.lineWidth = 4; c.beginPath(); c.ellipse(712, 397, 131, 137, 0, -.7, 2.7); c.stroke(); }
      if (foe.burn > 0) for (let i = 0; i < 3; i++) torch(c, 651 + i * 59, 497, t + i, .52);
      if (p.foeDamage > 0 && age < 1.6) impact(c, 683, 383, age, '#ffe2a4', foe.turn || 0);
    } else if (m.reward) chest(c, 710, 499, true, 1.25);
    else if (m.phase === 'rest') { torch(c, 697, 480, t, 1.8); line(c, [[656, 511], [730, 488]], '#a88b69', 9); line(c, [[659, 490], [733, 512]], '#a88b69', 9); }
    else if (m.phase === 'shop') {
      round(c, 600, 420, 270, 26, 5, '#987b5e');
      round(c, 615, 446, 20, 75, 3, '#665344'); round(c, 836, 446, 20, 75, 3, '#665344');
      picture(c, 'doors', 'shop', 730, 418, 104, 0, false);
    } else if (m.event) picture(c, 'events', m.event.id, 713, 505, 184, t * .3, false);
    else if (m.phase === 'fork') {
      for (let i = 0; i < 6; i++) round(c, 570 + i * 25, 500 - i * 28, 270 - i * 25, 30, 2, '#6e7e80', '#92a29c');
    }
    traveler(c, 288 + lunge, 520, m.classId, t, !!lunge);
    if (p.heroDamage > 0 && age < 1.6) impact(c, 287, 407, age, '#f5a99a', m.floor);
    if ((p.id === 'block' || p.id === 'reflect') && age < 1.5) {
      c.globalAlpha = 1 - age / 1.5;
      c.strokeStyle = '#c0e1ed'; c.lineWidth = 7; c.beginPath(); c.ellipse(342, 429, 60 + age * 20, 89, -.2, -1.5, 1.5); c.stroke(); c.globalAlpha = 1;
    }
    c.restore();
  }
  return { model, draw, onAssetsReady: fn => { assetsReady = fn; } };
});
