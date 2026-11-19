// Видимый мир: куски ландшафта с растительностью и океан. Куски строятся вокруг героя и убираются позади.
import * as THREE from 'three';
import { heightAt, moistAt, biomeOf, biomeAt, sitesNear, pathAt, B, SEED } from './terrain.js';
import { rng, hash2, hashSeed, fbm, pickW, sstep, clamp } from './util.js';
import { M, part, tpl, build, G } from './mesh.js';

const CH = 40, N = 20, CS = CH / N, V = N + 1;
const C = (hex) => new THREE.Color(hex);
const GROUND = [C('#c9b88a'), C('#d9c894'), C('#ecd9a3'), C('#93cf63'), C('#55a556'), C('#6b8550'), C('#93908d'), C('#f3f6f8'), C('#4b403d'), C('#8ea4b8'), C('#6b5c8c'), C('#e3c688')];

const flower = (hex) => tpl([
  part(G.cyl(0.03, 0.03, 0.4, 4), '#4d8f3f', M(0, 0.2, 0)),
  part(G.oct(0.15), hex, M(0, 0.46, 0, [1, 0.7, 1])),
]);
const T = {
  pine: tpl([
    part(G.cyl(0.14, 0.22, 1.3), '#6d4a2f', M(0, 0.65, 0)),
    part(G.cone(1.2, 2.0), '#2c6a45', M(0, 2.0, 0)),
    part(G.cone(0.9, 1.7), '#357a50', M(0, 3.05, 0)),
    part(G.cone(0.55, 1.3), '#43915f', M(0, 3.95, 0)),
  ]),
  tree: tpl([
    part(G.cyl(0.16, 0.24, 1.7), '#7a5334', M(0, 0.85, 0)),
    part(G.ico(1.25), '#58a548', M(0, 2.6, 0, [1, 0.85, 1])),
    part(G.ico(0.8), '#6dbb55', M(0.55, 3.2, 0.3)),
  ]),
  birch: tpl([
    part(G.cyl(0.1, 0.14, 2.2), '#e9e6dc', M(0, 1.1, 0)),
    part(G.ico(0.95), '#a7cf5a', M(0, 2.8, 0, [1, 1.15, 1])),
  ]),
  rock: tpl([part(G.dod(0.7), '#8c8f95', M(0, 0.3, 0, [1.1, 0.7, 0.9]))]),
  boulder: tpl([
    part(G.dod(1.2), '#7f8389', M(0, 0.6, 0, [1, 0.8, 1.1])),
    part(G.dod(0.6), '#93979c', M(1.0, 0.25, 0.4)),
  ]),
  bush: tpl([part(G.ico(0.55), '#4a974d', M(0, 0.35, 0, [1.2, 0.8, 1])), part(G.ico(0.35), '#5eae58', M(0.4, 0.3, 0.2))]),
  tuft: tpl([
    part(G.cone(0.09, 0.5, 4), '#7dbb52', M(0, 0.25, 0)),
    part(G.cone(0.08, 0.4, 4), '#8cc85c', M(0.14, 0.2, 0.05, 1, [0, 0, -0.3])),
    part(G.cone(0.08, 0.42, 4), '#6fae4a', M(-0.12, 0.2, 0.08, 1, [0, 0, 0.3])),
  ]),
  flR: flower('#ff6b7a'), flY: flower('#ffd95a'), flW: flower('#f6f2ff'), flB: flower('#7fb2ff'),
  mush: tpl([part(G.cyl(0.07, 0.09, 0.3), '#f1e8d8', M(0, 0.15, 0)), part(G.cone(0.26, 0.24, 7), '#d9483b', M(0, 0.4, 0))]),
  reed: tpl([
    part(G.cone(0.06, 1.3, 4), '#7c9a48', M(0, 0.65, 0)),
    part(G.cone(0.05, 1.0, 4), '#8aa651', M(0.16, 0.5, 0.06, 1, [0, 0, -0.14])),
    part(G.cone(0.05, 1.1, 4), '#6f8c40', M(-0.14, 0.55, -0.08, 1, [0, 0, 0.12])),
    part(G.cyl(0.06, 0.06, 0.28, 5), '#6b4a2e', M(0, 1.15, 0)),
  ]),
  dead: tpl([
    part(G.cyl(0.07, 0.2, 2.4), '#6a5a4c', M(0, 1.2, 0)),
    part(G.cyl(0.03, 0.07, 1.0), '#6a5a4c', M(0.3, 1.7, 0, 1, [0, 0, -0.9])),
    part(G.cyl(0.03, 0.06, 0.8), '#6a5a4c', M(-0.25, 2.0, 0.1, 1, [0.2, 0, 0.8])),
  ]),
  snow: tpl([part(G.ico(0.9), '#ffffff', M(0, 0.1, 0, [1.3, 0.4, 1.1]))]),
  // --- особые края
  lavarock: tpl([part(G.dod(0.8), '#2c2524', M(0, 0.35, 0, [1.1, 0.7, 1])), part(G.ico(0.22), '#ff6a2a', M(0.25, 0.72, 0.1))]),
  vent: tpl([part(G.cone(0.75, 0.9, 7), '#3a302e', M(0, 0.45, 0)), part(G.cyl(0.24, 0.3, 0.2, 7), '#ff8a3d', M(0, 0.9, 0))]),
  charred: tpl([part(G.cyl(0.08, 0.2, 2.0), '#2a2422', M(0, 1.0, 0)), part(G.cyl(0.03, 0.07, 0.9), '#2a2422', M(0.28, 1.5, 0, 1, [0, 0, -0.9]))]),
  crystal: tpl([part(G.cone(0.32, 1.5, 5), '#9fe8ff', M(0, 0.75, 0)), part(G.cone(0.2, 0.9, 5), '#c9f4ff', M(0.3, 0.42, 0.1, 1, [0, 0, -0.5]))]),
  crystalBig: tpl([part(G.cone(0.55, 3.2, 5), '#7fd6ff', M(0, 1.6, 0)), part(G.cone(0.4, 2.2, 5), '#b9aaff', M(0.6, 1.0, 0.2, 1, [0, 0, -0.45])), part(G.cone(0.35, 1.8, 5), '#9fe8ff', M(-0.5, 0.8, -0.2, 1, [0.2, 0, 0.5]))]),
  shroomBig: tpl([part(G.cyl(0.28, 0.4, 2.6, 7), '#efe6d6', M(0, 1.3, 0)), part(G.cone(1.7, 1.0, 9), '#b55ad6', M(0, 3.0, 0)), part(G.ico(0.2), '#f4e9ff', M(0.7, 2.9, 0.5)), part(G.ico(0.16), '#f4e9ff', M(-0.6, 3.0, -0.3))]),
  shroom: tpl([part(G.cyl(0.12, 0.17, 1.0, 6), '#efe6d6', M(0, 0.5, 0)), part(G.cone(0.6, 0.45, 8), '#4fd0c0', M(0, 1.15, 0))]),
  cactus: tpl([part(G.cyl(0.26, 0.3, 2.0, 7), '#4f9a58', M(0, 1.0, 0)), part(G.cyl(0.14, 0.16, 0.9, 6), '#5aa863', M(0.5, 1.3, 0)), part(G.cyl(0.14, 0.16, 0.7, 6), '#5aa863', M(-0.48, 1.0, 0))]),
  drybush: tpl([part(G.ico(0.5), '#b9a36a', M(0, 0.25, 0, [1.2, 0.6, 1]))]),
  bones: tpl([part(G.cone(0.12, 1.4, 5), '#efe7d4', M(0.3, 0.6, 0, 1, [0, 0, 0.5])), part(G.cone(0.12, 1.2, 5), '#efe7d4', M(-0.3, 0.5, 0.3, 1, [0, 0, -0.5]))]),
  frost: tpl([part(G.cyl(0.12, 0.2, 1.1), '#5b4636', M(0, 0.55, 0)), part(G.cone(1.0, 1.8), '#dfeef2', M(0, 1.7, 0)), part(G.cone(0.7, 1.5), '#f4fbff', M(0, 2.7, 0))]),
};

// Биом -> плотность и набор растений [шаблон, вес, мин. размер, макс. размер].
const DEC = {
  [B.BEACH]: { d: 0.1, t: [['rock', 3, 0.5, 1], ['tuft', 4, 0.8, 1.3]] },
  [B.MEADOW]: { d: 0.36, t: [['flR', 4, 0.8, 1.3], ['flY', 5, 0.8, 1.3], ['flW', 3, 0.8, 1.3], ['flB', 2, 0.8, 1.2], ['tuft', 8, 0.8, 1.5], ['bush', 3, 0.7, 1.2], ['birch', 1.6, 0.9, 1.3], ['rock', 1, 0.5, 1.1]] },
  [B.FOREST]: { d: 0.66, t: [['pine', 10, 0.8, 1.5], ['tree', 7, 0.8, 1.4], ['birch', 2, 0.8, 1.2], ['bush', 4, 0.7, 1.3], ['mush', 2, 0.8, 1.6], ['rock', 1.5, 0.6, 1.3], ['tuft', 3, 0.8, 1.3]] },
  [B.SWAMP]: { d: 0.5, t: [['reed', 10, 0.8, 1.4], ['dead', 3, 0.8, 1.3], ['bush', 3, 0.6, 1], ['mush', 3, 0.9, 1.8]] },
  [B.ROCK]: { d: 0.3, t: [['rock', 6, 0.7, 1.6], ['boulder', 4, 0.8, 1.5], ['pine', 1.5, 0.6, 0.9]] },
  [B.SNOW]: { d: 0.24, t: [['snow', 6, 0.8, 1.8], ['boulder', 2, 0.7, 1.3], ['frost', 2, 0.7, 1.1]] },
  [B.VOLCANO]: { d: 0.3, t: [['lavarock', 7, 0.7, 1.6], ['vent', 2, 0.8, 1.4], ['charred', 3, 0.8, 1.3], ['boulder', 1.5, 0.6, 1.1]] },
  [B.CRYSTAL]: { d: 0.34, t: [['crystal', 9, 0.7, 1.5], ['crystalBig', 2.5, 0.8, 1.4], ['rock', 3, 0.5, 1.1]] },
  [B.MUSHROOM]: { d: 0.6, t: [['shroomBig', 6, 0.7, 1.5], ['shroom', 9, 0.7, 1.5], ['mush', 5, 1, 1.8], ['bush', 2, 0.6, 1]] },
  [B.DUNES]: { d: 0.13, t: [['cactus', 4, 0.7, 1.3], ['drybush', 5, 0.7, 1.3], ['bones', 1, 0.8, 1.3], ['rock', 2, 0.5, 1]] },
};

for (const k in DEC) DEC[k].w = DEC[k].t.map((t) => [t, t[1]]);

// Ориентиры: редкие крупные вещи, на которые хочется ползти посмотреть.
const cyl = (r1, r2, h, s) => new THREE.CylinderGeometry(r1, r2, h, s);
const HP = Math.PI / 2;
const LAND = [
  tpl([ // дерево-великан
    part(cyl(0.75, 1.3, 8.5, 7), '#6a4a30', M(0, 4.2, 0)),
    part(G.cone(0.5, 2.6, 5), '#6a4a30', M(1.3, 0.8, 0.3, 1, [0, 0, -1.1])), part(G.cone(0.5, 2.6, 5), '#6a4a30', M(-1.1, 0.8, -0.8, 1, [0.4, 0, 1.1])),
    part(G.ico(4.8, 1), '#3c8a47', M(0, 11, 0, [1, 0.72, 1])), part(G.ico(3.1, 1), '#4ea256', M(2.9, 9.4, 1.6)), part(G.ico(2.7, 1), '#35803f', M(-2.6, 9.9, -1.4)),
  ]),
  tpl([ // каменная арка
    part(G.box(1.4, 6.4, 1.4), '#9a958c', M(2.6, 3, 0)), part(G.box(1.4, 6.4, 1.4), '#8f8a81', M(-2.6, 3, 0)),
    part(G.box(7.6, 1.2, 1.6), '#a39e94', M(0, 6.7, 0)), part(G.box(7.7, 0.26, 1.7), '#6f9a52', M(0, 7.4, 0)),
    part(G.dod(0.9), '#8a857c', M(3.9, 0.3, 1)), part(G.dod(0.6), '#8a857c', M(-3.6, 0.2, -0.9)),
  ]),
  tpl([ // остов древнего зверя
    part(cyl(0.24, 0.3, 9, 6), '#e8e0cc', M(0, 0.5, 0, 1, [HP, 0, 0])),
    ...[-3, -1.5, 0, 1.5, 3].flatMap((z, i) => [
      part(G.cone(0.2, 4.2 - Math.abs(i - 2) * 0.5, 5), '#efe7d4', M(1.3, 1.9, z, 1, [0, 0, 0.5])),
      part(G.cone(0.2, 4.2 - Math.abs(i - 2) * 0.5, 5), '#efe7d4', M(-1.3, 1.9, z, 1, [0, 0, -0.5])),
    ]),
    part(G.dod(1.1), '#e8e0cc', M(0, 0.9, 5.4, [0.9, 0.8, 1.3])),
  ]),
  tpl([ // круг стоячих камней
    ...[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return part(G.box(1.1, 4.4 + (i % 2) * 1.4, 0.8), i % 2 ? '#7e828c' : '#8c9099', M(Math.sin(a) * 4.6, 2, Math.cos(a) * 4.6, 1, [0.05, a, 0.06])); }),
    part(G.box(2.6, 0.5, 1.6), '#757984', M(0, 0.2, 0, 1, [0, 0.5, 0])),
  ]),
];
const PATCH_WARM = C('#c9da6c'), PATCH_DEEP = C('#2c7443'), DIRT = C('#b9996b'), FOAM = C('#f6f3e6'), CLIFF = C('#857c72');

function buildChunk(cx, cz, mat) {
  const x0 = cx * CH, z0 = cz * CH;
  const hs = new Float32Array(V * V), ms = new Float32Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const x = x0 + i * CS, z = z0 + j * CS;
    hs[j * V + i] = heightAt(x, z);
    ms[j * V + i] = moistAt(x, z);
  }

  // Растительность: сначала решаем, что и где стоит, чтобы знать размер буферов.
  const r = rng(hashSeed(cx, cz, SEED + 900));
  const sites = sitesNear(x0 + CH / 2, z0 + CH / 2, CH + 14);
  const items = [];
  let extra = 0;
  for (let k = 0; k < 130; k++) {
    const x = x0 + r() * CH, z = z0 + r() * CH, roll = r(), pickRoll = r(), sRoll = r(), rot = r() * 6.283, tint = 0.86 + r() * 0.24;
    const h = heightAt(x, z);
    if (h < 0.5) continue;
    const b = biomeAt(x, z, h, moistAt(x, z));
    const dec = DEC[b];
    if (!dec || roll > dec.d) continue;
    // Прорехи: тропинки и поляны.
    if (b === B.FOREST && fbm(x * 0.045, z * 0.045, SEED + 5, 2) > 0.16) continue;
    if (pathAt(x, z) < 0.04) continue;
    let blocked = false;
    for (const s of sites) { const dx = s.x - x, dz = s.z - z; if (dx * dx + dz * dz < 121) { blocked = true; break; } }
    if (blocked) continue;
    const row = pickW(dec.w, pickRoll);
    const t = T[row[0]];
    items.push({ t, x, y: h - 0.05, z, s: row[2] + (row[3] - row[2]) * sRoll, cs: Math.cos(rot), sn: Math.sin(rot), tint });
    extra += t.pos.length;
  }

  if (hash2(cx, cz, SEED + 77) < 0.08) {
    const x = x0 + CH / 2 + (hash2(cx, cz, SEED + 78) - 0.5) * 14, z = z0 + CH / 2 + (hash2(cx, cz, SEED + 79) - 0.5) * 14, h = heightAt(x, z);
    const flat = Math.abs(heightAt(x + 4, z) - h) < 1.3 && Math.abs(heightAt(x, z + 4) - h) < 1.3;
    const free = sites.every((s) => Math.hypot(s.x - x, s.z - z) > 26) && Math.hypot(x, z) > 30;
    if (h > 2 && h < 9.5 && flat && free) {
      const t = LAND[Math.floor(hash2(cx, cz, SEED + 80) * LAND.length)], rot = hash2(cx, cz, SEED + 81) * 6.283;
      items.push({ t, x, y: h - 0.25, z, s: 0.9 + hash2(cx, cz, SEED + 82) * 0.35, cs: Math.cos(rot), sn: Math.sin(rot), tint: 1 });
      extra += t.pos.length;
    }
  }

  const total = N * N * 18 + extra;
  const pos = new Float32Array(total), col = new Float32Array(total);
  let o = 0;
  const put = (i, j, c) => {
    pos[o] = x0 + i * CS; pos[o + 1] = hs[j * V + i]; pos[o + 2] = z0 + j * CS;
    col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2];
    o += 3;
  };
  const tc = [0, 0, 0];
  const triColor = (i0, j0, i1, j1, i2, j2, salt) => {
    const h0 = hs[j0 * V + i0], h1 = hs[j1 * V + i1], h2 = hs[j2 * V + i2], h = (h0 + h1 + h2) / 3;
    const m = (ms[j0 * V + i0] + ms[j1 * V + i1] + ms[j2 * V + i2]) / 3;
    const wx = x0 + ((i0 + i1 + i2) / 3) * CS, wz = z0 + ((j0 + j1 + j2) / 3) * CS;
    const b = biomeAt(wx, wz, h, m), g = GROUND[b];
    let r = g.r, gg = g.g, bl = g.b;
    const mix = (c, t) => { r += (c.r - r) * t; gg += (c.g - gg) * t; bl += (c.b - bl) * t; };
    if (b === B.MEADOW || b === B.FOREST || b === B.SWAMP) {
      // Пятна: где-то трава выгорела, где-то гуще. И тропы.
      const p = clamp(fbm(wx * 0.035, wz * 0.035, SEED + 61, 2) * 1.7, -0.6, 0.6);
      if (p > 0) mix(PATCH_WARM, p * 0.55); else mix(PATCH_DEEP, -p * 0.6);
      const pa = pathAt(wx, wz);
      if (pa < 0.05) mix(DIRT, (1 - sstep(0.02, 0.05, pa)) * 0.85);
    }
    if (h > -0.4 && h < 0.3) mix(FOAM, 0.55);
    const slope = (Math.max(h0, h1, h2) - Math.min(h0, h1, h2)) / CS;
    if (slope > 0.7 && h > 1 && b !== B.SNOW) mix(CLIFF, clamp((slope - 0.7) * 1.7, 0, 0.9));
    const k = 0.92 + hash2(cx * N + i0 + salt * 7, cz * N + j0, 3 + salt) * 0.16;
    tc[0] = r * k; tc[1] = gg * k; tc[2] = bl * k;
    return tc;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let c = triColor(i, j, i, j + 1, i + 1, j, 0);
    put(i, j, c); put(i, j + 1, c); put(i + 1, j, c);
    c = triColor(i + 1, j, i, j + 1, i + 1, j + 1, 1);
    put(i + 1, j, c); put(i, j + 1, c); put(i + 1, j + 1, c);
  }
  for (const it of items) {
    const p = it.t.pos, c = it.t.col, n = p.length;
    for (let i = 0; i < n; i += 3) {
      const lx = p[i] * it.s, ly = p[i + 1] * it.s, lz = p[i + 2] * it.s;
      pos[o] = it.x + lx * it.cs + lz * it.sn;
      pos[o + 1] = it.y + ly;
      pos[o + 2] = it.z - lx * it.sn + lz * it.cs;
      col[o] = c[i] * it.tint; col[o + 1] = c[i + 1] * it.tint; col[o + 2] = c[i + 2] * it.tint;
      o += 3;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _gv = new THREE.Vector3(), _gs = new THREE.Vector3(), _ge = new THREE.Euler(), _gc = new THREE.Color();
const GRASS_A = C('#8fd062'), GRASS_B = C('#4f9f52'), GRASS_C = C('#c4d96a');

/** Живая трава вокруг героя: один набор пучков, который переезжает вместе с ним и качается на ветру. */
export class Grass {
  constructor(scene) {
    const geo = build([
      part(G.cone(0.09, 0.62, 4), '#ffffff', M(0, 0.31, 0)),
      part(G.cone(0.08, 0.5, 4), '#f2f2f2', M(0.15, 0.25, 0.05, 1, [0, 0, -0.32])),
      part(G.cone(0.08, 0.52, 4), '#e6e6e6', M(-0.13, 0.26, 0.09, 1, [0.1, 0, 0.3])),
      part(G.cone(0.07, 0.44, 4), '#f2f2f2', M(0.02, 0.22, -0.14, 1, [-0.3, 0, 0])),
    ]);
    this.uTime = { value: 0 };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
          float sw = sin(uTime * 1.8 + ph) * 0.16 + sin(uTime * 3.1 + ph * 1.7) * 0.06;
          transformed.x += sw * position.y; transformed.z += sw * 0.6 * position.y;
        #endif`);
    };
    this.cap = 1300;
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.count = 0;
    this.cx = 1e9; this.cz = 1e9;
    scene.add(this.mesh);
  }

  /** cx/cz — центр травяного пятна (чуть впереди камеры). Пересчёт — только когда центр заметно сдвинулся. */
  update(cx, cz, time) {
    this.uTime.value = time;
    if (Math.hypot(cx - this.cx, cz - this.cz) < 3.4) return;
    this.cx = cx; this.cz = cz;
    const sites = sitesNear(cx, cz, 40);   // на площадках вызовов трава не растёт
    const S = 1.6, R = 31, gx0 = Math.floor((cx - R) / S), gx1 = Math.ceil((cx + R) / S), gz0 = Math.floor((cz - R) / S), gz1 = Math.ceil((cz + R) / S);
    let k = 0;
    for (let gz = gz0; gz <= gz1 && k < this.cap; gz++) for (let gx = gx0; gx <= gx1 && k < this.cap; gx++) {
      const hsh = hash2(gx, gz, 92);
      if (hsh > 0.6) continue;
      const x = (gx + 0.5 + (hash2(gx, gz, 93) - 0.5) * 0.9) * S, z = (gz + 0.5 + (hash2(gx, gz, 94) - 0.5) * 0.9) * S;
      const d = Math.hypot(x - cx, z - cz);
      if (d > R) continue;
      const h = heightAt(x, z);
      if (h < 1.15 || h > 11) continue;
      const b = biomeAt(x, z, h, moistAt(x, z));
      if ((b !== B.MEADOW && b !== B.FOREST) || pathAt(x, z) < 0.045) continue;
      if (sites.some((q) => (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) < 36)) continue;
      // К краю пятна пучки мельчают — так они не «выскакивают» из ниоткуда.
      const sc = (0.8 + hsh * 1.5) * sstep(R, R - 7, d);
      _gq.setFromEuler(_ge.set(0, hsh * 40, 0));
      _gm.compose(_gv.set(x, h - 0.03, z), _gq, _gs.set(sc, sc * (0.8 + hash2(gx, gz, 95) * 0.6), sc));
      this.mesh.setMatrixAt(k, _gm);
      _gc.copy(b === B.MEADOW ? GRASS_A : GRASS_B).lerp(GRASS_C, hash2(gx, gz, 96) * 0.45);
      this.mesh.setColorAt(k, _gc);
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const WATER_VS = `
uniform float uTime; varying float vWave;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float w = sin(wp.x * 0.33 + uTime * 0.9) * 0.11 + sin(wp.z * 0.27 + uTime * 0.7) * 0.11 + sin((wp.x + wp.z) * 0.12 + uTime * 0.4) * 0.08;
  wp.y += w; vWave = w;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FS = `
uniform vec3 uColor; uniform vec3 uCrest; varying float vWave;
#include <fog_pars_fragment>
void main() {
  vec3 c = mix(uColor, uCrest, smoothstep(0.08, 0.28, vWave) * 0.4);
  gl_FragColor = vec4(c, 0.78);
  #include <fog_fragment>
}`;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.queue = [];
    this.radius = 3;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.lastKey = '';
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uColor: { value: C('#2f86b8') }, uCrest: { value: C('#bfe9f5') },
      }]),
      vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, fog: true,
    });
    const wg = new THREE.PlaneGeometry(520, 520, 64, 64);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, this.waterMat);
    this.water.frustumCulled = false;
    this.water.renderOrder = 1;
    scene.add(this.water);
  }

  /** Построить ближайшие куски сразу — чтобы герой не появился в пустоте. */
  prime(px, pz) {
    const cx = Math.floor(px / CH), cz = Math.floor(pz / CH);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) this.ensure(cx + i, cz + j);
  }

  ensure(cx, cz) {
    const key = cx + ',' + cz;
    if (this.chunks.has(key)) return;
    const mesh = buildChunk(cx, cz, this.mat);
    this.chunks.set(key, mesh);
    this.scene.add(mesh);
  }

  update(px, pz, time, dayLight) {
    const cx = Math.floor(px / CH), cz = Math.floor(pz / CH), R = this.radius;
    const key = cx + ',' + cz + ',' + R;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.queue.length = 0;
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        if (i * i + j * j > (R + 0.5) * (R + 0.5)) continue;
        if (!this.chunks.has((cx + i) + ',' + (cz + j))) this.queue.push([cx + i, cz + j, i * i + j * j]);
      }
      this.queue.sort((a, b) => b[2] - a[2]);
      for (const [k, mesh] of this.chunks) {
        const [x, z] = k.split(',').map(Number);
        if (Math.abs(x - cx) > R + 1 || Math.abs(z - cz) > R + 1) {
          this.scene.remove(mesh); mesh.geometry.dispose(); this.chunks.delete(k);
        }
      }
    }
    if (this.queue.length) { const q = this.queue.pop(); this.ensure(q[0], q[1]); }
    // Океан всегда под героем, сдвигается по сетке волн, чтобы рябь не «плыла» вместе с ним.
    this.water.position.set(Math.round(px / 8) * 8, 0, Math.round(pz / 8) * 8);
    this.waterMat.uniforms.uTime.value = time;
    this.waterMat.uniforms.uColor.value.setRGB(0.03 + 0.1 * dayLight, 0.09 + 0.32 * dayLight, 0.2 + 0.42 * dayLight);
    this.waterMat.uniforms.uCrest.value.setRGB(0.25 + 0.5 * dayLight, 0.35 + 0.5 * dayLight, 0.5 + 0.45 * dayLight);
  }
}
