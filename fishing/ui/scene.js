// The water of «Рыбалка» on a canvas: FishScene.draw(ctx, m) paints one frame from a plain model
// and knows nothing of the engine or the rules. Layers, back to front: the sky by the period and
// the weather (or the rock of the tunnel), the far shore of the water, the strip of the surface
// with glints, the cut of the water down to the bed, the bank with the pier (or the boat), the
// angler with the rod, the line, the float, the fish. The quiet layers are kept on spare canvases
// and redrawn only when the place, the hour or the size changes.
//
// m = { W, H, dpr, t (seconds of animation), still (reduced motion), water {id, tint, underground},
//       period, weather, hour, z1, z2, maxView (metres), boat, lantern, sonar [{zone, i}],
//       cast {phase, fill, d, T, hold, jt, zone}, range, falseBite, fishLen (css px),
//       fish(ctx, x, y, len, tilt) — draws the hooked fish, its mouth at x, y }
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const WHITE = [255, 255, 255];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (i) => {
    const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
    return v - Math.floor(v);
  };
  const hex = (s) => {
    const n = parseInt(String(s).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const scale = (a, k) => [Math.min(255, a[0] * k), Math.min(255, a[1] * k), Math.min(255, a[2] * k)];
  const css = (c, a) => (a == null ? 'rgb(' : 'rgba(') + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + (a == null ? ')' : ',' + a.toFixed(3) + ')');

  // The sky of each period: the zenith, the middle, the horizon, the disc, how much light there is.
  const SKIES = {
    morning: { top: '#25315a', mid: '#8a6f93', low: '#f3ad84', disc: '#ffd9a0', light: 0.84 },
    day: { top: '#27557f', mid: '#4f86ad', low: '#9cc6d2', disc: '#fff2c4', light: 1 },
    evening: { top: '#272449', mid: '#86496a', low: '#f28c56', disc: '#ffb070', light: 0.72 },
    night: { top: '#060a18', mid: '#0f1830', low: '#22345a', disc: '#e9edf5', light: 0.36 }
  };

  // The palette of each water: the water at the surface and in the depth, the bed, the far shore,
  // the weed, the bank, and what stands on the far shore.
  const WATERS = {
    pond: { top: '#2f8576', deep: '#0d2a2e', bed: '#3a3524', far: '#3f6a44', weed: '#4f9a52', bank: '#4a5a34', kind: 'pond' },
    river: { top: '#2c7f92', deep: '#0c2836', bed: '#4a4130', far: '#46704e', weed: '#5aa06a', bank: '#55603a', kind: 'river' },
    lake: { top: '#2a6fa2', deep: '#0a2040', bed: '#30343a', far: '#2f5a50', weed: '#3f8f78', bank: '#4a5a3c', kind: 'lake' },
    swamp: { top: '#56703a', deep: '#182012', bed: '#2a2114', far: '#4a5232', weed: '#7a8a3a', bank: '#4a4a2a', kind: 'swamp' },
    creek: { top: '#3aa0aa', deep: '#103c48', bed: '#50545c', far: '#5a6a7c', weed: '#58a890', bank: '#5a5e62', kind: 'creek' },
    bay: { top: '#2468aa', deep: '#07183a', bed: '#5a5036', far: '#3a4a5c', weed: '#2f8a7a', bank: '#6a6048', kind: 'bay' },
    ice: { top: '#5a8eaa', deep: '#0c2236', bed: '#2a3440', far: '#c8d6e2', weed: '#4a7a80', bank: '#dfe8ee', kind: 'ice' },
    cave: { top: '#1f4c5c', deep: '#050a12', bed: '#181b22', far: '#2a2e38', weed: '#3a6a70', bank: '#2c3038', kind: 'cave' }
  };

  function paletteOf(water) {
    const p = WATERS[water.id];
    if (p) return p;
    const t = hex(water.tint || '#1d2b33');
    const h2 = (c) => '#' + c.map((v) => ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2)).join('');
    return { top: h2(scale(t, 2.6)), deep: h2(scale(t, 0.8)), bed: '#33352f', far: '#3a5a4a', weed: '#4a9068', bank: '#4a5638', kind: water.underground ? 'cave' : 'lake' };
  }

  // ---- spare canvases for the quiet layers -------------------------------------------------------

  const layers = {};

  function layer(name, key, W, H, paint) {
    let l = layers[name];
    if (!l) {
      l = { cv: document.createElement('canvas'), key: '' };
      layers[name] = l;
    }
    if (l.key !== key) {
      l.cv.width = W;
      l.cv.height = H;
      const c = l.cv.getContext('2d');
      c.clearRect(0, 0, W, H);
      paint(c);
      l.key = key;
    }
    return l.cv;
  }

  // ---- small shapes -----------------------------------------------------------------------------

  function ridge(c, W, base, amp, seed, f, color) {
    const yAt = (x) => base - amp * (0.5 + 0.32 * Math.sin((x / W) * f * TAU + seed) + 0.18 * Math.sin((x / W) * f * 2.7 * TAU + seed * 1.7));
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, base + 1);
    for (let i = 0; i <= 48; i++) c.lineTo((W * i) / 48, yAt((W * i) / 48));
    c.lineTo(W, base + 1);
    c.fill();
    return yAt;
  }

  function fir(c, x, y, hgt, color, snow) {
    const w = hgt * 0.42;
    c.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      const top = y - hgt + (hgt * i) / 4.2;
      const bot = y - hgt + (hgt * (i + 1.5)) / 3.6;
      const half = (w * (i + 1.4)) / 3.4;
      c.beginPath();
      c.moveTo(x, top);
      c.lineTo(x + half, bot);
      c.lineTo(x - half, bot);
      c.fill();
    }
    c.fillRect(x - hgt * 0.035, y - hgt * 0.2, hgt * 0.07, hgt * 0.2);
    if (snow) {
      c.fillStyle = snow;
      c.beginPath();
      c.moveTo(x, y - hgt);
      c.lineTo(x + w * 0.3, y - hgt * 0.72);
      c.lineTo(x - w * 0.3, y - hgt * 0.72);
      c.fill();
    }
  }

  function leafy(c, x, y, hgt, color, trunk) {
    c.fillStyle = trunk;
    c.fillRect(x - hgt * 0.04, y - hgt * 0.45, hgt * 0.08, hgt * 0.45);
    c.fillStyle = color;
    [[0, -0.66, 0.34], [-0.2, -0.5, 0.26], [0.2, -0.52, 0.27]].forEach((b) => {
      c.beginPath();
      c.arc(x + b[0] * hgt, y + b[1] * hgt, b[2] * hgt, 0, TAU);
      c.fill();
    });
  }

  function blob(c, x, y, rx, ry, color) {
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, TAU);
    c.fill();
  }

  function cloud(c, x, y, s, color) {
    c.save();
    c.beginPath();
    c.rect(x - s * 3, y - s * 3, s * 6, s * 3);
    c.clip();
    c.fillStyle = color;
    [[-1.25, 0, 0.62], [-0.45, -0.3, 0.95], [0.5, -0.12, 0.8], [1.3, 0.04, 0.55]].forEach((b) => {
      c.beginPath();
      c.arc(x + b[0] * s, y + b[1] * s, b[2] * s, 0, TAU);
      c.fill();
    });
    c.restore();
  }

  // ---- the frame --------------------------------------------------------------------------------

  let rodAngle = null;

  function draw(ctx, m) {
    const W = m.W;
    const H = m.H;
    const dpr = m.dpr || 1;
    const t = m.still ? 0 : m.t;
    const u = clamp(H / 240, dpr * 1.05, dpr * 2);
    const water = m.water || {};
    const pal = paletteOf(water);
    const kind = pal.kind;
    const cave = kind === 'cave';
    const ice = kind === 'ice';
    const weather = cave ? 'any' : m.weather;
    const sky = SKIES[m.period] || SKIES.day;
    const dull = weather === 'rain' ? 0.7 : weather === 'cloudy' ? 0.55 : weather === 'fog' ? 0.5 : weather === 'wind' ? 0.12 : 0;
    const L = cave ? 0.5 : sky.light * (1 - dull * 0.22);
    const grey = scale([112, 122, 134], sky.light);
    const skyTop = mixc(hex(sky.top), grey, dull * 0.8);
    const skyMid = mixc(hex(sky.mid), grey, dull);
    const skyLow = cave ? [26, 30, 38] : mixc(hex(sky.low), scale(grey, 1.15), dull);
    const shade = (c, k) => mixc(scale(c, 0.3 + 0.7 * L), skyLow, k == null ? 0.1 : k);
    const night = m.period === 'night' && !cave;

    const S = Math.round(H * 0.37);
    const B = Math.round(13 * u);
    const Y0 = S + B;
    const D = H - Y0;
    const shoreW = clamp(W * 0.15, 54 * u, W * 0.26);
    const x0 = shoreW + 10 * u;
    const xOf = (d) => x0 + ((W - x0 - 14 * u) * Math.max(0, d)) / Math.max(1, m.maxView);
    const z1 = xOf(m.z1);
    const z2 = xOf(m.z2);
    const bed = [[0, Y0 + D * 0.26], [shoreW, Y0 + D * 0.36], [z1, Y0 + D * 0.62], [z2, Y0 + D * 0.82], [W, Y0 + D * 0.93]];
    const bedY = (x) => {
      for (let i = 1; i < bed.length; i++) {
        if (x <= bed[i][0]) return bed[i - 1][1] + ((bed[i][1] - bed[i - 1][1]) * (x - bed[i - 1][0])) / Math.max(1, bed[i][0] - bed[i - 1][0]);
      }
      return bed[bed.length - 1][1];
    };
    const windy = weather === 'wind';
    const key = [W, H, water.id, m.period, weather, Math.floor(m.hour * 6), m.z1, m.z2, Math.round(m.maxView)].join('|');

    // ---- the sky with the disc and the stars, or the rock ----
    const dayK = clamp((m.hour - 5) / 16, 0, 1);
    const nightK = (((m.hour + 24 - 21) % 24) / 8);
    const discK = night ? clamp(nightK, 0, 1) : dayK;
    const discX = W * (0.24 + 0.66 * discK);
    const discY = S * (0.94 - 0.62 * Math.sin(Math.PI * discK));
    const discOn = !cave && weather !== 'fog';
    const discA = weather === 'cloudy' || weather === 'rain' ? 0.35 : 1;
    ctx.drawImage(layer('sky', key, W, H, (c) => {
      if (cave) {
        const g0 = c.createLinearGradient(0, 0, 0, S);
        g0.addColorStop(0, '#0a0c11');
        g0.addColorStop(1, '#1c2029');
        c.fillStyle = g0;
        c.fillRect(0, 0, W, S + 1);
        // The far wall, the pillars and the teeth of the ceiling.
        ridge(c, W, S, S * 0.5, 2.1, 1.6, '#151920');
        for (let i = 0; i < 4; i++) {
          const x = W * (0.2 + 0.23 * i + 0.06 * rnd(i + 3));
          c.fillStyle = '#12151b';
          c.beginPath();
          c.moveTo(x - 9 * u, 0);
          c.quadraticCurveTo(x - 3 * u, S * 0.5, x - 6 * u, S);
          c.lineTo(x + 6 * u, S);
          c.quadraticCurveTo(x + 3 * u, S * 0.5, x + 9 * u, 0);
          c.fill();
        }
        for (let i = 0; i < 14; i++) {
          const x = (W * (i + 0.2 + 0.6 * rnd(i))) / 14;
          const len = (10 + 30 * rnd(i + 20)) * u;
          c.fillStyle = i % 3 ? '#232832' : '#2c323e';
          c.beginPath();
          c.moveTo(x - (4 + 5 * rnd(i + 40)) * u, 0);
          c.lineTo(x + (4 + 5 * rnd(i + 60)) * u, 0);
          c.lineTo(x + u, Math.min(S * 0.7, len));
          c.fill();
        }
        // Crystals that glow by themselves.
        for (let i = 0; i < 6; i++) {
          const x = W * (0.3 + 0.68 * rnd(i + 70));
          const y = S - (2 + 26 * rnd(i + 80)) * u;
          const r = (4 + 4 * rnd(i + 90)) * u;
          const gl = c.createRadialGradient(x, y, 0, x, y, r * 4);
          gl.addColorStop(0, 'rgba(111,208,200,0.22)');
          gl.addColorStop(1, 'rgba(111,208,200,0)');
          c.fillStyle = gl;
          c.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
          c.fillStyle = '#7fe0d6';
          c.beginPath();
          c.moveTo(x, y - r);
          c.lineTo(x + r * 0.45, y);
          c.lineTo(x, y + r * 0.7);
          c.lineTo(x - r * 0.45, y);
          c.fill();
          c.fillStyle = '#4aa8a4';
          c.beginPath();
          c.moveTo(x, y - r);
          c.lineTo(x + r * 0.45, y);
          c.lineTo(x, y + r * 0.7);
          c.fill();
        }
        return;
      }
      const g0 = c.createLinearGradient(0, 0, 0, S);
      g0.addColorStop(0, css(skyTop));
      g0.addColorStop(0.62, css(skyMid));
      g0.addColorStop(1, css(skyLow));
      c.fillStyle = g0;
      c.fillRect(0, 0, W, S + 1);
      if (night && dull < 0.5) {
        for (let i = 0; i < 46; i++) {
          c.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.6 * rnd(i + 5)).toFixed(2) + ')';
          const r = (0.5 + 0.7 * rnd(i + 9)) * u;
          c.fillRect(W * rnd(i + 1), S * 0.85 * rnd(i + 3), r, r);
        }
      }
      if (discOn) {
        const disc = hex(sky.disc);
        const r = (night ? 8 : 9) * u;
        const gl = c.createRadialGradient(discX, discY, r * 0.5, discX, discY, r * 5.5);
        gl.addColorStop(0, css(disc, (night ? 0.22 : 0.42) * discA));
        gl.addColorStop(1, css(disc, 0));
        c.fillStyle = gl;
        c.fillRect(discX - r * 6, discY - r * 6, r * 12, r * 12);
        c.globalAlpha = discA;
        c.fillStyle = css(disc);
        c.beginPath();
        c.arc(discX, discY, r, 0, TAU);
        c.fill();
        if (night) {
          c.fillStyle = 'rgba(150,162,186,0.55)';
          [[-0.3, -0.25, 0.22], [0.3, 0.1, 0.16], [-0.1, 0.42, 0.13]].forEach((k) => {
            c.beginPath();
            c.arc(discX + k[0] * r, discY + k[1] * r, k[2] * r, 0, TAU);
            c.fill();
          });
        }
        c.globalAlpha = 1;
      }
    }), 0, 0);

    // ---- clouds ----
    if (!cave) {
      const n = weather === 'rain' ? 6 : weather === 'cloudy' ? 5 : weather === 'wind' ? 3 : 2;
      const heavy = weather === 'rain' || weather === 'cloudy';
      const cc = heavy ? mixc(grey, skyLow, 0.25) : mixc(skyLow, scale(WHITE, sky.light), 0.5);
      const speed = (windy ? 16 : heavy ? 5 : 3) * u;
      for (let i = 0; i < n; i++) {
        const s = (heavy ? 13 + 7 * rnd(i + 11) : 8 + 5 * rnd(i + 11)) * u;
        const span = W + s * 8;
        const x = ((rnd(i + 21) * span + t * speed * (0.7 + 0.6 * rnd(i + 31))) % span) - s * 4;
        const y = S * (0.2 + 0.42 * rnd(i + 41));
        cloud(ctx, x, y, s, css(i % 2 ? scale(cc, 0.9) : cc, heavy ? 0.8 : 0.6));
      }
    }

    // ---- the far shore ----
    const farA = mixc(shade(hex(pal.far), 0), skyLow, 0.6);
    const farB = mixc(shade(hex(pal.far), 0), skyLow, 0.22);
    const farC = mixc(shade(scale(hex(pal.far), 0.7), 0), skyLow, 0.1);
    const lit = m.period === 'evening' || night;
    if (!cave) {
      ctx.drawImage(layer('far', key, W, H, (c) => {
        const trunk = css(scale(farC, 0.7));
        if (kind === 'pond') {
          ridge(c, W, S, 13 * u, 0.6, 1.3, css(farA));
          const yb = ridge(c, W, S, 6 * u, 2.2, 2.1, css(farB));
          for (let i = 0; i < 10; i++) {
            const x = W * (0.2 + 0.8 * rnd(i + 100));
            if (Math.abs(x - W * 0.66) < 16 * u) continue;
            leafy(c, x, yb(x) + 2 * u, (14 + 9 * rnd(i + 110)) * u, css(i % 2 ? farC : farB), trunk);
          }
          // The dacha: a house with a window that is lit in the dark hours.
          const hx = W * 0.66;
          const hy = yb(hx) + 1.5 * u;
          c.fillStyle = css(mixc(shade([150, 120, 96], 0), skyLow, 0.3));
          c.fillRect(hx - 8 * u, hy - 9 * u, 16 * u, 9 * u);
          c.fillStyle = css(mixc(shade([120, 70, 60], 0), skyLow, 0.25));
          c.beginPath();
          c.moveTo(hx - 10.5 * u, hy - 8.5 * u);
          c.lineTo(hx, hy - 16 * u);
          c.lineTo(hx + 10.5 * u, hy - 8.5 * u);
          c.fill();
          c.fillRect(hx + 4 * u, hy - 15.5 * u, 2.2 * u, 5 * u);
          c.fillStyle = lit ? '#f4c66c' : css(scale(farC, 0.6));
          c.fillRect(hx - 4.5 * u, hy - 6.5 * u, 3.6 * u, 3.6 * u);
          c.fillStyle = css(scale(farC, 0.75));
          for (let i = 0; i < 7; i++) c.fillRect(hx + (11 + i * 3.4) * u, hy - 4 * u, 1 * u, 4 * u);
          c.fillRect(hx + 11 * u, hy - 3 * u, 21.4 * u, 0.8 * u);
        } else if (kind === 'river') {
          ridge(c, W, S, 15 * u, 1.4, 1.1, css(farA));
          const yb = ridge(c, W, S, 5 * u, 0.4, 1.7, css(farB));
          for (let i = 0; i < 4; i++) {
            const x = W * (0.3 + 0.2 * i + 0.08 * rnd(i + 120));
            const hgt = (20 + 8 * rnd(i + 130)) * u;
            const y = yb(x) + 2 * u;
            c.fillStyle = trunk;
            c.fillRect(x - hgt * 0.04, y - hgt * 0.5, hgt * 0.08, hgt * 0.5);
            blob(c, x, y - hgt * 0.6, hgt * 0.46, hgt * 0.34, css(farC));
            c.strokeStyle = css(farC);
            c.lineCap = 'round';
            c.lineWidth = hgt * 0.11;
            c.beginPath();
            for (let k = -4; k <= 4; k++) {
              if (k === 0) continue;
              c.moveTo(x + k * hgt * 0.1, y - hgt * 0.5);
              c.quadraticCurveTo(x + k * hgt * 0.125, y - hgt * 0.3, x + k * hgt * 0.115, y - hgt * (0.08 + 0.14 * rnd(i * 7 + k + 140)));
            }
            c.stroke();
          }
          for (let i = 0; i < 9; i++) {
            const x = W * (0.25 + 0.75 * rnd(i + 150));
            blob(c, x, yb(x), (5 + 4 * rnd(i + 160)) * u, (2.4 + 2 * rnd(i + 170)) * u, css(i % 2 ? farB : farC));
          }
        } else if (kind === 'swamp') {
          ridge(c, W, S, 7 * u, 0.9, 1.2, css(farA));
          const yb = ridge(c, W, S, 3 * u, 2.6, 2.4, css(farB));
          c.strokeStyle = css(farC);
          c.lineCap = 'round';
          for (let i = 0; i < 7; i++) {
            const x = W * (0.24 + 0.74 * rnd(i + 180));
            const hgt = (16 + 14 * rnd(i + 190)) * u;
            const y = yb(x) + 2 * u;
            const lean = (rnd(i + 200) - 0.5) * 5 * u;
            c.lineWidth = 1.8 * u;
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x + lean, y - hgt);
            c.stroke();
            c.lineWidth = 1.1 * u;
            c.beginPath();
            for (let k = 0; k < 3; k++) {
              const f = 0.45 + 0.18 * k;
              const side = k % 2 ? 1 : -1;
              c.moveTo(x + lean * f, y - hgt * f);
              c.lineTo(x + lean * f + side * hgt * 0.22, y - hgt * (f + 0.14));
            }
            c.stroke();
          }
        } else if (kind === 'creek') {
          // Peaks with snow, then a slope of firs.
          const peaks = [[0.2, 0.5], [0.4, 0.82], [0.58, 0.6], [0.78, 0.9], [0.97, 0.55]];
          const rock = mixc(shade(hex(pal.far), 0), skyLow, 0.5);
          peaks.forEach((p, i) => {
            const x = W * p[0];
            const hgt = Math.min(S * 0.78, 58 * u) * p[1];
            const half = hgt * 0.95;
            c.fillStyle = css(i % 2 ? rock : scale(rock, 0.92));
            c.beginPath();
            c.moveTo(x - half, S);
            c.lineTo(x, S - hgt);
            c.lineTo(x + half, S);
            c.fill();
            c.fillStyle = css(scale(rock, 0.8));
            c.beginPath();
            c.moveTo(x, S - hgt);
            c.lineTo(x + half, S);
            c.lineTo(x + half * 0.25, S);
            c.fill();
            c.fillStyle = css(mixc(scale(WHITE, 0.4 + 0.6 * L), skyLow, 0.25));
            c.beginPath();
            c.moveTo(x, S - hgt);
            c.lineTo(x + hgt * 0.26, S - hgt * 0.72);
            c.lineTo(x + hgt * 0.08, S - hgt * 0.78);
            c.lineTo(x - hgt * 0.04, S - hgt * 0.68);
            c.lineTo(x - hgt * 0.14, S - hgt * 0.8);
            c.lineTo(x - hgt * 0.24, S - hgt * 0.74);
            c.fill();
          });
          const green = mixc(shade([52, 92, 70], 0), skyLow, 0.2);
          const yb = ridge(c, W, S, 8 * u, 1.9, 1.8, css(green));
          for (let i = 0; i < 16; i++) {
            const x = W * (0.2 + 0.8 * rnd(i + 210));
            fir(c, x, yb(x) + 2 * u, (10 + 8 * rnd(i + 220)) * u, css(scale(green, i % 2 ? 0.78 : 0.9)));
          }
        } else if (kind === 'bay') {
          // The open sea: a headland with a lighthouse, a sail far away.
          c.fillStyle = css(farA);
          c.beginPath();
          c.moveTo(W * 0.52, S + 1);
          c.quadraticCurveTo(W * 0.66, S - 5 * u, W * 0.78, S - 12 * u);
          c.quadraticCurveTo(W * 0.9, S - 17 * u, W, S - 15 * u);
          c.lineTo(W, S + 1);
          c.fill();
          c.fillStyle = css(farB);
          c.beginPath();
          c.moveTo(W * 0.72, S + 1);
          c.quadraticCurveTo(W * 0.86, S - 9 * u, W, S - 8 * u);
          c.lineTo(W, S + 1);
          c.fill();
          const lx = W * 0.8;
          const ly = S - 12.5 * u;
          const wall = mixc(scale([236, 232, 222], 0.35 + 0.65 * L), skyLow, 0.2);
          const red = mixc(scale([214, 84, 66], 0.35 + 0.65 * L), skyLow, 0.2);
          for (let i = 0; i < 4; i++) {
            const a = 3.4 - i * 0.45;
            const b = 3.4 - (i + 1) * 0.45;
            c.fillStyle = css(i % 2 ? red : wall);
            c.beginPath();
            c.moveTo(lx - a * u, ly - i * 5 * u);
            c.lineTo(lx + a * u, ly - i * 5 * u);
            c.lineTo(lx + b * u, ly - (i + 1) * 5 * u);
            c.lineTo(lx - b * u, ly - (i + 1) * 5 * u);
            c.fill();
          }
          c.fillStyle = css(scale(farC, 0.6));
          c.fillRect(lx - 2.6 * u, ly - 23.5 * u, 5.2 * u, 3.5 * u);
          c.beginPath();
          c.moveTo(lx - 3 * u, ly - 23.5 * u);
          c.lineTo(lx, ly - 27 * u);
          c.lineTo(lx + 3 * u, ly - 23.5 * u);
          c.fill();
          c.fillStyle = lit ? '#ffe9a6' : css(mixc(wall, skyLow, 0.3));
          c.fillRect(lx - 1.5 * u, ly - 23 * u, 3 * u, 2.4 * u);
          const sx = W * 0.4;
          c.fillStyle = css(mixc(wall, skyLow, 0.35));
          c.beginPath();
          c.moveTo(sx, S - 9 * u);
          c.lineTo(sx + 4.5 * u, S - 2 * u);
          c.lineTo(sx, S - 2 * u);
          c.fill();
          c.beginPath();
          c.moveTo(sx - 0.8 * u, S - 7.5 * u);
          c.lineTo(sx - 0.8 * u, S - 2 * u);
          c.lineTo(sx - 4 * u, S - 2 * u);
          c.fill();
          c.fillStyle = css(farC);
          c.beginPath();
          c.moveTo(sx - 5 * u, S - 1.6 * u);
          c.lineTo(sx + 5.5 * u, S - 1.6 * u);
          c.lineTo(sx + 4 * u, S + 0.5 * u);
          c.lineTo(sx - 4 * u, S + 0.5 * u);
          c.fill();
        } else if (kind === 'ice') {
          const snowA = mixc(scale(WHITE, 0.3 + 0.7 * L), skyLow, 0.55);
          const snowB = mixc(scale([232, 240, 247], 0.3 + 0.7 * L), skyLow, 0.25);
          const ya = ridge(c, W, S, 18 * u, 0.3, 1.1, css(snowA));
          const dark = mixc(shade([44, 74, 70], 0), skyLow, 0.3);
          for (let i = 0; i < 9; i++) {
            const x = W * (0.18 + 0.82 * rnd(i + 230));
            fir(c, x, ya(x) + 3 * u, (9 + 5 * rnd(i + 240)) * u, css(mixc(dark, skyLow, 0.3)));
          }
          const yb = ridge(c, W, S, 8 * u, 2.4, 1.9, css(snowB));
          for (let i = 0; i < 9; i++) {
            const x = W * (0.2 + 0.8 * rnd(i + 250));
            fir(c, x, yb(x) + 2.5 * u, (13 + 9 * rnd(i + 260)) * u, css(dark), css(snowB));
          }
        } else {
          const ya = ridge(c, W, S, 19 * u, 0.3, 1, css(farA));
          for (let i = 0; i < 12; i++) {
            const x = W * rnd(i + 270);
            fir(c, x, ya(x) + 3 * u, (8 + 5 * rnd(i + 280)) * u, css(mixc(farA, farB, 0.4)));
          }
          const yb = ridge(c, W, S, 9 * u, 2.4, 1.8, css(farB));
          for (let i = 0; i < 14; i++) {
            const x = W * (0.2 + 0.8 * rnd(i + 290));
            fir(c, x, yb(x) + 2.5 * u, (11 + 9 * rnd(i + 300)) * u, css(i % 2 ? farC : scale(farC, 0.86)));
          }
        }
      }), 0, 0);
      // The lamp of the lighthouse breathes in the dark hours.
      if (kind === 'bay' && lit) {
        const lx = W * 0.8;
        const ly = S - 34.3 * u;
        const k = 0.55 + 0.45 * Math.sin(t * 1.6);
        const gl = ctx.createRadialGradient(lx, ly, 0, lx, ly, 26 * u);
        gl.addColorStop(0, 'rgba(255,233,166,' + (0.5 * k).toFixed(3) + ')');
        gl.addColorStop(1, 'rgba(255,233,166,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(lx - 26 * u, ly - 26 * u, 52 * u, 52 * u);
      }
    }

    // ---- fog over the far shore ----
    if (weather === 'fog' || kind === 'swamp') {
      const fc = mixc(skyLow, scale(WHITE, sky.light), 0.45);
      const a = weather === 'fog' ? 0.5 : 0.2;
      for (let i = 0; i < 2; i++) {
        const y = S - (4 + 16 * i) * u + Math.sin(t * 0.3 + i * 2) * 2 * u;
        const hgt = (22 + 10 * i) * u;
        const gf = ctx.createLinearGradient(0, y - hgt / 2, 0, y + hgt / 2);
        gf.addColorStop(0, css(fc, 0));
        gf.addColorStop(0.5, css(fc, a * (1 - 0.35 * i)));
        gf.addColorStop(1, css(fc, 0));
        ctx.fillStyle = gf;
        ctx.fillRect(0, y - hgt / 2, W, hgt);
      }
      if (weather === 'fog') {
        ctx.fillStyle = css(fc, 0.1);
        ctx.fillRect(0, 0, W, S);
      }
    }

    // ---- the strip of the surface ----
    const topC = shade(hex(pal.top), 0.06);
    const deepC = scale(hex(pal.deep), 0.45 + 0.55 * L);
    const disc = hex(sky.disc);
    if (ice) {
      const gi = ctx.createLinearGradient(0, S, 0, Y0);
      gi.addColorStop(0, css(mixc(scale([226, 236, 244], 0.3 + 0.7 * L), skyLow, 0.3)));
      gi.addColorStop(1, css(mixc(scale([244, 248, 252], 0.3 + 0.7 * L), skyLow, 0.12)));
      ctx.fillStyle = gi;
      ctx.fillRect(0, S, W, B);
      for (let i = 0; i < 7; i++) blob(ctx, W * rnd(i + 310), S + B * (0.3 + 0.5 * rnd(i + 320)), (10 + 14 * rnd(i + 330)) * u, 1.2 * u, css(mixc(scale([186, 204, 220], 0.3 + 0.7 * L), skyLow, 0.2), 0.6));
    } else {
      const gb = ctx.createLinearGradient(0, S, 0, Y0);
      gb.addColorStop(0, css(mixc(skyLow, topC, cave ? 0.75 : 0.42)));
      gb.addColorStop(1, css(mixc(topC, skyLow, 0.12)));
      ctx.fillStyle = gb;
      ctx.fillRect(0, S, W, B);
      // The far shore in the water, the path of the sun or the moon, glints, ripples.
      const gr = ctx.createLinearGradient(0, S, 0, S + B * 0.6);
      gr.addColorStop(0, css(cave ? [16, 19, 25] : farC, 0.5));
      gr.addColorStop(1, css(cave ? [16, 19, 25] : farC, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(0, S, W, B * 0.6);
      const amp = windy ? 1.6 : 1;
      if (discOn && discA === 1) {
        for (let i = 0; i < 6; i++) {
          const y = S + (B * (i + 0.6)) / 6.4;
          const w = (5 + i * 3.2) * u * (0.75 + 0.25 * Math.sin(t * 2.2 + i * 1.7));
          ctx.fillStyle = css(disc, (night ? 0.4 : 0.6) * (0.55 + 0.45 * Math.sin(t * 1.7 + i * 2.3)));
          ctx.fillRect(discX - w / 2 + Math.sin(t * 1.1 + i) * 1.5 * u, y, w, 1.1 * u);
        }
      }
      const glint = cave ? [111, 208, 200] : mixc(disc, WHITE, 0.4);
      for (let i = 0; i < 16; i++) {
        const a = (0.1 + 0.3 * L) * Math.max(0, Math.sin(t * (0.9 + rnd(i + 340)) + i * 2.4));
        if (a < 0.02 && !m.still) continue;
        const x = (W * rnd(i + 350) + t * (kind === 'river' ? 9 : 0) * u) % W;
        ctx.fillStyle = css(glint, m.still ? 0.16 : a);
        ctx.fillRect(x, S + B * (0.12 + 0.8 * rnd(i + 360)), (4 + 7 * rnd(i + 370)) * u, 0.9 * u);
      }
      ctx.strokeStyle = css(WHITE, 0.05 + 0.07 * L);
      ctx.lineWidth = 0.9 * u;
      for (let k = 0; k < 2; k++) {
        const y = S + B * (0.38 + 0.36 * k);
        ctx.beginPath();
        for (let x = 0; x <= W + 10 * u; x += 10 * u) {
          const yy = y + Math.sin(x / (22 * u) + t * (windy ? 2.6 : 1.2) + k * 2) * 0.9 * u * amp;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }

    // ---- the cut of the water down to the bed ----
    ctx.drawImage(layer('bed', key, W, H, (c) => {
      const gw = c.createLinearGradient(0, Y0, 0, H);
      gw.addColorStop(0, css(topC));
      gw.addColorStop(0.55, css(mixc(topC, deepC, 0.6)));
      gw.addColorStop(1, css(deepC));
      c.fillStyle = gw;
      c.fillRect(0, Y0, W, D);
      const bedC = scale(hex(pal.bed), 0.42 + 0.58 * L);
      const gbed = c.createLinearGradient(0, Y0 + D * 0.3, 0, H);
      gbed.addColorStop(0, css(mixc(bedC, topC, 0.3)));
      gbed.addColorStop(1, css(mixc(scale(bedC, 0.6), deepC, 0.35)));
      const path = () => {
        c.beginPath();
        c.moveTo(0, bed[0][1]);
        for (let i = 1; i < bed.length; i++) {
          const mx = (bed[i - 1][0] + bed[i][0]) / 2;
          c.bezierCurveTo(mx, bed[i - 1][1], mx, bed[i][1], bed[i][0], bed[i][1]);
        }
      };
      path();
      c.lineTo(W, H);
      c.lineTo(0, H);
      c.fillStyle = gbed;
      c.fill();
      path();
      c.strokeStyle = css(mixc(bedC, WHITE, 0.3), 0.35);
      c.lineWidth = 1.2 * u;
      c.stroke();
      for (let i = 0; i < 12; i++) {
        const x = W * rnd(i + 380);
        const r = (3 + 6 * rnd(i + 390)) * u * (kind === 'creek' ? 1.5 : 1);
        blob(c, x, bedY(x) + r * 0.25, r, r * 0.55, css(mixc(scale(bedC, i % 2 ? 1.35 : 0.8), topC, 0.2)));
      }
      if (cave) {
        for (let i = 0; i < 5; i++) {
          const x = W * (0.25 + 0.72 * rnd(i + 400));
          const y = bedY(x);
          const r = (4 + 3 * rnd(i + 410)) * u;
          c.fillStyle = 'rgba(111,208,200,0.75)';
          c.beginPath();
          c.moveTo(x - r * 0.4, y + u);
          c.lineTo(x, y - r);
          c.lineTo(x + r * 0.4, y + u);
          c.fill();
        }
      }
    }), 0, 0);

    // Shafts of light from the surface.
    if (!cave && !ice && L > 0.55) {
      const gl = ctx.createLinearGradient(0, Y0, 0, Y0 + D * 0.85);
      gl.addColorStop(0, css(mixc(disc, WHITE, 0.5), 0.11 * L * (1 - dull * 0.6)));
      gl.addColorStop(1, css(WHITE, 0));
      ctx.fillStyle = gl;
      for (let i = 0; i < 5; i++) {
        const x = W * (0.24 + 0.17 * i) + Math.sin(t * 0.4 + i * 1.9) * 8 * u;
        const w = (8 + 9 * rnd(i + 420)) * u;
        ctx.beginPath();
        ctx.moveTo(x, Y0);
        ctx.lineTo(x + w, Y0);
        ctx.lineTo(x + w * 2.2 + D * 0.3, Y0 + D * 0.85);
        ctx.lineTo(x + D * 0.3 - w * 0.4, Y0 + D * 0.85);
        ctx.fill();
      }
    }

    // The edge of the water: ice, or a bright line of small waves.
    if (ice) {
      ctx.fillStyle = css(mixc(scale([170, 204, 226], 0.35 + 0.65 * L), topC, 0.2), 0.9);
      ctx.fillRect(0, Y0, W, 5 * u);
      ctx.fillStyle = css(WHITE, 0.35 * L);
      ctx.fillRect(0, Y0, W, 1 * u);
    } else {
      ctx.strokeStyle = css(mixc(skyLow, WHITE, 0.55), 0.35 + 0.3 * L);
      ctx.lineWidth = 1.4 * u;
      ctx.beginPath();
      for (let x = 0; x <= W + 8 * u; x += 8 * u) {
        const y = Y0 + Math.sin(x / (16 * u) + t * (windy ? 3 : 1.5)) * (windy ? 1.6 : 0.8) * u;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Weed on the bed, sparse specks, a few small fish far off.
    const weedC = shade(hex(pal.weed), 0.05);
    ctx.lineCap = 'round';
    const clumps = ice || cave ? 5 : 9;
    for (let i = 0; i < clumps; i++) {
      const x = x0 + (W - x0) * rnd(i + 430);
      const y = bedY(x) + 2 * u;
      const tall = Math.min((16 + 22 * rnd(i + 440)) * u, (y - Y0) * 0.55);
      for (let k = 0; k < 3; k++) {
        const bx = x + (k - 1) * 3.2 * u;
        const hgt = tall * (0.65 + 0.35 * rnd(i * 5 + k + 450));
        const sway = Math.sin(t * (windy || kind === 'river' ? 1.7 : 1) + i + k * 0.8) * hgt * 0.16 + (kind === 'river' ? hgt * 0.2 : 0);
        ctx.strokeStyle = css(k === 1 ? weedC : scale(weedC, 0.75), 0.9);
        ctx.lineWidth = (2.6 - 0.3 * k) * u;
        ctx.beginPath();
        ctx.moveTo(bx, y);
        ctx.quadraticCurveTo(bx - sway * 0.3, y - hgt * 0.55, bx + sway, y - hgt);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 16; i++) {
      const x = (W * rnd(i + 460) + t * (kind === 'river' ? 6 : 1.5) * u) % W;
      const y = Y0 + 6 * u + ((D * 0.8 * rnd(i + 470) + D - t * 2 * u * (0.4 + rnd(i + 480))) % (D * 0.8));
      if (y > bedY(x) - 3 * u) continue;
      ctx.fillStyle = css(WHITE, 0.07 + 0.1 * rnd(i + 490));
      ctx.fillRect(x, y, 1.3 * u, 1.3 * u);
    }
    const dark = scale(deepC, 0.75);
    for (let i = 0; i < 3; i++) {
      const dir = i % 2 ? 1 : -1;
      const span = W - x0 + 60 * u;
      const pos = (rnd(i + 500) * span + t * (4 + 3 * i) * u) % span;
      const x = dir > 0 ? x0 - 30 * u + pos : W + 30 * u - pos;
      const y = Y0 + D * (0.3 + 0.16 * i) + Math.sin(t * 0.8 + i * 3) * 3 * u;
      if (x < x0 || y > bedY(x) - 6 * u) continue;
      const len = (9 + 3 * i) * u;
      ctx.fillStyle = css(dark, 0.4);
      ctx.beginPath();
      ctx.ellipse(x, y, len / 2, len * 0.17, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - dir * len * 0.4, y);
      ctx.lineTo(x - dir * len * 0.72, y - len * 0.2);
      ctx.lineTo(x - dir * len * 0.72, y + len * 0.2);
      ctx.fill();
    }

    // ---- zones: the marks, the names, the one the cast aims at ----
    const c = m.cast || { phase: 'idle' };
    if (c.phase === 'aim') {
      const d = c.fill * m.range;
      const zi = d >= m.z2 ? 2 : d >= m.z1 ? 1 : 0;
      const a = zi === 0 ? x0 - 10 * u : zi === 1 ? z1 : z2;
      const b = zi === 0 ? z1 : zi === 1 ? z2 : W;
      ctx.fillStyle = 'rgba(139,124,255,0.10)';
      ctx.fillRect(a, S, b - a, H - S);
    }
    ctx.strokeStyle = css(WHITE, 0.14);
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([3 * u, 5 * u]);
    [z1, z2].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, Y0 + 5 * u);
      ctx.lineTo(x, H);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.font = '500 ' + 15 * dpr + 'px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = css(WHITE, 0.55);
    // On a narrow screen the zones are narrower than their names: a name moves aside, never onto its neighbour.
    const names = [['берег', (x0 + z1) / 2], ['середина', (z1 + z2) / 2], ['глубина', (z2 + W) / 2]].map((l) => {
      const w = ctx.measureText(l[0]).width;
      return { text: l[0], w, x: clamp(l[1] - w / 2, 4 * dpr, W - w - 4 * dpr) };
    });
    for (let i = names.length - 2; i >= 0; i--) names[i].x = Math.max(4 * dpr, Math.min(names[i].x, names[i + 1].x - names[i].w - 8 * dpr));
    names.forEach((l) => ctx.fillText(l.text, l.x, H - 6 * dpr));

    // ---- what floats on the strip: lilies, tussocks, boulders, a buoy ----
    const midY = S + B * 0.58;
    if (kind === 'pond') {
      const leaf = shade([70, 140, 84], 0.05);
      for (let i = 0; i < 6; i++) {
        const x = W * (0.42 + 0.56 * rnd(i + 510));
        const y = S + B * (0.3 + 0.55 * rnd(i + 520)) + Math.sin(t * 1.2 + i) * 0.4 * u;
        const r = (4.5 + 3 * rnd(i + 530)) * u;
        blob(ctx, x, y, r, r * 0.34, css(i % 2 ? leaf : scale(leaf, 0.82)));
        ctx.fillStyle = css(mixc(topC, skyLow, 0.3));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + r, y - r * 0.12);
        ctx.lineTo(x + r, y + r * 0.12);
        ctx.fill();
        if (i % 3 === 0) {
          blob(ctx, x - r * 0.3, y - 1.6 * u, 2 * u, 1.5 * u, css(scale([246, 240, 232], 0.4 + 0.6 * L)));
          blob(ctx, x - r * 0.3, y - 1.7 * u, 0.8 * u, 0.7 * u, css(scale([240, 196, 90], 0.4 + 0.6 * L)));
        }
      }
    } else if (kind === 'swamp') {
      const moss = shade([98, 112, 56], 0.05);
      for (let i = 0; i < 5; i++) {
        const x = W * (0.4 + 0.58 * rnd(i + 540));
        const y = S + B * (0.45 + 0.4 * rnd(i + 550));
        const r = (6 + 5 * rnd(i + 560)) * u;
        ctx.fillStyle = css(scale(moss, 0.8));
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.42, 0, Math.PI, TAU);
        ctx.fill();
        ctx.strokeStyle = css(moss);
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        for (let k = -2; k <= 2; k++) {
          ctx.moveTo(x + k * r * 0.3, y - r * 0.3);
          ctx.lineTo(x + k * r * 0.42 + Math.sin(t + i + k) * u, y - r * 0.3 - (5 + 3 * rnd(i * 9 + k + 570)) * u);
        }
        ctx.stroke();
      }
    } else if (kind === 'creek') {
      const rock = shade([120, 126, 134], 0.08);
      for (let i = 0; i < 4; i++) {
        const x = W * (0.45 + 0.52 * rnd(i + 580));
        const r = (6 + 5 * rnd(i + 590)) * u;
        ctx.fillStyle = css(scale(rock, 0.72));
        ctx.beginPath();
        ctx.ellipse(x, midY + 2 * u, r, r * 0.62, 0, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = css(rock);
        ctx.beginPath();
        ctx.ellipse(x - r * 0.15, midY + 2 * u, r * 0.7, r * 0.5, 0, Math.PI, TAU);
        ctx.fill();
        ctx.strokeStyle = css(WHITE, 0.35);
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        ctx.ellipse(x, midY + 2.4 * u, r * (1.15 + 0.08 * Math.sin(t * 2 + i)), 1.6 * u, 0, 0, Math.PI);
        ctx.stroke();
      }
    } else if (kind === 'bay') {
      const bx = z2;
      const by = midY + Math.sin(t * 1.4) * 1 * u;
      const tilt = Math.sin(t * 1.1) * 0.12;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(tilt);
      ctx.fillStyle = css(scale([214, 84, 66], 0.4 + 0.6 * L));
      ctx.beginPath();
      ctx.moveTo(-3.6 * u, 0);
      ctx.lineTo(-2 * u, -8 * u);
      ctx.lineTo(2 * u, -8 * u);
      ctx.lineTo(3.6 * u, 0);
      ctx.fill();
      ctx.fillStyle = css(scale([236, 232, 222], 0.4 + 0.6 * L));
      ctx.fillRect(-2.8 * u, -5 * u, 5.6 * u, 1.8 * u);
      ctx.fillRect(-0.5 * u, -11.5 * u, 1 * u, 3.5 * u);
      ctx.restore();
    }

    // Rain: streaks in the air and rings on the water.
    if (weather === 'rain') {
      ctx.strokeStyle = css(mixc(skyLow, WHITE, 0.5), 0.4);
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      for (let i = 0; i < 46; i++) {
        const x = (rnd(i + 600) * W + t * 40 * u) % W;
        const y = (rnd(i + 610) * Y0 + t * 300 * u * (0.8 + 0.4 * rnd(i + 620))) % Y0;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2.4 * u, y + 10 * u);
      }
      ctx.stroke();
      ctx.lineWidth = 0.9 * u;
      for (let i = 0; i < 9; i++) {
        const ph = (t * 1.3 + rnd(i + 630) * 5) % 1;
        const seed = Math.floor(t * 1.3 + rnd(i + 630) * 5) + i * 13;
        ctx.strokeStyle = css(WHITE, 0.35 * (1 - ph));
        ctx.beginPath();
        ctx.ellipse(W * rnd(seed + 640), S + B * (0.2 + 0.7 * rnd(seed + 650)), (2 + 7 * ph) * u, (0.6 + 1.6 * ph) * u, 0, 0, TAU);
        ctx.stroke();
      }
    }
    // The drop from the ceiling of the tunnel.
    if (cave) {
      const ph = (t * 0.6) % 1;
      const dx = W * 0.63;
      if (ph < 0.6) {
        ctx.fillStyle = '#8fb6c4';
        blob(ctx, dx, (ph / 0.6) * midY, 1.1 * u, 2.2 * u, '#8fb6c4');
      } else {
        const k = (ph - 0.6) / 0.4;
        ctx.strokeStyle = css([143, 182, 196], 0.6 * (1 - k));
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        ctx.ellipse(dx, midY, (2 + 10 * k) * u, (0.8 + 2.2 * k) * u, 0, 0, TAU);
        ctx.stroke();
      }
    }

    // Sonar: where the rare fish stand now.
    (m.sonar || []).forEach((s) => {
      const x = s.zone === 0 ? (x0 + z1) / 2 : s.zone === 1 ? (z1 + z2) / 2 : (z2 + W) / 2;
      const y = Math.min(Y0 + D * (0.3 + 0.12 * s.i), bedY(x) - 10 * u);
      const k = (t * 0.8 + s.i * 0.37) % 1;
      ctx.lineWidth = 1.6 * u;
      ctx.strokeStyle = 'rgba(139,124,255,' + (0.85 * (1 - k)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, (4 + 10 * k) * u, 0, TAU);
      ctx.stroke();
      blob(ctx, x, y, 2.2 * u, 2.2 * u, 'rgba(139,124,255,0.95)');
    });

    // ---- the near bank, the pier or the boat ----
    const boat = !!m.boat && !ice;
    const bankC = shade(hex(pal.bank), 0.06);
    const wood = shade([150, 112, 74], 0.06);
    const pierTop = S - 3 * u;
    const px = shoreW + 4 * u;
    const reeds = kind === 'pond' || kind === 'lake' || kind === 'river' || kind === 'swamp';
    if (reeds) {
      const reedC = shade([104, 132, 70], 0.06);
      for (let i = 0; i < 6; i++) {
        const x = shoreW * (0.08 + 0.5 * rnd(i + 660));
        const hgt = (26 + 18 * rnd(i + 670)) * u;
        const sway = Math.sin(t * (windy ? 2.2 : 0.9) + i * 1.3) * (windy ? 5 : 2) * u + (windy ? 4 * u : 0);
        ctx.strokeStyle = css(i % 2 ? reedC : scale(reedC, 0.8));
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        ctx.moveTo(x, S);
        ctx.quadraticCurveTo(x, S - hgt * 0.5, x + sway, S - hgt);
        ctx.stroke();
        if (i % 2 === 0) {
          ctx.strokeStyle = css(shade([92, 62, 40], 0.05));
          ctx.lineWidth = 3 * u;
          ctx.beginPath();
          ctx.moveTo(x + sway * 0.82, S - hgt * 0.9);
          ctx.lineTo(x + sway * 0.6, S - hgt * 0.74);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = css(scale(bankC, 0.7));
    ctx.beginPath();
    ctx.moveTo(0, S - 15 * u);
    ctx.quadraticCurveTo(shoreW * 0.5, S - 15 * u, shoreW * 0.72, S - 3 * u);
    ctx.lineTo(shoreW * 0.86, Y0 + 2 * u);
    ctx.lineTo(0, Y0 + 2 * u);
    ctx.fill();
    ctx.strokeStyle = css(ice ? scale(WHITE, 0.4 + 0.6 * L) : cave ? scale(bankC, 1.4) : shade([96, 140, 72], 0.05));
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(0, S - 15 * u);
    ctx.quadraticCurveTo(shoreW * 0.5, S - 15 * u, shoreW * 0.72, S - 3 * u);
    ctx.stroke();

    let seatX;
    let seatY;
    if (boat) {
      const bob = Math.sin(t * 1.3) * 0.8 * u;
      const a = shoreW * 0.5;
      const b = shoreW + 20 * u;
      const y = midY + bob;
      ctx.fillStyle = css(scale(wood, 0.62));
      ctx.beginPath();
      ctx.moveTo(a - 4 * u, y - 7 * u);
      ctx.lineTo(b + 3 * u, y - 7.5 * u);
      ctx.quadraticCurveTo(b - 2 * u, y + 2.5 * u, b - 10 * u, y + 2.5 * u);
      ctx.lineTo(a + 5 * u, y + 2.5 * u);
      ctx.quadraticCurveTo(a - 2 * u, y + 2 * u, a - 4 * u, y - 7 * u);
      ctx.fill();
      ctx.strokeStyle = css(wood);
      ctx.lineWidth = 1.8 * u;
      ctx.beginPath();
      ctx.moveTo(a - 4 * u, y - 7 * u);
      ctx.lineTo(b + 3 * u, y - 7.5 * u);
      ctx.stroke();
      ctx.strokeStyle = css(WHITE, 0.3);
      ctx.lineWidth = 1 * u;
      ctx.beginPath();
      ctx.ellipse((a + b) / 2, midY + 3 * u, (b - a) * 0.6, 1.6 * u, 0, 0, Math.PI);
      ctx.stroke();
      seatX = a + (b - a) * 0.42;
      seatY = y - 7 * u;
    } else {
      // Posts into the water, then the deck with its planks.
      [px - 4 * u, px - 4 * u - (px - shoreW * 0.35) * 0.5].forEach((x) => {
        ctx.fillStyle = css(scale(wood, 0.6));
        ctx.fillRect(x - 1.6 * u, pierTop, 3.2 * u, Y0 - pierTop);
        ctx.fillStyle = css(scale(wood, 0.4), 0.7);
        ctx.fillRect(x - 1.6 * u, Y0, 3.2 * u, D * 0.2);
        if (!ice) {
          ctx.strokeStyle = css(WHITE, 0.3);
          ctx.lineWidth = 1 * u;
          ctx.beginPath();
          ctx.ellipse(x, midY + 2 * u, 4.5 * u, 1.3 * u, 0, 0, TAU);
          ctx.stroke();
        }
      });
      ctx.fillStyle = css(wood);
      ctx.fillRect(shoreW * 0.35, pierTop, px - shoreW * 0.35, 3.4 * u);
      ctx.fillStyle = css(scale(wood, 0.6));
      ctx.fillRect(shoreW * 0.35, pierTop + 3.4 * u, px - shoreW * 0.35, 1.2 * u);
      for (let x = shoreW * 0.35 + 6 * u; x < px - 2 * u; x += 6 * u) ctx.fillRect(x, pierTop, 0.8 * u, 3.4 * u);
      if (ice) {
        ctx.fillStyle = css(scale(WHITE, 0.4 + 0.6 * L));
        ctx.fillRect(shoreW * 0.35, pierTop - 1.2 * u, px - shoreW * 0.35, 1.6 * u);
      }
      seatX = px - 8.5 * u;
      seatY = pierTop;
    }

    // The lantern on its pole.
    if (m.lantern) {
      const lx = boat ? seatX - 13 * u : shoreW * 0.35 + 3 * u;
      const ly = seatY - 17 * u;
      ctx.strokeStyle = css(scale(wood, 0.6));
      ctx.lineWidth = 1.4 * u;
      ctx.beginPath();
      ctx.moveTo(lx, seatY);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      const k = 0.85 + 0.15 * Math.sin(t * 7) * Math.sin(t * 3.1);
      const gl = ctx.createRadialGradient(lx, ly, 0, lx, ly, 40 * u);
      gl.addColorStop(0, 'rgba(255,196,110,' + (0.5 * k).toFixed(3) + ')');
      gl.addColorStop(1, 'rgba(255,196,110,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(lx - 40 * u, ly - 40 * u, 80 * u, 80 * u);
      ctx.fillStyle = '#3a2f24';
      ctx.fillRect(lx - 2.6 * u, ly - 4.6 * u, 5.2 * u, 1.2 * u);
      ctx.fillRect(lx - 2.6 * u, ly + 2.4 * u, 5.2 * u, 1.2 * u);
      ctx.fillStyle = '#ffd98a';
      ctx.fillRect(lx - 2 * u, ly - 3.4 * u, 4 * u, 5.8 * u);
    }

    // ---- the rod: where it points and how it bends ----
    const phase = c.phase;
    const deg = Math.PI / 180;
    let aim = 50;
    if (phase === 'aim') aim = 56 + 62 * clamp(c.fill, 0, 1);
    else if (phase === 'wait') aim = m.falseBite ? 40 : 43;
    else if (phase === 'bite' || phase === 'late') aim = 37 + Math.sin(t * 22) * 1.6;
    else if (phase === 'fight') aim = c.hold ? 66 : 58;
    else if (phase === 'caught') aim = 64;
    if (rodAngle == null || m.still) rodAngle = aim;
    else rodAngle += (aim - rodAngle) * 0.22;
    const ang = rodAngle * deg;
    const butt = { x: seatX + 4.5 * u, y: seatY - 8.5 * u };
    const Lr = clamp(H * 0.27, 46 * u, 96 * u);
    const straight = { x: butt.x + Math.cos(ang) * Lr, y: butt.y - Math.sin(ang) * Lr };

    // The end of the line: the float on the strip or the fish under the water.
    const fx = phase === 'wait' || phase === 'bite' || phase === 'late' || phase === 'fight' ? xOf(c.d) : 0;
    let fishY = 0;
    let shake = 0;
    if (phase === 'fight') {
      shake = c.jt > 0 && !m.still ? Math.sin(t * 60) * 3 * u : 0;
      fishY = Math.min(Y0 + D * (0.2 + 0.17 * (c.zone || 0)), bedY(fx) - 9 * u) + Math.sin(t * 5) * 2.5 * u + shake;
      fishY = Math.max(fishY, Y0 + 9 * u);
    }
    let bend = 0;
    let pull = { x: 0, y: 1 };
    if (phase === 'fight') {
      bend = 0.1 + 0.3 * clamp(c.T / 100, 0, 1.1);
      const dx = fx - straight.x;
      const dy = fishY - straight.y;
      const len = Math.hypot(dx, dy) || 1;
      pull = { x: dx / len, y: dy / len };
    } else if (phase === 'bite' || phase === 'late') {
      bend = 0.1;
      pull = { x: 0.6, y: 0.8 };
    }
    const rodAt = (s) => ({
      x: butt.x + Math.cos(ang) * Lr * s + pull.x * bend * Lr * s * s,
      y: butt.y - Math.sin(ang) * Lr * s + pull.y * bend * Lr * s * s
    });
    const tip = rodAt(1);

    // ---- the angler ----
    const coat = shade(ice ? [176, 92, 70] : [92, 118, 78], 0.04);
    const legs = shade([58, 66, 84], 0.04);
    const skin = shade([226, 184, 150], 0.04);
    const hat = shade(ice ? [86, 70, 58] : [214, 176, 104], 0.04);
    const hand = rodAt(0.1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(legs);
    ctx.lineWidth = 3.6 * u;
    ctx.beginPath();
    if (boat) {
      ctx.moveTo(seatX, seatY - 1.5 * u);
      ctx.lineTo(seatX + 6.5 * u, seatY - 4.5 * u);
      ctx.lineTo(seatX + 9 * u, seatY + 1 * u);
    } else {
      ctx.moveTo(seatX, seatY - 1.8 * u);
      ctx.lineTo(seatX + 8.5 * u, seatY - 2 * u);
      ctx.lineTo(seatX + 9.5 * u, seatY + 6.5 * u);
    }
    ctx.stroke();
    if (!boat) {
      ctx.strokeStyle = css(scale(legs, 0.55));
      ctx.lineWidth = 3.8 * u;
      ctx.beginPath();
      ctx.moveTo(seatX + 9.5 * u, seatY + 6.8 * u);
      ctx.lineTo(seatX + 12 * u, seatY + 7 * u);
      ctx.stroke();
    }
    ctx.strokeStyle = css(coat);
    ctx.lineWidth = 8.6 * u;
    ctx.beginPath();
    ctx.moveTo(seatX - 0.5 * u, seatY - 4.6 * u);
    ctx.lineTo(seatX + 0.8 * u, seatY - 13 * u);
    ctx.stroke();
    blob(ctx, seatX + 2 * u, seatY - 20 * u, 3.6 * u, 3.8 * u, css(skin));
    ctx.fillStyle = css(hat);
    if (ice) {
      ctx.beginPath();
      ctx.arc(seatX + 1.8 * u, seatY - 21 * u, 4.2 * u, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(seatX - 2.6 * u, seatY - 21.2 * u, 2.4 * u, 3.6 * u);
    } else {
      ctx.beginPath();
      ctx.ellipse(seatX + 2.2 * u, seatY - 22.2 * u, 6.6 * u, 1.3 * u, -0.06, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(seatX + 1.8 * u, seatY - 22.6 * u, 3.5 * u, Math.PI, TAU);
      ctx.fill();
    }

    // ---- the rod itself, from the cork to the thin tip ----
    const rodC = night || cave ? [214, 190, 150] : [226, 196, 140];
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      const a = rodAt(i / segs);
      const b = rodAt((i + 1) / segs);
      ctx.strokeStyle = css(i < 2 ? shade([96, 66, 44], 0.04) : mixc(shade(rodC, 0.04), rodC, 0.25));
      ctx.lineWidth = (3.4 - 2.3 * (i / segs)) * u;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const reel = rodAt(0.2);
    blob(ctx, reel.x + 1.6 * u, reel.y + 2.2 * u, 2.6 * u, 2.6 * u, css(shade([196, 202, 212], 0.04)));
    blob(ctx, reel.x + 1.6 * u, reel.y + 2.2 * u, 1 * u, 1 * u, css(shade([70, 76, 88], 0.04)));
    // The arm over the rod, the hand on the cork.
    ctx.strokeStyle = css(scale(coat, 0.84));
    ctx.lineWidth = 3.4 * u;
    ctx.beginPath();
    ctx.moveTo(seatX + 1.6 * u, seatY - 13.4 * u);
    ctx.quadraticCurveTo(seatX + 4 * u, seatY - 8 * u, hand.x, hand.y);
    ctx.stroke();
    blob(ctx, hand.x, hand.y, 1.9 * u, 1.9 * u, css(skin));

    // ---- the line, the float, the fish ----
    const lineC = night || cave ? [214, 222, 232] : [240, 240, 236];
    const floatY = midY;
    const drawFloat = (x, y, sink, tilt) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 14 * u, 0, 28 * u, y + 0.6 * u);
      ctx.clip();
      ctx.translate(x, y + sink);
      ctx.scale(1.2, 1.2);
      ctx.rotate(tilt);
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 1 * u;
      ctx.beginPath();
      ctx.moveTo(0, -5 * u);
      ctx.lineTo(0, -12.5 * u);
      ctx.stroke();
      blob(ctx, 0, -12.8 * u, 1.3 * u, 1.3 * u, '#ff6a4c');
      ctx.fillStyle = '#f3eee2';
      ctx.beginPath();
      ctx.ellipse(0, -1.5 * u, 2.9 * u, 5.4 * u, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e8503a';
      ctx.beginPath();
      ctx.ellipse(0, -1.5 * u, 2.9 * u, 5.4 * u, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = '#23262b';
      ctx.fillRect(-2.9 * u, -2 * u, 5.8 * u, 1 * u);
      ctx.restore();
    };
    const ring = (x, y, r, a) => {
      ctx.strokeStyle = css(WHITE, a);
      ctx.lineWidth = 1.1 * u;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.28, 0, 0, TAU);
      ctx.stroke();
    };
    const hole = (x) => {
      if (!ice) return;
      blob(ctx, x, floatY + 0.5 * u, 8.5 * u, 2.9 * u, css(mixc(scale([150, 186, 210], 0.4 + 0.6 * L), topC, 0.2)));
      blob(ctx, x, floatY + 1 * u, 7 * u, 2.2 * u, css(scale(topC, 0.7)));
    };
    const hook = (x, y) => {
      ctx.strokeStyle = css(lineC, 0.8);
      ctx.lineWidth = 1.1 * u;
      ctx.beginPath();
      ctx.moveTo(x, y - 3 * u);
      ctx.lineTo(x, y);
      ctx.arc(x - 1.5 * u, y, 1.5 * u, 0, Math.PI * 0.95);
      ctx.stroke();
    };

    if (phase === 'idle' || phase === 'caught') {
      const sway = Math.sin(t * 1.6) * 2.5 * u;
      const ex = tip.x + sway;
      const ey = tip.y + Math.min(22 * u, Lr * 0.34);
      ctx.strokeStyle = css(lineC, 0.6);
      ctx.lineWidth = 0.9 * u;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo(tip.x + sway * 0.2, (tip.y + ey) / 2, ex, ey);
      ctx.stroke();
      drawFloat(ex, ey - 2 * u + 1000, -1000, sway * 0.02);
      hook(ex, ey + 4 * u);
    } else if (phase === 'aim') {
      const d = c.fill * m.range;
      const tx = xOf(d);
      const sway = Math.sin(t * 5) * 1.5 * u;
      const ex = tip.x - 5 * u * c.fill + sway;
      const ey = tip.y + 14 * u;
      ctx.strokeStyle = css(lineC, 0.6);
      ctx.lineWidth = 0.9 * u;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      drawFloat(ex, ey + 1000, -1000, 0.2);
      // Where it will land: a dashed arc and a mark on the water.
      const from = { x: butt.x + Math.cos(50 * deg) * Lr, y: butt.y - Math.sin(50 * deg) * Lr };
      ctx.strokeStyle = 'rgba(180,170,255,0.75)';
      ctx.lineWidth = 1.3 * u;
      ctx.setLineDash([4 * u, 5 * u]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo((from.x + tx) / 2, Math.max(6 * u, from.y - (tx - from.x) * 0.22), tx, floatY);
      ctx.stroke();
      ctx.setLineDash([]);
      hole(tx);
      const k = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.strokeStyle = 'rgba(180,170,255,0.95)';
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      ctx.ellipse(tx, floatY, (7 + 2 * k) * u, (2.2 + 0.6 * k) * u, 0, 0, TAU);
      ctx.stroke();
      blob(ctx, tx, floatY, 1.6 * u, 0.8 * u, 'rgba(180,170,255,0.95)');
    } else if (phase === 'wait' || phase === 'bite' || phase === 'late') {
      const biting = phase !== 'wait';
      const nibble = phase === 'wait' && m.falseBite;
      let sink = Math.sin(t * 2.4) * 0.9 * u;
      let tilt = Math.sin(t * 1.3) * 0.08 + (windy ? 0.12 : 0);
      if (nibble) {
        sink = (3 + Math.sin(t * 26) * 1.2) * u;
        tilt = Math.sin(t * 20) * 0.1;
      }
      if (biting) {
        sink = (m.still ? 9 : 9 + Math.sin(t * 19) * 2) * u;
        tilt = 0.3 + Math.sin(t * 15) * 0.1;
      }
      hole(fx);
      // The line down to the hook, and the shadow that took the bait.
      const hy = Y0 + (bedY(fx) - Y0) * (0.34 + 0.14 * (c.zone || 0));
      ctx.strokeStyle = css(lineC, 0.3);
      ctx.lineWidth = 0.8 * u;
      ctx.beginPath();
      ctx.moveTo(fx, floatY + 2 * u);
      ctx.lineTo(fx + (biting ? 3 * u : 0), hy);
      ctx.stroke();
      if (biting) {
        const wob = Math.sin(t * 14) * 2 * u;
        const bx = fx + 3 * u;
        const by = hy + wob * 0.4;
        const len = 30 * u;
        ctx.fillStyle = css(scale(deepC, 0.55), 0.85);
        ctx.beginPath();
        ctx.ellipse(bx + len * 0.42, by, len * 0.42, len * 0.15, 0.05, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx + len * 0.76, by);
        ctx.lineTo(bx + len, by - len * 0.17 + wob);
        ctx.lineTo(bx + len * 0.94, by + wob * 0.5);
        ctx.lineTo(bx + len, by + len * 0.17 + wob);
        ctx.fill();
      } else {
        hook(fx, hy + 3 * u);
        blob(ctx, fx - 1.6 * u, hy + 4.6 * u, 1.5 * u, 1.1 * u, css(shade([226, 132, 120], 0.04)));
      }
      // The line from the tip: slack while waiting, taut on the bite.
      ctx.strokeStyle = css(lineC, 0.75);
      ctx.lineWidth = 0.9 * u;
      const topY = floatY + Math.min(sink, 6 * u) - 12 * u;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      if (biting) ctx.quadraticCurveTo((tip.x + fx) / 2, (tip.y + topY) / 2 + 2 * u, fx, topY + 6 * u);
      else ctx.quadraticCurveTo(tip.x + (fx - tip.x) * 0.5, floatY - 6 * u + Math.sin(t * 1.1) * (windy ? 4 : 1.5) * u, fx, topY);
      ctx.stroke();
      // Rings: calm ones now and then, wide ones on the bite, a splash of drops.
      if (biting) {
        for (let i = 0; i < 3; i++) {
          const k = m.still ? (i + 1) / 3 : (t * 1.5 + i / 3) % 1;
          ring(fx, floatY + 0.5 * u, (4 + 22 * k) * u, 0.75 * (1 - k));
        }
        if (!m.still) {
          const sp = (t * 2.2) % 1;
          ctx.fillStyle = css(WHITE, 0.8 * (1 - sp));
          for (let i = 0; i < 5; i++) {
            const a = -Math.PI * (0.2 + 0.15 * i);
            ctx.fillRect(fx + Math.cos(a) * 14 * u * sp, floatY + Math.sin(a) * 16 * u * sp + 14 * u * sp * sp, 1.6 * u, 1.6 * u);
          }
        }
      } else if (nibble) {
        ring(fx, floatY + 0.5 * u, (5 + 3 * Math.abs(Math.sin(t * 9))) * u, 0.55);
      } else if (!ice) {
        const k = (t * 0.35) % 1;
        if (k < 0.5) ring(fx, floatY + 0.5 * u, (3.5 + 12 * k) * u, 0.35 * (1 - k * 2));
      }
      drawFloat(fx, floatY + 1 * u, sink, tilt);
      if (biting && sink > 6 * u) blob(ctx, fx + 0.5 * u, floatY + 1.6 * u, 2.6 * u, 1 * u, css(WHITE, 0.3));
    } else if (phase === 'fight') {
      const T = c.T || 0;
      const col = T >= 100 ? [255, 123, 114] : T >= 80 ? [226, 186, 96] : lineC;
      const sag = Math.max(0, 34 - T * 0.4) * u;
      const cp = { x: (tip.x + fx) / 2, y: (tip.y + fishY) / 2 + sag };
      const at = (s) => ({
        x: (1 - s) * (1 - s) * tip.x + 2 * (1 - s) * s * cp.x + s * s * fx,
        y: (1 - s) * (1 - s) * tip.y + 2 * (1 - s) * s * cp.y + s * s * fishY
      });
      const N = 24;
      const pts = [];
      for (let i = 0; i <= N; i++) pts.push(at(i / N));
      let cut = pts.findIndex((p) => p.y > floatY);
      if (cut < 0) cut = N;
      const enter = pts[cut];
      const stroke = (from, to, alpha) => {
        ctx.strokeStyle = css(col, alpha);
        ctx.lineWidth = (0.9 + T / 110) * u;
        ctx.beginPath();
        ctx.moveTo(pts[from].x, pts[from].y);
        for (let i = from + 1; i <= to; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };
      stroke(0, cut, 0.92);
      if (cut < N) stroke(cut, N, 0.5);
      if (enter) {
        hole(enter.x);
        const k = m.still ? 0.5 : (t * 2) % 1;
        ring(enter.x, floatY + 0.5 * u, (3 + 9 * k) * u, 0.6 * (1 - k));
        if (c.jt > 0) ring(enter.x, floatY + 0.5 * u, (10 + 12 * k) * u, 0.5 * (1 - k));
      }
      // Bubbles behind the fish, then the fish itself.
      for (let i = 0; i < 5; i++) {
        const k = m.still ? (i + 1) / 6 : (t * 0.9 + i / 5) % 1;
        const by = fishY - k * (fishY - Y0 - 3 * u);
        ctx.strokeStyle = css(WHITE, 0.45 * (1 - k));
        ctx.lineWidth = 0.8 * u;
        ctx.beginPath();
        ctx.arc(fx + (8 + 10 * rnd(i + 700)) * u + Math.sin(t * 3 + i) * 2 * u, by, (1 + 1.6 * rnd(i + 710)) * u, 0, TAU);
        ctx.stroke();
      }
      const len = clamp((m.fishLen || 30) * 1.3 * u, 30 * u, Math.min(W * 0.36, 90 * u));
      const tilt = (c.hold ? -0.16 : 0.1) + (m.still ? 0 : Math.sin(t * 9) * 0.07) + (c.jt > 0 ? 0.2 : 0);
      if (m.fish) m.fish(ctx, fx, fishY, len, tilt);
    }
  }

  window.FishScene = { draw: draw, palette: paletteOf };
})();
