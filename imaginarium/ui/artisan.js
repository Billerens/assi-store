import * as T from './vendor/three.module.js';

const v3 = (p) => new T.Vector3(...p);
export function seeded(value) {
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const surfaceCache = new Map(),
  swatches = new Map(),
  dummy = new T.Object3D();
function texture(kind) {
  if (surfaceCache.has(kind)) return surfaceCache.get(kind);
  const n = 256,
    c = document.createElement('canvas');
  c.width = c.height = n;
  const a = c.getContext('2d'),
    data = a.createImageData(n, n),
    rnd = seeded(529);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let value = 225;
      if (kind === 'wood') {
        const yy = y / n,
          xx = x / n;
        const curl =
          0.022 * Math.sin(xx * 6.283 + 0.22 * Math.sin(yy * 6.283)) +
          0.009 * Math.sin(xx * 12.566 + yy * 6.283);
        const ring = Math.sin((yy + curl) * 6.283 * 11 + Math.sin((yy + curl) * 6.283 * 3) * 1.4);
        value =
          226 +
          14 * ring -
          18 * Math.pow(Math.max(ring, 0), 9) +
          9 * Math.sin((yy + curl) * 6.283 * 51) +
          rnd() * 13;
      } else if (kind === 'linen') {
        value = 202 + (x % 4 < 2 ? 15 : -5) + (y % 4 < 2 ? 14 : -3) + rnd() * 17;
      } else if (kind === 'hide') {
        value =
          212 + 13 * Math.sin(x * 0.48 + Math.sin(y * 0.24)) + 7 * Math.sin(y * 0.67 + x * 0.11) + rnd() * 24;
      } else if (kind === 'metal') {
        value = 225 + 10 * Math.sin(y * 2.54) + rnd() * 12;
      } else value = 225 + rnd() * 25;
      const i = (y * n + x) * 4;
      data.data[i] = value;
      data.data[i + 1] = value;
      data.data[i + 2] = value;
      data.data[i + 3] = 255;
    }
  a.putImageData(data, 0, 0);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  surfaceCache.set(kind, t);
  return t;
}
export function finish(name, color) {
  const key = name + color;
  if (swatches.has(key)) return swatches.get(key);
  const kind = { wood: 'wood', leather: 'hide', cloth: 'linen', metal: 'metal', paper: 'paper' }[name];
  const m = new T.MeshStandardMaterial({
    color,
    roughness:
      { wood: 0.45, leather: 0.52, cloth: 0.89, metal: 0.32, glass: 0.21, porcelain: 0.28 }[name] ?? 0.78,
    metalness: name === 'metal' ? 0.81 : 0,
    side: T.DoubleSide
  });
  if (kind) {
    m.map = texture(kind);
    if (name !== 'metal' && name !== 'paper') {
      m.bumpMap = m.map;
      m.bumpScale = name === 'cloth' ? 0.0018 : 0.0028;
    }
  }
  if (name === 'glass') {
    m.emissive.set(color);
    m.emissiveIntensity = 0.22;
    m.metalness = 0.12;
  }
  if (name === 'clearGlass') {
    m.transparent = true;
    m.opacity = 0.62;
    m.depthWrite = false;
    m.roughness = 0.18;
    m.metalness = 0.11;
  }
  m.userData.shared = true;
  swatches.set(key, m);
  return m;
}
let environment;
export function studioLight(scene) {
  if (!environment) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, '#b6b8a5');
    sky.addColorStop(0.5, '#86887a');
    sky.addColorStop(0.68, '#443626');
    sky.addColorStop(1, '#3a3126');
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#f6e4c1';
      g.fillRect(28 + i * 10, 33, 8, 31);
      g.fillStyle = '#e7b973';
      g.fillRect(168 + i * 8, 40, 6, 14);
    }
    environment = new T.CanvasTexture(c);
    environment.mapping = T.EquirectangularReflectionMapping;
    environment.colorSpace = T.SRGBColorSpace;
  }
  scene.environment = environment;
}
// Dimensioned bevels retain the same edge radius on a long rail and on its end.
export function bevel(w, h, d, r = 0.025) {
  r = Math.min(w / 2 - 0.00001, h / 2 - 0.00001, d / 2 - 0.00001, r);
  const pos = [],
    norm = [],
    uv = [],
    idx = [],
    half = [w / 2, h / 2, d / 2],
    inner = half.map((v) => v - r);
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const u = (axis + 1) % 3,
        v = (axis + 2) % 3;
      const stops = (i) => [-half[i], -half[i] + r * 0.45, -inner[i], inner[i], half[i] - r * 0.45, half[i]];
      const us = stops(u),
        vs = stops(v),
        start = pos.length / 3;
      for (let j = 0; j < 6; j++)
        for (let i = 0; i < 6; i++) {
          const p = [0, 0, 0];
          p[axis] = half[axis] * sign;
          p[u] = us[i];
          p[v] = vs[j];
          const center = p.map((q, k) => Math.max(-inner[k], Math.min(inner[k], q)));
          const n = v3(p).sub(v3(center)).normalize();
          const q = v3(center).addScaledVector(n, r);
          pos.push(...q.toArray());
          norm.push(...n.toArray());
          uv.push((us[i] + half[u]) / (2 * half[u]), (vs[j] + half[v]) / (2 * half[v]));
          if (i && j) {
            const b = start + j * 6 + i;
            if (sign > 0) idx.push(b - 7, b - 6, b, b - 7, b, b - 1);
            else idx.push(b - 7, b, b - 6, b - 7, b - 1, b);
          }
        }
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(norm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
export function rings(rows, steps = 16) {
  const pos = [],
    uv = [],
    index = [];
  rows.forEach(([x, y, z, rx, rz], j) => {
    for (let i = 0; i <= steps; i++) {
      const angle = (i * 2 * Math.PI) / steps;
      pos.push(x + rx * Math.cos(angle), y, z + rz * Math.sin(angle));
      uv.push(i / steps, j / (rows.length - 1));
      if (j && i) {
        const b = j * (steps + 1) + i;
        index.push(b - steps - 2, b - 1, b, b - steps - 2, b, b - steps - 1);
      }
    }
  });
  // Close the lower and upper ends, including the four pads which meet the floor.
  for (const end of [0, rows.length - 1]) {
    const r = rows[end],
      center = pos.length / 3;
    pos.push(...r.slice(0, 3));
    uv.push(0.5, 0.5);
    for (let i = 0; i < steps; i++) {
      const a = end * (steps + 1) + i;
      end ? index.push(center, a + 1, a) : index.push(center, a, a + 1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
export function turning(profile, n = 20) {
  return rings(
    profile.map(([y, r]) => [0, y, 0, r, r]),
    n
  );
}
export function pipe(points, r = 0.012, n = points.length * 2, closed = false) {
  const count = Math.max(4, n),
    segments = 8;
  const g = new T.TubeGeometry(
    new T.CatmullRomCurve3(points.map(v3), closed, 'centripetal'),
    count,
    r,
    segments,
    closed
  );
  if (!closed) {
    const index = Array.from(g.index.array);
    for (let i = 1; i < segments - 1; i++) {
      index.push(0, i + 1, i);
      const end = count * (segments + 1);
      index.push(end, end + i, end + i + 1);
    }
    g.setIndex(index);
  }
  return g;
}
export function rod(a, b, r0 = 0.022, r1 = r0, n = 12) {
  const from = v3(a),
    to = v3(b),
    dir = to.clone().sub(from);
  const geo = new T.CylinderGeometry(r1, r0, dir.length(), n);
  geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize()));
  geo.translate(...from.add(to).multiplyScalar(0.5).toArray());
  return geo;
}
export function transform(geo, at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  dummy.position.set(...at);
  dummy.rotation.set(...rot);
  dummy.scale.set(...scale);
  dummy.updateMatrix();
  geo.applyMatrix4(dummy.matrix);
  return geo;
}
// Merge static pieces per material and per room; carved profiles can share a single draw.
export class Cast {
  constructor() {
    this.groups = new Map();
  }
  add(g, m, p, rot, scale) {
    if (p || rot || scale) transform(g, p, rot, scale);
    if (!this.groups.has(m)) this.groups.set(m, []);
    this.groups.get(m).push(g);
  }
  box(m, p, w, h, d, r = 0.016, rot) {
    this.add(bevel(w, h, d, r), m, p, rot);
  }
  ellipsoid(m, p, w, h, d, rot) {
    this.add(new T.SphereGeometry(0.5, 14, 8), m, p, rot, [w, h, d]);
  }
  line(m, points, r = 0.01, n, closed) {
    this.add(pipe(points, r, n, closed), m);
  }
  meshes(group = new T.Group()) {
    for (const [m, parts] of this.groups) {
      let count = 0,
        indices = 0;
      for (const g of parts) {
        count += g.attributes.position.count;
        indices += g.index?.count || g.attributes.position.count;
      }
      const out = new T.BufferGeometry(),
        pos = new Float32Array(count * 3),
        norm = new Float32Array(count * 3),
        uv = new Float32Array(count * 2),
        idx = count > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
      let start = 0,
        ii = 0;
      for (const g of parts) {
        const a = g.attributes,
          ct = a.position.count;
        pos.set(a.position.array, start * 3);
        norm.set(a.normal.array, start * 3);
        if (a.uv) uv.set(a.uv.array, start * 2);
        const ni = g.index?.count || ct;
        for (let i = 0; i < ni; i++) idx[ii++] = start + (g.index ? g.index.getX(i) : i);
        start += ct;
      }
      out.setAttribute('position', new T.BufferAttribute(pos, 3));
      out.setAttribute('normal', new T.BufferAttribute(norm, 3));
      out.setAttribute('uv', new T.BufferAttribute(uv, 2));
      out.setIndex(new T.BufferAttribute(idx, 1));
      out.computeBoundingSphere();
      const mesh = new T.Mesh(out, m);
      group.add(mesh);
    }
    return group;
  }
}
