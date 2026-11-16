(function (root, make) {
  const api = make();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WaveArena = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const TAU = Math.PI * 2, TILE = 192;
  const rand = n => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
  // The biome is cosmetic and stable for this run. It never consumes the world's RNG.
  function model(world) {
    const s = world.s, c = world.c;
    return { seed: s.seed >>> 0, theme: (s.seed >>> 0) % 2 ? 'rain' : 'garden',
      width: c.arenaW, height: c.arenaH, storm: Math.max(0, Number(s.storm) || 0),
      wave: Math.max(0, Number(s.wave) || 0), time: s.t,
      camX: s.hx - s.vw / 2, camY: s.hy - s.vh * c.camY,
      viewWidth: s.vw, viewHeight: s.vh };
  }
  function ellipse(c, x, y, rx, ry, color) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = color; c.fill();
  }
  function line(c, points, color, width) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.strokeStyle = color; c.lineWidth = width || 1; c.stroke();
  }
  function tile(theme, variant) {
    const canvas = document.createElement('canvas'); canvas.width = TILE; canvas.height = TILE;
    const c = canvas.getContext('2d');
    const rain = theme === 'rain';
    c.fillStyle = rain ? '#202f37' : '#435b48'; c.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 45; i++) {
      const x = rand(i + variant * 39) * TILE, y = rand(i * 2 + variant * 19 + 60) * TILE;
      c.fillStyle = rain ? i % 2 ? '#263740' : '#1d2b32' : i % 2 ? '#50634c' : '#3e5747';
      c.fillRect(x, y, 1 + rand(i) * 5, 1 + rand(i + 1) * 3);
    }
    if (rain) {
      ellipse(c, 93, 110, 48 + variant * 3, 17, '#283f49');
      line(c, [[54, 105], [83, 107], [119, 103]], '#3a525b', 1);
      line(c, [[81, 117], [128, 115]], '#334b55', 1);
      line(c, [[9, 40], [52, 58], [69, 50], [105, 67]], '#13232d', 2);
      line(c, [[51, 58], [57, 78]], '#13232d', 1);
      if (variant === 0) {
        ellipse(c, 144, 46, 22, 15, '#172830'); ellipse(c, 144, 44, 20, 14, '#35434a');
        for (let i = 0; i < 5; i++) line(c, [[128, 36 + i * 4], [160, 36 + i * 4]], '#172830', 2);
      }
    } else {
      ellipse(c, 96, 87, 72, 34, '#485f49');
      for (let i = 0; i < 12; i++) {
        const x = rand(i + variant * 17) * TILE, y = rand(i + 45) * TILE;
        line(c, [[x - 4, y], [x - 2, y - 7], [x, y], [x + 3, y - 5]], '#6e8058', 1);
      }
      if (variant === 1) {
        c.fillStyle = '#68715d'; c.fillRect(65, 72, 71, 47);
        c.strokeStyle = '#88917a'; c.strokeRect(67, 74, 67, 43);
        line(c, [[84, 73], [90, 91], [82, 118]], '#445b4c', 2);
        ellipse(c, 134, 119, 22, 9, '#567451');
      }
    }
    return canvas;
  }
  function make() {
    let theme = null, tiles = [];
    function draw(ctx, world, options) {
      const m = model(world), px = options.px;
      const rain = m.theme === 'rain', w = options.width, h = options.height;
      if (theme !== m.theme) { theme = m.theme; tiles = [0, 1, 2, 3].map(v => tile(theme, v)); }
      const X = x => (x - m.camX) * px, Y = y => (y - m.camY) * px;
      ctx.save(); ctx.fillStyle = rain ? '#111e28' : '#233e37'; ctx.fillRect(0, 0, w, h);
      // All solid scenery sits beyond the real collision boundary. Inside, details lie flat.
      const tileSize = Math.max(TILE, Math.ceil(Math.max(m.viewWidth, m.viewHeight) / 7 / TILE) * TILE);
      const x0 = Math.floor(m.camX / tileSize), y0 = Math.floor(m.camY / tileSize);
      const nx = Math.ceil(m.viewWidth / tileSize) + 2, ny = Math.ceil(m.viewHeight / tileSize) + 2;
      ctx.save(); ctx.beginPath(); ctx.rect(X(0), Y(0), m.width * px, m.height * px); ctx.clip();
      for (let row = 0; row < ny; row++) for (let col = 0; col < nx; col++) {
        const tx = x0 + col, ty = y0 + row, variant = ((tx * 7 + ty * 3 + m.seed) % 4 + 4) % 4;
        ctx.drawImage(tiles[variant], X(tx * tileSize), Y(ty * tileSize), tileSize * px + 1, tileSize * px + 1);
      }
      const road = rain ? '#273942' : '#66715b';
      ctx.fillStyle = road;
      ctx.fillRect(X(m.width / 2 - 77), Y(0), 154 * px, m.height * px);
      ctx.fillRect(X(0), Y(m.height / 2 - 66), m.width * px, 132 * px);
      ctx.strokeStyle = rain ? '#617374' : '#909b7d'; ctx.lineWidth = 2 * px;
      ctx.setLineDash([20 * px, 23 * px]);
      ctx.beginPath(); ctx.moveTo(X(m.width / 2), Y(0)); ctx.lineTo(X(m.width / 2), Y(m.height)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = rain ? '#344c55' : '#839173'; ctx.lineWidth = 3 * px;
      ctx.strokeRect(X(m.width / 2 - 76), Y(-3), 152 * px, (m.height + 6) * px);
      ctx.strokeRect(X(-3), Y(m.height / 2 - 65), (m.width + 6) * px, 130 * px);
      // Zebra crossings/old flagstones make the crossroads readable from the very first frame.
      for (const side of [-1, 1]) {
        for (let i = -3; i <= 3; i++) {
          ctx.fillStyle = rain ? '#61736f' : '#919779';
          ctx.fillRect(X(m.width / 2 + i * 17 - 5), Y(m.height / 2 + side * 127 - 23), 10 * px, 46 * px);
          ctx.fillRect(X(m.width / 2 + side * 130 - 24), Y(m.height / 2 + i * 15 - 4), 48 * px, 8 * px);
        }
      }
      // A painted plaza gives the starting area a clear anchor without adding obstacles.
      const cx = X(m.width / 2), cy = Y(m.height / 2);
      ellipse(ctx, cx, cy, 95 * px, 95 * px, rain ? '#2d4148' : '#7b8061');
      ctx.strokeStyle = rain ? '#4f6c70' : '#a7aa84'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(cx, cy, 84 * px, 0, TAU); ctx.stroke();
      line(ctx, [[cx - 37 * px, cy], [cx, cy - 47 * px], [cx + 37 * px, cy], [cx, cy + 47 * px], [cx - 37 * px, cy]], rain ? '#557b7d' : '#a4ad86', 3 * px);
      ctx.restore();
      // Perimeter blocks/tree crowns remain world-anchored when the camera follows the player.
      const step = Math.max(150, Math.ceil(Math.max(m.viewWidth, m.viewHeight) / 12 / 150) * 150);
      for (let i = Math.floor(m.camX / step) - 1; i <= Math.ceil((m.camX + m.viewWidth) / step) + 1; i++) {
        for (const yy of [-56, m.height + 56]) {
          const x = X(i * step), y = Y(yy), margin = 90 * px;
          if (x > -margin && x < w + margin && y > -margin && y < h + margin) edge(ctx, x, y, px, rain, i);
        }
      }
      for (let i = Math.floor(m.camY / step) - 1; i <= Math.ceil((m.camY + m.viewHeight) / step) + 1; i++) {
        for (const xx of [-58, m.width + 58]) {
          const x = X(xx), y = Y(i * step), margin = 90 * px;
          if (x > -margin && x < w + margin && y > -margin && y < h + margin) edge(ctx, x, y, px, rain, i + 8);
        }
      }
      ctx.strokeStyle = rain ? '#65828a' : '#a5af87'; ctx.lineWidth = 4 * px;
      ctx.strokeRect(X(0), Y(0), m.width * px, m.height * px);
      ctx.strokeStyle = rain ? 'rgba(129,178,182,.17)' : 'rgba(214,226,163,.22)'; ctx.lineWidth = px;
      ctx.strokeRect(X(world.c.edge), Y(world.c.edge), (m.width - 2 * world.c.edge) * px, (m.height - 2 * world.c.edge) * px);
      if (options.motion !== false) {
        if (rain) {
          const count = 22 + Math.min(18, m.storm * 2);
          ctx.strokeStyle = 'rgba(156,192,202,.19)'; ctx.lineWidth = Math.max(1, px * .6); ctx.beginPath();
          for (let i = 0; i < count; i++) {
            const x = ((rand(i + m.seed) * (w + 30) + m.time * 19 * px) % (w + 30)) - 15;
            const y = ((rand(i + 58) * (h + 30) + m.time * 130 * px) % (h + 30)) - 15;
            ctx.moveTo(x, y); ctx.lineTo(x - 4 * px, y + 14 * px);
          }
          ctx.stroke();
        } else {
          for (let i = 0; i < 9; i++) {
            const x = ((rand(i + m.seed) * w + m.time * 5 * px) % w), y = (rand(i + 91) * h + Math.sin(m.time * .6 + i) * 9 * px);
            ellipse(ctx, x, y, 1.5 * px, px, 'rgba(224,221,153,.35)');
          }
        }
      }
      ctx.restore();
    }
    return { draw };
  }
  function edge(c, x, y, px, rain, seed) {
    c.save(); c.translate(x, y); c.scale(px, px);
    if (rain) {
      c.fillStyle = '#101c25'; c.fillRect(-63, -47, 138, 108);
      c.fillStyle = '#35444d'; c.fillRect(-65, -55, 126, 101);
      c.fillStyle = '#46545b'; c.fillRect(-59, -49, 114, 12);
      c.fillStyle = '#20323d'; c.fillRect(-57, -32, 110, 68);
      c.fillStyle = '#69827c';
      for (let i = 0; i < 3; i++) c.fillRect(-48 + i * 35, -22, 17, 9);
      if (seed % 3 === 0) { c.fillStyle = '#997d55'; c.fillRect(-42, 17, 76, 4); }
    } else {
      ellipse(c, 10, 19, 60, 48, '#1c3430');
      for (let j = 0; j < 5; j++) {
        const a = j / 5 * TAU;
        ellipse(c, Math.cos(a) * 26, Math.sin(a) * 29, 31, 37, j % 2 ? '#3b634b' : '#4d7252');
      }
      ellipse(c, -9, -12, 28, 28, '#63815b');
      line(c, [[-13, 26], [-7, 5], [14, -15]], '#81906b', 3);
    }
    c.restore();
  }
  return { model, make };
});
