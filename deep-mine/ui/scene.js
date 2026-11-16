// The picture of the cut of «Шахта вглубь»: window.DmScene.draw(env) paints the whole field on the
// canvas. Rock bands are painted once each into their own small canvas (strata, veins, ores,
// fossils and what the zone adds: water pockets, gas, glowing cracks, crystals, caves, lava,
// masonry, echo rings) and reused; over them every frame go the light things: glints, drips,
// bubbles, lava pulse, galleries with miners and carts, the lit shaft with pipes and a cage, the
// drill with its turning bit, sparks and dust, the dusk over the derrick. The light falls from the
// shaft: the rock darkens to the sides and below the face, each zone has its own tint and glow.
// With «reduce motion» nothing moves: no particles, no turning, glints stay as they are.
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(mq && mq.matches);
  const S = { t: 0, phase: 0, bands: new Map(), parts: [], icons: {}, spawn: 0 };

  // The zones: the colour of the plate and the line, the tint of the rock, how dark the sides are,
  // the colour of the light near the drill.
  const ZONE = {
    sediment: { color: '#c9a66b', tint: null, edge: 0.34, glow: '255,190,110' },
    water: { color: '#5aa0d8', tint: 'rgba(30,84,140,0.34)', edge: 0.38, glow: '150,205,255' },
    gas: { color: '#b9c36a', tint: 'rgba(104,120,36,0.30)', edge: 0.38, glow: '215,230,130' },
    heat: { color: '#e0643a', tint: 'rgba(150,46,22,0.34)', edge: 0.40, glow: '255,150,90' },
    crystal: { color: '#8fd3e8', tint: 'rgba(24,96,128,0.36)', edge: 0.42, glow: '160,235,255' },
    void: { color: '#9a9fc4', tint: 'rgba(6,8,22,0.50)', edge: 0.50, glow: '190,195,235' },
    magma: { color: '#f6913c', tint: 'rgba(120,28,6,0.46)', edge: 0.44, glow: '255,140,60' },
    vault: { color: '#e8dcc0', tint: 'rgba(84,70,40,0.34)', edge: 0.44, glow: '255,225,170' },
    pressure: { color: '#aab4c0', tint: 'rgba(8,12,22,0.54)', edge: 0.54, glow: '190,215,255' },
    echo: { color: '#a79be0', tint: 'rgba(58,40,120,0.42)', edge: 0.48, glow: '190,170,255' }
  };
  const BONE = 'rgba(232,220,192,0.62)';
  const K = '#15120f';

  function hash(i) {
    let x = (i + 1) * 2654435761 % 4294967296;
    x = (x ^ (x >>> 13)) * 1274126177 % 4294967296;
    return (x >>> 0) / 4294967296;
  }

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function parse(color) {
    const s = String(color || '');
    if (s[0] === '#' && s.length === 7) {
      const n = parseInt(s.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/(\d+)[^\d]+(\d+)[^\d]+(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [85, 80, 73];
  }

  function tone(rgb, k, alpha) {
    const c = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v + k))));
    return 'rgba(' + c.join(',') + ',' + (alpha === undefined ? 1 : alpha) + ')';
  }

  const al = (hex, alpha) => tone(parse(hex), 0, alpha);
  const wave = (px, p) => Math.sin(px / 41 + p) * 3.2 + Math.sin(px / 13 + p * 2) * 1.1;

  function icon(name) {
    if (S.icons[name]) return S.icons[name];
    const img = new Image();
    const svg = (window.DmArt && window.DmArt.svg(name)) || '';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" '));
    S.icons[name] = img;
    return img;
  }

  function put(x, name, px, py, size) {
    const img = icon(name);
    if (img.complete && img.naturalWidth) x.drawImage(img, px, py, size, size);
  }

  function plate(x, px, py, w, hgt, border) {
    x.fillStyle = 'rgba(16,14,12,0.86)';
    x.beginPath();
    x.roundRect(px + 0.5, py + 0.5, w, hgt, 6);
    x.fill();
    x.strokeStyle = border;
    x.lineWidth = 1;
    x.stroke();
  }

  function blob(x, cx, cy, rx, ry, rnd, n) {
    const pts = [];
    const count = n || 9;
    for (let j = 0; j < count; j++) {
      const a = j / count * TAU;
      const f = 0.72 + rnd() * 0.42;
      pts.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
    }
    x.beginPath();
    for (let j = 0; j <= count; j++) {
      const p = pts[j % count];
      const q = pts[(j + 1) % count];
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      if (!j) x.moveTo(mx, my);
      else x.quadraticCurveTo(p[0], p[1], mx, my);
    }
    x.closePath();
    return pts;
  }

  // ---- what lies in the rock ----

  function ore(x, rnd, px, py, kind) {
    const col = { gold: ['#f2c84b', '#fff0b0'], copper: ['#c0774a', '#f0b890'], iron: ['#a5553a', '#dc9474'], silver: ['#cfd6dd', '#ffffff'] }[kind];
    x.strokeStyle = al(col[0], 0.4);
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(px - 22, py + (rnd() - 0.5) * 10);
    x.lineTo(px - 8, py + (rnd() - 0.5) * 6);
    x.lineTo(px + 7, py + (rnd() - 0.5) * 6);
    x.lineTo(px + 22, py + (rnd() - 0.5) * 10);
    x.stroke();
    const n = 4 + Math.floor(rnd() * 4);
    for (let j = 0; j < n; j++) {
      const ox = px + (rnd() - 0.5) * 30;
      const oy = py + (rnd() - 0.5) * 14;
      const r = 1.8 + rnd() * 2.6;
      x.fillStyle = col[0];
      x.strokeStyle = 'rgba(21,18,15,0.6)';
      x.lineWidth = 0.8;
      blob(x, ox, oy, r, r * 0.8, rnd, 5);
      x.fill();
      x.stroke();
      x.fillStyle = col[1];
      x.fillRect(ox - r * 0.4, oy - r * 0.45, 1.3, 1.3);
    }
  }

  function gems(x, rnd, px, py) {
    const col = [['#6fae7a', '#c4ecc9'], ['#d0506a', '#f6b4c0'], ['#a79be0', '#e2dcfa'], ['#f2c84b', '#fff0b0'], ['#8fd3e8', '#e2f6fb']][Math.floor(rnd() * 5)];
    const n = 2 + Math.floor(rnd() * 2);
    for (let j = 0; j < n; j++) {
      const ox = px + (j - (n - 1) / 2) * 8 + (rnd() - 0.5) * 3;
      const oy = py + (rnd() - 0.5) * 6;
      const w = 3 + rnd() * 1.6;
      const hh = 5 + rnd() * 2.5;
      x.fillStyle = col[0];
      x.strokeStyle = 'rgba(21,18,15,0.7)';
      x.lineWidth = 0.8;
      x.beginPath();
      x.moveTo(ox, oy - hh);
      x.lineTo(ox + w, oy);
      x.lineTo(ox, oy + hh);
      x.lineTo(ox - w, oy);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = col[1];
      x.beginPath();
      x.moveTo(ox, oy - hh);
      x.lineTo(ox, oy);
      x.lineTo(ox - w, oy);
      x.closePath();
      x.fill();
    }
    return [px, py - 6];
  }

  function coal(x, rnd, px, py) {
    x.fillStyle = 'rgba(18,16,15,0.82)';
    blob(x, px, py, 22 + rnd() * 16, 4 + rnd() * 3, rnd, 8);
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.22)';
    x.lineWidth = 1;
    x.beginPath();
    for (let j = 0; j < 3; j++) {
      const ox = px + (rnd() - 0.5) * 30;
      x.moveTo(ox, py - 1);
      x.lineTo(ox + 5, py - 2.5);
    }
    x.stroke();
  }

  function fossil(x, rnd, px, py) {
    const kind = Math.floor(rnd() * 6);
    const s = 1 + rnd() * 0.5;
    x.save();
    x.translate(px, py);
    x.rotate((rnd() - 0.5) * 1.6);
    x.scale(s, s);
    x.strokeStyle = BONE;
    x.fillStyle = 'rgba(232,220,192,0.16)';
    x.lineWidth = 1.2;
    x.lineCap = 'round';
    x.beginPath();
    if (kind === 0) {
      // An ammonite: a spiral with ribs.
      for (let a = 0; a < 20; a += 0.35) {
        const r = 1 + a * 0.55;
        if (!a) x.moveTo(r, 0);
        else x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      for (let a = 14; a < 20; a += 0.7) {
        const r = 1 + a * 0.55;
        x.moveTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
        x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    } else if (kind === 1) {
      // A fish: the spine, the ribs, the head and the tail.
      x.moveTo(-12, 0);
      x.lineTo(10, 0);
      for (let j = 0; j < 7; j++) {
        const rx = -8 + j * 2.6;
        const len = 5 - Math.abs(j - 2.5) * 0.9;
        x.moveTo(rx, 0);
        x.lineTo(rx + 1.6, -len);
        x.moveTo(rx, 0);
        x.lineTo(rx + 1.6, len);
      }
      x.moveTo(-12, 0);
      x.lineTo(-17, -4);
      x.lineTo(-17, 4);
      x.lineTo(-12, 0);
      x.moveTo(10, 0);
      x.lineTo(15, -5);
      x.moveTo(10, 0);
      x.lineTo(15, 5);
    } else if (kind === 2) {
      // A fern leaf.
      x.moveTo(-14, 3);
      x.quadraticCurveTo(0, -3, 14, 0);
      for (let j = 0; j < 8; j++) {
        const fx = -11 + j * 3.2;
        const fy = 2 - Math.sin((j + 1) / 9 * Math.PI) * 4 + j * 0.1;
        const len = 5.5 - j * 0.45;
        x.moveTo(fx, fy);
        x.lineTo(fx + 2.4, fy - len);
        x.moveTo(fx, fy);
        x.lineTo(fx + 2.4, fy + len);
      }
    } else if (kind === 3) {
      // A shell: a fan of ribs.
      x.arc(0, 4, 10, Math.PI * 1.08, Math.PI * 1.92);
      x.lineTo(0, 5);
      x.closePath();
      x.fill();
      for (let j = 1; j < 6; j++) {
        const a = Math.PI * (1.08 + j * 0.14);
        x.moveTo(0, 5);
        x.lineTo(Math.cos(a) * 10, 4 + Math.sin(a) * 10);
      }
    } else if (kind === 4) {
      // A bone.
      x.moveTo(-9, 0);
      x.lineTo(9, 0);
      x.stroke();
      x.beginPath();
      x.arc(-10, -2, 2.2, 0, TAU);
      x.arc(-10, 2, 2.2, 0, TAU);
      x.moveTo(12.2, -2);
      x.arc(10, -2, 2.2, 0, TAU);
      x.arc(10, 2, 2.2, 0, TAU);
    } else {
      // A trilobite: an oval of segments.
      x.ellipse(0, 0, 11, 6.5, 0, 0, TAU);
      x.fill();
      x.moveTo(-11, 0);
      x.lineTo(11, 0);
      for (let j = -3; j <= 3; j++) {
        const hw = 6.2 * Math.sqrt(1 - (j * 2.7 / 11) * (j * 2.7 / 11));
        x.moveTo(j * 2.7, -hw);
        x.lineTo(j * 2.7, hw);
      }
    }
    x.stroke();
    x.restore();
  }

  function crystals(x, rnd, px, py, dyn) {
    const n = 3 + Math.floor(rnd() * 4);
    const base = rnd() * TAU;
    for (let j = 0; j < n; j++) {
      const a = base + (j - n / 2) * 0.42 + (rnd() - 0.5) * 0.2;
      const len = 11 + rnd() * 16;
      const w = 2.6 + rnd() * 2.4;
      const tx = px + Math.cos(a) * len;
      const ty = py + Math.sin(a) * len;
      const nx = -Math.sin(a) * w;
      const ny = Math.cos(a) * w;
      const mx = px + Math.cos(a) * len * 0.72;
      const my = py + Math.sin(a) * len * 0.72;
      x.fillStyle = j % 2 ? '#8fd3e8' : '#6fbad6';
      x.strokeStyle = 'rgba(12,30,40,0.75)';
      x.lineWidth = 0.9;
      x.beginPath();
      x.moveTo(px + nx * 0.6, py + ny * 0.6);
      x.lineTo(mx + nx, my + ny);
      x.lineTo(tx, ty);
      x.lineTo(mx - nx, my - ny);
      x.lineTo(px - nx * 0.6, py - ny * 0.6);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = 'rgba(226,246,251,0.75)';
      x.beginPath();
      x.moveTo(px + nx * 0.6, py + ny * 0.6);
      x.lineTo(mx + nx, my + ny);
      x.lineTo(tx, ty);
      x.lineTo(px, py);
      x.closePath();
      x.fill();
      if (j % 2 === 0) dyn.glints.push([tx, ty, rnd() * TAU]);
    }
  }

  function cave(x, rnd, px, py, rx, ry) {
    x.fillStyle = 'rgba(7,7,12,0.9)';
    blob(x, px, py, rx, ry, rnd, 10);
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.10)';
    x.lineWidth = 1.5;
    x.stroke();
    x.save();
    x.clip();
    // Stalactites from the roof, stalagmites from the floor, a still pool.
    x.fillStyle = 'rgba(120,116,128,0.55)';
    for (let j = 0; j < 7; j++) {
      const sx = px - rx * 0.8 + j * rx * 0.27;
      const up = j % 2 === 0;
      const len = ry * (0.35 + rnd() * 0.5);
      x.beginPath();
      x.moveTo(sx - 3.5, up ? py - ry : py + ry);
      x.lineTo(sx + 3.5, up ? py - ry : py + ry);
      x.lineTo(sx, up ? py - ry + len + ry * 0.2 : py + ry - len);
      x.closePath();
      x.fill();
    }
    x.fillStyle = 'rgba(90,160,216,0.32)';
    x.fillRect(px - rx, py + ry * 0.62, rx * 2, ry);
    x.restore();
  }

  function lava(x, rnd, W, hh, dyn) {
    const n = 2 + Math.floor(rnd() * 2);
    for (let j = 0; j < n; j++) {
      let px = rnd() * W * 0.6;
      let py = hh * (0.2 + rnd() * 0.65);
      const pts = [[px, py]];
      const len = 5 + Math.floor(rnd() * 5);
      for (let q = 0; q < len; q++) {
        px += 18 + rnd() * 22;
        py += (rnd() - 0.5) * 22;
        pts.push([px, Math.max(8, Math.min(hh - 8, py))]);
      }
      [[8, 'rgba(60,14,6,0.8)'], [4.5, '#d6502a'], [1.8, '#f9c860']].forEach((st) => {
        x.strokeStyle = st[1];
        x.lineWidth = st[0];
        x.lineJoin = 'round';
        x.lineCap = 'round';
        x.beginPath();
        pts.forEach((p, q) => (q ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
        x.stroke();
      });
      const mid = pts[Math.floor(pts.length / 2)];
      dyn.glows.push([mid[0], mid[1], 26 + rnd() * 16, rnd() * TAU]);
    }
    const px = W * (0.15 + rnd() * 0.7);
    const py = hh * (0.3 + rnd() * 0.5);
    x.fillStyle = 'rgba(60,14,6,0.85)';
    blob(x, px, py, 22, 10, rnd, 8);
    x.fill();
    x.fillStyle = '#e0643a';
    blob(x, px, py, 18, 7, rnd, 8);
    x.fill();
    x.fillStyle = '#f9c860';
    blob(x, px - 2, py - 1, 9, 3, rnd, 7);
    x.fill();
    dyn.glows.push([px, py, 34, rnd() * TAU]);
  }

  function masonry(x, rnd, px, py, w, hh) {
    x.fillStyle = 'rgba(52,44,32,0.72)';
    x.fillRect(px, py, w, hh);
    x.strokeStyle = 'rgba(232,220,192,0.30)';
    x.lineWidth = 1;
    x.beginPath();
    const rows = Math.max(3, Math.round(hh / 9));
    const rh = hh / rows;
    for (let j = 0; j <= rows; j++) {
      x.moveTo(px, py + j * rh);
      x.lineTo(px + w, py + j * rh);
      if (j < rows) for (let b = (j % 2 ? 8 : 0); b <= w; b += 16) {
        x.moveTo(px + b, py + j * rh);
        x.lineTo(px + b, py + (j + 1) * rh);
      }
    }
    x.stroke();
    // A doorway under an arch and a row of signs over it.
    const dw = Math.min(26, w * 0.3);
    const dx = px + w * (0.3 + rnd() * 0.4);
    x.fillStyle = 'rgba(6,5,4,0.92)';
    x.beginPath();
    x.moveTo(dx - dw / 2, py + hh);
    x.lineTo(dx - dw / 2, py + hh * 0.5);
    x.arc(dx, py + hh * 0.5, dw / 2, Math.PI, 0);
    x.lineTo(dx + dw / 2, py + hh);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(232,220,192,0.6)';
    x.lineWidth = 1.5;
    x.stroke();
    x.fillStyle = 'rgba(242,200,75,0.5)';
    x.fillRect(dx - 1.5, py + hh * 0.62, 3, 3);
    x.strokeStyle = 'rgba(242,200,75,0.55)';
    x.lineWidth = 1.2;
    x.beginPath();
    for (let j = 0; j < Math.floor(w / 14); j++) {
      const gx = px + 7 + j * 14;
      const gy = py - 7;
      const g = Math.floor(rnd() * 4);
      if (g === 0) x.rect(gx - 2.5, gy - 2.5, 5, 5);
      else if (g === 1) {
        x.moveTo(gx - 3, gy + 3);
        x.lineTo(gx, gy - 3);
        x.lineTo(gx + 3, gy + 3);
      } else if (g === 2) {
        x.moveTo(gx + 3, gy);
        x.arc(gx, gy, 3, 0, TAU);
      } else {
        x.moveTo(gx - 3, gy - 3);
        x.lineTo(gx + 3, gy + 3);
        x.moveTo(gx + 3, gy - 3);
        x.lineTo(gx - 3, gy + 3);
      }
    }
    x.stroke();
  }

  /** One band of rock, 100 m: painted once into its own canvas. Returns what will move over it. */
  function paintBand(x, i, W, hh, color, zid, soil) {
    const rnd = rng(i * 7919 + 13);
    const R = (a, b) => a + rnd() * (b - a);
    const rgb = parse(color);
    const dyn = { glints: [], drips: [], bubbles: [], rings: [], glows: [] };
    x.fillStyle = color;
    x.fillRect(0, 0, W, hh);
    const shade = x.createLinearGradient(0, 0, 0, hh);
    shade.addColorStop(0, 'rgba(255,255,255,0.08)');
    shade.addColorStop(0.45, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.20)');
    x.fillStyle = shade;
    x.fillRect(0, 0, W, hh);
    // Beds inside the band: wavy strips a little lighter or darker.
    const beds = 2 + Math.floor(rnd() * 3);
    for (let b = 0; b < beds; b++) {
      const y = hh * (b + 0.5 + rnd() * 0.6) / (beds + 0.6);
      const th = R(5, 17);
      const p1 = R(0, 6);
      const p2 = R(0, 6);
      x.fillStyle = b % 2 ? tone(rgb, 26, 0.30) : tone(rgb, -34, 0.38);
      x.beginPath();
      x.moveTo(0, y + wave(0, p1));
      for (let px = 16; px <= W + 16; px += 16) x.lineTo(px, y + wave(px, p1));
      for (let px = W + 16; px >= 0; px -= 16) x.lineTo(px, y + th + wave(px, p2));
      x.closePath();
      x.fill();
    }
    // The grain.
    const grains = Math.round(W * hh / 190);
    x.fillStyle = 'rgba(255,255,255,0.09)';
    for (let j = 0; j < grains; j++) x.fillRect(R(0, W), R(0, hh), rnd() < 0.3 ? 2 : 1, rnd() < 0.3 ? 2 : 1);
    x.fillStyle = 'rgba(0,0,0,0.16)';
    for (let j = 0; j < grains; j++) x.fillRect(R(0, W), R(0, hh), rnd() < 0.4 ? 2 : 1, rnd() < 0.4 ? 3 : 1);
    // The build of the rock, five kinds by the band's number.
    const kind = i % 5;
    const dens = Math.max(1, W * hh / 46000);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    if (kind === 0) {
      x.strokeStyle = 'rgba(0,0,0,0.20)';
      x.lineWidth = 1;
      for (let j = 1; j < 6; j++) {
        const py = j * hh / 6 + R(-4, 4);
        const p = R(0, 6);
        x.beginPath();
        x.moveTo(0, py + wave(0, p));
        for (let px = 14; px <= W + 14; px += 14) x.lineTo(px, py + wave(px, p) * 0.8);
        x.stroke();
      }
    } else if (kind === 1) {
      for (let j = 0; j < 6 * dens; j++) {
        let px = R(-40, W);
        let py = R(0, hh * 0.5);
        x.strokeStyle = 'rgba(255,255,255,' + R(0.07, 0.16) + ')';
        x.lineWidth = R(0.8, 2.6);
        x.beginPath();
        x.moveTo(px, py);
        for (let q = 0; q < 5; q++) {
          px += R(8, 20);
          py += R(6, 20);
          x.lineTo(px, py);
        }
        x.stroke();
      }
    } else if (kind === 2) {
      x.strokeStyle = 'rgba(0,0,0,0.30)';
      x.lineWidth = 1.1;
      for (let j = 0; j < 6 * dens; j++) {
        let px = R(0, W);
        let py = R(4, hh * 0.7);
        x.beginPath();
        x.moveTo(px, py);
        for (let q = 0; q < 4; q++) {
          px += R(-8, 12);
          py += R(5, 11);
          x.lineTo(px, py);
          if (q === 1) {
            x.lineTo(px + R(6, 14), py + R(-3, 5));
            x.moveTo(px, py);
          }
        }
        x.stroke();
      }
    } else if (kind === 3) {
      for (let j = 0; j < 12 * dens; j++) {
        const px = R(0, W);
        const py = R(6, hh - 6);
        const rx = R(4, 11);
        const ry = R(3, 6);
        const rot = R(0, 3);
        x.fillStyle = j % 2 ? tone(rgb, 30, 0.5) : tone(rgb, -30, 0.55);
        x.beginPath();
        x.ellipse(px, py, rx, ry, rot, 0, TAU);
        x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.14)';
        x.lineWidth = 1;
        x.beginPath();
        x.ellipse(px, py, rx - 1, ry - 1, rot, Math.PI * 1.1, Math.PI * 1.7);
        x.stroke();
      }
    } else {
      x.strokeStyle = 'rgba(0,0,0,0.20)';
      x.lineWidth = 1;
      const rows = Math.max(2, Math.round(hh / 46));
      for (let j = 0; j < rows; j++) {
        const y0 = j * hh / rows;
        const y1 = (j + 1) * hh / rows;
        x.beginPath();
        x.moveTo(0, y1 + R(-3, 3));
        x.lineTo(W, y1 + R(-3, 3));
        for (let px = R(10, 60); px < W; px += R(40, 90)) {
          x.moveTo(px, y0);
          x.lineTo(px + R(-8, 8), y1);
        }
        x.stroke();
      }
    }
    // What lies in the rock: fossils near the top, ores and gems deeper.
    const things = Math.max(2, Math.round(W * hh / 21000 * R(0.7, 1.3)));
    const shallow = i % 100 < 30;
    for (let j = 0; j < things; j++) {
      const px = R(26, W - 26);
      let py = R(16, hh - 14);
      if (px < 190 && py < 46) py += 46;
      const p = rnd();
      if (soil && j < 2) continue;
      if (p < (shallow ? 0.42 : 0.10)) fossil(x, rnd, px, py);
      else if (p < (shallow ? 0.56 : 0.16)) coal(x, rnd, px, py);
      else if (p < (shallow ? 0.92 : 0.70)) ore(x, rnd, px, py, ['copper', 'iron', 'gold', 'silver'][Math.floor(rnd() * 4)]);
      else dyn.glints.push(gems(x, rnd, px, py).concat(rnd() * TAU));
    }
    if (soil) {
      // The topsoil: humus, roots going down, small stones.
      x.fillStyle = 'rgba(20,14,8,0.45)';
      x.fillRect(0, 0, W, 7);
      x.strokeStyle = 'rgba(190,160,110,0.42)';
      for (let j = 0; j < W / 26; j++) {
        let px = R(0, W);
        let py = 0;
        x.lineWidth = R(0.8, 1.8);
        x.beginPath();
        x.moveTo(px, py);
        for (let q = 0; q < 5; q++) {
          px += R(-7, 7);
          py += R(4, 10);
          x.lineTo(px, py);
          if (q === 2) {
            x.lineTo(px + R(-10, 10), py + R(3, 8));
            x.moveTo(px, py);
          }
        }
        x.stroke();
      }
    }
    // The zone's own things.
    if (zid === 'water') {
      for (let j = 0; j < 2 * dens + 1; j++) {
        const px = R(30, W - 30);
        const py = R(22, hh - 16);
        const rx = R(16, 34);
        const ry = R(6, 11);
        x.fillStyle = 'rgba(18,60,104,0.78)';
        blob(x, px, py, rx, ry, rnd, 8);
        x.fill();
        x.save();
        x.clip();
        x.fillStyle = 'rgba(90,160,216,0.75)';
        x.fillRect(px - rx * 1.2, py - ry * 0.25, rx * 2.4, ry * 2);
        x.fillStyle = 'rgba(190,225,248,0.85)';
        x.fillRect(px - rx * 1.2, py - ry * 0.25, rx * 2.4, 1.2);
        x.restore();
      }
      for (let j = 0; j < 5 * dens; j++) dyn.drips.push([R(10, W - 10), R(0, hh - 40), R(26, 60), R(0, 60)]);
      x.strokeStyle = 'rgba(150,205,245,0.22)';
      x.lineWidth = 1;
      dyn.drips.forEach((d) => {
        x.beginPath();
        x.moveTo(d[0], d[1]);
        x.lineTo(d[0], d[1] + d[2]);
        x.stroke();
      });
    } else if (zid === 'gas') {
      for (let j = 0; j < 3 * dens + 1; j++) {
        const px = R(26, W - 26);
        const py = R(20, hh - 16);
        const rx = R(12, 26);
        const ry = R(7, 13);
        x.fillStyle = 'rgba(190,205,96,0.22)';
        blob(x, px, py, rx, ry, rnd, 8);
        x.fill();
        x.strokeStyle = 'rgba(215,228,130,0.5)';
        x.lineWidth = 1;
        x.setLineDash([3, 3]);
        x.stroke();
        x.setLineDash([]);
        for (let q = 0; q < 3; q++) dyn.bubbles.push([px + R(-rx, rx) * 0.6, py, R(1.5, 3.5), R(0, 40)]);
      }
    } else if (zid === 'heat') {
      for (let j = 0; j < 3 * dens + 1; j++) {
        let px = R(0, W - 60);
        let py = R(14, hh - 14);
        const pts = [[px, py]];
        for (let q = 0; q < 6; q++) {
          px += R(8, 20);
          py += R(-9, 9);
          pts.push([px, py]);
        }
        [[5, 'rgba(224,100,58,0.22)'], [1.6, 'rgba(250,180,80,0.85)']].forEach((st) => {
          x.strokeStyle = st[1];
          x.lineWidth = st[0];
          x.beginPath();
          pts.forEach((p, q) => (q ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
          x.stroke();
        });
        dyn.glows.push([pts[3][0], pts[3][1], 22, R(0, TAU)]);
      }
    } else if (zid === 'crystal') {
      for (let j = 0; j < 3 * dens + 1; j++) crystals(x, rnd, R(28, W - 28), R(26, hh - 22), dyn);
    } else if (zid === 'void') {
      for (let j = 0; j < 1 + Math.round(dens); j++) cave(x, rnd, R(50, W - 50), R(hh * 0.3, hh * 0.72), R(30, 58), R(14, Math.min(26, hh * 0.22)));
    } else if (zid === 'magma') {
      lava(x, rnd, W, hh, dyn);
    } else if (zid === 'vault') {
      const mw = R(84, 140);
      const mh = Math.min(hh * 0.4, R(34, 54));
      masonry(x, rnd, R(10, Math.max(12, W - mw - 10)), R(hh * 0.25, hh - mh - 8), mw, mh);
    } else if (zid === 'pressure') {
      x.strokeStyle = 'rgba(0,0,0,0.26)';
      x.lineWidth = 1;
      for (let py = 5; py < hh; py += 5) {
        const p = R(0, 6);
        x.beginPath();
        x.moveTo(0, py);
        for (let px = 20; px <= W + 20; px += 20) x.lineTo(px, py + wave(px, p) * 0.35);
        x.stroke();
      }
      for (let j = 0; j < 7 * dens; j++) dyn.glints.push([R(8, W - 8), R(8, hh - 8), R(0, TAU)]);
    } else if (zid === 'echo') {
      for (let j = 0; j < 2 + Math.round(dens); j++) {
        const px = R(30, W - 30);
        const py = R(26, hh - 26);
        x.strokeStyle = 'rgba(190,170,255,0.20)';
        x.lineWidth = 1.2;
        for (let q = 1; q < 4; q++) {
          x.beginPath();
          x.arc(px, py, q * 9, 0, TAU);
          x.stroke();
        }
        x.fillStyle = 'rgba(210,195,255,0.8)';
        x.fillRect(px - 1.5, py - 1.5, 3, 3);
        dyn.rings.push([px, py, R(0, 40)]);
      }
    }
    const z = ZONE[zid] || ZONE.sediment;
    if (z.tint) {
      x.fillStyle = z.tint;
      x.fillRect(0, 0, W, hh);
    }
    // The contact with the band above: an uneven dark edge with a light line under it.
    const p = R(0, 6);
    x.fillStyle = 'rgba(0,0,0,0.42)';
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(W, 0);
    for (let px = W; px >= -12; px -= 12) x.lineTo(px, 3 + wave(px, p) * 0.5);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.10)';
    x.lineWidth = 1;
    x.beginPath();
    for (let px = 0; px <= W + 12; px += 12) x.lineTo(px, 4.5 + wave(px, p) * 0.5);
    x.stroke();
    return dyn;
  }

  function band(e, i, hh, color, zid) {
    const key = [e.W, hh, e.dpr, color, zid].join('|');
    let b = S.bands.get(i);
    if (b && b.key === key) return b;
    const canvas = (b && b.canvas) || document.createElement('canvas');
    canvas.width = Math.round(e.W * e.dpr);
    canvas.height = Math.max(1, Math.round(hh * e.dpr));
    const x = canvas.getContext('2d');
    x.setTransform(e.dpr, 0, 0, e.dpr, 0, 0);
    b = { key, canvas, dyn: paintBand(x, i, e.W, hh, color, zid, i === 0) };
    S.bands.set(i, b);
    return b;
  }

  /** What moves over a band: glints of gems and crystals, drips, gas bubbles, echo rings, the breath of lava. */
  function alive(x, b, y0, hh, t) {
    const d = b.dyn;
    d.glints.forEach((p) => {
      const a = 0.5 + 0.5 * Math.sin(t * 2.2 + p[2]);
      if (a < 0.15) return;
      const r = 1.5 + a * 3.5;
      x.strokeStyle = 'rgba(255,255,255,' + (a * 0.9).toFixed(2) + ')';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(p[0] - r, y0 + p[1]);
      x.lineTo(p[0] + r, y0 + p[1]);
      x.moveTo(p[0], y0 + p[1] - r);
      x.lineTo(p[0], y0 + p[1] + r);
      x.stroke();
    });
    x.fillStyle = 'rgba(190,225,248,0.85)';
    d.drips.forEach((p) => x.fillRect(p[0] - 0.8, y0 + p[1] + (t * 34 + p[3]) % p[2], 1.6, 4));
    d.bubbles.forEach((p) => {
      const up = (t * 9 + p[3]) % 40;
      if (p[1] - up < 2) return;
      x.strokeStyle = 'rgba(225,238,150,' + (0.7 * (1 - up / 40)).toFixed(2) + ')';
      x.lineWidth = 1;
      x.beginPath();
      x.arc(p[0] + Math.sin(up / 5 + p[3]) * 2, y0 + p[1] - up, p[2], 0, TAU);
      x.stroke();
    });
    d.rings.forEach((p) => {
      const r = (t * 9 + p[2]) % 40;
      x.strokeStyle = 'rgba(200,185,255,' + (0.6 * (1 - r / 40)).toFixed(2) + ')';
      x.lineWidth = 1.5;
      x.beginPath();
      x.arc(p[0], y0 + p[1], r, 0, TAU);
      x.stroke();
    });
    if (d.glows.length) {
      x.globalCompositeOperation = 'lighter';
      d.glows.forEach((p) => {
        const a = 0.20 + 0.12 * Math.sin(t * 1.4 + p[3]);
        const g = x.createRadialGradient(p[0], y0 + p[1], 0, p[0], y0 + p[1], p[2]);
        g.addColorStop(0, 'rgba(255,140,50,' + a.toFixed(2) + ')');
        g.addColorStop(1, 'rgba(255,140,50,0)');
        x.fillStyle = g;
        x.fillRect(p[0] - p[2], y0 + p[1] - p[2], p[2] * 2, p[2] * 2);
      });
      x.globalCompositeOperation = 'source-over';
    }
  }

  // ---- the surface ----

  function surface(e, y, cx, s) {
    const x = e.x;
    const W = e.W;
    const t = S.t;
    const lag = Math.max(0, e.at) * e.k;
    const sky = x.createLinearGradient(0, y - 230, 0, y);
    sky.addColorStop(0, '#0d1424');
    sky.addColorStop(0.5, '#232c48');
    sky.addColorStop(0.82, '#55465c');
    sky.addColorStop(1, '#b06a48');
    x.fillStyle = sky;
    x.fillRect(0, 0, W, y);
    // Stars and the moon: they sink behind the hills as the view goes down.
    for (let j = 0; j < 30; j++) {
      const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.3 + j * 2.1));
      x.fillStyle = 'rgba(240,236,228,' + a.toFixed(2) + ')';
      const sz = j % 5 === 0 ? 2 : 1.2;
      x.fillRect(hash(j * 3 + 1) * W, y - 46 - hash(j * 7 + 2) * 170 + lag * 0.5, sz, sz);
    }
    const mx = W * 0.8;
    const my = y - 104 * s + lag * 0.55;
    const halo = x.createRadialGradient(mx, my, 4, mx, my, 34 * s);
    halo.addColorStop(0, 'rgba(255,236,190,0.30)');
    halo.addColorStop(1, 'rgba(255,236,190,0)');
    x.fillStyle = halo;
    x.fillRect(mx - 40 * s, my - 40 * s, 80 * s, 80 * s);
    x.fillStyle = '#f3e6c2';
    x.beginPath();
    x.arc(mx, my, 9 * s, 0, TAU);
    x.fill();
    x.fillStyle = 'rgba(190,170,130,0.5)';
    x.beginPath();
    x.arc(mx - 3 * s, my - 2 * s, 2 * s, 0, TAU);
    x.arc(mx + 3 * s, my + 3 * s, 1.5 * s, 0, TAU);
    x.fill();
    // Clouds drift.
    x.fillStyle = 'rgba(150,130,150,0.26)';
    for (let j = 0; j < 3; j++) {
      const px = (hash(j + 40) * (W + 160) + t * (3 + j)) % (W + 160) - 80;
      const py = y - (70 + j * 26) * s + lag * 0.4;
      x.beginPath();
      x.ellipse(px, py, 34 * s, 5 * s, 0, 0, TAU);
      x.ellipse(px + 20 * s, py - 4 * s, 22 * s, 5 * s, 0, 0, TAU);
      x.fill();
    }
    // Two rows of hills; the far one lags more.
    [[0.34, 30, '#2e3350', 83, 31], [0.16, 16, '#1f2333', 47, 19]].forEach((r, n) => {
      const by = y + lag * r[0];
      x.fillStyle = r[2];
      x.beginPath();
      x.moveTo(0, y);
      for (let px = 0; px <= W + 12; px += 12) x.lineTo(px, by - 8 - r[1] * (0.5 + 0.5 * Math.sin(px / r[3] + n * 2)) - 5 * Math.abs(Math.sin(px / r[4])));
      x.lineTo(W, y);
      x.closePath();
      x.fill();
      if (n) {
        for (let j = 0; j < W / 34; j++) {
          const px = hash(j * 5 + 9) * W;
          if (Math.abs(px - cx) < 80 * s) continue;
          const base = by - 8 - r[1] * (0.5 + 0.5 * Math.sin(px / r[3] + n * 2)) + 3;
          const th = (9 + hash(j) * 8) * s;
          x.beginPath();
          x.moveTo(px - 4 * s, base);
          x.lineTo(px, base - th);
          x.lineTo(px + 4 * s, base);
          x.closePath();
          x.fill();
        }
      }
    });
    // The engine house with a lit window and smoke.
    const hx = cx - 68 * s;
    x.fillStyle = '#4a4038';
    x.fillRect(hx, y - 22 * s, 34 * s, 22 * s);
    x.fillStyle = '#2c2622';
    x.fillRect(hx + 22 * s, y - 14 * s, 8 * s, 14 * s);
    x.fillStyle = '#7d5a40';
    x.beginPath();
    x.moveTo(hx - 3 * s, y - 22 * s);
    x.lineTo(hx + 17 * s, y - 31 * s);
    x.lineTo(hx + 37 * s, y - 22 * s);
    x.closePath();
    x.fill();
    x.fillStyle = '#3a322c';
    x.fillRect(hx + 5 * s, y - 36 * s, 5 * s, 10 * s);
    x.fillStyle = '#f2c84b';
    x.fillRect(hx + 6 * s, y - 16 * s, 10 * s, 8 * s);
    x.fillStyle = '#4a4038';
    x.fillRect(hx + 10.5 * s, y - 16 * s, 1, 8 * s);
    for (let j = 0; j < 4; j++) {
      const age = (t * 0.3 + j / 4) % 1;
      x.fillStyle = 'rgba(200,196,210,' + (0.26 * (1 - age)).toFixed(2) + ')';
      x.beginPath();
      x.arc(hx + 7.5 * s + age * 16 * s + Math.sin(age * 6 + j) * 2, y - 38 * s - age * 36 * s, (2.5 + age * 6) * s, 0, TAU);
      x.fill();
    }
    // The derrick: a lattice tower, the crown wheel, a beacon, the cable into the well.
    const dh = 92 * s;
    x.strokeStyle = '#aeb6bf';
    x.lineWidth = 2.6 * s;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cx - 24 * s, y);
    x.lineTo(cx - 5 * s, y - dh);
    x.moveTo(cx + 24 * s, y);
    x.lineTo(cx + 5 * s, y - dh);
    x.stroke();
    x.strokeStyle = '#7b848e';
    x.lineWidth = 1.2 * s;
    x.beginPath();
    for (let j = 0; j < 5; j++) {
      const wa = 24 - j * 3.8;
      const wb = 24 - (j + 1) * 3.8;
      const a = y - j * dh / 5;
      const b = y - (j + 1) * dh / 5;
      x.moveTo(cx - wa * s, a);
      x.lineTo(cx + wb * s, b);
      x.moveTo(cx + wa * s, a);
      x.lineTo(cx - wb * s, b);
      x.moveTo(cx - wb * s, b);
      x.lineTo(cx + wb * s, b);
    }
    x.stroke();
    x.fillStyle = '#5b636c';
    x.fillRect(cx - 9 * s, y - dh - 5 * s, 18 * s, 6 * s);
    x.fillStyle = '#e0a23a';
    x.fillRect(cx - 9 * s, y - dh - 5 * s, 18 * s, 2 * s);
    x.strokeStyle = '#cfd6dd';
    x.lineWidth = 1.5 * s;
    x.beginPath();
    x.arc(cx, y - dh - 10 * s, 6 * s, 0, TAU);
    for (let j = 0; j < 3; j++) {
      const a = S.phase * TAU / 3 + j * Math.PI / 3;
      x.moveTo(cx - Math.cos(a) * 6 * s, y - dh - 10 * s - Math.sin(a) * 6 * s);
      x.lineTo(cx + Math.cos(a) * 6 * s, y - dh - 10 * s + Math.sin(a) * 6 * s);
    }
    x.stroke();
    const blink = 0.5 + 0.5 * Math.sin(t * 3);
    x.fillStyle = 'rgba(240,80,60,' + (0.35 + 0.65 * blink).toFixed(2) + ')';
    x.beginPath();
    x.arc(cx, y - dh - 19 * s, 2 * s, 0, TAU);
    x.fill();
    x.fillStyle = '#e0a23a';
    x.fillRect(cx - 1, y - dh - 4 * s, 2, dh + 4 * s);
    // A lamp post: a pool of warm light by the tower.
    const lx = cx + 28 * s;
    x.fillStyle = '#5b636c';
    x.fillRect(lx, y - 30 * s, 1.5 * s, 30 * s);
    x.globalCompositeOperation = 'lighter';
    const lamp = x.createRadialGradient(lx, y - 30 * s, 0, lx, y - 30 * s, 30 * s);
    lamp.addColorStop(0, 'rgba(255,200,110,0.42)');
    lamp.addColorStop(1, 'rgba(255,200,110,0)');
    x.fillStyle = lamp;
    x.fillRect(lx - 30 * s, y - 60 * s, 60 * s, 60 * s);
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#ffe2a0';
    x.fillRect(lx - 1.5 * s, y - 32 * s, 4.5 * s, 3 * s);
    // The crews that work here stand by the tower: one picture a kind.
    const size = 22 * s;
    const slots = [];
    for (let px = cx + 36 * s; px + size < W - 4; px += 25 * s) slots.push(px);
    for (let px = hx - 27 * s; px > 4; px -= 25 * s) slots.push(px);
    let n = 0;
    e.state.run.crews.forEach((count, j) => {
      if (!(count > 0) || n >= slots.length) return;
      put(x, e.sim.CREWS[j].id, slots[n++], y - size - 2, size);
    });
    // The turf.
    x.fillStyle = '#3f5a3c';
    x.fillRect(0, y - 4, W, 5);
    x.fillStyle = '#5c8456';
    x.beginPath();
    for (let px = 2; px < W; px += 7) {
      const th = 3 + hash(px) * 5;
      x.moveTo(px, y - 3);
      x.lineTo(px + 1.5 + hash(px + 1) * 2, y - 3 - th);
      x.lineTo(px + 3, y - 3);
    }
    x.fill();
    x.fillStyle = '#2a2622';
    x.fillRect(cx - 14 * s, y - 5, 28 * s, 6);
  }

  // ---- galleries: side drifts with props, a lamp and somebody at work ----

  function gallery(e, n, y, cx, hw, s) {
    const x = e.x;
    const t = S.t;
    const side = hash(n * 5 + 1) < 0.5 ? -1 : 1;
    const room = side < 0 ? cx - hw - 10 : e.W - cx - hw - 10;
    const len = Math.min(room, (46 + hash(n * 3) * 50) * s);
    if (len < 30) return;
    const gh = 16 * s;
    const x0 = cx + side * hw;
    const left = side < 0 ? x0 - len : x0;
    x.fillStyle = 'rgba(9,8,7,0.9)';
    x.beginPath();
    x.roundRect(left, y - gh, len, gh, side < 0 ? [5, 0, 0, 2] : [0, 5, 2, 0]);
    x.fill();
    x.fillStyle = 'rgba(125,106,80,0.9)';
    x.fillRect(left, y - 1.5, len, 1.5);
    // Timber props.
    x.fillStyle = '#7a5632';
    for (let px = 9 * s; px < len - 4; px += 17 * s) {
      const bx = side < 0 ? x0 - px : x0 + px;
      x.fillRect(bx - 1, y - gh, 2, gh);
    }
    x.fillRect(left, y - gh, len, 2);
    // The lamp.
    const lx = x0 + side * len * 0.62;
    x.globalCompositeOperation = 'lighter';
    const flick = 0.30 + 0.05 * Math.sin(t * 7 + n);
    const g = x.createRadialGradient(lx, y - gh + 4, 0, lx, y - gh + 4, 24 * s);
    g.addColorStop(0, 'rgba(255,196,110,' + flick.toFixed(2) + ')');
    g.addColorStop(1, 'rgba(255,196,110,0)');
    x.fillStyle = g;
    x.fillRect(lx - 24 * s, y - gh - 20 * s, 48 * s, 48 * s);
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#ffe2a0';
    x.fillRect(lx - 1.5, y - gh + 2, 3, 3);
    const kind = Math.floor(hash(n * 11 + 2) * 3);
    if (kind === 0 || kind === 2) {
      // A miner at the end of the drift, swinging a pick.
      const px = x0 + side * (len - 9 * s);
      const u = s;
      x.fillStyle = '#39424e';
      x.fillRect(px - 2 * u, y - 7.5 * u, 4 * u, 5 * u);
      x.fillStyle = '#1b1815';
      x.fillRect(px - 2 * u, y - 2.5 * u, 1.6 * u, 2.5 * u);
      x.fillRect(px + 0.4 * u, y - 2.5 * u, 1.6 * u, 2.5 * u);
      x.fillStyle = '#e2b48c';
      x.fillRect(px - 1.5 * u, y - 10 * u, 3 * u, 2.6 * u);
      x.fillStyle = '#e0a23a';
      x.fillRect(px - 2 * u, y - 11.5 * u, 4 * u, 1.8 * u);
      x.fillStyle = '#fff3c4';
      x.fillRect(px + side * 2 * u - 0.5, y - 11 * u, 1.4, 1.4);
      const swing = Math.sin(t * 5 + n) * 0.7;
      x.strokeStyle = '#9a6b3c';
      x.lineWidth = 1.2 * u;
      x.beginPath();
      x.moveTo(px + side * 1.5 * u, y - 6 * u);
      x.lineTo(px + side * (1.5 + Math.cos(swing) * 5.5) * u, y - (6 + Math.sin(swing) * 5.5) * u);
      x.stroke();
    }
    if (kind >= 1) {
      // An ore cart on the rails.
      const run = len - 30 * s;
      const pos = kind === 1 ? 0.5 + 0.5 * Math.sin(t * 0.5 + n) : 0.1;
      const px = x0 + side * (10 * s + run * pos * (kind === 1 ? 1 : 0.4));
      const u = s;
      x.fillStyle = '#e0a23a';
      x.beginPath();
      x.arc(px, y - 6.5 * u, 3.4 * u, Math.PI, 0);
      x.fill();
      x.fillStyle = '#8d9299';
      x.beginPath();
      x.moveTo(px - 5 * u, y - 6.5 * u);
      x.lineTo(px + 5 * u, y - 6.5 * u);
      x.lineTo(px + 3.8 * u, y - 2.6 * u);
      x.lineTo(px - 3.8 * u, y - 2.6 * u);
      x.closePath();
      x.fill();
      x.fillStyle = '#2a2622';
      x.beginPath();
      x.arc(px - 2.6 * u, y - 2 * u, 1.4 * u, 0, TAU);
      x.arc(px + 2.6 * u, y - 2 * u, 1.4 * u, 0, TAU);
      x.fill();
    }
  }

  // ---- the drill ----

  function spawn(e, cx, faceY, s, rock) {
    const dt = Math.min(0.05, e.dt || 0);
    const v = e.v || 0;
    S.spawn += dt;
    const every = 1 / (16 + Math.min(40, v * 20));
    while (S.spawn > every && S.parts.length < 140) {
      S.spawn -= every;
      const p = Math.random();
      const dir = Math.random() < 0.5 ? -1 : 1;
      if (p < 0.6) S.parts.push({ k: 0, x: dir * 4 * s, y: -3 * s, vx: dir * (40 + Math.random() * 110) * s, vy: -(20 + Math.random() * 120) * s, life: 0, max: 0.25 + Math.random() * 0.35 });
      else if (p < 0.8) S.parts.push({ k: 1, x: dir * (10 + Math.random() * 6) * s, y: -8 * s, vx: dir * (5 + Math.random() * 16) * s, vy: -(8 + Math.random() * 18) * s, life: 0, max: 0.9 + Math.random() * 0.7, c: rock });
      else S.parts.push({ k: 2, x: dir * 6 * s, y: -4 * s, vx: dir * (30 + Math.random() * 60) * s, vy: -(60 + Math.random() * 90) * s, life: 0, max: 0.5 + Math.random() * 0.3, c: rock });
    }
    if (S.spawn > 1) S.spawn = 0;
    const x = e.x;
    S.parts = S.parts.filter((p) => {
      p.life += dt;
      if (p.life >= p.max) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k !== 1) p.vy += 420 * s * dt;
      const a = 1 - p.life / p.max;
      const px = cx + p.x;
      const py = faceY + p.y;
      if (p.k === 0) {
        x.strokeStyle = a > 0.6 ? 'rgba(255,243,196,' + a.toFixed(2) + ')' : a > 0.3 ? 'rgba(246,178,60,' + a.toFixed(2) + ')' : 'rgba(224,100,58,' + a.toFixed(2) + ')';
        x.lineWidth = 1.5;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px - p.vx * 0.035, py - p.vy * 0.035);
        x.stroke();
      } else if (p.k === 1) {
        x.fillStyle = tone(p.c, 60, 0.22 * a);
        x.beginPath();
        x.arc(px, py, (3 + (1 - a) * 9) * s, 0, TAU);
        x.fill();
      } else {
        x.fillStyle = tone(p.c, -20, Math.min(1, a * 2));
        x.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
      }
      return true;
    });
  }

  function drill(e, cx, faceY, s, z) {
    const x = e.x;
    const r = e.state.run;
    const still = calm();
    const dx = still ? 0 : Math.sin(S.t * 46) * 0.6;
    const bx = cx + dx;
    const bw = 15 * s;
    const bh = 30 * s;
    const top = faceY - bh;
    const hot = r.over ? 1 : Math.min(1, (r.heat || 0) / 100);
    // The broken rock and the light at the face.
    x.fillStyle = 'rgba(0,0,0,0.42)';
    x.beginPath();
    x.ellipse(cx, faceY + 1, 26 * s, 7 * s, 0, 0, TAU);
    x.fill();
    x.globalCompositeOperation = 'lighter';
    const pulse = still ? 0.3 : 0.26 + 0.08 * Math.sin(S.t * 9);
    const glow = x.createRadialGradient(cx, faceY - 4 * s, 0, cx, faceY - 4 * s, 120 * s);
    glow.addColorStop(0, 'rgba(' + z.glow + ',' + pulse.toFixed(2) + ')');
    glow.addColorStop(0.4, 'rgba(' + z.glow + ',0.10)');
    glow.addColorStop(1, 'rgba(' + z.glow + ',0)');
    x.fillStyle = glow;
    x.fillRect(cx - 120 * s, faceY - 124 * s, 240 * s, 240 * s);
    x.globalCompositeOperation = 'source-over';
    // The bit: a cone with turning flutes.
    const cone = () => {
      x.beginPath();
      x.moveTo(bx - bw, top);
      x.lineTo(bx + bw, top);
      x.lineTo(bx + 2 * s, faceY + 2);
      x.lineTo(bx - 2 * s, faceY + 2);
      x.closePath();
    };
    cone();
    x.fillStyle = '#b4bcc5';
    x.fill();
    x.save();
    x.clip();
    x.fillStyle = '#59616b';
    for (let j = -1; j < 5; j++) {
      const y0 = top + ((S.phase + j) / 4) * (bh + 12 * s) - 10 * s;
      x.beginPath();
      x.moveTo(bx - bw, y0);
      x.lineTo(bx + bw, y0 + 9 * s);
      x.lineTo(bx + bw, y0 + 13.5 * s);
      x.lineTo(bx - bw, y0 + 4.5 * s);
      x.closePath();
      x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,0.26)';
    x.fillRect(bx - bw, top, bw * 0.7, bh + 4);
    x.fillStyle = 'rgba(0,0,0,0.30)';
    x.fillRect(bx + bw * 0.35, top, bw, bh + 4);
    if (hot > 0.02) {
      const heat = x.createLinearGradient(0, top, 0, faceY);
      heat.addColorStop(0, 'rgba(240,90,40,0)');
      heat.addColorStop(1, 'rgba(255,120,40,' + (0.85 * hot).toFixed(2) + ')');
      x.fillStyle = heat;
      x.fillRect(bx - bw, top, bw * 2, bh + 4);
    }
    x.restore();
    cone();
    x.strokeStyle = K;
    x.lineWidth = 1.5;
    x.lineJoin = 'round';
    x.stroke();
    x.fillStyle = r.over ? '#ff7a4a' : '#f2c84b';
    x.beginPath();
    x.moveTo(bx - 3 * s, faceY - 3 * s);
    x.lineTo(bx + 3 * s, faceY - 3 * s);
    x.lineTo(bx, faceY + 4 * s);
    x.closePath();
    x.fill();
    x.stroke();
    // The collar and the motor housing: vents, a hazard band, a status light.
    x.fillStyle = '#3d444c';
    x.fillRect(bx - 10 * s, top - 4 * s, 20 * s, 4 * s);
    x.strokeRect(bx - 10 * s, top - 4 * s, 20 * s, 4 * s);
    const my = top - 4 * s - 22 * s;
    const body = x.createLinearGradient(bx - 12 * s, 0, bx + 12 * s, 0);
    body.addColorStop(0, '#8a939d');
    body.addColorStop(0.35, '#6a737d');
    body.addColorStop(1, '#3f464e');
    x.fillStyle = body;
    x.beginPath();
    x.roundRect(bx - 12 * s, my, 24 * s, 22 * s, 3 * s);
    x.fill();
    x.stroke();
    x.save();
    x.beginPath();
    x.rect(bx - 12 * s, my + 13 * s, 24 * s, 5 * s);
    x.clip();
    x.fillStyle = '#e0a23a';
    x.fillRect(bx - 12 * s, my + 13 * s, 24 * s, 5 * s);
    x.fillStyle = '#1b1815';
    for (let j = -2; j < 6; j++) {
      x.beginPath();
      x.moveTo(bx - 12 * s + j * 6 * s, my + 18 * s);
      x.lineTo(bx - 12 * s + j * 6 * s + 5 * s, my + 13 * s);
      x.lineTo(bx - 12 * s + j * 6 * s + 8 * s, my + 13 * s);
      x.lineTo(bx - 12 * s + j * 6 * s + 3 * s, my + 18 * s);
      x.closePath();
      x.fill();
    }
    x.restore();
    x.fillStyle = 'rgba(0,0,0,0.5)';
    for (let j = 0; j < 3; j++) x.fillRect(bx - 8 * s, my + (3 + j * 3) * s, 10 * s, 1.4 * s);
    const lit = still ? 1 : 0.5 + 0.5 * Math.sin(S.t * (r.over ? 12 : 4));
    x.fillStyle = r.over ? 'rgba(255,90,70,' + (0.4 + 0.6 * lit).toFixed(2) + ')' : 'rgba(127,224,138,' + (0.5 + 0.5 * lit).toFixed(2) + ')';
    x.beginPath();
    x.arc(bx + 7 * s, my + 6 * s, 2.2 * s, 0, TAU);
    x.fill();
    x.fillStyle = '#4a525b';
    x.fillRect(bx - 5 * s, my - 5 * s, 10 * s, 5 * s);
    x.strokeRect(bx - 5 * s, my - 5 * s, 10 * s, 5 * s);
    x.lineWidth = 1;
    return my - 5 * s;
  }

  // ---- the whole field ----

  function draw(e) {
    const x = e.x;
    const W = e.W;
    const H = e.H;
    const c = e.cfg;
    const sim = e.sim;
    const state = e.state;
    const r = state.run;
    const k = e.k;
    const still = calm();
    const dt = Math.min(0.1, e.dt || 0);
    const v = e.v || 0;
    if (!still) {
      S.t += dt;
      S.phase = (S.phase + dt * Math.min(9, 1.6 + v * 6)) % 1;
    }
    const t = S.t;
    const s = W > 480 ? 1.25 : 1;
    const at = r.depth - e.scrollM;
    e.at = at;
    const sky = Math.min(H * 0.44, 138 * s);
    const drillY = Math.round(Math.min(H * 0.74, at * k + sky));
    const top = at - drillY / k;
    const bottom = at + (H - drillY) / k;
    const Y = (d) => drillY + (d - at) * k;
    const colW = e.colW;
    const cx = Math.round((W - colW) * 0.55);
    const hw = Math.round(11 * s);
    const circle = c['circle.depth'];
    const zoneNow = sim.zoneAt(state, r.depth, c);
    const zNow = ZONE[zoneNow.id] || ZONE.sediment;
    x.setTransform(e.dpr, 0, 0, e.dpr, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = e.colors['--bg'];
    x.fillRect(0, 0, W, H);
    const surfaceY = Y(0);
    const ground = Math.max(0, Math.min(H, surfaceY));
    if (surfaceY > 0) surface(e, Math.min(H + 40, surfaceY), cx, s);

    // The bands.
    const first = Math.max(0, Math.floor(top / 100));
    const last = Math.floor(bottom / 100);
    const yb = (i) => Math.round(Y(i * 100));
    const labels = [];
    for (let i = first; i <= last; i++) {
      const y0 = yb(i);
      const hh = Math.round(100 * k);
      const rock = e.rockOf(i);
      const mid = i * 100 + 50;
      const zid = sim.zoneAt(state, mid, c).id;
      const b = band(e, i, hh, rock.color || '#555049', zid);
      x.drawImage(b.canvas, 0, y0, W, yb(i + 1) - y0);
      alive(x, b, y0, hh, t);
      if (zid !== 'sediment' && sim.inZone(state, 'heat', mid, c) && i * 100 <= r.depth && r.depth < (i + 1) * 100 && r.heat > 0) {
        x.fillStyle = 'rgba(210,80,40,' + (0.20 * r.heat / 100).toFixed(3) + ')';
        x.fillRect(0, y0, W, hh);
      }
      labels.push({ i, y0, y1: y0 + hh, rock });
    }
    S.bands.forEach((b, i) => { if (i < first - 2 || i > last + 2) S.bands.delete(i); });

    // Galleries in the passed rock, when there is somebody to work in them.
    if (r.crews.some((n) => n > 0)) {
      for (let n = Math.max(0, Math.floor(top / 50) - 1); n * 50 + 30 < Math.min(bottom + 20, r.depth - 14); n++) {
        if (Y(n * 50 + 30) < Y(r.depth) - 72 * s) gallery(e, n, Y(n * 50 + 30), cx, hw, s);
      }
    }

    // Finds: a spark in the rock where each was met.
    r.marks.forEach((d, j) => {
      if (d < top || d > bottom) return;
      const y = Y(d);
      const ox = 24 + hash(j * 7 + Math.round(d)) * (W - colW - 70);
      const a = 0.6 + 0.4 * Math.sin(t * 3 + j);
      x.fillStyle = 'rgba(242,200,75,0.20)';
      x.strokeStyle = 'rgba(255,236,170,' + a.toFixed(2) + ')';
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(ox, y - 8);
      x.lineTo(ox + 6, y);
      x.lineTo(ox, y + 8);
      x.lineTo(ox - 6, y);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = '#fff3c4';
      x.fillRect(ox - 1, y - 1, 2, 2);
    });

    // The light: the rock darkens away from the shaft and with the depth of the circle.
    if (ground < H) {
      const f = cx / W;
      const edge = zNow.edge;
      const side = x.createLinearGradient(0, 0, W, 0);
      side.addColorStop(0, 'rgba(0,0,0,' + edge + ')');
      side.addColorStop(f * 0.5, 'rgba(0,0,0,' + (edge * 0.3).toFixed(2) + ')');
      side.addColorStop(f, 'rgba(0,0,0,0)');
      side.addColorStop(f + (1 - f) * 0.5, 'rgba(0,0,0,' + (edge * 0.3).toFixed(2) + ')');
      side.addColorStop(1, 'rgba(0,0,0,' + edge + ')');
      x.fillStyle = side;
      x.fillRect(0, ground, W, H - ground);
      const deep = Math.min(0.14, sim.circleOf(Math.max(0, at), c).local / circle * 0.14);
      if (deep > 0.01) {
        x.fillStyle = 'rgba(0,0,0,' + deep.toFixed(3) + ')';
        x.fillRect(0, ground, W, H - ground);
      }
    }
    // Nobody has seen the rock below the face yet.
    const faceY = Y(r.depth);
    if (faceY < H) {
      const fy = Math.max(-40, faceY);
      const dark = x.createLinearGradient(0, fy - 4, 0, fy + 46 * s);
      dark.addColorStop(0, 'rgba(0,0,0,0)');
      dark.addColorStop(1, 'rgba(0,0,0,0.50)');
      x.fillStyle = dark;
      x.fillRect(0, fy - 4, W, H - fy + 4);
    }

    // Where the zones begin: a glowing line and a plate with the zone's picture and name.
    for (let n = Math.max(0, Math.floor(top / circle)); n <= Math.floor(bottom / circle); n++) {
      sim.ZONES.forEach((zn) => {
        const st = zn.start ? sim.zoneStart(state, zn.id, c) : (n > 0 ? 0 : null);
        if (st === null) return;
        const d = n * circle + st;
        if (d < top - 10 || d > bottom + 10) return;
        const y = Math.round(Y(d));
        const zc = (ZONE[zn.id] || ZONE.sediment).color;
        const g = x.createLinearGradient(0, y - 12, 0, y + 12);
        g.addColorStop(0, al(zc, 0));
        g.addColorStop(0.5, al(zc, 0.42));
        g.addColorStop(1, al(zc, 0));
        x.fillStyle = g;
        x.fillRect(0, y - 12, W, 24);
        x.fillStyle = zc;
        for (let px = 0; px < W; px += 14) x.fillRect(px, y - 1, 9, 2);
        x.font = '600 12px sans-serif';
        const title = e.t(zn.title);
        const tw = Math.ceil(x.measureText(title).width) + 34;
        const tx = Math.max(6, W - colW - 14 - tw);
        plate(x, tx, y - 27, tw, 24, zc);
        put(x, zn.id, tx + 5, y - 24, 18);
        x.fillStyle = zc;
        x.fillText(title, tx + 27, y - 11);
      });
    }

    // Records below the face.
    const marks = [[sim.cs(state).record, 'рекорд скважин'], [state.meta.record, 'рекорд всех краёв']];
    marks.forEach((m, j) => {
      if (!(m[0] > r.depth + 5) || m[0] < top || m[0] > bottom || (j === 1 && Math.abs(m[0] - marks[0][0]) < 1)) return;
      const y = Math.round(Y(m[0]));
      x.strokeStyle = 'rgba(240,236,228,0.6)';
      x.lineWidth = 1;
      x.setLineDash([6, 5]);
      x.beginPath();
      x.moveTo(0, y + 0.5);
      x.lineTo(W, y + 0.5);
      x.stroke();
      x.setLineDash([]);
      x.font = '12px sans-serif';
      const text = e.t(m[1]) + ' ' + e.meters(m[0]);
      const tw = Math.ceil(x.measureText(text).width) + 16;
      const tx = Math.max(6, W - colW - 14 - tw);
      plate(x, tx, y - 23, tw, 20, 'rgba(240,236,228,0.5)');
      x.fillStyle = e.colors['--ink'];
      x.fillText(text, tx + 8, y - 9);
    });

    // The shaft: the bore, the casing with joints, the pipes of the equipment, lamps, the string, the cage.
    const shaftTop = Math.max(-4, surfaceY);
    let stringEnd = faceY;
    const visible = faceY > -60 && faceY < H + 60;
    if (faceY > 0 && faceY > shaftTop) {
      const end = Math.min(H + 4, faceY);
      const sh = end - shaftTop;
      const bore = x.createLinearGradient(cx - hw, 0, cx + hw, 0);
      bore.addColorStop(0, 'rgba(4,4,5,0.94)');
      bore.addColorStop(0.5, 'rgba(26,23,20,0.92)');
      bore.addColorStop(1, 'rgba(4,4,5,0.94)');
      x.fillStyle = bore;
      x.fillRect(cx - hw, shaftTop, hw * 2, sh);
      x.fillStyle = 'rgba(176,182,190,0.75)';
      x.fillRect(cx - hw - 2, shaftTop, 2, sh);
      x.fillRect(cx + hw, shaftTop, 2, sh);
      const from = Math.max(0, Math.ceil(top / 10) * 10);
      x.fillStyle = 'rgba(176,182,190,0.30)';
      for (let d = from; d < Math.min(r.depth, bottom); d += 10) {
        const y = Math.round(Y(d));
        if (y > shaftTop) x.fillRect(cx - hw - 3, y, hw * 2 + 6, d % 50 === 0 ? 2 : 1);
      }
      // Pipes: what was bought for the zones runs along the casing.
      const pipes = [['pump', '#5aa0d8', -hw - 6], ['vent', '#b9c36a', hw + 4], ['cool', '#8fd3e8', -hw - 10], ['sink', '#e0643a', hw + 8]];
      const pend = Math.min(end, faceY - 40 * s);
      pipes.forEach((p) => {
        if (!(r.eq && r.eq[p[0]] > 0) || pend <= shaftTop) return;
        x.fillStyle = p[1];
        x.fillRect(cx + p[2], shaftTop, 2.5, pend - shaftTop);
        x.fillStyle = 'rgba(0,0,0,0.45)';
        for (let d = from; d < Math.min(r.depth, bottom); d += 20) {
          const y = Math.round(Y(d)) + 4;
          if (y > shaftTop && y < pend) x.fillRect(cx + p[2] - 0.5, y, 3.5, 2);
        }
      });
      // Lamps on the casing, one every 25 m.
      x.globalCompositeOperation = 'lighter';
      for (let n = Math.max(0, Math.floor(top / 25)); n * 25 + 12 < Math.min(bottom, r.depth - 6); n++) {
        const y = Y(n * 25 + 12);
        const lx = cx + (n % 2 ? hw + 1 : -hw - 1);
        const a = still ? 0.26 : 0.24 + 0.05 * Math.sin(t * 5 + n * 1.7);
        const g = x.createRadialGradient(lx, y, 0, lx, y, 30 * s);
        g.addColorStop(0, 'rgba(' + zNow.glow + ',' + a.toFixed(2) + ')');
        g.addColorStop(1, 'rgba(' + zNow.glow + ',0)');
        x.fillStyle = g;
        x.fillRect(lx - 30 * s, y - 30 * s, 60 * s, 60 * s);
      }
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = '#ffe9b8';
      for (let n = Math.max(0, Math.floor(top / 25)); n * 25 + 12 < Math.min(bottom, r.depth - 6); n++) {
        x.fillRect(cx + (n % 2 ? hw - 2 : -hw) , Y(n * 25 + 12) - 1.5, 2, 3);
      }
    }

    // The drill and what flies from under it.
    if (visible) {
      const rockRgb = parse(e.rockOf(Math.floor(r.depth / 100)).color);
      stringEnd = drill(e, cx, faceY, s, zNow);
      if (!still) spawn(e, cx, faceY, s, rockRgb);
      else S.parts.length = 0;
    }
    if (faceY > 0 && stringEnd > shaftTop) {
      // The drill string: a pipe with a thread that runs as it turns.
      const end = Math.min(H + 4, stringEnd);
      const pw = 2.5 * s;
      x.fillStyle = '#8d9299';
      x.fillRect(cx - pw, shaftTop, pw * 2, end - shaftTop);
      x.fillStyle = 'rgba(255,255,255,0.38)';
      x.fillRect(cx - pw, shaftTop, 1.2, end - shaftTop);
      x.fillStyle = 'rgba(0,0,0,0.42)';
      const stepPx = 9 * s;
      const off = (S.phase * stepPx * 2) % stepPx;
      for (let y = Math.max(shaftTop, 0) - stepPx + off; y < end; y += stepPx) {
        if (y > shaftTop) x.fillRect(cx - pw, y, pw * 2, 1.5);
      }
      // The cage rides beside the string when the crews have one.
      if (r.crews[4] > 0 && end - shaftTop > 80) {
        const lo = Math.max(shaftTop, 0) + 16;
        const hi = end - 70 * s;
        if (hi > lo) {
          const ph = still ? 0.4 : Math.abs(((t / 9) % 2) - 1);
          const cy = lo + (hi - lo) * ph;
          x.fillStyle = 'rgba(207,214,221,0.6)';
          x.fillRect(cx + pw + (hw - pw) / 2 - 0.5, shaftTop, 1, cy - shaftTop);
          x.fillStyle = '#e0a23a';
          x.fillRect(cx + pw + 1, cy, hw - pw - 2, 2);
          x.fillRect(cx + pw + 1, cy + 9 * s, hw - pw - 2, 2);
          x.strokeStyle = '#cfd6dd';
          x.lineWidth = 1;
          x.strokeRect(cx + pw + 1.5, cy + 0.5, hw - pw - 3, 10 * s);
        }
      }
    }

    // The names of the bands; the top one stays on screen while its band does.
    x.lineJoin = 'round';
    const zone = zonePlate(e, zoneNow, zNow, true);
    labels.forEach((b) => {
      x.font = '600 13px sans-serif';
      const title = b.rock.title;
      const tw = x.measureText(title).width;
      let sticky = 20;
      if (16 + tw > W - zone.w - 16) sticky = zone.h + 26;
      const ly = Math.max(b.y0 + 20, Math.min(b.y1 - 22, sticky));
      if (ly < 14 || ly > H + 20) return;
      x.strokeStyle = 'rgba(10,9,8,0.7)';
      x.lineWidth = 3;
      x.strokeText(title, 16, ly);
      x.fillStyle = 'rgba(244,240,232,0.94)';
      x.fillText(title, 16, ly);
      x.font = '12px sans-serif';
      const sub = e.fmt(b.i * 100) + ' м';
      x.strokeText(sub, 16, ly + 15);
      x.fillStyle = 'rgba(244,240,232,0.72)';
      x.fillText(sub, 16, ly + 15);
    });

    // The ruler on the left edge and the mark of the face on it.
    const step = k > 2.4 ? 10 : 20;
    for (let d = Math.max(0, Math.ceil(top / step) * step); d <= bottom; d += step) {
      const y = Math.round(Y(d));
      const long = d % 100 === 0;
      x.fillStyle = long ? 'rgba(244,240,232,0.75)' : 'rgba(244,240,232,0.35)';
      x.fillRect(0, y, long ? 11 : 5, 1);
    }
    if (visible) {
      x.fillStyle = '#e0a23a';
      x.beginPath();
      x.moveTo(0, faceY - 5);
      x.lineTo(9, faceY);
      x.lineTo(0, faceY + 5);
      x.closePath();
      x.fill();
      // Metres and speed on a plate by the drill.
      x.font = '700 15px sans-serif';
      const label = e.meters(r.depth);
      const w1 = x.measureText(label).width;
      x.font = '12px sans-serif';
      const speed = e.mps(v);
      const w2 = x.measureText(speed).width;
      const pw = Math.ceil(Math.max(w1, w2)) + 18;
      let px = cx + 20 * s;
      if (px + pw > W - colW - 4) px = Math.max(14, cx - 20 * s - pw);
      const py = Math.round(faceY - 58 * s);
      plate(x, px, py, pw, 42, 'rgba(224,162,58,0.7)');
      x.fillStyle = '#e0a23a';
      x.fillRect(px + 1, py + 6, 2.5, 30);
      x.fillStyle = e.colors['--ink'];
      x.font = '700 15px sans-serif';
      x.fillText(label, px + 10, py + 18);
      x.fillStyle = r.over ? e.colors['--danger'] : 'rgba(244,240,232,0.72)';
      x.font = '12px sans-serif';
      x.fillText(speed, px + 10, py + 34);
    }
    zonePlate(e, zoneNow, zNow, false);
  }

  /** The plate in the corner: the zone of the face and how far the next one is. */
  function zonePlate(e, zoneNow, z, measure) {
    const x = e.x;
    const next = e.sim.nextZone(e.state, e.state.run.depth, e.cfg);
    const title = e.t(zoneNow.title);
    const sub = next ? e.t(next.zone.title) + ' · ' + e.meters(Math.max(0, next.at - e.state.run.depth)) : '';
    x.font = '600 12px sans-serif';
    const w1 = x.measureText(title).width;
    x.font = '11px sans-serif';
    const w2 = sub ? x.measureText(sub).width + 12 : 0;
    const w = Math.ceil(Math.max(w1, w2)) + 38;
    const hgt = sub ? 40 : 26;
    if (measure) return { w: w + 8, h: hgt + 8 };
    const px = e.W - w - 8;
    plate(x, px, 8, w, hgt, al(z.color, 0.75));
    put(x, zoneNow.id, px + 6, 8 + (hgt - 20) / 2, 20);
    x.fillStyle = z.color;
    x.font = '600 12px sans-serif';
    x.fillText(title, px + 31, sub ? 23 : 25);
    if (sub) {
      x.font = '11px sans-serif';
      x.fillStyle = 'rgba(244,240,232,0.7)';
      // A small arrow down: this is what waits below.
      x.beginPath();
      x.moveTo(px + 31, 33);
      x.lineTo(px + 39, 33);
      x.lineTo(px + 35, 39);
      x.closePath();
      x.fill();
      x.fillText(sub, px + 43, 40);
    }
    return null;
  }

  window.DmScene = { draw: draw, zones: ZONE, reset: function () { S.bands.clear(); S.parts.length = 0; } };
})();
