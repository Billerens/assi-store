(function (root, make) {
  var api = make();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MenagerieScene = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  // Artwork follows saved phenotypes; this module never rolls genes or edits the simulation.
  const W = 1000, H = 620, TAU = Math.PI * 2;
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number(n) || 0));
  const rand = n => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
  const copy = value => JSON.parse(JSON.stringify(value));
  const seed = value => String(value || '').split('').reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
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
  function grass(c, x, y, size, color, t = 0) {
    const sway = Math.sin(t * 1.1 + x / 43) * size * .1;
    for (let j = -2; j <= 2; j++) line(c, [[x + j * 2, y], [x + j * size * .13 + sway, y - size * .5], [x + j * size * .3 + sway, y - size * (1 - Math.abs(j) * .12)]], color, 2.2);
  }
  function fern(c, x, y, size, t, color = '#416b4d') {
    c.save(); c.translate(x, y); c.rotate(Math.sin(t * .7 + x) * .025);
    for (let a = -2; a <= 2; a++) {
      c.save(); c.rotate(a * .29); line(c, [[0, 0], [0, -size]], '#42664c', 2);
      for (let j = 1; j <= 5; j++) {
        const yy = -j * size / 6, len = size * (.24 - j * .027);
        ellipse(c, -len * .65, yy + 3, len, size * .045, color, .42);
        ellipse(c, len * .65, yy + 3, len, size * .045, color, -.42);
      }
      c.restore();
    }
    c.restore();
  }
  function tree(c, x, y, scale, t, tone = '#284c40') {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    poly(c, [[-12, 0], [-8, -175], [9, -190], [15, 0]], '#3f4032');
    line(c, [[1, -85], [-38, -146], [-60, -180]], '#3f4032', 10);
    line(c, [[5, -122], [45, -185], [72, -205]], '#3f4032', 8);
    for (let i = 0; i < 11; i++) ellipse(c, (rand(i + x) - .5) * 160 + Math.sin(t * .4 + i) * 2, -180 - rand(i + y) * 90, 38 + rand(i) * 28, 27 + rand(i + 4) * 19, i % 3 ? tone : '#41634b');
    c.restore();
  }
  function pennants(c, x, y, width, t, colors) {
    line(c, [[x, y], [x + width * .5, y + 28], [x + width, y]], '#9b855c', 2);
    for (let i = 0; i < 10; i++) {
      const u = (i + .5) / 10, xx = x + width * u, yy = y + Math.sin(u * Math.PI) * 27;
      poly(c, [[xx - 10, yy], [xx + 10, yy + 1], [xx + Math.sin(t * 2 + i) * 7, yy + 34]], colors[i % colors.length]);
    }
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
  function model(state, view) {
    view = view || {};
    const run = state.run || {}, meta = state.meta || {}, all = run.beasts || [];
    const selected = all.find(b => b.id === view.selected);
    const preferred = (view.pair || []).concat(selected ? [selected.id] : []);
    const ordered = all.filter(b => preferred.includes(b.id)).concat(all.filter(b => !preferred.includes(b.id)).slice().sort((a, b) => (b.bornAt || 0) - (a.bornAt || 0)));
    const upgrades = run.upgrades || {};
    const out = { mode: 'habitat', tab: view.tab || 'aviary', continent: Math.max(1, Number(meta.continent) || 1),
      population: all.length, selected: selected ? selected.id : null,
      beasts: copy(ordered.slice(0, 6)), pair: (view.pair || []).slice(0, 2),
      eggs: (run.eggs || []).slice(0, 4).map(e => ({ id: e.id, remaining: Math.max(0, e.remaining || 0), progress: clamp(1 - (e.remaining || 0) / Math.max(1, e.duration || 1)) })),
      eggCount: (run.eggs || []).length,
      incubator: Number(upgrades.incubator) > 0, arena: Number(upgrades.arena) > 0,
      league: Number(run.league) || 0, event: run.event ? copy(run.event) : null };
    const battle = run.lastBattle;
    if (view.tab === 'tournament' && battle && battle.result) {
      const log = battle.result.log || [], step = Math.max(0, Math.min(log.length, Number.isFinite(view.replayStep) ? view.replayStep : log.length));
      const fighters = {};
      (battle.result.fighters || []).forEach(f => { fighters[f.id] = { hp: f.maxHp, maxHp: f.maxHp }; });
      log.slice(0, step).forEach(row => { if (fighters[row.target] && typeof row.hp === 'number') fighters[row.target].hp = row.hp; });
      if (step === log.length) (battle.result.fighters || []).forEach(f => { fighters[f.id] = { hp: f.hp, maxHp: f.maxHp }; });
      out.mode = 'arena'; out.seed = battle.seed; out.step = step; out.steps = log.length;
      out.last = step ? copy(log[step - 1]) : null;
      out.done = step === log.length; out.win = !!battle.result.win;
      out.teams = [battle.team || [], battle.enemies || []].map(team => team.slice(0, 4).map(b => ({ beast: copy(b), health: copy(fighters[b.id] || { hp: 1, maxHp: 1 }) })));
    }
    return out;
  }
  const images = new Map();
  let assetsReady = function () {};
  function animal(c, beast, x, y, width, t, face, pose) {
    pose = pose || {};
    const key = JSON.stringify([beast.parts, beast.colors, beast.traits, beast.name]);
    let image = images.get(key);
    if (!image && typeof window !== 'undefined' && window.MenagerieArt) {
      image = new Image();
      image.onload = function () { assetsReady(); };
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.MenagerieArt.svg(beast).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
      images.set(key, image);
      if (images.size > 64) images.delete(images.keys().next().value);
    }
    shadow(c, x, y, width * .36, width * .07);
    c.save(); c.translate(x, y + Math.sin(t * 1.7 + seed(beast.id)) * 2); c.scale(face || 1, 1);
    c.rotate(pose.hit ? Math.sin(t * 45) * .025 * pose.hit : 0);
    c.globalAlpha = pose.dead ? .32 : 1;
    if (image && image.complete && image.naturalWidth) c.drawImage(image, -width / 2, -width * .8, width, width * .8);
    else { ellipse(c, 0, -width * .25, width * .28, width * .18, '#9eaa95'); ellipse(c, width * .2, -width * .42, width * .13, width * .14, '#bbc6aa'); }
    c.restore();
  }
  function habitat(c, m, t, effects) {
    const season = (m.continent - 1) % 3;
    sky(c, ['#183c3d', '#3b3449', '#314653'][season], ['#8da98a', '#bba98d', '#94b4ac'][season]);
    glow(c, 540, 80, 490, 'rgba(212,232,186,.2)');
    for (let i = 0; i < 7; i++) tree(c, i * 175 - 24, 373, .85 + rand(i + m.continent) * .25, t, ['#385f4a', '#596050', '#395d5e'][season]);
    if (m.incubator) {
      for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(i * 180 - 20, 390); c.quadraticCurveTo(230 + i * 30, 20, 510, -35); c.strokeStyle = '#92aa9a'; c.lineWidth = 6; c.stroke(); }
      line(c, [[0, 140], [1000, 140]], 'rgba(212,233,208,.25)', 3);
    }
    poly(c, [[0, 341], [260, 320], [710, 337], [1000, 376], [1000, 620], [0, 620]], '#41664e');
    ellipse(c, 510, 470, 427, 130, '#6f8c67'); ellipse(c, 510, 455, 382, 110, '#91a17a');
    for (let i = 0; i < 22; i++) { const a = i / 22 * TAU; ellipse(c, 510 + Math.cos(a) * 375, 457 + Math.sin(a) * 109, 20, 9, i % 3 ? '#b4ba97' : '#7a906f', a * .1); }
    let shown = m.beasts;
    if (m.tab === 'nests' && m.pair.length) shown = m.beasts.filter(b => m.pair.includes(b.id)).concat(m.beasts.filter(b => !m.pair.includes(b.id))).slice(0, 4);
    const positions = shown.length <= 2 ? [[340, 474, 290], [695, 478, 290]] : [[258, 405, 218], [502, 411, 214], [757, 407, 213], [274, 525, 244], [516, 535, 247], [762, 522, 239]];
    shown.forEach((b, i) => {
      const p = positions[i], newest = effects.find(e => e.kind === 'hatch' && e.payload && e.payload.ids && e.payload.ids.includes(b.id));
      animal(c, b, p[0], p[1], p[2], t, p[0] > 550 ? -1 : 1, {});
      if (m.selected === b.id || m.pair.includes(b.id)) { c.beginPath(); c.ellipse(p[0], p[1] + 4, p[2] * .4, 15, 0, 0, TAU); c.strokeStyle = '#e3d19a'; c.lineWidth = 3; c.stroke(); }
      if (newest) impact(c, p[0], p[1] - 45, newest.age, '#e4efbf', seed(b.id));
    });
    m.eggs.forEach((egg, i) => {
      const x = 375 + i * 80, y = 568;
      ellipse(c, x, y, 40, 12, '#5b6746');
      for (let j = 0; j < 6; j++) line(c, [[x - 33 + j * 12, y - 1], [x - 16 + j * 7, y + 5]], '#a99b69', 3);
      ellipse(c, x, y - 18, 18, 25, '#d9d6af', Math.sin(t * 1.6 + i) * egg.progress * .025);
      ellipse(c, x - 6, y - 24, 4, 6, '#a1ad8c');
      if (egg.progress > .8) line(c, [[x - 13, y - 16], [x - 3, y - 21], [x + 2, y - 15], [x + 11, y - 22]], '#83977a', 1.5);
    });
    effects.filter(e => e.kind === 'upgrade' || e.kind === 'breed' || e.kind === 'release').slice(-1).forEach(e => impact(c, 510, 487, e.age, '#e6d3a0', 13));
    for (let i = 0; i < 7; i++) fern(c, i * 170 - 7, 646, 76 + rand(i) * 46, t, '#305f43');
    motes(c, t, 21, '#e5ecc3', 150, 540, 19);
  }
  function arena(c, m, t, effects) {
    sky(c, '#46566c', '#d8b88b'); ellipse(c, 813, 113, 52, 52, '#e7c692');
    for (let i = 0; i < 5; i++) poly(c, [[i * 250 - 80, 300], [i * 250 + 65, 159 + rand(i) * 60], [i * 250 + 240, 300]], '#5b736c');
    for (let row = 0; row < 3; row++) {
      round(c, 62, 204 + row * 38, 876, 28, 3, row % 2 ? '#7d6951' : '#5e574d');
      for (let i = 0; i < 22; i++) { const x = 82 + i * 40; ellipse(c, x, 205 + row * 38, 6, 8, ['#b7a486', '#91a79c', '#c8b59d'][i % 3]); }
    }
    pennants(c, 35, 123, 930, t, ['#8cafa0', '#d3ad7a', '#afa2bd']);
    poly(c, [[0, 332], [1000, 332], [1000, 620], [0, 620]], '#937f61'); ellipse(c, 500, 456, 430, 132, '#c5af88');
    c.beginPath(); c.ellipse(500, 455, 347, 105, 0, 0, TAU); c.strokeStyle = '#e4cf9f'; c.lineWidth = 3; c.stroke();
    m.teams.forEach((team, side) => team.forEach((entry, i) => {
      const front = i === 0, baseX = side ? (front ? 695 : 873) : (front ? 310 : 125), y = front ? 489 : 293 + i * 74, width = front ? 260 : 135;
      const hit = effects.find(e => e.kind === 'battle' && e.payload && e.payload.target === entry.beast.id);
      const move = effects.find(e => e.kind === 'battle' && e.payload && e.payload.actor === entry.beast.id);
      const progress = move ? Math.sin(clamp(move.age / .65) * Math.PI) : 0;
      const x = baseX + (side ? -1 : 1) * progress * 74;
      animal(c, entry.beast, x, y, width, t, side ? -1 : 1, { dead: entry.health.hp <= 0, hit: hit ? hit.strength : 0 });
      round(c, x - width * .24, y + 15, width * .48, 6, 3, '#6c6452');
      round(c, x - width * .24, y + 15, width * .48 * clamp(entry.health.hp / Math.max(1, entry.health.maxHp)), 6, 3, side ? '#c78e72' : '#89b89b');
      if (hit && Number(hit.payload.damage) > 0) impact(c, x, y - width * .35, hit.age, '#f5ddb0', i + side * 7);
    }));
    for (const x of [65, 939]) { round(c, x - 7, 305, 14, 229, 4, '#69583e'); ellipse(c, x, 306, 11, 7, '#b49b68'); }
    line(c, [[65, 505], [500, 577], [939, 505]], '#806342', 6);
    grass(c, 35, 617, 61, '#5b704e', t); grass(c, 960, 615, 65, '#5b704e', t);
    motes(c, t, 18, '#efd3a2', 320, 580, 55);
  }
  function draw(c, m, t, effects) {
    if (!m) return;
    effects = Array.isArray(effects) ? effects : effects ? [effects] : [];
    c.save(); c.globalAlpha = 1;
    if (m.mode === 'arena') arena(c, m, t, effects); else habitat(c, m, t, effects);
    c.restore();
  }
  return { model: model, draw: draw, onAssetsReady: function (fn) { assetsReady = fn; } };
});
