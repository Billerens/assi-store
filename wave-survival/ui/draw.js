// «Последний рубеж» — the picture of a run on one 2D canvas: window.WaveDraw.
//   const r = WaveDraw.make(canvas, o)        once per screen: o = {particles, numbers, style, looks, salt}
//                                              looks[kind] — a GameArt look; style 'shapes' — the old figures
//   r.resize(world, cssW, cssH, dpr)            on fold, rotation, quality
//   r.frame(world, o)                           every animation frame: o = {joy, fx, numbers}
// Every kind of enemy, projectile and crystal is drawn once into its own small canvas when the
// scale changes; a frame is drawImage of those plus a few lines. No shadowBlur, filter or
// gradients; particles and damage numbers live in fixed pools (caps from the config), so a
// frame allocates nothing.
(function () {
  'use strict';
  const W = window.WaveWorld;
  const TAU = Math.PI * 2;
  const FX = W.FX;
  const F = W.F;
  const PK = W.PK;

  const ENEMY_COLORS = ['#7d8a6a', '#9a8660', '#6a7d8a', '#7f93a0', '#8a6a7d', '#8f625c', '#5f6f8a', '#5f8a7a', '#9a8450', '#71608f', '#b4b4b4'];
  const ENEMY_SIDES = [4, 3, 6, 6, 5, 3, 8, 7, 4, 6, 9];
  // A readable helmet, visor, coat and boots: two cached walk frames, not a hitbox circle.
  const HERO_PIXELS = [
    '.....111111.....', '....12222221....', '...1222222221...', '...1223333321...',
    '...1234455431...', '...1233333331...', '....12666621....', '...1722222271...',
    '..177227722771..', '..172227722271..', '..112222222211..', '...1222662221...',
    '....12222221....', '....12111121....', '....11....11....', '...111....111...'
  ];
  const HERO_COLORS = {
    wanderer: ['#70d6bd', '#2b827b'], keeper: ['#98caed', '#396b9d'], bomber: ['#e5bd6b', '#96612b'],
    hunter: ['#a5cf79', '#4f8050'], mechanic: ['#edab74', '#a56837'], hermit: ['#c5a5f3', '#76579c']
  };

  function sprite(size, paint) {
    const c = document.createElement('canvas');
    const s = Math.max(2, Math.ceil(size));
    c.width = s;
    c.height = s;
    const x = c.getContext('2d');
    paint(x, s);
    return c;
  }

  function polygon(x, cx, cy, r, sides, rot) {
    x.beginPath();
    for (let k = 0; k <= sides; k++) {
      const a = rot + k / sides * TAU;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (k === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.closePath();
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round((n >> 16 & 255) * f));
    const g = Math.min(255, Math.round((n >> 8 & 255) * f));
    const b = Math.min(255, Math.round((n & 255) * f));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function make(canvas, o) {
    o = o || {};
    const arena = window.WaveArena ? window.WaveArena.make() : null;
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    const ctx = canvas.getContext('2d', { alpha: false });
    const caps = { particles: o.particles || 150, numbers: o.numbers || 40 };
    const r = {
      k: 1, dpr: 1, cssW: 0, cssH: 0, px: 1, camX: 0, camY: 0,
      enemy: [], elite: [], enemyF: [], eliteF: [], gem: null, bigGem: null, pick: [], digits: null, digitsCrit: null, digitW: 0, digitH: 0,
      particles: true, numbers: true, lastFx: 0, frameNo: 0, grid: true
    };
    // Particles and numbers: pools of plain numbers.
    const P = { x: new Float32Array(caps.particles), y: new Float32Array(caps.particles), vx: new Float32Array(caps.particles),
      vy: new Float32Array(caps.particles), life: new Float32Array(caps.particles), c: new Uint8Array(caps.particles), n: 0 };
    const N = { x: new Float32Array(caps.numbers), y: new Float32Array(caps.numbers), v: new Int32Array(caps.numbers),
      life: new Float32Array(caps.numbers), crit: new Uint8Array(caps.numbers), n: 0 };
    // Short-lived shapes: lines of the chain, rings, blasts.
    const SH = 64;
    const S = { k: new Uint8Array(SH), x: new Float32Array(SH), y: new Float32Array(SH), a: new Float32Array(SH), b: new Float32Array(SH),
      life: new Float32Array(SH), max: new Float32Array(SH), n: 0 };
    const digitBuf = new Int32Array(12);
    r.hurtFlash = 0;

    function sprites(world) {
      const c = world.c;
      const px = r.k * r.dpr;
      r.px = px;
      const colors = HERO_COLORS[world.s.hero] || HERO_COLORS.wanderer;
      const palette = ['', '#15272d', colors[0], '#233a4b', '#f4fffb', '#82e9ff', '#f0c04a', colors[1]];
      const cell = Math.max(1, Math.round(c.heroR * px * 2.4 / 16));
      r.hero = [0, 1].map(function (frame) {
        return sprite(20 * cell, function (x) {
          HERO_PIXELS.forEach(function (row, y) {
            for (let col = 0; col < row.length; col++) {
              const ink = Number(row[col]);
              if (!ink) continue;
              x.fillStyle = palette[ink];
              const stride = y >= 13 && frame ? (col < 8 ? -1 : 1) : 0;
              x.fillRect((col + 2) * cell, (y + 2 + stride) * cell, cell, cell);
            }
          });
        });
      });
      r.enemy = [];
      r.elite = [];
      r.enemyF = [];
      r.eliteF = [];
      const Art = window.GameArt;
      for (let kind = 0; kind < c.ek.length; kind++) {
        const rad = c.ek[kind].r * px;
        const color = ENEMY_COLORS[kind];
        const sides = ENEMY_SIDES[kind];
        const look = o.style !== 'shapes' && Art && o.looks ? o.looks[kind] : null;
        if (look) {
          // A pixel creature of the GameArt generator: two frames, the elite in a light outline.
          const sp = Art.fromLook(look, W.ENEMIES[kind] + ':' + (o.salt || ''), { frames: 2 });
          const elite = { w: sp.w, h: sp.h, frames: sp.frames, colors: sp.colors.slice() };
          elite.colors[1] = '#f2f2f2';
          const size = (rad * c.elite.r + 3 * r.dpr) * 2;
          const pixelSprite = (one, frame, scale) => sprite(size, (x, s) => {
            // Whole pixels a cell, so the edges stay sharp; a bit larger than the old shape,
            // since a creature has empty corners.
            const cell = Math.max(1, Math.floor(rad * scale * 2.3 / Math.max(one.w, one.h)));
            Art.draw(x, one, Math.round((s - one.w * cell) / 2), Math.round((s - one.h * cell) / 2), cell, frame);
          });
          r.enemyF.push([pixelSprite(sp, 0, 1), pixelSprite(sp, 1, 1)]);
          r.eliteF.push([pixelSprite(elite, 0, c.elite.r), pixelSprite(elite, 1, c.elite.r)]);
          r.enemy.push(r.enemyF[kind][0]);
          r.elite.push(r.eliteF[kind][0]);
          continue;
        }
        r.enemyF.push(null);
        r.eliteF.push(null);
        const paint = (elite) => (x, s) => {
          const m = s / 2;
          const rr = rad * (elite ? c.elite.r : 1);
          polygon(x, m, m, rr - 1.5 * r.dpr, sides, -Math.PI / 2);
          x.fillStyle = color;
          x.fill();
          x.lineWidth = Math.max(1, 1.2 * r.dpr);
          x.strokeStyle = shade(color, 0.6);
          x.stroke();
          if (kind === 10) {
            // The Reaper: a dark core and a pale crescent.
            x.beginPath();
            x.arc(m, m, rr * 0.45, 0, TAU);
            x.fillStyle = '#202020';
            x.fill();
            x.beginPath();
            x.arc(m - rr * 0.1, m, rr * 0.3, -1.2, 1.2);
            x.strokeStyle = '#e8e8e8';
            x.lineWidth = 2 * r.dpr;
            x.stroke();
          } else if (kind === 9) {
            polygon(x, m, m, rr * 0.5, 6, -Math.PI / 2);
            x.strokeStyle = shade(color, 1.4);
            x.lineWidth = 1.5 * r.dpr;
            x.stroke();
          } else {
            // An eye: which way it looks does not matter, it reads as a creature.
            x.beginPath();
            x.arc(m, m - rr * 0.15, Math.max(1, rr * 0.18), 0, TAU);
            x.fillStyle = shade(color, 0.45);
            x.fill();
          }
          if (elite) {
            polygon(x, m, m, rr - 0.5 * r.dpr, sides, -Math.PI / 2);
            x.lineWidth = 2 * r.dpr;
            x.strokeStyle = '#f2f2f2';
            x.stroke();
          }
        };
        const size = (rad * c.elite.r + 3 * r.dpr) * 2;
        r.enemy.push(sprite(size, paint(false)));
        r.elite.push(sprite(size, paint(true)));
      }
      const g = Math.max(3, 4 * px);
      r.gem = sprite(g * 2 + 2, (x, s) => {
        const m = s / 2;
        x.beginPath();
        x.moveTo(m, m - g);
        x.lineTo(m + g * 0.7, m);
        x.lineTo(m, m + g);
        x.lineTo(m - g * 0.7, m);
        x.closePath();
        x.fillStyle = '#6fc9b8';
        x.fill();
        x.strokeStyle = '#3d7d72';
        x.lineWidth = 1;
        x.stroke();
      });
      r.bigGem = sprite(g * 4 + 2, (x, s) => {
        const m = s / 2;
        const gg = g * 1.9;
        x.beginPath();
        x.moveTo(m, m - gg);
        x.lineTo(m + gg * 0.7, m);
        x.lineTo(m, m + gg);
        x.lineTo(m - gg * 0.7, m);
        x.closePath();
        x.fillStyle = '#9fe6d8';
        x.fill();
        x.strokeStyle = '#f2f2f2';
        x.lineWidth = 1.5 * r.dpr;
        x.stroke();
      });
      const ps = 9 * px;
      const pickPaint = [
        (x, m) => {
          x.fillStyle = '#d8d8d8';
          x.fillRect(m - ps * 0.7, m - ps * 0.7, ps * 1.4, ps * 1.4);
          x.fillStyle = '#c0504a';
          x.fillRect(m - ps * 0.15, m - ps * 0.5, ps * 0.3, ps);
          x.fillRect(m - ps * 0.5, m - ps * 0.15, ps, ps * 0.3);
        },
        (x, m) => {
          x.strokeStyle = '#8fb0e0';
          x.lineWidth = ps * 0.3;
          x.beginPath();
          x.arc(m, m - ps * 0.1, ps * 0.5, Math.PI, 0);
          x.moveTo(m - ps * 0.5, m - ps * 0.1);
          x.lineTo(m - ps * 0.5, m + ps * 0.5);
          x.moveTo(m + ps * 0.5, m - ps * 0.1);
          x.lineTo(m + ps * 0.5, m + ps * 0.5);
          x.stroke();
        },
        (x, m) => {
          x.fillStyle = '#f0e08a';
          x.beginPath();
          x.moveTo(m + ps * 0.15, m - ps * 0.8);
          x.lineTo(m - ps * 0.45, m + ps * 0.1);
          x.lineTo(m - ps * 0.05, m + ps * 0.1);
          x.lineTo(m - ps * 0.2, m + ps * 0.8);
          x.lineTo(m + ps * 0.45, m - ps * 0.15);
          x.lineTo(m + ps * 0.05, m - ps * 0.15);
          x.closePath();
          x.fill();
        },
        (x, m) => {
          x.fillStyle = '#d9b860';
          x.beginPath();
          x.arc(m, m, ps * 0.55, 0, TAU);
          x.fill();
          x.strokeStyle = '#8a6f30';
          x.lineWidth = ps * 0.15;
          x.stroke();
        },
        (x, m) => {
          x.fillStyle = '#8a6a4a';
          x.fillRect(m - ps * 0.8, m - ps * 0.5, ps * 1.6, ps * 1.1);
          x.strokeStyle = '#f2f2f2';
          x.lineWidth = ps * 0.15;
          x.strokeRect(m - ps * 0.8, m - ps * 0.5, ps * 1.6, ps * 1.1);
          x.fillStyle = '#f0e08a';
          x.fillRect(m - ps * 0.15, m - ps * 0.2, ps * 0.3, ps * 0.35);
        }
      ];
      r.pick = pickPaint.map((p) => sprite(ps * 2.2, (x, s) => p(x, s / 2)));
      digits();
    }

    function digits() {
      const size = Math.round(13 * r.dpr);
      const font = '700 ' + size + 'px system-ui, sans-serif';
      const probe = document.createElement('canvas').getContext('2d');
      probe.font = font;
      const dw = Math.ceil(probe.measureText('0').width) + 1;
      r.digitW = dw;
      r.digitH = Math.ceil(size * 1.25);
      r.digits = document.createElement('canvas');
      r.digitsCrit = document.createElement('canvas');
      [r.digits, r.digitsCrit].forEach((c, i) => {
        c.width = dw * 10;
        c.height = r.digitH;
        const x = c.getContext('2d');
        x.font = font;
        x.textBaseline = 'top';
        x.fillStyle = i ? '#f0c060' : '#e8e8e8';
        for (let d = 0; d < 10; d++) x.fillText(String(d), d * dw, 1);
      });
    }

    r.resize = function (world, cssW, cssH, dpr) {
      r.cssW = Math.max(1, cssW);
      r.cssH = Math.max(1, cssH);
      r.dpr = dpr;
      canvas.width = Math.round(r.cssW * dpr);
      canvas.height = Math.round(r.cssH * dpr);
      canvas.style.width = r.cssW + 'px';
      canvas.style.height = r.cssH + 'px';
      W.view(world, r.cssW, r.cssH);
      r.k = r.cssW / world.s.vw;
      sprites(world);
    };

    // ---- effects from the world's ring buffer ----

    function particle(x, y, color, n, speed) {
      if (!r.particles) return;
      for (let i = 0; i < n; i++) {
        const at = P.n % caps.particles;
        P.n++;
        const a = Math.random() * TAU;
        const v = speed * (0.4 + Math.random() * 0.8);
        P.x[at] = x;
        P.y[at] = y;
        P.vx[at] = Math.cos(a) * v;
        P.vy[at] = Math.sin(a) * v;
        P.life[at] = 0.35 + Math.random() * 0.25;
        P.c[at] = color;
      }
    }

    function shape(k, x, y, a, b, life) {
      const at = S.n % SH;
      S.n++;
      S.k[at] = k;
      S.x[at] = x;
      S.y[at] = y;
      S.a[at] = a;
      S.b[at] = b;
      S.life[at] = life;
      S.max[at] = life;
    }

    function number(x, y, v, crit) {
      if (!r.numbers || v < 1) return;
      const at = N.n % caps.numbers;
      N.n++;
      N.x[at] = x + (Math.random() - 0.5) * 8;
      N.y[at] = y;
      N.v[at] = Math.round(v);
      N.life[at] = 0.6;
      N.crit[at] = crit ? 1 : 0;
    }

    /** Reads what happened since the last frame; returns {hurt, kills, level, boom} for sounds. */
    r.consume = function (world) {
      const f = world.fx;
      const out = { hurt: 0, kills: 0, elite: 0, level: 0, boom: 0, pick: 0, hits: 0 };
      let from = r.lastFx;
      if (f.n - from > FX.SIZE) from = f.n - FX.SIZE;
      for (let n = from; n < f.n; n++) {
        const i = n % FX.SIZE;
        const k = f.k[i];
        const x = f.x[i];
        const y = f.y[i];
        if (k === FX.HIT) {
          out.hits++;
          number(x, y, f.a[i], f.b[i] > 0);
        } else if (k === FX.KILL) {
          out.kills++;
          if (f.b[i] > 0) out.elite++;
          particle(x, y, f.a[i], f.b[i] > 0 ? 10 : 4, 90);
        } else if (k === FX.LINE) {
          if (f.b[i] === 3 && f.a[i] > -100 && f.a[i] < 100) shape(5, x, y, f.a[i], 0, 0.7);
          else shape(1, x, y, f.a[i], f.b[i], 0.14);
        } else if (k === FX.RING) {
          shape(2, x, y, f.a[i], f.b[i], f.b[i] === 4 ? 0.45 : 0.3);
        } else if (k === FX.BOOM) {
          out.boom++;
          shape(3, x, y, f.a[i], f.b[i], 0.25);
        } else if (k === FX.HURT) {
          out.hurt++;
          r.hurtFlash = 0.25;
        } else if (k === FX.PICK) {
          out.pick++;
        } else if (k === FX.LEVEL) {
          out.level++;
          shape(2, x, y, 60, 5, 0.4);
        } else if (k === FX.BLOCK) {
          shape(4, x, y, f.a[i], 0, 0.15);
        }
      }
      r.lastFx = f.n;
      return out;
    };

    r.skipFx = function (world) { r.lastFx = world.fx.n; };

    // ---- a frame ----

    const PCOL = ['#e8e8e8', '#d8c890', '#a8c0d0', '#a8c0d0', '#c8a0b8', '#d09088', '#a0b0d0', '#90c8b8', '#e0c070', '#b0a0d0', '#f2f2f2'];

    r.frame = function (world, o) {
      const s = world.s;
      const c = world.c;
      const E = world.E;
      const px = r.px;
      const dt = o.dt || 0;
      const w = canvas.width;
      const hgt = canvas.height;
      r.frameNo++;
      const camX = s.hx - s.vw / 2;
      const camY = s.hy - s.vh * c.camY;
      r.camX = camX;
      r.camY = camY;
      const X = (wx) => (wx - camX) * px;
      const Y = (wy) => (wy - camY) * px;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      if (arena) arena.draw(ctx, world, { width: w, height: hgt, px: px, motion: !reducedMotion || !reducedMotion.matches });
      else {
      // Compatibility with an older package without the illustrated arena.
      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, w, hgt);
      const ax0 = Math.max(0, X(0));
      const ay0 = Math.max(0, Y(0));
      const ax1 = Math.min(w, X(c.arenaW));
      const ay1 = Math.min(hgt, Y(c.arenaH));
      ctx.fillStyle = '#121212';
      if (ax1 > ax0 && ay1 > ay0) ctx.fillRect(ax0, ay0, ax1 - ax0, ay1 - ay0);
      if (r.grid) {
        ctx.strokeStyle = '#1b1b1b';
        ctx.lineWidth = Math.max(1, r.dpr * 0.75);
        ctx.beginPath();
        const step = c.cell;
        const gx0 = Math.max(0, Math.floor(camX / step) * step);
        for (let gx = gx0; gx <= Math.min(c.arenaW, camX + s.vw + step); gx += step) {
          const sx = Math.round(X(gx)) + 0.5;
          ctx.moveTo(sx, ay0);
          ctx.lineTo(sx, ay1);
        }
        const gy0 = Math.max(0, Math.floor(camY / step) * step);
        for (let gy = gy0; gy <= Math.min(c.arenaH, camY + s.vh + step); gy += step) {
          const sy = Math.round(Y(gy)) + 0.5;
          ctx.moveTo(ax0, sy);
          ctx.lineTo(ax1, sy);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 2 * r.dpr;
      ctx.strokeRect(X(0), Y(0), c.arenaW * px, c.arenaH * px);
      // The soft edge: a band where the arena pushes back.
      ctx.strokeStyle = '#1f1f1f';
      ctx.lineWidth = 1 * r.dpr;
      ctx.strokeRect(X(c.edge), Y(c.edge), (c.arenaW - 2 * c.edge) * px, (c.arenaH - 2 * c.edge) * px);
      }

      // Puddles of «Ледяной след» and mines of «Семена».
      const U = world.U;
      ctx.fillStyle = '#5a8aa8';
      ctx.globalAlpha = 0.22;
      for (let i = 0; i < c.capU; i++) {
        if (!U.on[i] || U.until[i] <= s.t) continue;
        ctx.beginPath();
        ctx.arc(X(U.x[i]), Y(U.y[i]), U.r[i] * px, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const M = world.M;
      for (let i = 0; i < c.capM; i++) {
        if (!M.on[i]) continue;
        const armed = M.arm[i] <= s.t;
        ctx.beginPath();
        ctx.arc(X(M.x[i]), Y(M.y[i]), 4 * px, 0, TAU);
        ctx.fillStyle = armed ? '#7fa060' : '#4a5a3a';
        ctx.fill();
        if (armed) {
          ctx.strokeStyle = '#3a4a2a';
          ctx.lineWidth = r.dpr;
          ctx.beginPath();
          ctx.arc(X(M.x[i]), Y(M.y[i]), M.r[i] * px, 0, TAU);
          ctx.stroke();
        }
      }

      // Crystals and pickups.
      const G = world.G;
      const gs = r.gem.width / 2;
      for (let i = 0; i < c.capG; i++) {
        if (!G.st[i]) continue;
        const sx = X(G.x[i]);
        const sy = Y(G.y[i]);
        if (sx < -20 || sy < -20 || sx > w + 20 || sy > hgt + 20) continue;
        ctx.drawImage(r.gem, sx - gs, sy - gs);
      }
      if (s.big.v > 0) ctx.drawImage(r.bigGem, X(s.big.x) - r.bigGem.width / 2, Y(s.big.y) - r.bigGem.height / 2);
      const K = world.K;
      for (let i = 0; i < c.capK; i++) {
        if (!K.on[i]) continue;
        const sp = r.pick[K.kind[i]];
        if (K.life[i] < 5 && Math.floor(K.life[i] * 6) % 2) continue;
        ctx.drawImage(sp, X(K.x[i]) - sp.width / 2, Y(K.y[i]) - sp.height / 2);
      }

      // Warnings: the line of a ram, the circle of a bomber, the windup of a shooter.
      for (let i = 0; i < c.capE; i++) {
        const fl = E.flag[i];
        if (!(fl & F.ALIVE)) continue;
        const kind = E.kind[i];
        if (kind === 5 && E.st[i] === 1) {
          const len = c.ram.speed * c.ram.time * px;
          ctx.strokeStyle = '#c0504a';
          ctx.lineWidth = Math.max(2, E.r[i] * px * 0.5);
          ctx.globalAlpha = 0.35 + 0.3 * Math.sin(s.t * 30);
          ctx.beginPath();
          ctx.moveTo(X(E.x[i]), Y(E.y[i]));
          ctx.lineTo(X(E.x[i]) + Math.cos(E.ang[i]) * len, Y(E.y[i]) + Math.sin(E.ang[i]) * len);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (kind === 8 && E.st[i] === 1) {
          ctx.strokeStyle = '#e0a050';
          ctx.lineWidth = 1.5 * r.dpr;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          const rad = c.bomber.radius * (s.storm >= 10 ? 1 + c.storm.bomber : 1);
          ctx.arc(X(E.x[i]), Y(E.y[i]), rad * px, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (kind === 10 && ((E.st[i] & 3) === 1)) {
          ctx.strokeStyle = '#c0504a';
          ctx.lineWidth = E.r[i] * px * 0.6;
          ctx.globalAlpha = 0.3;
          const len = c.reaper.dashSpeed * c.reaper.dashTime * px;
          ctx.beginPath();
          ctx.moveTo(X(E.x[i]), Y(E.y[i]));
          ctx.lineTo(X(E.x[i]) + Math.cos(E.ang[i]) * len, Y(E.y[i]) + Math.sin(E.ang[i]) * len);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Enemies.
      for (let i = 0; i < c.capE; i++) {
        const fl = E.flag[i];
        if (!(fl & F.ALIVE)) continue;
        const sx = X(E.x[i]);
        const sy = Y(E.y[i]);
        const kind = E.kind[i];
        const frames = (fl & F.ELITE) ? r.eliteF[kind] : r.enemyF[kind];
        // Legs step four times a second, each foe out of step with its neighbours.
        const sp = frames ? frames[(Math.floor(s.t * 4) + i) & 1] : (fl & F.ELITE) ? r.elite[kind] : r.enemy[kind];
        const half = sp.width / 2;
        if (sx < -half || sy < -half || sx > w + half || sy > hgt + half) continue;
        if (kind === 8 && E.st[i] === 1 && Math.floor(s.t * 10) % 2) ctx.globalAlpha = 0.45;
        if (E.frz[i] > s.t) ctx.globalAlpha = 0.6;
        ctx.drawImage(sp, sx - half, sy - half);
        ctx.globalAlpha = 1;
        if (kind === 6) {
          // The shield: an arc in front.
          ctx.strokeStyle = '#d8dde8';
          ctx.lineWidth = 3 * r.dpr;
          ctx.beginPath();
          ctx.arc(sx, sy, E.r[i] * px + 3 * r.dpr, E.face[i] - 0.9, E.face[i] + 0.9);
          ctx.stroke();
        } else if (kind === 4 && E.st[i] === 1) {
          ctx.fillStyle = '#e2786a';
          ctx.beginPath();
          ctx.arc(sx, sy, 3 * px, 0, TAU);
          ctx.fill();
        }
        if (E.slow[i] > s.t && !(E.frz[i] > s.t)) {
          ctx.strokeStyle = '#7fb0d0';
          ctx.lineWidth = r.dpr;
          ctx.beginPath();
          ctx.arc(sx, sy, E.r[i] * px + 1.5 * r.dpr, 0, TAU);
          ctx.stroke();
        }
        if (E.link[i] >= 0) {
          ctx.strokeStyle = '#5f8a7a';
          ctx.lineWidth = r.dpr;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(X(E.x[E.link[i]]), Y(E.y[E.link[i]]));
          ctx.stroke();
        }
      }

      // Projectiles.
      const PP = world.P;
      for (let i = 0; i < c.capP; i++) {
        if (!PP.on[i]) continue;
        const kind = PP.kind[i];
        const sx = X(PP.x[i]);
        const sy = Y(PP.y[i]);
        if (kind !== PK.MORTAR && (sx < -30 || sy < -30 || sx > w + 30 || sy > hgt + 30)) continue;
        const rad = Math.max(1.5 * r.dpr, PP.r[i] * px);
        if (kind === PK.SPARK || kind === PK.DRONE) {
          ctx.fillStyle = kind === PK.SPARK ? '#f0e0a0' : '#c8d8f0';
          ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
        } else if (kind === PK.NEEDLE) {
          const vl = Math.sqrt(PP.vx[i] * PP.vx[i] + PP.vy[i] * PP.vy[i]) || 1;
          ctx.strokeStyle = '#e0e0e0';
          ctx.lineWidth = 1.5 * r.dpr;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - PP.vx[i] / vl * 9 * px, sy - PP.vy[i] / vl * 9 * px);
          ctx.stroke();
        } else if (kind === PK.MORTAR) {
          const total = PP.a[i] || 1;
          const left = Math.max(0, PP.life[i]);
          const f = 1 - left / total;
          const lift = Math.sin(f * Math.PI) * 60 * px;
          const tx = X(PP.tx[i]);
          const ty = Y(PP.ty[i]);
          ctx.strokeStyle = '#806040';
          ctx.lineWidth = r.dpr;
          ctx.beginPath();
          ctx.arc(tx, ty, PP.r[i] * px, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = '#d0a070';
          ctx.beginPath();
          ctx.arc(sx, sy - lift, 4.5 * px, 0, TAU);
          ctx.fill();
        } else if (kind === PK.SICKLE) {
          ctx.strokeStyle = '#d8d8c0';
          ctx.lineWidth = 3 * r.dpr;
          ctx.beginPath();
          const spin = s.t * 14 + i;
          ctx.arc(sx, sy, rad, spin, spin + 3.6);
          ctx.stroke();
        } else if (kind === PK.BALL) {
          ctx.strokeStyle = '#a0c8f0';
          ctx.lineWidth = 2 * r.dpr;
          ctx.beginPath();
          ctx.arc(sx, sy, rad, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = '#d8ecff';
          ctx.beginPath();
          ctx.arc(sx, sy, rad * 0.4, 0, TAU);
          ctx.fill();
        } else if (kind === PK.EBALL || kind === PK.ERING) {
          ctx.fillStyle = kind === PK.EBALL ? '#e2786a' : '#e0a060';
          ctx.beginPath();
          ctx.arc(sx, sy, rad, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#401c18';
          ctx.lineWidth = r.dpr;
          ctx.stroke();
        }
      }

      // Weapons drawn around the hero: blades, the beam, the drones.
      const hx = X(s.hx);
      const hy = Y(s.hy);
      for (let n = 0; n < s.wp.length; n++) {
        const wp = s.wp[n];
        if (wp.id === 'blades' && wp.n > 0) {
          const size = c.w.blades.size * (s.stat.area || 1) * (wp.fu === 'millstones' ? c.f.millSize : 1) * px;
          ctx.fillStyle = wp.fu ? '#e8d8a8' : '#c8c8c8';
          for (let q = 0; q < wp.n; q++) {
            const a = wp.a + q / wp.n * TAU;
            const bx = hx + Math.cos(a) * wp.b * px;
            const by = hy + Math.sin(a) * wp.b * px;
            ctx.beginPath();
            ctx.moveTo(bx + Math.cos(a + 1.57) * size, by + Math.sin(a + 1.57) * size);
            ctx.lineTo(bx + Math.cos(a) * size * 0.5, by + Math.sin(a) * size * 0.5);
            ctx.lineTo(bx + Math.cos(a - 1.57) * size, by + Math.sin(a - 1.57) * size);
            ctx.lineTo(bx - Math.cos(a) * size * 0.5, by - Math.sin(a) * size * 0.5);
            ctx.closePath();
            ctx.fill();
          }
        } else if (wp.id === 'beacon' && wp.b > 0) {
          const beams = Math.max(1, 1 + W.countAtLevel(c.w.beacon.countAt, wp.lvl) + (s.stat.proj || 0));
          const L = c.w.beacon.range * (s.stat.area || 1) * px;
          ctx.strokeStyle = '#f0e8c0';
          ctx.lineWidth = 3 * r.dpr;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          for (let q = 0; q < beams; q++) {
            const a = wp.a + q / beams * TAU;
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx + Math.cos(a) * L, hy + Math.sin(a) * L);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (wp.id === 'drones') {
          const count = Math.max(1, c.w.drones.count + W.countAtLevel(c.w.drones.countAt, wp.lvl) + (s.stat.proj || 0)) + (s.stat.drones || 0);
          ctx.fillStyle = '#c8d8f0';
          for (let q = 0; q < count; q++) {
            const a = wp.a + q / count * TAU;
            const dx = hx + Math.cos(a) * c.w.drones.orbit * px;
            const dy = hy + Math.sin(a) * c.w.drones.orbit * px;
            ctx.beginPath();
            ctx.moveTo(dx + Math.cos(a + 1.57) * 5 * px, dy + Math.sin(a + 1.57) * 5 * px);
            ctx.lineTo(dx + Math.cos(a - 2.4) * 4 * px, dy + Math.sin(a - 2.4) * 4 * px);
            ctx.lineTo(dx + Math.cos(a + 0.8) * 4 * px, dy + Math.sin(a + 0.8) * 4 * px);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // The hero stays upright; walking alternates boots, facing mirrors the silhouette.
      const blink = s.inv > 0 && Math.floor(s.t * 20) % 2 === 0;
      ctx.globalAlpha = blink ? 0.5 : 1;
      const hero = r.hero[s.moving ? Math.floor(s.t * 8) % 2 : 0];
      ctx.save();
      ctx.translate(hx, hy);
      ctx.scale(Math.cos(s.face) < 0 ? -1 : 1, 1);
      ctx.drawImage(hero, -hero.width / 2, -hero.height / 2);
      ctx.restore();
      ctx.globalAlpha = 1;
      const bw = 30 * px;
      const bh = Math.max(2, 3 * px);
      const by = hy + hero.height * 0.45 + 3 * px;
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(hx - bw / 2, by, bw, bh);
      const frac = Math.max(0, Math.min(1, s.hp / s.hmax));
      ctx.fillStyle = frac > 0.35 ? '#7fbf7f' : '#d06a5a';
      ctx.fillRect(hx - bw / 2, by, bw * frac, bh);

      // Short shapes: chains, rings, blasts, blocks, the Reaper's warning.
      for (let i = 0; i < SH; i++) {
        if (S.life[i] <= 0) continue;
        S.life[i] -= dt;
        const f = Math.max(0, S.life[i] / S.max[i]);
        const k = S.k[i];
        ctx.globalAlpha = f;
        if (k === 1) {
          ctx.strokeStyle = '#c8d8ff';
          ctx.lineWidth = 2 * r.dpr;
          ctx.beginPath();
          ctx.moveTo(X(S.x[i]), Y(S.y[i]));
          ctx.lineTo(X(S.a[i]), Y(S.b[i]));
          ctx.stroke();
        } else if (k === 2) {
          const grow = S.b[i] === 0 || S.b[i] === 5 ? 1 - f * 0.3 : 1;
          ctx.strokeStyle = S.b[i] === 3 ? '#e0a060' : S.b[i] === 4 ? '#f2f2f2' : S.b[i] === 5 ? '#8B7CFF' : '#a8c8e8';
          ctx.lineWidth = 2 * r.dpr;
          ctx.beginPath();
          ctx.arc(X(S.x[i]), Y(S.y[i]), Math.max(1, S.a[i] * px * grow), 0, TAU);
          ctx.stroke();
        } else if (k === 3) {
          ctx.fillStyle = S.b[i] === 1 ? '#e0a050' : '#d0a070';
          ctx.globalAlpha = f * 0.35;
          ctx.beginPath();
          ctx.arc(X(S.x[i]), Y(S.y[i]), S.a[i] * px, 0, TAU);
          ctx.fill();
        } else if (k === 4) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3 * r.dpr;
          ctx.beginPath();
          ctx.arc(X(S.x[i]), Y(S.y[i]), 14 * px, S.a[i] - 0.6, S.a[i] + 0.6);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Particles.
      if (r.particles) {
        const ps = Math.max(1.5, 2.5 * px);
        for (let i = 0; i < caps.particles; i++) {
          if (P.life[i] <= 0) continue;
          P.life[i] -= dt;
          P.x[i] += P.vx[i] * dt;
          P.y[i] += P.vy[i] * dt;
          ctx.globalAlpha = Math.min(1, P.life[i] * 3);
          ctx.fillStyle = PCOL[P.c[i]] || '#e8e8e8';
          ctx.fillRect(X(P.x[i]) - ps / 2, Y(P.y[i]) - ps / 2, ps, ps);
        }
        ctx.globalAlpha = 1;
      }

      // Damage numbers from the atlas of digits.
      if (r.numbers) {
        const dw = r.digitW;
        const dh = r.digitH;
        for (let i = 0; i < caps.numbers; i++) {
          if (N.life[i] <= 0) continue;
          N.life[i] -= dt;
          N.y[i] -= 30 * dt;
          let v = N.v[i];
          let len = 0;
          do {
            digitBuf[len++] = v % 10;
            v = Math.floor(v / 10);
          } while (v > 0 && len < 12);
          const atlas = N.crit[i] ? r.digitsCrit : r.digits;
          let sx = X(N.x[i]) - len * dw / 2;
          const sy = Y(N.y[i]) - dh;
          ctx.globalAlpha = Math.min(1, N.life[i] * 3);
          for (let d = len - 1; d >= 0; d--) {
            ctx.drawImage(atlas, digitBuf[d] * dw, 0, dw, dh, sx, sy, dw, dh);
            sx += dw * 0.8;
          }
        }
        ctx.globalAlpha = 1;
      }

      // Hurt: a red frame for a moment.
      if (r.hurtFlash > 0) {
        r.hurtFlash -= dt;
        ctx.strokeStyle = '#c0504a';
        ctx.globalAlpha = Math.max(0, r.hurtFlash * 3);
        ctx.lineWidth = 10 * r.dpr;
        ctx.strokeRect(0, 0, w, hgt);
        ctx.globalAlpha = 1;
      }

      // The stick under the thumb.
      const joy = o.joy;
      if (joy && joy.id !== null) {
        const jx = joy.ox * r.dpr;
        const jy = joy.oy * r.dpr;
        const jr = joy.radius * r.dpr;
        ctx.strokeStyle = '#4a4a4a';
        ctx.lineWidth = 2 * r.dpr;
        ctx.beginPath();
        ctx.arc(jx, jy, jr, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#8a8a8a';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(jx + joy.mx * jr, jy + joy.my * jr, jr * 0.42, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    r.clear = function () {
      P.life.fill(0);
      N.life.fill(0);
      S.life.fill(0);
      r.hurtFlash = 0;
    };

    return r;
  }

  window.WaveDraw = { make: make };
})();
