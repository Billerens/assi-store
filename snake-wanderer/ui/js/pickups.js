// Добыча: ягоды, осколки, сундуки, реликвии — и то, что берут осознанно: тайники за ягоды, коконы, яйца спутников.
import * as THREE from 'three';
import { heightAt, moistAt, biomeAt, B } from './terrain.js';
import { RELIC } from './data.js';
import { build, part, M, G as P, vcMat } from './mesh.js';
import { rand, pickW } from './util.js';
import { ACTIVE, ACTIVES } from './data.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const DENS = { [B.BEACH]: 0.4, [B.MEADOW]: 1, [B.FOREST]: 1, [B.SWAMP]: 0.7, [B.ROCK]: 0.3, [B.SNOW]: 0.15, [B.VOLCANO]: 0.3, [B.CRYSTAL]: 0.18, [B.MUSHROOM]: 1.15, [B.DUNES]: 0.22 };
export const RAR_HEX = [0xdfe8ee, 0x6fd6ff, 0xffc94a, 0x9d8cff];
const MANUAL = { cache: 1, pod: 1, egg: 1, crate: 1, grave: 1 };
const CACHE = [
  { name: 'Малый тайник', hint: 'Внутри реликвия — скорее всего обычная.', price: 12, w: [[0, 82], [1, 17], [2, 1]], scale: 1.15 },
  { name: 'Большой тайник', hint: 'Внутри реликвия — скорее всего редкая.', price: 28, w: [[0, 22], [1, 63], [2, 15]], scale: 1.45 },
  { name: 'Древний тайник', hint: 'Внутри редкая или легендарная реликвия.', price: 60, w: [[1, 45], [2, 55]], scale: 1.8 },
];

export class Pickups {
  constructor(game, scene) {
    this.G = game; this.scene = scene; this.items = []; this.near = null; this.refT = 0;
    const inst = (geo, color, emissive, k, cap) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: k }), cap);
      m.frustumCulled = false; m.count = 0; scene.add(m); return m;
    };
    this.inst = {
      berry: inst(new THREE.IcosahedronGeometry(0.3, 1), 0xee4455, 0x4a0c14, 1, 220),
      shard: inst(new THREE.OctahedronGeometry(0.3), 0x7fe9ff, 0x1f86a6, 4, 140),
      gold: inst(new THREE.OctahedronGeometry(0.36), 0xffd24a, 0x9a6400, 2.6, 50),
      moon: inst(new THREE.OctahedronGeometry(0.34), 0xb9aaff, 0x5a3cff, 3, 24),
    };
    this.chestGeo = build([
      part(P.box(1.1, 0.6, 0.8), '#8a5a33', M(0, 0.3, 0)),
      part(P.box(1.16, 0.3, 0.86), '#a06a3c', M(0, 0.72, 0)),
      part(P.box(1.2, 0.1, 0.9), '#ffd24a', M(0, 0.56, 0)),
      part(P.box(0.2, 0.26, 0.1), '#ffd24a', M(0, 0.5, 0.44)),
    ]);
    this.chestMat = vcMat();
    // Тайники: тот же сундук, но чем дороже, тем крупнее и ярче светится.
    this.cacheMat = [
      new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x9fb4c0, emissiveIntensity: 0.25 }),
      new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2f8fd0, emissiveIntensity: 0.35 }),
      new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffa520, emissiveIntensity: 0.4 }),
    ];
    this.orbGeo = new THREE.OctahedronGeometry(0.5);
    this.podGeo = new THREE.SphereGeometry(0.55, 10, 8);
    this.podMat = new THREE.MeshLambertMaterial({ color: 0x7fe9ff, emissive: 0x2fb6e0, emissiveIntensity: 0.8 });
    this.eggMat = new THREE.MeshLambertMaterial({ color: 0xfff1c9, emissive: 0xffc24a, emissiveIntensity: 0.7 });
    this.graveGeo = new THREE.BoxGeometry(0.75, 1.4, 0.3); this.graveGeo.translate(0, 0.7, 0);
    this.graveMat = new THREE.MeshLambertMaterial({ color: 0x8f93a0, emissive: 0x9d8cff, emissiveIntensity: 0.3 });
    this.crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3c, emissive: 0x5fd08a, emissiveIntensity: 0.35 });
    this.reset();
  }

  reset() { this.spT = 0; this.travel = 0; this.nextChest = 150; this.nextCache = 55; this.nextPod = 95; this.nextEgg = 210; this.nextCrate = 130; this.near = null; }

  add(type, x, z, o = {}) {
    const it = { type, x, z, t: rand(0, 6), pull: false, pop: o.pop ? 0.35 : 0, vx: 0, vz: 0, sc: 1, ...o };
    if (o.pop) { const a = Math.random() * Math.PI * 2, s = rand(2, 5); it.vx = Math.sin(a) * s; it.vz = Math.cos(a) * s; }
    if (type === 'chest') { it.mesh = new THREE.Mesh(this.chestGeo, this.chestMat); it.mesh.rotation.y = rand(0, 6); }
    if (type === 'cache') { it.mesh = new THREE.Mesh(this.chestGeo, this.cacheMat[it.tier]); it.mesh.rotation.y = rand(0, 6); it.sc = CACHE[it.tier].scale; }
    if (type === 'grave') { it.mesh = new THREE.Mesh(this.graveGeo, this.graveMat); it.mesh.rotation.y = rand(0, 6); it.sc = 1; }
    if (type === 'crate') { it.mesh = new THREE.Mesh(this.chestGeo, this.crateMat); it.mesh.rotation.y = rand(0, 6); it.sc = 0.85; }
    if (type === 'pod') { it.mesh = new THREE.Mesh(this.podGeo, this.podMat); it.sc = 1; }
    if (type === 'egg') { it.mesh = new THREE.Mesh(this.podGeo, this.eggMat); it.mesh.scale.set(1, 1.3, 1); it.sc = 1; }
    if (type === 'relic') {
      const hex = RAR_HEX[it.rar || 0];
      it.mesh = new THREE.Mesh(this.orbGeo, new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 3 }));
    }
    if (it.mesh) { it.mesh.castShadow = type !== 'relic'; this.scene.add(it.mesh); }
    this.items.push(it);
    return it;
  }

  remove(it) { if (it.mesh) this.scene.remove(it.mesh); const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); }

  clear() {
    for (const it of this.items) if (it.mesh) this.scene.remove(it.mesh);
    this.items.length = 0;
    this.reset();
  }

  cluster(cx, cz) {
    const h = heightAt(cx, cz);
    if (h < 0.7) return false;
    const dens = (DENS[biomeAt(cx, cz, h, moistAt(cx, cz))] || 0) * (this.G.run && this.G.run.arts.drought ? 0.5 : 1);
    if (Math.random() > dens) return false;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.3, 2.4), x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      if (heightAt(x, z) > 0.5) this.add('berry', x, z);
    }
    return true;
  }

  /** Раскидать ягоды вокруг начала забега. */
  seed(px, pz) {
    for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, r = rand(6, 48); this.cluster(px + Math.sin(a) * r, pz + Math.cos(a) * r); }
  }

  price(it) {
    const run = this.G.run;
    const st = this.G.stats;
    if (it.type === 'crate' || it.type === 'grave') return 0;
    if (st.greed) return 0;   // «Лунная жадность»: бесплатно, но за здоровье
    if (it.type === 'cache') return Math.max(1, Math.round(CACHE[it.tier].price * (1 + 0.1 * run.caches) * st.cachePrice));
    if (it.type === 'egg') return Math.max(1, Math.round(25 * (1 + 0.6 * run.hatched) * st.eggPrice));
    return 0;
  }

  /** Карточка рядом с тайником, коконом или яйцом. */
  promptFor(it) {
    const G = this.G, run = G.run, price = this.price(it), have = `Стоит ягод: ${price} · у тебя: ${run.berries}`;
    if (it.type === 'cache') {
      const c = CACHE[it.tier];
      return { title: c.name, name: 'Открывается за ягоды', icon: 'relic', pic: 'x_cache', hex: RAR_HEX[it.tier], desc: c.hint, reward: have, btn: 'Открыть', can: run.berries >= price, why: `Не хватает ягод: нужно ${price}` };
    }
    if (it.type === 'pod') {
      const a = ACTIVE[it.aid], cur = run.active && ACTIVE[run.active];
      return { title: 'Кокон: ' + a.name, name: 'Активный предмет', icon: 'pod', pic: 'a_' + it.aid, hex: 0x7fe9ff, desc: a.desc, reward: `Кнопка «Предмет» или Q. Перезарядка ${a.cd} с` + (cur ? `. Заменит «${cur.name}»` : ''), btn: 'Взять', can: true };
    }
    if (it.type === 'grave') { const r = RELIC[it.rid]; return { title: 'Надгробие', name: 'Здесь уснула прошлая змейка', icon: 'relic', pic: 'x_grave', hex: 0xb9aaff, desc: `Под камнем лежит её реликвия — «${r.name}».`, reward: r.desc, btn: 'Забрать', can: true }; }
    if (it.type === 'crate') return { title: 'Ящик с модулем', name: 'Крепится на звено тела', icon: 'relic', pic: 'x_crate', hex: 0x7ff0c8, desc: 'Модули садятся на каждое четвёртое звено: чем длиннее тело, тем больше их работает.', reward: 'Один из трёх на выбор', btn: 'Открыть', can: true };
    const full = G.pets.length >= 4;
    return { title: 'Яйцо спутника', name: 'Вылупится за ягоды', icon: 'bird', pic: 'x_egg', hex: 0xffd24a, desc: 'Спутник идёт следом и помогает. Теряет сердце каждый раз, когда тебя ранят.', reward: have, btn: 'Высидеть', can: !full && run.berries >= price, why: full ? 'Спутников уже четверо' : `Не хватает ягод: нужно ${price}` };
  }

  /** Игрок нажал «принять» рядом с тайником, коконом или яйцом. */
  useNear() {
    const it = this.near, G = this.G, run = G.run;
    if (!it || G.state !== 'play') return;
    const price = this.price(it), y = heightAt(it.x, it.z);
    if (run.berries < price) return;
    if (it.type === 'egg' && G.pets.length >= 4) return;
    run.berries -= price;
    this.near = null; G.ui.prompt(null);
    if (it.type === 'grave') { G.fx.burst(it.x, y + 1, it.z, 0xb9aaff, 24, 6, 1.2, 6); G.grantRelic(it.rid, true); G.save.grave = null; G.persist(); this.remove(it); return; }
    if (it.type === 'crate') { G.sound.sfx('chest'); G.fx.burst(it.x, y + 0.8, it.z, 0x7ff0c8, 20, 6, 1.1, 6); G.offers.push({ kind: 'module', title: 'Ящик с модулем' }); this.remove(it); return; }
    if (G.stats.greed && it.type !== 'pod') { run.bonusHp -= 8; G.refreshStats(); G.ui.toast('Лунная жадность: −8 здоровья', 'rar3'); }
    if (it.type === 'cache') {
      run.caches++;
      G.sound.sfx('chest'); G.hitStop(0.06);
      G.fx.burst(it.x, y + 0.8, it.z, RAR_HEX[it.tier], 22, 6, 1.2, 6); G.fx.ring(it.x, y, it.z, RAR_HEX[it.tier], 0.4, 4, 0.4);
      G.grantRelic(G.rollRelic(pickW(CACHE[it.tier].w)), true);
    } else if (it.type === 'pod') {
      const old = run.active;
      run.active = it.aid; run.activeCd = 0;
      if (!it.keep) G.see('a_' + it.aid);
      G.sound.sfx('relic'); G.fx.burst(it.x, y + 0.8, it.z, 0x7fe9ff, 18, 5, 1.1, 5);
      G.ui.toast('Активный предмет: ' + ACTIVE[it.aid].name, 'rar1'); G.ui.itemButton();
      if (old) this.add('pod', it.x + 1.6, it.z, { aid: old, keep: true });
    } else {
      run.hatched++;
      G.sound.sfx('level'); G.fx.burst(it.x, y + 0.8, it.z, 0xffd24a, 22, 6, 1.2, 6);
      G.addPet(null, it.x, it.z);
    }
    this.remove(it);
  }

  update(dt) {
    const G = this.G, s = G.snake, px = s.x, pz = s.z, st = G.stats, live = G.state === 'play';
    this.travel += s.moved;

    // Пополнение мира вокруг героя.
    this.spT -= dt;
    if (live && this.spT <= 0) {
      this.spT = 0.22;
      let nb = 0, ns = 0;
      for (const it of this.items) { if (it.type === 'berry') nb++; else if (it.type === 'shard' && it.amb) ns++; }
      const ahead = () => (Math.random() < 0.7 ? s.heading + rand(-1.3, 1.3) : rand(0, 6.283));
      const spot = (rmin, rmax, minH = 0.8) => { const a = s.heading + rand(-0.9, 0.9), r = rand(rmin, rmax), x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r; return heightAt(x, z) > minH ? { x, z } : null; };
      if (nb < Math.max(12, (G.run.arts.drought ? 45 : 90) * Math.min(1, DENS[G.run.biome] || 1))) { const a = ahead(), r = rand(24, 54); this.cluster(px + Math.sin(a) * r, pz + Math.cos(a) * r); }
      const bio = G.run.biome;
      if (ns < 4 * st.luck * (bio === B.CRYSTAL ? 3 : bio === B.VOLCANO ? 2 : 1)) {
        const a = ahead(), r = rand(26, 52), x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
        if (heightAt(x, z) > 0.6) this.add(Math.random() < 0.08 * st.luck ? 'gold' : 'shard', x, z, { amb: true });
      }
      let p;
      if (this.travel > this.nextChest && (p = spot(30, 44))) { this.add('chest', p.x, p.z); this.nextChest = this.travel + rand(190, 280) / st.luck; }
      if (this.travel > this.nextCache && (p = spot(28, 42))) { this.add('cache', p.x, p.z, { tier: pickW([[0, 68], [1, 25], [2, 7]]) }); this.nextCache = this.travel + rand(110, 170) / Math.sqrt(st.luck); }
      if (this.travel > this.nextPod && (p = spot(26, 40))) { this.add('pod', p.x, p.z, { aid: ACTIVES[Math.floor(Math.random() * ACTIVES.length)].id }); this.nextPod = this.travel + rand(420, 560); }
      if (this.travel > this.nextCrate && (p = spot(26, 40))) { this.add('crate', p.x, p.z); this.nextCrate = this.travel + rand(300, 420); }
      if (this.travel > this.nextEgg && (p = spot(26, 40))) { this.add('egg', p.x, p.z); this.nextEgg = this.travel + rand(440, 600); }
    }

    const count = { berry: 0, shard: 0, gold: 0, moon: 0 };
    const pr = st ? st.pickR + (G.petPull || 0) : 1.6;
    let near = null, nd = 2.9;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.pop > 0) { it.pop -= dt; it.x += it.vx * dt; it.z += it.vz * dt; }
      const dx = px - it.x, dz = pz - it.z, d = Math.hypot(dx, dz);
      const manual = MANUAL[it.type], solid = manual || it.type === 'chest' || it.type === 'relic';
      let gone = false;
      if (live && it.pop <= 0) {
        if (!solid && (it.pull || d < pr + 1.6)) {
          it.pull = true;
          const sp = Math.min(d, (15 + s.v) * dt);
          it.x += (dx / (d || 1)) * sp; it.z += (dz / (d || 1)) * sp;
        }
        if (manual) { if (d < nd) { nd = d; near = it; } }
        else if (d < (solid ? 1.5 : 0.9)) { G.onPickup(it); gone = true; }
      }
      if (!gone && d > 78 && !it.keep) gone = true;
      // Выпавшее из врагов лежит недолго — иначе за длинный забег мир зарастает осколками.
      if (!gone && it.life !== undefined && (it.life -= dt) <= 0) gone = true;
      if (gone) { if (it.mesh) this.scene.remove(it.mesh); this.items.splice(i, 1); continue; }
      const y = heightAt(it.x, it.z);
      if (it.mesh) {
        if (it.type === 'relic') { it.mesh.position.set(it.x, y + 1.1 + Math.sin(it.t * 2) * 0.2, it.z); it.mesh.rotation.y = it.t * 1.6; }
        else if (it.type === 'pod' || it.type === 'egg') { it.mesh.position.set(it.x, y + 0.75 + Math.sin(it.t * 2.2) * 0.12, it.z); it.mesh.rotation.y = it.t * 0.8; }
        else { it.mesh.position.set(it.x, y, it.z); it.mesh.scale.setScalar(it.sc * (1 + Math.sin(it.t * 3) * 0.04)); }
        continue;
      }
      const mesh = this.inst[it.type], k = count[it.type]++;
      if (k >= mesh.instanceMatrix.count) continue;
      const berry = it.type === 'berry', sc = berry ? 1 + Math.sin(it.t * 3) * 0.08 : 1;
      _q.setFromEuler(_e.set(0, it.t * (berry ? 0.6 : 2), 0));
      _m.compose(_v.set(it.x, y + (berry ? 0.38 : 0.6) + Math.sin(it.t * 2.4) * 0.1, it.z), _q, _s.set(sc, berry ? sc : sc * 1.5, sc));
      mesh.setMatrixAt(k, _m);
    }
    for (const k in this.inst) { this.inst[k].count = count[k]; this.inst[k].instanceMatrix.needsUpdate = true; }

    // Карточка рядом с тайником, коконом, яйцом. Место вызова важнее — его карточка главная.
    this.refT -= dt;
    if (live && !G.pois.near && (near !== this.near || (near && this.refT <= 0))) {
      this.refT = 0.4; this.near = near;
      G.ui.prompt(near ? this.promptFor(near) : null);
    }
  }
}
