// Чистые функции мира: высота, влажность, биом, места вызовов. Никакой графики.
import { fbm, sstep, rng, hashSeed, pickW } from './util.js';

export const SEED = 20261;
export const B = { DEEP: 0, SHALLOW: 1, BEACH: 2, MEADOW: 3, FOREST: 4, SWAMP: 5, ROCK: 6, SNOW: 7, VOLCANO: 8, CRYSTAL: 9, MUSHROOM: 10, DUNES: 11 };

export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  const home = Math.max(0, 1 - d / 190);
  const c = fbm(x * 0.0032, z * 0.0032, SEED, 4) + home * 0.6;
  const land = sstep(-0.17, 0.03, c);
  const hills = fbm(x * 0.021, z * 0.021, SEED + 51, 3);
  const r = 1 - Math.abs(fbm(x * 0.0062, z * 0.0062, SEED + 97, 3));
  const r2 = r * r, ridge = r2 * r2 * r2;
  const inland = sstep(0.08, 0.36, c) * (1 - home);
  return -5.5 + land * 10.5 + hills * 2.8 * (0.25 + land) + ridge * inland * 30;
}

export const moistAt = (x, z) => fbm(x * 0.0058 + 300, z * 0.0058 - 200, SEED + 7, 3);

export function biomeOf(h, m) {
  if (h < -1.3) return B.DEEP;
  if (h < 0.15) return B.SHALLOW;
  if (h < 1.1) return B.BEACH;
  if (h > 17) return B.SNOW;
  if (h > 11.5) return B.ROCK;
  if (m > 0.2 && h < 3.4) return B.SWAMP;
  if (m > -0.07) return B.FOREST;
  return B.MEADOW;
}

/** Особые края: большие области со своим видом и своими правилами. Вокруг начала мира их нет. */
export function biomeAt(x, z, h, m) {
  const b = biomeOf(h, m);
  if (b !== B.MEADOW && b !== B.FOREST && b !== B.SWAMP) return b;
  if (x * x + z * z < 360 * 360) return b;
  const r = fbm(x * 0.0019 + 900, z * 0.0019 - 400, SEED + 211, 2);
  if (r > -0.27 && r < 0.27) return b;
  const k = fbm(x * 0.0013 - 123, z * 0.0013 + 77, SEED + 307, 2);
  return r > 0 ? (k < 0 ? B.VOLCANO : B.CRYSTAL) : (k < 0 ? B.MUSHROOM : B.DUNES);
}

export const walkable = (x, z) => heightAt(x, z) > -0.5;

/** Насколько точка близка к тропе: меньше 0.04 — прямо на ней. Тропы вьются по всему миру. */
export const pathAt = (x, z) => Math.abs(fbm(x * 0.0105 + 40, z * 0.0105 - 70, SEED + 33, 2));

// ---- Места вызовов: по одному на клетку, всегда в одном и том же месте.
export const CELL = 150;
const TYPE_W = [['outpost', 21], ['rift', 14], ['altar', 13], ['den', 13], ['wisps', 13], ['idol', 8], ['lair', 10], ['ruins', 12], ['forge', 7], ['copier', 7], ['pool', 6], ['plates', 9], ['shrine', 7], ['maze', 8]];
const ADJ = ['Тихий', 'Забытый', 'Туманный', 'Дальний', 'Старый', 'Сонный', 'Янтарный', 'Седой', 'Лунный', 'Ветреный', 'Мшистый', 'Солёный'];
const NOUN = ['холм', 'маяк', 'брод', 'камень', 'утёс', 'берег', 'дол', 'мыс', 'ручей', 'бор', 'луг', 'перевал'];
const cache = new Map();

export function siteInCell(cx, cz) {
  const key = cx + ',' + cz;
  if (cache.has(key)) return cache.get(key);
  const r = rng(hashSeed(cx, cz, SEED + 500));
  let site = null;
  if (r() < 0.86) {
    for (let i = 0; i < 8 && !site; i++) {
      const x = (cx + 0.5) * CELL + (r() - 0.5) * CELL * 0.62;
      const z = (cz + 0.5) * CELL + (r() - 0.5) * CELL * 0.62;
      const h = heightAt(x, z);
      if (h < 1.7 || h > 10) continue;
      const slope = Math.max(
        Math.abs(heightAt(x + 5, z) - h), Math.abs(heightAt(x - 5, z) - h),
        Math.abs(heightAt(x, z + 5) - h), Math.abs(heightAt(x, z - 5) - h));
      const dist = Math.hypot(x, z);
      if (slope > 1.7 || dist < 48) continue;
      let type = pickW(TYPE_W, r());
      if (type === 'lair' && dist < 260) type = 'outpost';
      site = {
        id: key, x, z, y: h, type,
        name: ADJ[Math.floor(r() * ADJ.length)] + ' ' + NOUN[Math.floor(r() * NOUN.length)],
        zone: Math.floor(dist / 320),
      };
    }
  }
  cache.set(key, site);
  return site;
}

export function sitesNear(x, z, rad) {
  const out = [];
  const c0x = Math.floor((x - rad) / CELL), c1x = Math.floor((x + rad) / CELL);
  const c0z = Math.floor((z - rad) / CELL), c1z = Math.floor((z + rad) / CELL);
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    const s = siteInCell(cx, cz);
    if (s && Math.hypot(s.x - x, s.z - z) <= rad) out.push(s);
  }
  return out;
}

/** Ровное сухое место рядом с точкой: для начала забега и появления существ. */
export function findLand(x, z, maxR = 60, minH = 2.2, maxH = 8) {
  for (let rad = 0; rad <= maxR; rad += 4) {
    const steps = rad === 0 ? 1 : 10;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 + rad * 0.37;
      const px = x + Math.sin(a) * rad, pz = z + Math.cos(a) * rad;
      const h = heightAt(px, pz);
      if (h < minH || h > maxH) continue;
      if (Math.abs(heightAt(px + 3, pz) - h) > 1 || Math.abs(heightAt(px, pz + 3) - h) > 1) continue;
      return { x: px, z: pz };
    }
  }
  return { x, z };
}
