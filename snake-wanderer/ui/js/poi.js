// Места вызовов. Игрок сам решает, принять вызов или проползти мимо.
import * as THREE from 'three';
import { sitesNear, heightAt } from './terrain.js';
import { build, part, M, G as P, vcMat } from './mesh.js';
import { rand, pickW, fmtTime, rng, shuffle } from './util.js';
import { DEF } from './enemies.js';
import { RELIC, RELICS } from './data.js';

/** Кто живёт в логове: зависит от самого места, поэтому в каждом забеге одно и то же. */
export const lairBoss = (site) => { let h = 0; for (let i = 0; i < site.id.length; i++) h = (h * 31 + site.id.charCodeAt(i)) | 0; return ['boss', 'rival', 'queen', 'worm'][Math.abs(h) % 4]; };
const LAIR_TIP = { boss: 'Ударные волны проскакивай рывком.', rival: 'Другая змея: не дай себя обвести и бей после её броска.', queen: 'В воздухе её не взять — жди, пока сядет.', worm: 'Уходи из голубого круга и бей, пока он наверху.' };
const TROPHY = { boss: 'tr_guard', rival: 'tr_rival', queen: 'tr_queen', worm: 'tr_worm' };
import { RAR_HEX } from './pickups.js';

const H = Math.PI / 2, TAU = Math.PI * 2;
export const POI = {
  outpost: { title: 'Аванпост', hex: 0x6fe3ff, icon: 'tower', beam: 60, coreY: 3.3 },
  rift: { title: 'Разлом', hex: 0xb07cff, icon: 'rift', beam: 46, coreY: 2.5 },
  altar: { title: 'Алтарь жертвы', hex: 0xff6b7f, icon: 'altar', beam: 0, coreY: 1.5 },
  den: { title: 'Гнездо', hex: 0xffa040, icon: 'den', beam: 0, coreY: 1.1 },
  wisps: { title: 'Блуждающие огоньки', hex: 0xffe066, icon: 'wisps', beam: 26, coreY: 3.0 },
  idol: { title: 'Проклятый идол', hex: 0xe0405a, icon: 'idol', beam: 0, coreY: 2.7 },
  lair: { title: 'Логово стража', hex: 0xff4040, icon: 'lair', beam: 84, coreY: 7.6 },
  ruins: { title: 'Руины', hex: 0xb8f27a, icon: 'ruins', beam: 36, coreY: 2.3 },
  forge: { title: 'Плавильня', hex: 0xff8a3d, icon: 'anvil', beam: 0, coreY: 1.42 },
  copier: { title: 'Копировальня', hex: 0x6fd6ff, icon: 'relic', beam: 0, coreY: 2.2 },
  pool: { title: 'Лунный омут', hex: 0x9d8cff, icon: 'moon', beam: 30, coreY: 1.7 },
  plates: { title: 'Нажимные плиты', hex: 0xffd24a, icon: 'ruins', beam: 0, coreY: 1.5 },
  shrine: { title: 'Святилище стихий', hex: 0xff9a5c, icon: 'altar', beam: 24, coreY: 2.3 },
  maze: { title: 'Лабиринт', hex: 0xb8f27a, icon: 'ruins', beam: 44, coreY: 1.5 },
};
const RAR_WORD = ['обычную', 'редкую', 'легендарную'];
const LUNAR = RELICS.filter((r) => r.rar === 3);
const ring = (n, fn) => Array.from({ length: n }, (_, i) => fn((i / n) * TAU, i));
const capCyl = (r1, r2, h, seg) => new THREE.CylinderGeometry(r1, r2, h, seg);
const GEO = {
  plates: build([part(capCyl(0.55, 0.75, 1.1, 6), '#8f8a7c', M(0, 0.5, 0)), part(capCyl(0.8, 0.8, 0.14, 6), '#a39e8e', M(0, 1.1, 0))]),
  shrine: build([
    part(capCyl(2.6, 2.9, 0.3, 8), '#8f8a7c', M(0, 0.1, 0)), part(capCyl(0.6, 0.8, 1.2, 6), '#a39e8e', M(0, 0.8, 0)),
    ...ring(4, (a, i) => part(P.box(0.5, 2.6, 0.5), '#99948a', M(Math.sin(a) * 2.2, 1.4, Math.cos(a) * 2.2))),
    ...ring(4, (a, i) => part(P.oct(0.34), ['#ff8a3d', '#8fe3ff', '#b06cff', '#ffe45c'][i], M(Math.sin(a) * 2.2, 3.0, Math.cos(a) * 2.2))),
  ]),
  maze: build([part(capCyl(0.9, 1.1, 0.5, 6), '#8f9a86', M(0, 0.2, 0)), part(capCyl(1.0, 1.0, 0.12, 6), '#a7b29c', M(0, 0.5, 0))]),
  outpost: build([
    ...ring(6, (a, i) => part(P.box(0.95, 3.2 + (i % 2) * 0.7, 0.75), i % 2 ? '#8b8f99' : '#7c818c', M(Math.sin(a) * 5, 1.1, Math.cos(a) * 5, 1, [0.06, a, 0.07]))),
    part(capCyl(0.9, 1.4, 1.0, 6), '#747985', M(0, 0.2, 0)),
  ]),
  rift: build(ring(7, (a, i) => part(P.cone(0.5, 1.9 + (i % 3) * 0.5, 4), '#3b2f55', M(Math.sin(a) * 2.7, 0.6, Math.cos(a) * 2.7, 1, [0.35 * Math.cos(a), a, -0.35 * Math.sin(a)])))),
  altar: build([
    part(P.box(2.7, 0.5, 1.6), '#8d8a86', M(0, 0.6, 0)),
    part(P.box(0.55, 1.2, 1.3), '#77736f', M(0.95, 0, 0)), part(P.box(0.55, 1.2, 1.3), '#77736f', M(-0.95, 0, 0)),
    part(capCyl(0.55, 0.3, 0.32, 7), '#5c2f35', M(0, 1.0, 0)),
    part(P.cone(0.2, 1.3, 4), '#77736f', M(1.7, 0.4, 0)), part(P.cone(0.2, 1.3, 4), '#77736f', M(-1.7, 0.4, 0)),
  ]),
  den: build([
    part(capCyl(1.6, 1.8, 0.3, 9), '#b89a5a', M(0, 0.05, 0)),
    ...ring(9, (a, i) => part(P.box(1.4, 0.4, 0.55), i % 2 ? '#7a5a3a' : '#8b6944', M(Math.sin(a) * 1.8, 0.3, Math.cos(a) * 1.8, 1, [0, a + H, 0.18]))),
  ]),
  wisps: build([
    part(capCyl(0.12, 0.17, 2.7, 5), '#6b4a2e', M(0, 1.35, 0)),
    part(P.box(0.9, 0.12, 0.12), '#6b4a2e', M(0, 2.7, 0)),
    part(P.cone(0.55, 0.45, 4), '#444a55', M(0, 3.75, 0)),
    part(P.dod(0.5), '#8c8f95', M(0.4, 0.1, 0.3)), part(P.dod(0.35), '#7c7f85', M(-0.4, 0.05, -0.2)),
  ]),
  idol: build([
    part(capCyl(0.45, 0.95, 3.8, 4), '#3a3340', M(0, 1.7, 0, 1, [0, Math.PI / 4, 0])),
    part(P.box(2.2, 0.5, 2.2), '#2d2833', M(0, 0, 0)),
    part(P.cone(0.2, 0.9, 4), '#4a4152', M(0.45, 3.9, 0, 1, [0, 0, -0.5])), part(P.cone(0.2, 0.9, 4), '#4a4152', M(-0.45, 3.9, 0, 1, [0, 0, 0.5])),
  ]),
  lair: build([
    part(P.box(1.4, 6.6, 1.4), '#4a4652', M(3, 2.6, 0)), part(P.box(1.4, 6.6, 1.4), '#4a4652', M(-3, 2.6, 0)),
    part(P.box(8.2, 1.2, 1.7), '#3e3a46', M(0, 6.4, 0)),
    part(P.dod(1.5), '#55515e', M(5, 0.6, 0.6)), part(P.dod(1.2), '#55515e', M(-4.9, 0.4, -0.5)),
  ]),
  ruins: build([
    part(capCyl(4.6, 5, 0.6, 8), '#a9a394', M(0, 0.15, 0)),
    part(capCyl(0.55, 0.62, 5.0, 7), '#c8c2b1', M(3.2, 2.7, 2.2)), part(capCyl(0.7, 0.7, 0.4, 7), '#b4ae9d', M(3.2, 5.3, 2.2)),
    part(capCyl(0.55, 0.62, 3.2, 7), '#c2bcab', M(-3.2, 1.8, 2.2)),
    part(capCyl(0.55, 0.62, 1.7, 7), '#bdb7a6', M(3.2, 1.1, -2.4)),
    part(capCyl(0.55, 0.62, 3.8, 7), '#b4ae9d', M(-2.4, 0.75, -3.0, 1, [H, 0.7, 0])),
    part(P.box(1.5, 1.1, 1.5), '#8f897b', M(0, 0.9, 0)), part(P.box(1.9, 0.25, 1.9), '#a39d8e', M(0, 1.5, 0)),
    part(P.ico(0.6), '#6f9a52', M(-3.2, 3.5, 2.2, [1.1, 0.4, 1.1])), part(P.ico(0.7), '#628b48', M(2.6, 0.5, -3.4, [1.3, 0.45, 1])),
  ]),
  forge: build([
    part(capCyl(1.4, 1.0, 1.25, 8), '#3b3f48', M(0, 0.8, 0)), part(capCyl(1.55, 1.55, 0.2, 8), '#565b67', M(0, 1.38, 0)),
    part(P.dod(0.6), '#6d6860', M(1.5, 0.2, 0.6)), part(P.dod(0.55), '#77726a', M(-1.4, 0.2, 0.7)), part(P.dod(0.6), '#6d6860', M(0, 0.2, -1.6)),
  ]),
  copier: build([
    part(capCyl(1.7, 2.0, 0.4, 6), '#8f94a3', M(0, 0.1, 0)), part(capCyl(0.7, 0.95, 1.0, 6), '#a7acba', M(0, 0.8, 0)),
    part(P.box(0.26, 2.6, 0.26), '#7a7f8e', M(1.35, 1.4, 0)), part(P.box(0.26, 2.6, 0.26), '#7a7f8e', M(-1.35, 1.4, 0)),
    part(P.box(3.0, 0.22, 0.3), '#7a7f8e', M(0, 2.8, 0)),
  ]),
  pool: build([
    part(capCyl(2.5, 2.5, 0.14, 14), '#241d5c', M(0, 0.1, 0)),
    ...ring(8, (a, i) => part(P.dod(0.5 + (i % 2) * 0.15), i % 2 ? '#c9c4e6' : '#aaa4cf', M(Math.sin(a) * 2.7, 0.2, Math.cos(a) * 2.7))),
  ]),
};
/** Где лежат плиты: зигзагом, и чем дальше от начала мира, тем шире. */
export const platePos = (site) => { const d = 2.3 + Math.min(3, site.zone) * 0.45; return [[-1.5 * d, 0.9], [-0.5 * d, -0.9], [0.5 * d, 0.9], [1.5 * d, -0.9]]; };
const siteSeed = (site) => { let h = 7; for (let i = 0; i < site.id.length; i++) h = (h * 31 + site.id.charCodeAt(i)) | 0; return Math.abs(h) + 1; };
const MZ = 7, MC = 3.2;   // лабиринт: клеток на сторону и размер клетки

/** Стены лабиринта: обход в глубину от середины, один вход с краю. Возвращает отрезки стен и тупики. */
function mazePlan(site) {
  const r = rng(siteSeed(site)), N = MZ, seen = new Uint8Array(N * N), east = new Uint8Array(N * N).fill(1), south = new Uint8Array(N * N).fill(1);
  const stack = [[3, 3]]; seen[3 * N + 3] = 1;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => { const x = cx + dx, z = cz + dz; return x >= 0 && z >= 0 && x < N && z < N && !seen[z * N + x]; });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dz] = opts[Math.floor(r() * opts.length)], nx = cx + dx, nz = cz + dz;
    if (dx === 1) east[cz * N + cx] = 0; else if (dx === -1) east[nz * N + nx] = 0; else if (dz === 1) south[cz * N + cx] = 0; else south[nz * N + nx] = 0;
    seen[nz * N + nx] = 1; stack.push([nx, nz]);
  }
  const ox = site.x - (N * MC) / 2, oz = site.z - (N * MC) / 2, walls = [], gate = Math.floor(r() * N), side = Math.floor(r() * 4);
  const add = (x0, z0, x1, z1) => walls.push([x0, z0, x1, z1]);
  for (let i = 0; i < N; i++) {
    if (!(side === 0 && i === gate)) add(ox + i * MC, oz, ox + (i + 1) * MC, oz);
    if (!(side === 1 && i === gate)) add(ox + i * MC, oz + N * MC, ox + (i + 1) * MC, oz + N * MC);
    if (!(side === 2 && i === gate)) add(ox, oz + i * MC, ox, oz + (i + 1) * MC);
    if (!(side === 3 && i === gate)) add(ox + N * MC, oz + i * MC, ox + N * MC, oz + (i + 1) * MC);
  }
  const dead = [];
  for (let cz = 0; cz < N; cz++) for (let cx = 0; cx < N; cx++) {
    if (cx < N - 1 && east[cz * N + cx]) add(ox + (cx + 1) * MC, oz + cz * MC, ox + (cx + 1) * MC, oz + (cz + 1) * MC);
    if (cz < N - 1 && south[cz * N + cx]) add(ox + cx * MC, oz + (cz + 1) * MC, ox + (cx + 1) * MC, oz + (cz + 1) * MC);
    let open = 0;
    if (cx < N - 1 && !east[cz * N + cx]) open++; if (cx > 0 && !east[cz * N + cx - 1]) open++;
    if (cz < N - 1 && !south[cz * N + cx]) open++; if (cz > 0 && !south[(cz - 1) * N + cx]) open++;
    if (open === 1 && !(cx === 3 && cz === 3)) dead.push([ox + (cx + 0.5) * MC, oz + (cz + 0.5) * MC]);
  }
  return { walls, dead: shuffle(dead).slice(0, 3) };
}
const WALL = new THREE.BoxGeometry(1, 1, 1), WALL_MAT = new THREE.MeshLambertMaterial({ color: 0x8a9484 });
const _wm = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _wv = new THREE.Vector3(), _ws = new THREE.Vector3();

const CORE = {
  plates: new THREE.OctahedronGeometry(0.42), shrine: new THREE.IcosahedronGeometry(0.55, 1), maze: new THREE.OctahedronGeometry(0.6),
  outpost: new THREE.OctahedronGeometry(0.9), rift: new THREE.TorusGeometry(1.7, 0.17, 6, 16), altar: new THREE.ConeGeometry(0.3, 0.9, 5),
  den: new THREE.SphereGeometry(0.85, 10, 8), wisps: new THREE.IcosahedronGeometry(0.42, 1), idol: new THREE.IcosahedronGeometry(0.3, 1), lair: new THREE.OctahedronGeometry(1.1),
  ruins: new THREE.TorusKnotGeometry(0.42, 0.13, 40, 6),
  forge: new THREE.SphereGeometry(1.2, 12, 6), copier: new THREE.OctahedronGeometry(0.5), pool: new THREE.IcosahedronGeometry(0.6, 1),
};
const MAT = vcMat();
const BASE_SH = { plates: [25, 4], maze: [35, 5], shrine: [0, 0], outpost: [25, 4], rift: [40, 6], den: [20, 3], lair: [120, 10], wisps: [20, 3], ruins: [30, 5] };
const SEAL = 20;

export class Pois {
  constructor(game, scene) {
    this.G = game; this.scene = scene; this.live = new Map(); this.st = {}; this.active = null; this.near = null; this.scanT = 0; this.sites = [];
    const zg = new THREE.RingGeometry(0.985, 1, 80); zg.rotateX(-H);
    this.zone = new THREE.Mesh(zg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.zone.visible = false; this.zone.renderOrder = 5; this.zone.frustumCulled = false;
    scene.add(this.zone);
    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe066).multiplyScalar(2.4) }));
    this.orb.visible = false; scene.add(this.orb);
  }

  /** Стоит ли в этой точке стена лабиринта. */
  blockedAt(x, z) {
    if (!this.mazeN) return false;
    for (const v of this.live.values()) {
      if (!v.walls || Math.abs(x - v.site.x) > 13 || Math.abs(z - v.site.z) > 13) continue;
      for (const w of v.walls) if (x > w[0] && x < w[2] && z > w[1] && z < w[3]) return true;
    }
    return false;
  }

  /** Места, которые не «принимают», а проходят телом: плиты и лабиринт. */
  structures() {
    const G = this.G, s = G.snake;
    for (const v of this.live.values()) {
      const site = v.site, type = site.type;
      if ((type !== 'plates' && type !== 'maze') || site.d > 34) continue;
      const st = this.state(site);
      if (st.s === 'done') continue;
      if (type === 'plates') {
        let n = 0;
        platePos(site).forEach(([ox, oz], i) => {
          const x = site.x + ox, z = site.z + oz, on = Math.hypot(s.x - x, s.z - z) < 0.95 || s.nearBody(x, z, 0.95);
          if (on) n++;
          v.lamps[i].material.emissiveIntensity = on ? 1.6 : 0;
        });
        if (n !== st.pressed) { st.pressed = n; if (n) G.sound.sfx('tick'); if (this.near === site) G.ui.prompt(this.promptFor(site)); }
        if (n === 4) this.finish(site, 'Плиты сошлись!', [50, 40, 10], 'Дар плит');
      } else {
        if (!st.spawned && site.d < 30) {
          st.spawned = true;
          for (const [x, z] of v.walls.dead) G.enemies.spawn('turret', x, z, { tag: 'maze', quiet: true });
          G.pickups.add('relic', site.x, site.z, { rar: 2, keep: true }); G.pickups.add('crate', site.x + 0.9, site.z + 0.9, { keep: true });
        }
        if (site.d < 2) this.finish(site, 'Лабиринт пройден!', null);
      }
    }
  }

  finish(site, title, weights, gift) {
    const G = this.G, st = this.state(site);
    st.s = 'done'; G.run.challenges++;
    const got = G.addShards(this.shardsFor(site));
    G.fx.ring(site.x, site.y, site.z, POI[site.type].hex, 1, 12, 0.8); G.fx.burst(site.x, site.y + 1.5, site.z, POI[site.type].hex, 30, 7, 1.3, 7);
    G.sound.sfx('win'); G.addXp(40);
    G.ui.center(title, `+${got} осколков`);
    if (weights) G.offerRelics(weights, gift);
    this.repaint(site); if (this.near === site) { this.near = null; G.ui.prompt(null); }
  }

  state(site) { return this.st[site.id] || (this.st[site.id] = { s: 'idle', uses: 0 }); }
  cleared(site) { return site.type === 'outpost' && !!this.G.save.cleared[site.id]; }
  isOpen(site) { return this.state(site).s !== 'done' && !this.cleared(site); }

  resetRun() {
    this.st = {}; this.active = null; this.near = null; this.scanT = 0; this.mazeN = this.mazeN || 0;
    this.zone.visible = false; this.orb.visible = false;
    for (const v of this.live.values()) this.scene.remove(v.g);
    this.live.clear();
  }

  make(site) {
    const info = POI[site.type], g = new THREE.Group();
    g.position.set(site.x, site.y - 0.35, site.z);
    const base = new THREE.Mesh(GEO[site.type], MAT);
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    const core = new THREE.Mesh(CORE[site.type], new THREE.MeshBasicMaterial({ color: info.hex }));
    core.position.y = info.coreY;
    if (site.type === 'den') core.scale.set(1, 1.3, 1);
    if (site.type === 'idol') core.position.z = 0.55;
    if (site.type === 'forge') core.scale.set(1, 0.16, 1);
    g.add(core);
    let beam = null;
    if (info.beam) {
      const bg = new THREE.CylinderGeometry(0.12, 0.34, info.beam, 8, 1, true); bg.translate(0, info.beam / 2 + 1, 0);
      beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: info.hex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      g.add(beam);
    }
    let lamps = null, walls = null;
    if (site.type === 'plates') {
      lamps = platePos(site).map(([ox, oz]) => {
        const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.16, 8), new THREE.MeshLambertMaterial({ color: 0x7a7466, emissive: 0xffd24a, emissiveIntensity: 0 }));
        slab.position.set(ox, heightAt(site.x + ox, site.z + oz) - (site.y - 0.35) + 0.08, oz); slab.receiveShadow = true; g.add(slab);
        return slab;
      });
    }
    if (site.type === 'maze') {
      const plan = mazePlan(site);
      const im = new THREE.InstancedMesh(WALL, WALL_MAT, plan.walls.length); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      walls = plan.walls.map(([x0, z0, x1, z1], i) => {
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, horiz = z0 === z1;
        _wm.compose(_wv.set(mx, Math.max(heightAt(x0, z0), heightAt(x1, z1), heightAt(mx, mz)) + 0.75, mz), _wq, _ws.set(horiz ? MC + 0.45 : 0.45, 1.9, horiz ? 0.45 : MC + 0.45));
        im.setMatrixAt(i, _wm);
        return horiz ? [x0 - 0.5, z0 - 0.62, x1 + 0.5, z0 + 0.62] : [x0 - 0.62, z0 - 0.5, x0 + 0.62, z1 + 0.5];
      });
      this.scene.add(im);
      walls.mesh = im; walls.dead = plan.dead;
    }
    this.scene.add(g);
    const v = { site, g, core, beam, lamps, walls, t: rand(0, 6) };
    if (walls) this.mazeN++;
    this.paint(v);
    return v;
  }

  paint(v) {
    const site = v.site, info = POI[site.type];
    if (this.cleared(site)) { v.core.material.color.set(0xffd24a).multiplyScalar(3); v.core.visible = true; if (v.beam) { v.beam.visible = true; v.beam.material.color.set(0xffd24a); v.beam.material.opacity = 0.14; } return; }
    const done = this.state(site).s === 'done', busy = this.state(site).s === 'active';
    v.core.material.color.set(info.hex).multiplyScalar(4);
    if (site.type === 'copier' && this.G.run) v.core.material.color.set(RAR_HEX[RELIC[this.itemOf(site)].rar]).multiplyScalar(3);
    v.core.visible = !done && !(busy && (site.type === 'den' || site.type === 'wisps'));
    if (v.beam) { v.beam.visible = !done; v.beam.material.color.set(info.hex); v.beam.material.opacity = 0.2; }
  }
  repaint(site) { const v = this.live.get(site.id); if (v) this.paint(v); }

  /** Что лежит на постаменте копировальни или в лунном омуте: выбирается один раз за забег. */
  itemOf(site) {
    const st = this.state(site);
    if (!st.item) {
      st.item = site.type === 'pool' ? LUNAR[Math.floor(Math.random() * LUNAR.length)].id : this.G.rollRelic(pickW([[0, 52], [1, 40], [2, 8]]));
    }
    return st.item;
  }
  /** Сколько у игрока реликвий данной редкости (со стопками). */
  have(rar, except) {
    const R = this.G.run.relics;
    return Object.keys(R).reduce((n, id) => n + (RELIC[id].rar === rar && id !== except ? R[id] : 0), 0);
  }

  shardsFor(site) {
    const b = BASE_SH[site.type]; if (!b) return 0;
    return Math.round((b[0] + b[1] * this.G.run.level) * (1 + site.zone * 0.25));
  }

  altarCost(site) {
    const st = this.state(site), G = this.G, seg = (Math.floor(site.x) & 1) === 0;
    if (seg) { const n = [3, 5, 7][st.uses]; return { seg, n, can: G.run.len - n >= 5, text: `${n} ${n < 5 ? 'звена' : 'звеньев'} тела` }; }
    const n = Math.round(G.stats.maxHp * [0.25, 0.35, 0.45][st.uses]);
    return { seg, n, can: G.run.hp > n + 1, text: `${n} здоровья` };
  }

  /** Что показать игроку рядом с местом: суть, цена, награда. */
  promptFor(site) {
    const G = this.G, info = POI[site.type], sh = Math.round(this.shardsFor(site) * G.stats.shardMul);
    const p = { title: info.title, name: site.name, icon: info.icon, hex: info.hex, can: true };
    switch (site.type) {
      case 'outpost': p.desc = `Победи ${8 + site.zone * 2} врагов, не уходя далеко от кристалла.`; p.reward = `Реликвия на выбор, ${sh} осколков и новая точка старта`; p.btn = 'Принять вызов'; break;
      case 'rift': p.desc = 'Продержись 45 секунд внутри круга. Врагов будет много.'; p.reward = `Редкая реликвия на выбор и ${sh} осколков`; p.btn = 'Войти в разлом'; break;
      case 'den': p.desc = 'В гнезде спит вожак. Разбудишь — придётся драться.'; p.reward = `Редкая реликвия и ${sh} осколков`; p.btn = 'Разбудить'; break;
      case 'lair': p.title = 'Логово: ' + DEF[lairBoss(site)].name.toLowerCase(); p.desc = LAIR_TIP[lairBoss(site)]; p.reward = `Легендарная реликвия и ${sh} осколков. Мир станет злее и щедрее`; p.btn = 'Бросить вызов'; break;
      case 'wisps': p.desc = 'Догони десять огоньков, пока каждый не погас. Без боя.'; p.reward = `Реликвия на выбор и ${sh} осколков`; p.btn = 'Погнаться'; break;
      case 'idol': p.desc = 'Проклятие до конца забега: враги сильнее и не спят днём.'; p.reward = 'Редкая реликвия сразу и +30% осколков'; p.btn = 'Принять проклятие'; break;
      case 'plates': p.desc = 'Ляг телом на все четыре плиты сразу. Хватит ли длины?'; p.reward = `Реликвия на выбор и ${sh} осколков`; p.can = false; p.why = `Нажато плит: ${this.state(site).pressed || 0} из 4`; break;
      case 'maze': p.desc = 'Стены не пускают: к середине — только по коридорам. Каменные головы плюются вдоль них.'; p.reward = `В середине — легендарная реликвия, ящик с модулем и ${sh} осколков`; p.can = false; p.why = 'Доберись до середины'; break;
      case 'shrine': p.desc = 'Одна из трёх стихий — на выбор. С ней проще собрать набор.'; p.reward = `Цена: 20 ягод. У тебя ${G.run.berries}`; p.btn = 'Выбрать стихию'; p.can = G.run.berries >= 20; p.why = 'Нужно 20 ягод'; break;
      case 'forge': {
        const from = this.have(0) >= 3 ? 0 : this.have(1) >= 3 ? 1 : -1;
        p.desc = 'Переплавь три реликвии одной редкости в одну получше. Какие именно уйдут — решит огонь.';
        p.reward = from === 0 ? 'Три обычные → одна редкая' : from === 1 ? 'Три редкие → одна легендарная' : 'Обычные дают редкую, редкие — легендарную';
        p.btn = 'Переплавить'; p.can = from >= 0; p.why = 'Нужно три реликвии одной редкости';
        break;
      }
      case 'copier': {
        const r = RELIC[this.itemOf(site)];
        p.hex = RAR_HEX[r.rar]; p.pic = r.id;
        p.desc = `Отдай случайную ${RAR_WORD[r.rar]} реликвию — получи «${r.name}». Сколько угодно раз.`;
        p.reward = r.desc; p.btn = 'Обменять'; p.can = this.have(r.rar, r.id) > 0; p.why = 'Нет другой реликвии той же редкости';
        break;
      }
      case 'pool': {
        const r = RELIC[this.itemOf(site)], price = 2;
        p.pic = r.id;
        p.desc = `Лунный предмет «${r.name}». ${r.desc}`;
        p.reward = `Цена: ${price} лунные чешуйки. У тебя ${G.save.moons}`;
        p.btn = 'Взять'; p.can = G.save.moons >= price; p.why = 'Мало лунных чешуек. Они падают с вожаков и стражей';
        break;
      }
      case 'ruins': {
        const art = G.nextArtifact(site);
        p.desc = `Сними печать: простой ${SEAL} секунд в малом круге, пока лезут стражи.`;
        p.reward = art ? `Артефакт — новое правило для будущих забегов, навсегда. И ${sh} осколков` : `Редкая реликвия на выбор и ${sh} осколков`;
        p.btn = 'Снять печать';
        break;
      }
      case 'altar': {
        const c = this.altarCost(site);
        p.desc = `Алтарь просит жертву: ${c.text}.`; p.reward = 'Случайная реликвия — может выпасть и легендарная'; p.btn = 'Принести жертву';
        p.can = c.can; if (!c.can) p.why = c.seg ? 'Слишком короткое тело' : 'Слишком мало здоровья';
        break;
      }
    }
    return p;
  }

  accept() {
    const site = this.near, G = this.G;
    if (!site || this.active || !this.isOpen(site) || G.state !== 'play') return;
    const st = this.state(site);
    if (!this.promptFor(site).can) return;
    // Карточка вызова своё дело сделала; рядом с алтарём она появится снова, уже с новой ценой.
    this.near = null; G.ui.prompt(null);
    if (site.type === 'forge' || site.type === 'copier' || site.type === 'pool') {
      const info = POI[site.type];
      G.fx.burst(site.x, site.y + 1.6, site.z, info.hex, 26, 6, 1.3, 6); G.fx.ring(site.x, site.y, site.z, info.hex, 0.5, 6, 0.6);
      if (site.type === 'forge') {
        const from = this.have(0) >= 3 ? 0 : 1;
        for (let i = 0; i < 3; i++) G.takeRelic(from);
        G.grantRelic(G.rollRelic(from + 1), true);
      } else if (site.type === 'copier') {
        const id = this.itemOf(site);
        G.takeRelic(RELIC[id].rar, id);
        G.grantRelic(id, true);
      } else {
        G.save.moons -= 2; st.s = 'done';
        G.grantRelic(this.itemOf(site), true);
        G.sound.sfx('curse'); G.persist();
      }
      G.hitStop(0.08); this.repaint(site);
      return;
    }
    if (site.type === 'shrine') {
      G.run.berries -= 20; st.s = 'done';
      G.fx.burst(site.x, site.y + 2, site.z, 0xff9a5c, 26, 6, 1.3, 6); G.sound.sfx('relic');
      const pool = ['pyre', 'rime', 'venom', G.save.ach.rift1 ? 'storm' : 'static', 'ember', 'aura', 'slime'].filter((id) => !RELIC[id].unlock || G.save.ach[RELIC[id].unlock]);
      G.offers.push({ kind: 'fixed', title: 'Святилище стихий', ids: shuffle(pool).slice(0, 3) });
      this.repaint(site);
      return;
    }
    if (site.type === 'altar') {
      const c = this.altarCost(site);
      if (c.seg) G.run.len -= c.n; else { G.run.hp -= c.n; G.snake.hurtT = 0.3; }
      st.uses++; if (st.uses >= 3) st.s = 'done';
      G.fx.burst(site.x, site.y + 1.5, site.z, 0xff6b7f, 26, 6, 1.4, 6); G.fx.ring(site.x, site.y, site.z, 0xff6b7f, 0.5, 7, 0.7);
      G.grantRelic(G.rollRelic(pickW([[0, 56], [1, 34], [2, 10]])), true);
      G.run.challenges++; this.repaint(site); this.near = null; G.refreshStats();
      return;
    }
    if (site.type === 'idol') {
      st.s = 'done'; G.run.curses++; G.run.challenges++;
      G.sound.sfx('curse'); G.shake(0.5);
      G.fx.burst(site.x, site.y + 2.5, site.z, 0xe0405a, 30, 7, 1.4, 5);
      G.grantRelic(G.rollRelic(1), true);
      G.ui.center('Проклятие принято', 'Враги сильнее, осколков больше');
      if (G.run.curses >= 3) G.unlock('curse3');
      this.repaint(site); this.near = null; G.refreshStats();
      return;
    }
    const few = G.run.arts.elites ? 3 : 1;   // артефакт «Вожаки»: врагов втрое меньше
    const a = (this.active = { site, type: site.type, t: 0, killed: 0, spawned: 0, need: Math.ceil((8 + site.zone * 2) / few), few, spawnT: 0.6, idx: 0, left: 0, foe: null, hold: 0 });
    st.s = 'active';
    G.sound.sfx('start'); G.shake(0.4);
    G.fx.ring(site.x, site.y, site.z, POI[site.type].hex, 1, 14, 0.9);
    const zoneR = { outpost: 34, rift: 23, den: 55, lair: 60, ruins: 5.5 }[site.type];
    if (site.type === 'outpost' || site.type === 'rift' || site.type === 'ruins') {
      this.zone.visible = true; this.zone.position.set(site.x, site.y + 0.5, site.z); this.zone.scale.set(zoneR, 1, zoneR);
      this.zone.material.color.set(POI[site.type].hex).multiplyScalar(1.6); this.zone.material.opacity = 0.55;
    }
    a.leash = zoneR || 0;
    if (site.type === 'den') {
      const type = ['slime', 'spiker', 'brute'][Math.min(2, site.zone + (G.diff > 2 ? 1 : 0))];
      a.foe = G.enemies.spawn(type, site.x, site.z, { elite: true, tag: 'den', hpMul: 1.7 });
      G.ui.center('Вожак проснулся!', DEF[type].name);
    } else if (site.type === 'lair') {
      a.foe = G.enemies.spawn(lairBoss(site), site.x, site.z + 4, { tag: 'boss' });
      G.ui.center(DEF[a.foe.type].name, 'Хозяин логова проснулся');
    } else if (site.type === 'wisps') {
      a.ox = site.x; a.oz = site.z; this.nextWisp(a);
      G.ui.center('Лови огоньки!', 'Каждый скоро погаснет');
    } else if (site.type === 'ruins') { a.leash = 32; G.ui.center('Печать дрогнула', 'Стой в круге'); }
    else G.ui.center(site.type === 'rift' ? 'Разлом открыт!' : 'Испытание!', site.name);
    this.repaint(site); this.near = null;
  }

  nextWisp(a) {
    const G = this.G;
    for (let i = 0; i < 14; i++) {
      const ang = rand(0, TAU), d = rand(12, 18), x = a.ox + Math.sin(ang) * d, z = a.oz + Math.cos(ang) * d;
      if (heightAt(x, z) > 0.9 || i === 13) {
        a.ox = x; a.oz = z;
        a.left = a.max = 2.4 + Math.hypot(x - G.snake.x, z - G.snake.z) / (G.stats.speed * 0.74);
        this.orb.visible = true;
        G.fx.burst(x, heightAt(x, z) + 1.2, z, 0xffe066, 8, 3, 0.9, 3);
        return;
      }
    }
  }

  /** Победа над врагом — могла продвинуть вызов. */
  onKill(e) {
    const a = this.active;
    if (!a) return;
    if (e.tag === 'ch') a.killed++;
    if (a.foe === e) this.complete();
  }

  fail(msg) {
    const a = this.active, G = this.G;
    if (!a) return;
    this.active = null; this.state(a.site).s = 'idle';
    this.zone.visible = false; this.orb.visible = false;
    for (const t of ['ch', 'den', 'boss', 'add']) G.enemies.clear(t);
    G.sound.sfx('fail');
    G.ui.center(msg, 'Можно начать заново'); G.ui.banner(null); G.ui.boss(null);
    this.repaint(a.site);
  }

  complete() {
    const a = this.active, G = this.G, site = a.site;
    this.active = null; this.state(site).s = 'done';
    this.zone.visible = false; this.orb.visible = false;
    for (const t of ['ch', 'add']) G.enemies.clear(t);
    const got = G.addShards(this.shardsFor(site));
    G.run.challenges++; G.save.stats.challenges++;
    G.sound.sfx('win'); G.shake(0.5);
    G.fx.ring(site.x, site.y, site.z, 0xffd24a, 1, 16, 1.0);
    G.fx.burst(site.x, site.y + 2, site.z, 0xffd24a, 34, 8, 1.5, 7);
    G.ui.banner(null); G.ui.boss(null);
    const sub = `+${got} осколков`;
    switch (site.type) {
      case 'outpost':
        G.save.cleared[site.id] = 1;
        G.save.waypoints.push({ id: site.id, name: site.name, x: site.x, z: site.z });
        G.map.reveal(site.x, site.z, 210);   // пройденный аванпост открывает карту вокруг себя
        G.save.stats.outposts++; G.unlock('out1'); if (G.save.stats.outposts >= 5) G.unlock('out5');
        G.heal(G.stats.maxHp * 0.25); G.addXp(60);
        G.ui.center('Аванпост пройден!', sub);
        G.offerRelics([70, 26, 4], 'Награда аванпоста');
        break;
      case 'rift':
        G.save.stats.rifts++; G.unlock('rift1'); G.addXp(80);
        G.ui.center('Разлом закрыт!', sub);
        G.offerRelics([30, 58, 12], 'Дар разлома');
        break;
      case 'den':
        G.unlock('den1'); G.addXp(40);
        G.ui.center('Гнездо разорено', sub);
        G.pickups.add('relic', site.x, site.z, { rar: Math.random() < 0.18 ? 2 : 1, keep: true });
        break;
      case 'lair':
        G.save.stats.bosses++; G.unlock('boss1'); G.run.loop++;
        G.ui.center('Логово пало!', `${sub} · круг ${G.run.loop + 1}`);
        if (a.foe && TROPHY[a.foe.type] && !G.run.relics[TROPHY[a.foe.type]]) G.grantRelic(TROPHY[a.foe.type], true);
        G.offerRelics([0, 40, 60], 'Дар логова');
        if (G.run.loop >= 3 && !G.run.lordDone && !G.run.lord) G.run.lordT = 6;   // три логова пали — придёт хозяин архипелага
        break;
      case 'wisps':
        G.unlock('wisp1'); G.addXp(50);
        G.ui.center('Все огоньки пойманы!', sub);
        G.offerRelics([74, 23, 3], 'Награда огоньков');
        break;
      case 'ruins': {
        const art = G.nextArtifact(site);
        G.addXp(60);
        if (art) {
          G.save.arts[art.id] = 1; G.unlock('art1');
          G.ui.center('Артефакт найден!', art.name);
          G.ui.toast('Включить артефакт можно в меню перед забегом', 'gold');
        } else { G.ui.center('Печать снята', sub); G.offerRelics([20, 55, 25], 'Дар руин'); }
        break;
      }
    }
    this.repaint(site); G.refreshStats(); G.persist();
  }

  update(dt) {
    const G = this.G, s = G.snake, px = s.x, pz = s.z, live = G.state === 'play';
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.4;
      this.sites = sitesNear(px, pz, 270);
      for (const site of this.sites) {
        const d = Math.hypot(site.x - px, site.z - pz);
        site.d = d;
        if (d < 200 && !this.live.has(site.id)) this.live.set(site.id, this.make(site));
      }
      for (const [id, v] of this.live) if (Math.hypot(v.site.x - px, v.site.z - pz) > 225) { this.scene.remove(v.g); if (v.walls) { this.scene.remove(v.walls.mesh); this.mazeN--; } this.live.delete(id); }
      const marks = this.sites.filter((q) => this.isOpen(q) && this.state(q).s === 'idle').sort((p, q) => p.d - q.d).slice(0, 4)
        .map((q) => ({ x: q.x, z: q.z, icon: POI[q.type].icon, hex: POI[q.type].hex }));
      G.ui.setMarks(marks);
    }

    for (const v of this.live.values()) {
      v.t += dt;
      const ty = v.site.type, y = POI[ty].coreY;
      if (ty === 'rift') { v.core.rotation.y = v.t * 0.8; v.core.scale.setScalar(1 + Math.sin(v.t * 2.3) * 0.08); }
      else if (ty === 'den') v.core.rotation.z = Math.sin(v.t * 1.5) * 0.06;
      else if (ty === 'altar') v.core.scale.set(1 + Math.sin(v.t * 9) * 0.15, 1 + Math.sin(v.t * 7) * 0.25, 1);
      else if (ty === 'idol') v.core.scale.setScalar(1 + Math.sin(v.t * 3) * 0.2);
      else if (ty === 'forge') v.core.scale.set(1 + Math.sin(v.t * 2) * 0.02, 0.16, 1 + Math.cos(v.t * 2.3) * 0.02);
      else { v.core.rotation.y = v.t * 0.9; v.core.position.y = y + Math.sin(v.t * 1.6) * 0.3; }
    }

    // Предложение вызова рядом с местом.
    let near = null;
    if (live && !this.active) {
      let bd = 8.5;
      for (const site of this.sites) {
        const d = Math.hypot(site.x - px, site.z - pz);
        if (d < bd) { bd = d; near = site; }
      }
      if (near && this.cleared(near)) {
        const st = this.state(near);
        if (st.s !== 'done') { st.s = 'done'; G.heal(G.stats.maxHp * 0.3); G.ui.toast('Маяк согрел тебя: +30% здоровья', 'good'); G.sound.sfx('shard'); }
        near = null;
      } else if (near && !this.isOpen(near)) near = null;
    }
    // Цена и награда меняются с уровнем и длиной тела — карточку освежаем вместе с обзором окрестностей.
    if (near !== this.near || (near && this.scanT === 0.4)) { this.near = near; G.ui.prompt(near ? this.promptFor(near) : null); }

    const a = this.active;
    if (!a || !live) return;
    const site = a.site, d = Math.hypot(site.x - px, site.z - pz), E = G.enemies;
    a.t += dt;
    if (a.type === 'outpost') {
      a.spawnT -= dt;
      if (a.spawned < a.need && a.spawnT <= 0 && E.count('ch') < 9) {
        a.spawnT = 0.55; const before = E.list.length;
        E.spawnPack(site.x, site.z, 10, 18, { tag: 'ch' });
        a.spawned += E.list.length - before;
      }
      G.ui.banner(`Испытание: ${Math.min(a.killed, a.need)} / ${a.need}`);
      if (a.killed >= a.need || (a.spawned >= a.need && E.count('ch') === 0)) return this.complete();
      if (d > a.leash) return this.fail('Испытание сорвано');
    } else if (a.type === 'rift') {
      a.spawnT -= dt;
      if (a.spawnT <= 0 && E.count('ch') < Math.min(26, 10 + G.diff * 4 + site.zone * 2) / a.few) { a.spawnT = 0.45 * a.few; E.spawnPack(site.x, site.z, 7, 21, { tag: 'ch' }); }
      G.ui.banner(`Разлом: ${fmtTime(45 - a.t + 0.99)}`);
      if (a.t >= 45) return this.complete();
      if (d > a.leash) return this.fail('Ты покинула разлом');
    } else if (a.type === 'ruins') {
      a.spawnT -= dt;
      if (a.spawnT <= 0 && E.count('ch') < Math.min(16, 5 + G.diff * 3) / a.few) { a.spawnT = 0.75 * a.few; E.spawnPack(site.x, site.z, 9, 16, { tag: 'ch' }); }
      const inside = d < 5.5;
      if (inside) a.hold += dt;
      this.zone.material.opacity = inside ? 0.85 : 0.35 + Math.sin(a.t * 8) * 0.2;
      G.ui.banner(`Печать: ${Math.floor(Math.min(SEAL, a.hold))} / ${SEAL} с${inside ? '' : ' — вернись в круг'}`);
      if (a.hold >= SEAL) return this.complete();
      if (d > a.leash) return this.fail('Печать снова застыла');
    } else if (a.type === 'den' || a.type === 'lair') {
      const f = a.foe;
      G.ui.boss(DEF[f.type].name + (f.elite ? '-вожак' : ''), Math.max(0, f.hp / f.maxHp));
      if (d > a.leash) return this.fail(a.type === 'lair' ? 'Хозяин логова снова уснул' : 'Вожак вернулся в гнездо');
    } else if (a.type === 'wisps') {
      a.left -= dt;
      const oy = heightAt(a.ox, a.oz) + 1.3 + Math.sin(a.t * 5) * 0.25, k = Math.max(0.25, a.left / a.max);
      this.orb.position.set(a.ox, oy, a.oz); this.orb.scale.setScalar(0.5 + k * 0.7);
      G.ui.setWisp({ x: a.ox, z: a.oz });
      G.ui.banner(`Огоньки: ${a.idx} / 10 · ${Math.max(0, a.left).toFixed(1)} с`);
      if (Math.hypot(a.ox - px, a.oz - pz) < 1.8) {
        a.idx++; G.sound.sfx('tick'); G.sound.sfx('shard');
        G.fx.burst(a.ox, oy, a.oz, 0xffe066, 12, 5, 1, 4);
        G.addXp(3);
        if (a.idx >= 10) { G.ui.setWisp(null); return this.complete(); }
        this.nextWisp(a);
      } else if (a.left <= 0) { G.ui.setWisp(null); return this.fail('Огонёк погас'); }
    }
  }
}
