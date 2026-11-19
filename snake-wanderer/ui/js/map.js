// Карта: круглая мини-карта в углу и большая карта на экране паузы.
// Мини-карта растёт: постоянное улучшение «Картография» и предметы забега открывают на ней всё больше.
import { heightAt, moistAt, biomeAt, B, sitesNear } from './terrain.js';
import { POI } from './poi.js';

const COL = { [B.DEEP]: '#1c4a73', [B.SHALLOW]: '#3d82ad', [B.BEACH]: '#dccb96', [B.MEADOW]: '#79bd58', [B.FOREST]: '#3e8a49', [B.SWAMP]: '#55774a', [B.ROCK]: '#8b8b86', [B.SNOW]: '#eef3f7', [B.VOLCANO]: '#5a4038', [B.CRYSTAL]: '#9fc4dc', [B.MUSHROOM]: '#8a6cc0', [B.DUNES]: '#e6c67c' };
const hex = (h) => '#' + h.toString(16).padStart(6, '0');
export const MCELL = 60;   // клетка разведанной карты
const LOOT_COL = { cache: '#ffc94a', pod: '#7fe9ff', egg: '#ffe9c0', crate: '#d9a066', chest: '#ffd24a', relic: '#ffffff' };

/** Нарисовать квадрат мира в холст: по одной пробе на блок. mask(x, z) решает, разведано ли место. */
function paint(ctx, size, cx, cz, span, step, mask) {
  const n = Math.ceil(size / step), u = span / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = cx - span / 2 + (i + 0.5) * u, z = cz - span / 2 + (j + 0.5) * u;
    if (mask && !mask(x, z)) { ctx.fillStyle = (i + j) % 2 ? '#0e1820' : '#101b24'; ctx.fillRect(i * step, j * step, step, step); continue; }
    const h = heightAt(x, z);
    ctx.fillStyle = COL[biomeAt(x, z, h, moistAt(x, z))];
    ctx.fillRect(i * step, j * step, step, step);
  }
}

export class MiniMap {
  constructor(game, canvas) {
    this.G = game; this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.tex = document.createElement('canvas'); this.tex.width = this.tex.height = 72;
    this.tcx = 1e9; this.tcz = 1e9; this.tspan = 0; this.t = 0; this.markT = 0; this.compass = null;
  }

  /** Ступень карты: постоянное улучшение + «Подзорная труба»; «Сигнальный огонь» на время открывает всё. */
  level() {
    const G = this.G, run = G.run;
    if (run.flareT > 0) return 5;
    return Math.min(5, (run.arts.bare ? 0 : G.save.perms.p_map || 0) + (run.relics.spyglass || 0));
  }
  radius() { return (48 + this.level() * 9) * (1 + (this.G.run.relics.spyglass || 0) * 0.5); }

  /** Запомнить разведанное вокруг точки — для большой карты, между забегами тоже. */
  reveal(x, z, rad) {
    const m = this.G.save.map, c0x = Math.floor((x - rad) / MCELL), c1x = Math.floor((x + rad) / MCELL), c0z = Math.floor((z - rad) / MCELL), c1z = Math.floor((z + rad) / MCELL);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) m[cx + ',' + cz] = 1;
  }
  known(x, z) { return !!this.G.save.map[Math.floor(x / MCELL) + ',' + Math.floor(z / MCELL)]; }

  update(dt) {
    const G = this.G, run = G.run, s = G.snake;
    if (!run) return;
    if (run.flareT > 0) run.flareT -= dt;
    this.markT -= dt;
    if (this.markT <= 0) {
      this.markT = 1;
      this.reveal(s.x, s.z, this.radius() * 0.8);
      // «Компас»: стрелка к ближайшей находке, которую надо открыть самой.
      this.compass = null;
      if (run.relics.compass) {
        let bd = 400;
        for (const it of G.pickups.items) {
          if (it.type !== 'cache' && it.type !== 'pod' && it.type !== 'egg' && it.type !== 'crate') continue;
          const d = Math.hypot(it.x - s.x, it.z - s.z);
          if (d < bd) { bd = d; this.compass = { x: it.x, z: it.z, icon: 'relic', hex: 0xffc94a }; }
        }
      }
    }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.11;
    const hide = !!run.arts.fog;   // артефакт «Мгла» отнимает и карту
    if (this.cv.hidden !== hide) this.cv.hidden = hide;
    if (!hide) this.draw();
  }

  draw() {
    const G = this.G, run = G.run, s = G.snake, ctx = this.ctx, W = 132, R = this.radius(), k = W / 2 / R, L = this.level(), S = this.cv.width / W;
    const span = R * 3;
    if (Math.hypot(s.x - this.tcx, s.z - this.tcz) > R * 0.4 || this.tspan !== span) {
      this.tcx = s.x; this.tcz = s.z; this.tspan = span;
      paint(this.tex.getContext('2d'), 72, s.x, s.z, span, 1);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 1, 0, 6.2832); ctx.clip();
    ctx.translate(W / 2, W / 2); ctx.rotate(G.camYaw);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.tex, (this.tcx - span / 2 - s.x) * k, (this.tcz - span / 2 - s.z) * k, span * k, span * k);
    ctx.fillStyle = 'rgba(8, 14, 20, .16)'; ctx.fillRect(-W, -W, W * 2, W * 2);

    const edge = W / 2 - 7;
    const dot = (wx, wz, col, r, clamp, ring) => {
      let x = (wx - s.x) * k, y = (wz - s.z) * k;
      const d = Math.hypot(x, y);
      if (d > edge) { if (!clamp) return; x = (x / d) * edge; y = (y / d) * edge; }
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = col; ctx.fill();
      if (ring) { ctx.lineWidth = 1.5; ctx.strokeStyle = ring; ctx.stroke(); }
    };
    for (const w of G.save.waypoints) dot(w.x, w.z, '#6fe3ff', 3, false, '#0f1a22');
    if (L >= 1) for (const q of G.pois.sites || []) {
      const open = G.pois.isOpen(q);
      const far = L >= 5 && open && (q.type === 'pool' || q.type === 'ruins' || q.type === 'lair');
      dot(q.x, q.z, open ? hex(POI[q.type].hex) : '#5b6670', open ? 4.2 : 2.5, far, open ? '#0f1a22' : null);
    }
    if (L >= 2) for (const it of G.pickups.items) { const c = LOOT_COL[it.type]; if (c) dot(it.x, it.z, c, 2.6, false, '#0f1a22'); }
    if (L >= 3) for (const e of G.enemies.list) if (!e.dead) dot(e.x, e.z, e.sleep ? '#9a6a70' : '#ff5a4a', e.boss || e.boss ? 5 : e.elite && L >= 4 ? 3.4 : 2, false, e.elite && L >= 4 ? '#ffd24a' : null);
    if (L >= 4) {
      for (const c of G.life.list) dot(c.x, c.z, '#c8f08a', 1.8, false);
      const ev = G.ui.event;
      if (ev) dot(ev.x, ev.z, hex(ev.hex), 4.5, true, '#ffffff');
    }
    if (this.compass) dot(this.compass.x, this.compass.z, '#ffc94a', 3.4, true, '#ffffff');
    if (run.pin) dot(run.pin.x, run.pin.z, '#ff7ab8', 4, true, '#ffffff');

    // Змейка: стрелка по ходу движения.
    const a = s.heading, fx = Math.sin(a), fz = Math.cos(a);
    ctx.beginPath(); ctx.moveTo(fx * 7, fz * 7); ctx.lineTo(-fx * 4 - fz * 4.5, -fz * 4 + fx * 4.5); ctx.lineTo(-fx * 4 + fz * 4.5, -fz * 4 - fx * 4.5); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#0f1a22'; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 1.5, 0, 6.2832); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(244, 239, 226, .3)'; ctx.stroke();
  }

  /** Большая карта: север сверху, показано только разведанное. Возвращает функцию «точка холста → точка мира». */
  drawBig(cv, radius) {
    const G = this.G, run = G.run, s = G.snake, ctx = cv.getContext('2d'), W = cv.width, k = W / (radius * 2);
    paint(ctx, W, s.x, s.z, radius * 2, 4, (x, z) => this.known(x, z));
    const P = (wx, wz) => [(wx - s.x) * k + W / 2, (wz - s.z) * k + W / 2];
    const mark = (wx, wz, col, r, ring = '#0f1a22') => { const [x, y] = P(wx, wz); if (x < 4 || y < 4 || x > W - 4 || y > W - 4) return; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ring; ctx.stroke(); };
    for (const q of sitesNear(s.x, s.z, radius * 1.42)) {
      if (!this.known(q.x, q.z)) continue;
      const open = G.pois.isOpen(q);
      mark(q.x, q.z, open ? hex(POI[q.type].hex) : '#5b6670', open ? 6 : 4);
    }
    mark(G.home.x, G.home.z, '#ffffff', 5);
    for (const w of G.save.waypoints) mark(w.x, w.z, '#6fe3ff', 5);
    if (G.save.grave) mark(G.save.grave.x, G.save.grave.z, '#b9aaff', 5);
    if (run.pin) mark(run.pin.x, run.pin.z, '#ff7ab8', 7, '#ffffff');
    const [x, y] = P(s.x, s.z), a = s.heading, fx = Math.sin(a), fz = Math.cos(a);
    ctx.beginPath(); ctx.moveTo(x + fx * 11, y + fz * 11); ctx.lineTo(x - fx * 6 - fz * 7, y - fz * 6 + fx * 7); ctx.lineTo(x - fx * 6 + fz * 7, y - fz * 6 - fx * 7); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#0f1a22'; ctx.stroke();
    return (px, py) => ({ x: s.x + (px - W / 2) / k, z: s.z + (py - W / 2) / k });
  }
}
