// Мирная живность: олени, зайцы, лисы, птицы и ночные светлячки.
// Звери пасутся, настораживаются, убегают и устают; их можно поймать — догнать или обвести кольцом.
// Птицы собираются над тайниками: стая в небе — подсказка, куда стоит сходить.
import * as THREE from 'three';
import { heightAt, moistAt, biomeAt, B } from './terrain.js';
import { build, part, M, G as P, vcMat } from './mesh.js';
import { rand, angDiff, clamp, pickW, lerp, damp, pointInPoly } from './util.js';

const MAT = vcMat();
const legGeo = (hex, h) => build([part(P.box(0.12, h, 0.12), hex, M(0, -h / 2, 0))]);

/** Чертежи: тело, голова (качается у шеи), ноги (у бедра), хвост. Координаты частей — от своих шарниров. */
const KIND = {
  deer: {
    body: build([part(P.box(0.6, 0.6, 1.3), '#a8774c', M(0, 1.05, 0))]),
    head: build([
      part(P.box(0.3, 0.7, 0.3), '#a8774c', M(0, 0.3, 0.1, 1, [0.5, 0, 0])), part(P.box(0.34, 0.34, 0.5), '#b98a5e', M(0, 0.66, 0.36)),
      part(P.cone(0.05, 0.5, 4), '#e9dcc4', M(0.14, 1.02, 0.26, 1, [0, 0, -0.4])), part(P.cone(0.05, 0.5, 4), '#e9dcc4', M(-0.14, 1.02, 0.26, 1, [0, 0, 0.4])),
    ]),
    neck: [0, 1.2, 0.5], leg: legGeo('#8a5f3b', 0.8), hips: [[-0.2, 0.8, 0.5], [0.2, 0.8, 0.5], [-0.2, 0.8, -0.5], [0.2, 0.8, -0.5]],
    tail: build([part(P.box(0.14, 0.14, 0.12), '#f4ede0', M(0, 0, -0.05))]), rump: [0, 1.18, -0.66],
    walk: 1.6, run: 7.6, hop: 0.12, graze: 1.05,
  },
  fox: {
    body: build([part(P.box(0.4, 0.4, 0.95), '#e07a2f', M(0, 0.6, 0))]),
    head: build([
      part(P.box(0.36, 0.34, 0.4), '#e88b3e', M(0, 0.12, 0.16)), part(P.box(0.16, 0.12, 0.2), '#f6e7d8', M(0, 0.04, 0.42)),
      part(P.cone(0.1, 0.22, 4), '#3b2a22', M(0.12, 0.38, 0.12)), part(P.cone(0.1, 0.22, 4), '#3b2a22', M(-0.12, 0.38, 0.12)),
    ]),
    neck: [0, 0.7, 0.44], leg: legGeo('#3b2a22', 0.42), hips: [[-0.14, 0.42, 0.35], [0.14, 0.42, 0.35], [-0.14, 0.42, -0.35], [0.14, 0.42, -0.35]],
    tail: build([part(P.cone(0.2, 0.8, 5), '#e07a2f', M(0, 0.02, -0.36, 1, [-1.2, 0, 0])), part(P.ico(0.13), '#ffffff', M(0, 0.27, -0.68))]), rump: [0, 0.68, -0.44],
    walk: 2, run: 7.9, hop: 0.1, graze: 0.7,
  },
  hare: {
    body: build([part(P.ico(0.3), '#b9b2a6', M(0, 0.3, 0, [1, 0.9, 1.3]))]),
    head: build([
      part(P.ico(0.2), '#c7c1b6', M(0, 0.1, 0.12)),
      part(P.box(0.07, 0.4, 0.1), '#c7c1b6', M(0.08, 0.42, 0.1)), part(P.box(0.07, 0.4, 0.1), '#c7c1b6', M(-0.08, 0.42, 0.1)),
    ]),
    neck: [0, 0.4, 0.2], leg: null, hips: [],
    tail: build([part(P.ico(0.09), '#ffffff', M(0, 0, 0))]), rump: [0, 0.32, -0.4],
    walk: 2.2, run: 8.2, hop: 0.42, graze: 0.5,
  },
};
const BIRD = build([
  part(P.box(0.16, 0.12, 0.5), '#3c4654', M(0, 0, 0)),
  part(P.box(0.7, 0.04, 0.26), '#56637a', M(0.42, 0, 0)), part(P.box(0.7, 0.04, 0.26), '#56637a', M(-0.42, 0, 0)),
]);
const LOOT = { cache: 1, pod: 1, egg: 1, crate: 1 };

export class Life {
  constructor(game, scene) {
    this.G = game; this.scene = scene; this.list = []; this.spT = 0; this.birds = []; this.bx = null; this.bz = 0; this.flock = 0;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(BIRD, MAT); scene.add(m);
      this.birds.push({ m, a: rand(0, 6.28), r: rand(10, 26), h: rand(13, 20), sp: rand(0.25, 0.5) * (Math.random() < 0.5 ? -1 : 1), ox: rand(-15, 15), oz: rand(-15, 15), t: rand(0, 6) });
    }
    const n = 70, pos = new Float32Array(n * 3);
    this.flySeed = Array.from({ length: n }, () => [rand(-22, 22), rand(0.4, 2.6), rand(-22, 22), rand(0, 6.28), rand(0.4, 1.2)]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.flies = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe9ff8a, size: 0.11, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flies.frustumCulled = false; scene.add(this.flies);
  }

  make(type, x, z) {
    const K = KIND[type], g = new THREE.Group();
    const add = (geo, p) => { const m = new THREE.Mesh(geo, MAT); m.castShadow = true; if (p) m.position.set(p[0], p[1], p[2]); g.add(m); return m; };
    add(K.body);
    const head = add(K.head, K.neck), tail = add(K.tail, K.rump), legs = K.hips.map((h) => add(K.leg, h));
    this.scene.add(g);
    return { type, g, head, tail, legs, x, z, dir: rand(0, 6.28), state: 'idle', t: rand(1, 4), ph: rand(0, 6), sp: 0, stam: 0, calm: 0, tx: 0, tz: 0, nod: 0 };
  }

  remove(c) { this.scene.remove(c.g); const i = this.list.indexOf(c); if (i >= 0) this.list.splice(i, 1); }
  clear() { for (const c of this.list) this.scene.remove(c.g); this.list.length = 0; }

  /** Замкнутое кольцо ловит всех зверей внутри. */
  inLoop(px, pz, n) {
    for (const c of this.list.slice()) if (pointInPoly(c.x, c.z, px, pz, n)) { this.G.onCatch(c.type, c.x, c.z); this.remove(c); }
  }

  update(dt, time, night) {
    const G = this.G, s = G.snake, px = s.x, pz = s.z, playing = G.state === 'play';
    this.spT -= dt;
    if (this.spT <= 0 && this.list.length < 8) {
      this.spT = 1.5;
      const a = rand(0, 6.28), r = rand(34, 55), x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r, h = heightAt(x, z);
      const b = biomeAt(x, z, h, moistAt(x, z));
      if (h > 1.2 && (b === B.FOREST || b === B.MEADOW)) {
        const type = pickW(b === B.FOREST ? [['deer', 5], ['fox', 3], ['hare', 2]] : [['hare', 5], ['deer', 2], ['fox', 2]]);
        this.list.push(this.make(type, x, z));
      }
    }
    // Быструю змейку слышно издалека, медленную звери подпускают близко.
    const notice = s.v > 3 ? 10 : 4.2;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i], K = KIND[c.type], dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz);
      if (d > 80) { this.remove(c); continue; }
      if (playing && d < 1.05) { G.onCatch(c.type, c.x, c.z); this.remove(c); continue; }
      let scared = false;
      if (playing && d < notice) { scared = true; c.tx = dx; c.tz = dz; }
      else { const e = G.enemies.nearest(c.x, c.z, 6); if (e && !e.sleep) { scared = true; c.tx = c.x - e.x; c.tz = c.z - e.z; } }

      let want = c.dir, target = 0, nod = 0;
      if (c.state === 'alert') {   // заметил: замер, поднял голову — и через мгновение сорвётся
        nod = -0.4; c.t -= dt;
        if (c.t <= 0) { c.state = 'flee'; c.stam = 3.4; c.calm = 0; }
      } else if (c.state === 'flee') {
        want = Math.atan2(c.tx, c.tz); target = K.run; nod = -0.15;
        c.stam -= dt; c.calm = scared ? 0 : c.calm + dt;
        if (c.stam <= 0) { c.state = 'tired'; c.t = 2.6; } else if (c.calm > 1.4) { c.state = 'idle'; c.t = rand(1, 3); }
      } else if (c.state === 'tired') {   // выдохся: еле бредёт — самое время ловить
        want = Math.atan2(c.tx, c.tz); target = 2.4; nod = 0.35 + Math.sin(time * 9) * 0.08;
        c.t -= dt;
        if (c.t <= 0) { if (scared) { c.state = 'flee'; c.stam = 3.4; } else { c.state = 'idle'; c.t = rand(1, 3); } }
      } else {
        if (scared) { c.state = 'alert'; c.t = 0.4; }
        else {
          c.t -= dt;
          if (c.t <= 0) {
            c.state = c.state === 'walk' ? (Math.random() < 0.6 ? 'graze' : 'idle') : 'walk';
            c.t = c.state === 'walk' ? rand(2, 5) : rand(2, 5.5);
            if (c.state === 'walk') c.dir = rand(0, 6.28);
          }
          if (c.state === 'walk') target = K.walk;
          else if (c.state === 'graze') nod = K.graze + Math.sin(time * 5 + c.ph) * 0.06;
          else nod = Math.sin(time * 0.8 + c.ph) * 0.08;
        }
      }
      c.sp = lerp(c.sp, target, damp(c.state === 'flee' ? 5 : 3.5, dt));
      c.dir += clamp(angDiff(c.dir, want), -5 * dt, 5 * dt);
      const nx = c.x + Math.sin(c.dir) * c.sp * dt, nz = c.z + Math.cos(c.dir) * c.sp * dt;
      if (heightAt(nx, nz) > 0.6) { c.x = nx; c.z = nz; } else { c.dir += 2.5; c.tx = Math.sin(c.dir); c.tz = Math.cos(c.dir); }

      // Движения: шаг ногами по диагонали, подскок, кивок головой, хвост.
      c.ph += dt * (1.2 + c.sp * 2.3);
      const gait = clamp(c.sp / 2.5, 0, 1), swing = gait * (c.sp > 4 ? 0.95 : 0.55);
      for (let k = 0; k < c.legs.length; k++) c.legs[k].rotation.x = Math.sin(c.ph + (k === 0 || k === 3 ? 0 : Math.PI)) * swing;
      const hop = Math.abs(Math.sin(c.ph * (c.type === 'hare' ? 0.5 : 1))) * K.hop * gait;
      c.nod = lerp(c.nod, nod, damp(7, dt));
      c.head.rotation.x = c.nod;
      c.tail.rotation.y = Math.sin(time * (c.state === 'idle' || c.state === 'graze' ? 3 : 9) + c.ph) * 0.35;
      c.g.position.set(c.x, heightAt(c.x, c.z) + hop, c.z);
      c.g.rotation.y = c.dir;
      c.g.rotation.x = c.type === 'hare' ? -Math.cos(c.ph * 0.5) * 0.25 * gait : 0;
    }

    // Птицы: если рядом лежит тайник, кокон или яйцо — стая кружит над ним.
    let loot = null, ld = 75;
    for (const it of G.pickups.items) {
      if (!LOOT[it.type]) continue;
      const d = Math.hypot(it.x - px, it.z - pz);
      if (d < ld) { ld = d; loot = it; }
    }
    if (this.bx === null) { this.bx = px; this.bz = pz; }
    this.flock = lerp(this.flock, loot ? 1 : 0, damp(1.2, dt));
    this.bx = lerp(this.bx, loot ? loot.x : px, damp(0.9, dt)); this.bz = lerp(this.bz, loot ? loot.z : pz, damp(0.9, dt));
    for (const b of this.birds) {
      b.a += b.sp * dt * (1 + this.flock); b.t += dt;
      const k = 1 - this.flock * 0.72, x = this.bx + b.ox * k + Math.sin(b.a) * b.r * k, z = this.bz + b.oz * k + Math.cos(b.a) * b.r * k;
      b.m.position.set(x, Math.max(heightAt(x, z), 0) + b.h * (1 - this.flock * 0.35) + Math.sin(b.t * 0.7) * 1.2, z);
      b.m.rotation.y = b.a + (b.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
      b.m.scale.set(1, 1 + Math.sin(b.t * 9) * 3, 1);
      b.m.visible = night < 0.6;
    }
    this.flies.visible = night > 0.05;
    if (this.flies.visible) {
      const p = this.flies.geometry.attributes.position.array;
      this.flies.material.opacity = night * 0.9;
      for (let i = 0; i < this.flySeed.length; i++) {
        const f = this.flySeed[i];
        // Светлячки живут в клетках вокруг героя и «перетекают» вместе с ним.
        const x = px + ((((f[0] - px) % 44) + 66) % 44) - 22 + Math.sin(time * f[4] + f[3]) * 1.2;
        const z = pz + ((((f[2] - pz) % 44) + 66) % 44) - 22 + Math.cos(time * f[4] * 0.8 + f[3]) * 1.2;
        p[i * 3] = x; p[i * 3 + 1] = Math.max(heightAt(x, z), 0) + f[1] + Math.sin(time * 1.3 + f[3]) * 0.3; p[i * 3 + 2] = z;
      }
      this.flies.geometry.attributes.position.needsUpdate = true;
    }
  }
}
