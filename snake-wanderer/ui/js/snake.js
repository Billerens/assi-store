// Герой: голова и цепочка звеньев, повторяющая след движения.
import * as THREE from 'three';
import { heightAt, walkable } from './terrain.js';
import { angDiff, clamp, lerp, damp } from './util.js';

export const MAXSEG = 64, SP = 0.56;
const TR_STEP = 0.16, TR_MAX = 280;
const _m = new THREE.Matrix4(), _c = new THREE.Color(), _a = new THREE.Color(), _b = new THREE.Color(), _t = new THREE.Color();

export class Snake {
  constructor(scene) {
    this.x = 0; this.z = 0; this.y = 0; this.heading = 0; this.v = 0;
    this.len = 8; this.n = 0; this.dashT = 0; this.biteAnim = 0; this.hurtT = 0; this.phase = 0; this.moved = 0;
    this.sx = new Float32Array(MAXSEG); this.sz = new Float32Array(MAXSEG); this.sy = new Float32Array(MAXSEG);
    this.trx = []; this.trz = [];
    this.skinA = '#8edb5c'; this.skinB = '#2f8a4c'; this.colN = -1;

    this.body = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 9, 7), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXSEG);
    this.body.frustumCulled = false; this.body.count = 0;
    const sg = new THREE.CircleGeometry(0.52, 12); sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }), MAXSEG + 1);
    this.shadow.frustumCulled = false; this.shadow.count = 0; this.shadow.renderOrder = 2;

    this.head = new THREE.Group();
    this.headMat = new THREE.MeshLambertMaterial({ color: 0x8edb5c });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 9), this.headMat);
    skull.scale.set(1, 0.82, 1.22);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x1b1b22 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), white); eye.position.set(sx * 0.24, 0.2, 0.3);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), black); pupil.position.set(sx * 0.27, 0.23, 0.4);
      this.head.add(eye, pupil);
    }
    this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.5), new THREE.MeshBasicMaterial({ color: 0xff4d6a }));
    this.tongue.position.set(0, -0.08, 0.7);
    this.head.add(skull, this.tongue);
    this.body.castShadow = true; skull.castShadow = true;
    // Силуэт: там, где змейку закрывает дерево или скала, она просвечивает контуром.
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthFunc: THREE.GreaterDepth, depthWrite: false });
    this.ghost = new THREE.InstancedMesh(this.body.geometry, this.ghostMat, MAXSEG);
    this.ghost.instanceMatrix = this.body.instanceMatrix;
    this.ghost.frustumCulled = false; this.ghost.count = 0; this.ghost.renderOrder = 6;
    const skullGhost = new THREE.Mesh(skull.geometry, this.ghostMat);
    skullGhost.scale.copy(skull.scale); skullGhost.renderOrder = 6;
    this.head.add(skullGhost);
    scene.add(this.ghost);

    // Облик от предметов: всё создано заранее и включается, когда предмет подобран.
    this.look = {}; this.scale = 1;
    const bone = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    const gold = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd24a).multiplyScalar(1.15) });
    const M3 = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); return m; };
    const grp = (...ms) => { const g = new THREE.Group(); g.add(...ms); g.visible = false; this.head.add(g); return g; };
    const cone = (r, h) => new THREE.ConeGeometry(r, h, 5);
    const wingMat = new THREE.MeshLambertMaterial({ color: 0xeaf6ff, side: THREE.DoubleSide });
    this.wingR = M3(new THREE.BoxGeometry(0.85, 0.04, 0.45).translate(0.42, 0, 0), wingMat, 0.22, 0.28, -0.38);
    this.wingL = M3(new THREE.BoxGeometry(0.85, 0.04, 0.45).translate(-0.42, 0, 0), wingMat, -0.22, 0.28, -0.38);
    const skull2 = M3(skull.geometry, this.headMat, 0.66, 0.02, -0.12); skull2.scale.set(0.62, 0.52, 0.76);
    this.att = {
      horns: grp(M3(cone(0.11, 0.6), bone, 0.3, 0.52, 0.02, -0.35, -0.55), M3(cone(0.11, 0.6), bone, -0.3, 0.52, 0.02, -0.35, 0.55)),
      halo: grp(M3(new THREE.TorusGeometry(0.4, 0.045, 6, 20), gold, 0, 0.84, 0, Math.PI / 2)),
      crown: grp(M3(new THREE.CylinderGeometry(0.27, 0.23, 0.14, 8, 1, true), gold, 0, 0.47, -0.02), ...[0, 1, 2, 3, 4].map((i) => M3(cone(0.06, 0.2), gold, Math.sin(i * 1.257) * 0.25, 0.62, Math.cos(i * 1.257) * 0.25 - 0.02))),
      eye3: grp(M3(new THREE.SphereGeometry(0.11, 8, 6), white, 0, 0.4, 0.34), M3(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9a4cff).multiplyScalar(1.2) }), 0, 0.43, 0.43)),
      fangs: grp(M3(cone(0.06, 0.32), bone, 0.15, -0.2, 0.5, Math.PI), M3(cone(0.06, 0.32), bone, -0.15, -0.2, 0.5, Math.PI)),
      wings: grp(this.wingR, this.wingL),
      twin: grp(skull2, M3(new THREE.SphereGeometry(0.09, 8, 6), white, 0.56, 0.16, 0.12), M3(new THREE.SphereGeometry(0.09, 8, 6), white, 0.78, 0.16, 0.12)),
    };
    this.spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.13, 0.52, 4), bone, MAXSEG);
    this.spikes.frustumCulled = false; this.spikes.count = 0; this.spikes.visible = false;
    const glow = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
    this.tails = {
      flame: [new THREE.ConeGeometry(0.24, 0.8, 6), glow(0xff8a3d, 2.4)],
      ice: [new THREE.OctahedronGeometry(0.32), glow(0x8fe3ff, 1.8)],
      sting: [new THREE.ConeGeometry(0.15, 0.8, 5), new THREE.MeshLambertMaterial({ color: 0x8a3cc0 })],
      rattle: [new THREE.IcosahedronGeometry(0.24, 0), bone],
    };
    this.tailTip = new THREE.Mesh(this.tails.flame[0], this.tails.flame[1]);
    this.tailTip.visible = false;
    scene.add(this.spikes, this.tailTip);
    this.shadow.visible = false;   // кружки-тени нужны, только когда настоящие тени выключены
    scene.add(this.body, this.shadow, this.head);

    // Силуэт не должен проступать сквозь саму змейку. Её детали помечают свои видимые точки
    // в трафарете, а силуэт рисуется только там, где такой пометки нет, — то есть за чужими предметами.
    const own = new Set([this.body.material, this.spikes.material, this.tailTip.material]);
    this.head.traverse((o) => { if (o.material && o.material !== this.ghostMat) own.add(o.material); });
    for (const k in this.tails) own.add(this.tails[k][1]);
    for (const m of own) { m.stencilWrite = true; m.stencilRef = 1; m.stencilZPass = THREE.ReplaceStencilOp; }
    this.ghostMat.stencilWrite = true; this.ghostMat.stencilRef = 1; this.ghostMat.stencilFunc = THREE.NotEqualStencilFunc;
  }

  /** Запасные тени-кружки — для слабых устройств, где настоящие тени отключены. */
  setBlob(on) { this.blob = on; this.shadow.visible = on && this.body.visible; }

  setSkin(skin) { this.skinA = skin.a; this.skinB = skin.b; this.ghostMat.color.set(skin.a); this.setLook(this.look); }

  /** Облик по предметам: что надето на голову, чем заканчивается хвост, каким цветом отливает тело. */
  setLook(L) {
    this.look = L; this.colN = -1; this.scale = L.scale || 1;
    for (const k in this.att) this.att[k].visible = !!L[k];
    this.spikes.visible = !!L.spikes;
    const t = L.tail && this.tails[L.tail];
    this.tailTip.visible = !!t;
    if (t) { this.tailTip.geometry = t[0]; this.tailTip.material = t[1]; }
    this.headMat.color.set(this.skinA);
    if (L.tint) this.headMat.color.lerp(_a.set(L.tint), 0.4);
    const em = this.body.material.emissive;
    if (L.lunar) em.set(0x3a2f8a); else if (L.tint) em.set(L.tint).multiplyScalar(0.16); else em.set(0x000000);
  }

  reset(x, z, heading, len) {
    this.x = x; this.z = z; this.heading = heading; this.len = len; this.v = 0; this.dashT = 0; this.hurtT = 0; this.moved = 0;
    this.trx.length = 0; this.trz.length = 0;
    for (let k = TR_MAX; k >= 1; k--) { this.trx.push(x - Math.sin(heading) * k * TR_STEP); this.trz.push(z - Math.cos(heading) * k * TR_STEP); }
    this.y = heightAt(x, z);
    this.place(0);
  }

  /** dirX/dirZ — куда хочет игрок (в мире), mag — сила наклона джойстика 0..1. */
  update(dt, dirX, dirZ, mag, speed, turnMul = 1) {
    const dashing = this.dashT > 0;
    if (mag > 0.08) {
      const d = angDiff(this.heading, Math.atan2(dirX, dirZ)), turn = (dashing ? 2.2 : 5.4) * turnMul * dt;
      this.heading += clamp(d, -turn, turn);
    }
    if (dashing) { this.dashT -= dt; this.v = speed * 2.9; }
    else if (mag > 0.08) this.v = lerp(this.v, speed * (0.35 + 0.65 * Math.min(1, mag)), damp(9, dt));
    else this.v = lerp(this.v, 0, damp(7, dt));

    const step = this.v * dt;
    this.moved = 0;
    if (step > 1e-4) {
      const nx = this.x + Math.sin(this.heading) * step, nz = this.z + Math.cos(this.heading) * step;
      const ox = this.x, oz = this.z;
      const ok = (x, z) => walkable(x, z) && !(this.blocked && this.blocked(x, z));   // вода и стены лабиринтов
      if (ok(nx, nz)) { this.x = nx; this.z = nz; }
      else if (ok(nx, this.z)) this.x = nx;
      else if (ok(this.x, nz)) this.z = nz;
      else this.v = 0;
      this.moved = Math.hypot(this.x - ox, this.z - oz);
      const li = this.trx.length - 1;
      if (Math.hypot(this.x - this.trx[li], this.z - this.trz[li]) > TR_STEP) {
        this.trx.push(this.x); this.trz.push(this.z);
        if (this.trx.length > TR_MAX) { this.trx.shift(); this.trz.shift(); }
      }
    }
    this.y = heightAt(this.x, this.z);
    this.phase += dt * (2 + this.v * 1.6);
    if (this.biteAnim > 0) this.biteAnim -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    this.place(dt);
  }

  place() {
    const n = (this.n = Math.min(MAXSEG, Math.max(1, Math.ceil(this.len))));
    const frac = this.len - Math.floor(this.len);
    const sc = this.scale, look = this.look;
    let idx = this.trx.length - 1, ax = this.x, az = this.z, acc = 0, need = SP * sc, spk = 0;
    for (let i = 0; i < n; i++) {
      let px = ax, pz = az;
      while (idx >= 0) {
        const bx = this.trx[idx], bz = this.trz[idx], seg = Math.hypot(bx - ax, bz - az);
        if (acc + seg >= need) {
          const t = (need - acc) / (seg || 1);
          px = ax + (bx - ax) * t; pz = az + (bz - az) * t;
          break;
        }
        acc += seg; ax = bx; az = bz; px = ax; pz = az; idx--;
      }
      ax = px; az = pz; acc = need; need += SP * sc;
      this.sx[i] = px; this.sz[i] = pz;
      const g = heightAt(px, pz);
      let s = (i > n - 5 ? lerp(1, 0.5, (i - (n - 5)) / 4) : 1) * sc;
      if (i === n - 1 && frac > 0.01 && this.len < MAXSEG) s *= 0.35 + 0.65 * frac;
      const bob = Math.sin(this.phase - i * 0.75) * 0.05 * Math.min(1, this.v / 3);
      this.sy[i] = g + 0.34 * s + bob;
      _m.makeScale(s, s * 0.84, s); _m.setPosition(px, this.sy[i], pz);
      this.body.setMatrixAt(i, _m);
      _m.makeScale(s * 1.05, 1, s * 1.05); _m.setPosition(px, g + 0.05, pz);
      this.shadow.setMatrixAt(i, _m);
      if (look.spikes && i % 2 === 0) { _m.makeScale(s, s, s); _m.setPosition(px, this.sy[i] + 0.44 * s, pz); this.spikes.setMatrixAt(spk++, _m); }
    }
    _m.makeScale(1.25, 1, 1.25); _m.setPosition(this.x, this.y + 0.05, this.z);
    this.shadow.setMatrixAt(n, _m);
    this.body.count = n; this.shadow.count = n + 1; this.ghost.count = n;
    this.spikes.count = spk; this.spikes.instanceMatrix.needsUpdate = true;
    this.body.instanceMatrix.needsUpdate = true; this.shadow.instanceMatrix.needsUpdate = true;

    if (this.colN !== n) {
      this.colN = n; _a.set(this.skinA); _b.set(this.skinB);
      for (let i = 0; i < n; i++) {
        const stripe = i % 3 === 2 ? 0.86 : 1;
        const along = n > 1 ? i / (n - 1) : 0;
        _c.copy(_a).lerp(_b, along).multiplyScalar(stripe);
        if (look.tint) _c.lerp(_t.set(look.tint), 0.15 + 0.45 * along);          // стихия проступает к хвосту
        if (look.stripes && i % 6 === 5) _c.set(0xfff3a0).multiplyScalar(1.7);   // «Хор чешуи»: стреляющие звенья светятся
        this.body.setColorAt(i, _c);
      }
      this.body.instanceColor.needsUpdate = true;
    }

    const lunge = this.biteAnim > 0 ? Math.sin((this.biteAnim / 0.14) * Math.PI) * 0.28 : 0;
    this.head.position.set(this.x + Math.sin(this.heading) * lunge, this.y + 0.46 * sc, this.z + Math.cos(this.heading) * lunge);
    this.head.rotation.y = this.heading;
    this.head.scale.setScalar((1 + lunge * 0.5) * sc * (look.big ? 1.25 : 1));
    this.tongue.scale.z = 0.3 + Math.max(0, Math.sin(this.phase * 1.7)) * 0.9;
    this.headMat.emissive.setRGB(this.hurtT > 0 ? 0.8 * (this.hurtT / 0.3) : 0, 0, 0);
    if (look.wings) { const f = 0.25 + Math.sin(this.phase * 2.2) * 0.45; this.wingR.rotation.z = f; this.wingL.rotation.z = -f; }
    if (look.halo) this.att.halo.rotation.y = this.phase * 0.2;
    if (this.tailTip.visible) {
      const li = n - 1, fl = look.tail === 'flame' ? 0.8 + Math.abs(Math.sin(this.phase * 3)) * 0.5 : 1;
      this.tailTip.position.set(this.sx[li], this.sy[li] + 0.32 * sc * fl, this.sz[li]);
      this.tailTip.scale.set(sc, sc * fl, sc);
      this.tailTip.rotation.y = this.phase * (look.tail === 'ice' ? 0.6 : 0);
    }
  }

  /** Замкнулось ли кольцо: голова коснулась далёкого звена. Возвращает его номер или -1. */
  loopIndex() {
    if (this.v < 1.2) return -1;
    for (let i = this.n - 1; i >= 9; i--) {
      const dx = this.sx[i] - this.x, dz = this.sz[i] - this.z;
      if (dx * dx + dz * dz < 0.7 * this.scale * this.scale) return i;
    }
    return -1;
  }

  /** Расстояние от точки до ближайшего звена (для хлыста и шипов). */
  nearBody(x, z, r) {
    const r2 = r * r;
    for (let i = 0; i < this.n; i += 2) {
      const dx = this.sx[i] - x, dz = this.sz[i] - z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  setVisible(v) { this.body.visible = v; this.shadow.visible = v && !!this.blob; this.head.visible = v; }
}
