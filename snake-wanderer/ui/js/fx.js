// Эффекты: искры, расходящиеся кольца, вспышка замкнутого кольца, молнии.
import * as THREE from 'three';

const CAP = 360;
const _m = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3();

export class Fx {
  constructor(scene) {
    this.ps = [];
    // Искры чуть ярче белого — их подхватывает свечение.
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.17), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2) }), CAP);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.mesh);

    this.rings = [];
    const rg = new THREE.RingGeometry(0.86, 1, 44); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; m.frustumCulled = false; scene.add(m);
      this.rings.push({ m, t: 0, dur: 1, r0: 0, r1: 1 });
    }

    this.polyPos = new Float32Array(70 * 9);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.polyPos, 3));
    this.poly = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.poly.frustumCulled = false; this.poly.visible = false; this.polyT = 0;
    scene.add(this.poly);

    this.bolts = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 3), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      l.frustumCulled = false; l.visible = false; scene.add(l);
      this.bolts.push({ l, t: 0 });
    }
  }

  burst(x, y, z, hex, n = 8, spd = 4, size = 1, up = 3) {
    for (let i = 0; i < n; i++) {
      if (this.ps.length >= CAP) this.ps.shift();
      const a = Math.random() * Math.PI * 2, s = spd * (0.4 + Math.random() * 0.8);
      const life = 0.35 + Math.random() * 0.45;
      this.ps.push({ x, y, z, vx: Math.cos(a) * s, vy: up * (0.4 + Math.random()), vz: Math.sin(a) * s, life, max: life, size: size * (0.6 + Math.random() * 0.8), hex, rot: Math.random() * 6 });
    }
  }

  ring(x, y, z, hex, r0, r1, dur = 0.5) {
    const r = this.rings.find((q) => q.t <= 0) || this.rings[0];
    r.t = r.dur = dur; r.r0 = r0; r.r1 = r1;
    r.m.material.color.set(hex).multiplyScalar(2); r.m.position.set(x, y + 0.15, z); r.m.visible = true;
  }

  /** Вспышка внутри замкнутого кольца: веер треугольников от центра. */
  polyFlash(px, pz, n, y, hex) {
    n = Math.min(n, 69);
    let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
    cx /= n; cz /= n;
    const p = this.polyPos; let o = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      p[o++] = cx; p[o++] = y; p[o++] = cz;
      p[o++] = px[i]; p[o++] = y; p[o++] = pz[i];
      p[o++] = px[j]; p[o++] = y; p[o++] = pz[j];
    }
    this.poly.geometry.setDrawRange(0, n * 3);
    this.poly.geometry.attributes.position.needsUpdate = true;
    this.poly.material.color.set(hex).multiplyScalar(1.6);
    this.poly.visible = true; this.polyT = 0.45;
  }

  bolt(x1, y1, z1, x2, y2, z2, hex = 0xbfe6ff) {
    const b = this.bolts.find((q) => q.t <= 0) || this.bolts[0];
    const p = b.l.geometry.attributes.position.array;
    for (let i = 0; i < 7; i++) {
      const t = i / 6, j = i === 0 || i === 6 ? 0 : 0.7;
      p[i * 3] = x1 + (x2 - x1) * t + (Math.random() - 0.5) * j;
      p[i * 3 + 1] = y1 + (y2 - y1) * t + (Math.random() - 0.5) * j;
      p[i * 3 + 2] = z1 + (z2 - z1) * t + (Math.random() - 0.5) * j;
    }
    b.l.geometry.attributes.position.needsUpdate = true;
    b.l.material.color.set(hex).multiplyScalar(3); b.l.visible = true; b.t = 0.16;
  }

  update(dt) {
    let k = 0;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const s = p.size * (p.life / p.max);
      _m.makeRotationY(p.rot + p.life * 6).scale(_v.set(s, s, s));
      _m.setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(k, _m);
      this.mesh.setColorAt(k, _c.set(p.hex));
      this.ps[k++] = p;
    }
    this.ps.length = k;
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (const r of this.rings) {
      if (r.t <= 0) continue;
      r.t -= dt;
      const q = 1 - Math.max(0, r.t) / r.dur, s = r.r0 + (r.r1 - r.r0) * (1 - (1 - q) * (1 - q));
      r.m.scale.set(s, 1, s); r.m.material.opacity = (1 - q) * 0.9;
      if (r.t <= 0) r.m.visible = false;
    }
    if (this.polyT > 0) {
      this.polyT -= dt;
      this.poly.material.opacity = Math.max(0, this.polyT / 0.45) * 0.55;
      if (this.polyT <= 0) this.poly.visible = false;
    }
    for (const b of this.bolts) {
      if (b.t <= 0) continue;
      b.t -= dt; b.l.material.opacity = Math.max(0, b.t / 0.16);
      if (b.t <= 0) b.l.visible = false;
    }
  }
}
