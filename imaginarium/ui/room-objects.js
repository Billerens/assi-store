import * as T from './vendor/three.module.js';
import { bevel, finish, pipe, rod, turning, seeded } from './artisan.js';

export function pottedTree(c, x, z, h) {
  const random = seeded(Math.round(730 + h * 77 + x * 11)),
    pot = finish('porcelain', '#887c65'),
    rim = finish('porcelain', '#645740'),
    bark = finish('wood', '#76553b'),
    twig = finish('wood', '#766342');
  const radius = 0.28 + (h - 1) * 0.04,
    ph = radius * 1.5,
    crownWidth = h * 0.32;
  c.add(
    turning(
      [
        [0, 0.65],
        [0.026, 0.78],
        [0.056, 0.76],
        [0.093, 0.7],
        [0.12, 0.73],
        [0.19, 0.79],
        [ph * 0.8, 0.96],
        [ph * 0.87, 0.99],
        [ph * 0.91, 1.04],
        [ph, 1.04]
      ].map(([y, r]) => [y, r * radius]),
      24
    ),
    pot,
    [x, 0, z]
  );
  for (const [y, r] of [
    [0.04, 0.77],
    [ph * 0.82, 0.981],
    [ph * 0.867, 1.015],
    [ph * 0.98, 1.048]
  ])
    c.add(new T.TorusGeometry(radius * r, 0.006, 5, 24), rim, [x, y, z], [Math.PI / 2, 0, 0]);
  c.add(
    turning(
      [
        [0, radius * 0.97],
        [0.005, radius * 0.97]
      ],
      24
    ),
    finish('matte', '#453a2b'),
    [x, ph - 0.008, z]
  );
  const root = [x, ph - 0.016, z],
    fork = [x + h * 0.027, h * 0.53, z + 0.02],
    top = [x - h * 0.049, h * 0.95, z - 0.025];
  c.line(bark, [root, [x - 0.04, h * 0.47, z], fork, top], 0.026, 20);
  const palette = ['#3b5843', '#4f6841', '#617c46', '#76894c', '#385640'].map((v) => finish('matte', v));
  for (let branch = 0; branch < 12; branch++) {
    const t = branch / 12,
      angle = branch * 2.399 + 0.36,
      rad = crownWidth * (0.59 + random() * 0.43) * (1 - 0.34 * t);
    const stem = [x + 0.027 * (1 - 2 * t), h * (0.49 + 0.39 * t), z + 0.01],
      end = [x + Math.cos(angle) * rad, h * (0.73 + 0.29 * t) + random() * 0.14, z + Math.sin(angle) * rad];
    const middle = [
      stem[0] * 0.52 + end[0] * 0.48,
      stem[1] + (end[1] - stem[1]) * 0.34,
      stem[2] * 0.52 + end[2] * 0.48
    ];
    c.line(twig, [stem, middle, end], 0.011, 9);
    for (let j = 0; j < 7; j++) {
      const f = 0.22 + 0.12 * j,
        side = j % 2 ? 1 : -1;
      const at = [
        middle[0] + (end[0] - middle[0]) * f,
        middle[1] + (end[1] - middle[1]) * f,
        middle[2] + (end[2] - middle[2]) * f
      ];
      const a = angle + side * (0.45 + random() * 0.8),
        length = (0.116 + random() * 0.085) * (h / 1.4) ** 0.36,
        width = 0.034 + random() * 0.022;
      const points = [],
        normals = [],
        uv = [],
        idx = [];
      for (let i = 0; i <= 6; i++) {
        const s = i / 6,
          spread = Math.sin(Math.PI * s) ** 0.82 * width,
          mid = 0.048 * Math.sin(Math.PI * s) - 0.041 * s;
        for (const across of [-1, 0, 1]) {
          points.push(
            at[0] + Math.cos(a) * s * length - Math.sin(a) * spread * across,
            at[1] + mid - Math.abs(across) * spread * 0.42,
            at[2] + Math.sin(a) * s * length + Math.cos(a) * spread * across
          );
          uv.push(s, (across + 1) / 2);
        }
        if (i) {
          const k = i * 3;
          idx.push(k - 3, k, k + 1, k - 3, k + 1, k - 2, k - 2, k + 1, k + 2, k - 2, k + 2, k - 1);
        }
      }
      const leaf = new T.BufferGeometry();
      leaf.setAttribute('position', new T.Float32BufferAttribute(points, 3));
      leaf.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      leaf.setIndex(idx);
      leaf.computeVertexNormals();
      c.add(leaf, palette[(j + branch) % palette.length]);
    }
    if (branch % 4 === 0 && h > 1.3) {
      c.add(rod(end, [end[0], end[1] - 0.036, end[2]], 0.005), twig);
      c.ellipsoid(finish('matte', '#be9c48'), [end[0], end[1] - 0.067, end[2]], 0.075, 0.096, 0.073);
    }
  }
}

export function bookPress(c, x, y, z) {
  const walnut = finish('wood', '#673f2e'),
    iron = finish('metal', '#3d4439'),
    brass = finish('metal', '#c19450');
  const at = (dx, dy, dz) => [x + dx, y + dy, z + dz];
  c.box(walnut, at(0, 0.07, 0), 0.84, 0.105, 0.57, 0.031);
  for (const s of [-1, 1]) {
    c.add(
      turning(
        [
          [0, 0.042],
          [0.045, 0.045],
          [0.064, 0.026],
          [0.48, 0.025],
          [0.509, 0.042],
          [0.536, 0.038]
        ],
        14
      ),
      iron,
      at(s * 0.34, 0.087, 0)
    );
    c.box(walnut, at(s * 0.27, 0.023, 0), 0.13, 0.045, 0.52, 0.009);
  }
  c.box(walnut, at(0, 0.285, 0), 0.74, 0.09, 0.54, 0.022);
  c.box(iron, at(0, 0.59, 0), 0.79, 0.094, 0.14, 0.022);
  c.add(
    turning(
      [
        [0, 0.045],
        [0.03, 0.062],
        [0.047, 0.031],
        [0.405, 0.029],
        [0.427, 0.042],
        [0.453, 0.039]
      ],
      18
    ),
    brass,
    at(0, 0.33, 0)
  );
  const helix = [];
  for (let j = 0; j <= 90; j++) {
    const a = j * 0.42;
    helix.push(at(Math.cos(a) * 0.033, 0.405 + j * 0.00275, Math.sin(a) * 0.033));
  }
  c.line(iron, helix, 0.006, 95);
  c.add(rod(at(-0.216, 0.765, -0.038), at(0.216, 0.765, 0.038), 0.016), brass);
  for (const s of [-1, 1]) c.ellipsoid(walnut, at(0.216 * s, 0.765, 0.038 * s), 0.078, 0.07, 0.07);
  c.box(finish('cloth', '#81604a'), at(0.012, 0.159, -0.007), 0.46, 0.062, 0.395, 0.01);
  c.box(finish('paper', '#d2ba93'), at(0.025, 0.161, -0.007), 0.435, 0.045, 0.381, 0.006);
  c.box(finish('cloth', '#7a604d'), at(0.012, 0.202, -0.007), 0.458, 0.018, 0.395, 0.006);
}
export function displayCabinet(c, x, z) {
  const wood = finish('wood', '#714832'),
    accent = finish('wood', '#a17447'),
    insert = finish('wood', '#623d30'),
    brass = finish('metal', '#b69560');
  for (const s of [-1, 1]) {
    const cx = x + s * 0.48;
    c.box(insert, [cx, 0.48, z + 0.297], 0.76, 0.74, 0.042, 0.035);
    c.box(wood, [cx, 0.48, z + 0.32], 0.62, 0.64, 0.043, 0.032);
    c.box(accent, [cx, 0.48, z + 0.345], 0.52, 0.52, 0.018, 0.028);
    c.box(insert, [cx, 0.48, z + 0.356], 0.5, 0.5, 0.019, 0.027);
    c.add(rod([cx + s * 0.22, 0.64, z + 0.355], [cx + s * 0.22, 0.64, z + 0.395], 0.014), brass);
    c.ellipsoid(brass, [cx + s * 0.22, 0.64, z + 0.405], 0.05, 0.051, 0.029);
    const sx = x + s * 1.045;
    c.add(
      turning(
        [
          [0, 0.07],
          [0.021, 0.084],
          [0.046, 0.076],
          [0.063, 0.052],
          [0.095, 0.055],
          [0.12, 0.07]
        ],
        16
      ),
      wood,
      [sx, 0.986, z + 0.507]
    );
  }
  c.box(wood, [x, 0.085, z], 2.16, 0.14, 0.65, 0.028);
  c.box(accent, [x, 0.16, z], 2.11, 0.034, 0.62, 0.015);
}
export function caseTrim(c, x, z, width) {
  const wood = finish('wood', '#66432f'),
    accent = finish('wood', '#987044'),
    metal = finish('metal', '#aa8956');
  for (const sign of [-1, 1]) {
    const xx = x + (sign * width) / 2;
    c.add(
      turning(
        [
          [0, 0.09],
          [0.06, 0.104],
          [0.09, 0.1],
          [0.12, 0.068],
          [0.19, 0.064],
          [0.22, 0.071],
          [2.65, 0.054],
          [2.77, 0.072],
          [2.81, 0.084],
          [2.88, 0.09],
          [2.98, 0.076]
        ],
        14
      ),
      wood,
      [xx, 0.11, z + 0.45]
    );
    c.add(
      turning(
        [
          [0, 0.07],
          [0.011, 0.072],
          [0.025, 0.071]
        ],
        14
      ),
      metal,
      [xx, 0.32, z + 0.45]
    );
  }
  c.box(wood, [x, 0.1, z + 0.16], width + 0.26, 0.18, 0.7, 0.025);
  c.box(accent, [x, 0.2, z + 0.2], width + 0.22, 0.045, 0.66, 0.015);
  c.box(wood, [x, 3.18, z + 0.2], width + 0.32, 0.095, 0.69, 0.029);
  c.box(accent, [x, 3.241, z + 0.2], width + 0.35, 0.045, 0.72, 0.017);
}
