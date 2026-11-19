// Плевки змейки: дальняя атака. Предметы меняют её — веер, наведение, пробивание, рикошет, разделение, взрыв.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

const CAP = 200, _m = new THREE.Matrix4(), _c = new THREE.Color();
const HUES = { fire: 0xff8a3d, ice: 0x8fe3ff, venom: 0xc59dff, storm: 0xffe45c, base: 0xc9f27a };

export class Shots {
  constructor(game, scene) {
    this.G = game; this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.7, 1.7) }), CAP);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.mesh);
  }

  clear() { this.list.length = 0; this.mesh.count = 0; }

  fire(x, z, ang, dmg, o = {}) {
    if (this.list.length >= CAP) return;
    const st = this.G.stats, sn = st.sniper || 0, sp = (o.speed || 15) * (1 + sn * 0.2);
    this.list.push({
      x, z, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, life: (o.life || 0.85) * (1 + sn * 0.4), dmg, x0: x, z0: z, back: false, canBack: !o.life, size: (o.size || 1) * st.shotSize,
      pierce: o.pierce ?? st.pierce, bounce: o.bounce ?? st.bounce, split: o.split ?? st.split, hit: o.hit || [],
      hue: HUES[this.G.style.el || 'base'],
    });
  }

  /** Залп из точки в сторону цели. Число плевков и разлёт берутся из характеристик. */
  volley(x, z, tx, tz, dmg, o, extra = 0) {
    const st = this.G.stats, a = Math.atan2(tx - x, tz - z), n = st.shots + extra;
    for (let i = 0; i < n; i++) this.fire(x, z, st.wild ? a + (Math.random() - 0.5) * 2.2 : a + (i - (n - 1) / 2) * 0.2, dmg, o);
  }

  onHit(q, e) {
    const G = this.G, st = G.stats;
    q.hit.push(e);
    G.fx.burst(q.x, e.y + e.r, q.z, q.hue, 3, 3, 0.7, 2);
    if (st.acid) { e.acid = Math.min(5, e.acid + st.acid); e.acidT = 4; }   // «Кислота»
    const far = st.sniper ? 1 + Math.min(1, Math.hypot(q.x - q.x0, q.z - q.z0) / 12) * 0.6 * st.sniper : 1;   // «Дальнобой»
    G.hit(e, q.dmg * far, 'spit', q.vx * 0.12, q.vz * 0.12);
    if (st.boom) {
      G.fx.ring(q.x, e.y, q.z, 0xffb066, 0.3, st.boom, 0.22);
      G.enemies.each(q.x, q.z, st.boom, (o) => { if (o !== e) G.hit(o, q.dmg * 0.6, 'boom'); });
    }
    if (q.split > 0) {
      const a = Math.atan2(q.vx, q.vz);
      for (const d of [-0.7, 0.7]) this.fire(q.x, q.z, a + d, q.dmg * 0.5, { size: (q.size / st.shotSize) * 0.7, split: q.split - 1, pierce: 0, bounce: 0, hit: [e], life: 0.5 });
    }
    if (q.bounce > 0) {
      const t = G.enemies.nearest(q.x, q.z, 7, q.hit);
      if (t) {
        const sp = Math.hypot(q.vx, q.vz), a = Math.atan2(t.x - q.x, t.z - q.z);
        q.vx = Math.sin(a) * sp; q.vz = Math.cos(a) * sp; q.bounce--; q.life = Math.max(q.life, 0.6);
        return true;
      }
    }
    if (q.pierce > 0) { q.pierce--; return true; }
    return false;
  }

  update(dt) {
    const G = this.G, E = G.enemies, st = G.stats, L = this.list;
    let k = 0;
    for (let i = 0; i < L.length; i++) {
      const q = L[i];
      q.life -= dt;
      if (q.life <= 0) {
        // «Бумеранг»: долетев, плевок разворачивается к змейке.
        if (st.boomerang && q.canBack && !q.back) { q.back = true; q.life = 1.3; q.hit = []; q.dmg *= 0.6 + 0.4 * st.boomerang; } else continue;
      }
      if (q.back) {
        const bx = G.snake.x - q.x, bz = G.snake.z - q.z, bd = Math.hypot(bx, bz);
        if (bd < 0.9) continue;
        const sp = Math.max(17, Math.hypot(q.vx, q.vz));
        q.vx = (bx / bd) * sp; q.vz = (bz / bd) * sp;
      } else if (st.homing) {
        const t = E.nearest(q.x, q.z, 6, q.hit);
        if (t) {
          const sp = Math.hypot(q.vx, q.vz), cur = Math.atan2(q.vx, q.vz);
          let d = Math.atan2(t.x - q.x, t.z - q.z) - cur;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          const mt = 4.5 * st.homing * dt, a = cur + Math.max(-mt, Math.min(mt, d));
          q.vx = Math.sin(a) * sp; q.vz = Math.cos(a) * sp;
        }
      }
      q.x += q.vx * dt; q.z += q.vz * dt;
      let alive = true;
      for (const e of E.list) {
        if (e.dead || e.hidden || q.hit.includes(e)) continue;
        const dx = e.x - q.x, dz = e.z - q.z, rr = e.r + 0.24 * q.size;
        if (dx * dx + dz * dz > rr * rr) continue;
        alive = this.onHit(q, e);
        if (q.back) alive = true;   // на обратном пути пробивает всех
        else if (!alive && st.boomerang && q.canBack) { alive = true; q.back = true; q.life = 1.3; q.hit = [e]; q.dmg *= 0.6 + 0.4 * st.boomerang; }
        break;
      }
      if (!alive) continue;
      _m.makeScale(q.size, q.size, q.size); _m.setPosition(q.x, heightAt(q.x, q.z) + 0.75, q.z);
      this.mesh.setMatrixAt(k, _m); this.mesh.setColorAt(k, _c.set(q.hue));
      L[k++] = q;
    }
    L.length = k;
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
