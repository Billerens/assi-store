// Сборка низкополигональных фигур: несколько примитивов в одну геометрию с цветами вершин.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _e = new THREE.Euler();

/** Матрица: позиция, масштаб (число или [x,y,z]), поворот [x,y,z]. */
export function M(x = 0, y = 0, z = 0, s = 1, rot = null) {
  const sc = Array.isArray(s) ? new THREE.Vector3(s[0], s[1], s[2]) : new THREE.Vector3(s, s, s);
  if (rot) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])); else _q.identity();
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, sc);
}

/** Примитив, цвет и матрица -> кусок будущей фигуры. */
export function part(geo, hex, m) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (m) g.applyMatrix4(m);
  return { p: g.attributes.position.array, c: new THREE.Color(hex) };
}

/** Куски -> массивы позиций и цветов (шаблон, который можно тиражировать). */
export function tpl(parts) {
  let n = 0;
  for (const q of parts) n += q.p.length;
  const pos = new Float32Array(n), col = new Float32Array(n);
  let o = 0;
  for (const q of parts) {
    pos.set(q.p, o);
    for (let i = 0; i < q.p.length; i += 3) { col[o + i] = q.c.r; col[o + i + 1] = q.c.g; col[o + i + 2] = q.c.b; }
    o += q.p.length;
  }
  return { pos, col };
}

/** Куски -> готовая геометрия с гранёными нормалями. */
export function build(parts) {
  const t = tpl(parts);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(t.pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(t.col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export const G = {
  cone: (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg, 1, true),
  cyl: (r1, r2, h, seg = 5) => new THREE.CylinderGeometry(r1, r2, h, seg, 1, true),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  dod: (r) => new THREE.DodecahedronGeometry(r, 0),
  oct: (r) => new THREE.OctahedronGeometry(r, 0),
  box: (x, y, z) => new THREE.BoxGeometry(x, y, z),
};

export const vcMat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
