import * as T from './vendor/three.module.js';
import { Cast, bevel, finish, pipe, rings, rod, turning, transform, seeded } from './artisan.js';

const walnut = () => finish('wood', '#754832'),
  dark = () => finish('wood', '#402c25'),
  light = () => finish('wood', '#986442');
const brass = () => finish('metal', '#c39956'),
  antique = () => finish('metal', '#896744');
const tau = Math.PI * 2;

function coveredPad(width, height, depth, tuft = false) {
  const posts = tuft
    ? [
        [-0.54, 0.44],
        [0, 0.44],
        [0.54, 0.44],
        [-0.28, -0.1],
        [0.28, -0.1],
        [-0.54, -0.64],
        [0, -0.64],
        [0.54, -0.64]
      ]
    : [];
  function surface(s, t, front = true) {
    const x = s * (1 - 0.115 * Math.pow(Math.abs(t), 6)) * (tuft ? 1 + 0.067 * t : 1) * width * 0.5;
    const y =
      t * (1 - 0.116 * Math.pow(Math.abs(s), 6)) * height * 0.5 +
      (tuft ? 0.035 * Math.max(t, 0) * (1 - s * s) : 0);
    const fullness = Math.sqrt(Math.max(0, (1 - Math.pow(Math.abs(s), 4)) * (1 - Math.pow(Math.abs(t), 4))));
    let z = (0.45 + fullness * 0.55) * depth * 0.5;
    if (tuft && front)
      for (const [a, b] of posts) {
        const dx = (s - a) * width * 0.5,
          dy = (t - b) * height * 0.5;
        z -= Math.exp(-((dx * dx + dy * dy) / 0.0024)) * 0.048;
        for (const sign of [-1, 1])
          z -=
            0.009 * Math.exp(-Math.pow((dy - sign * dx) / 0.014, 2)) * Math.exp(-(dx * dx + dy * dy) / 0.009);
      }
    return [x, y, front ? z : -z];
  }
  const pos = [],
    uv = [],
    idx = [],
    nx = tuft ? 34 : 16,
    ny = tuft ? 32 : 16,
    plane = (nx + 1) * (ny + 1);
  for (let side = 0; side < 2; side++)
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const s = (i / nx) * 2 - 1,
          t = (j / ny) * 2 - 1;
        pos.push(...surface(s, t, !side));
        uv.push((i / nx) * 3, (j / ny) * 3);
        if (i && j) {
          const b = side * plane + j * (nx + 1) + i;
          !side
            ? idx.push(b - nx - 2, b - nx - 1, b, b - nx - 2, b, b - 1)
            : idx.push(b - nx - 2, b, b - nx - 1, b - nx - 2, b - 1, b);
        }
      }
  const rim = [];
  for (let i = 0; i <= nx; i++) rim.push(i);
  for (let j = 1; j <= ny; j++) rim.push(j * (nx + 1) + nx);
  for (let i = nx - 1; i >= 0; i--) rim.push(ny * (nx + 1) + i);
  for (let j = ny - 1; j >= 1; j--) rim.push(j * (nx + 1));
  for (let k = 0; k < rim.length; k++) {
    const a = rim[k],
      b = rim[(k + 1) % rim.length];
    idx.push(a, a + plane, b + plane, a, b + plane, b);
  }
  const mesh = new T.BufferGeometry();
  mesh.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  mesh.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  mesh.setIndex(idx);
  mesh.computeVertexNormals();
  const border = rim.map((i) =>
    surface(((i % (nx + 1)) / nx) * 2 - 1, (Math.floor(i / (nx + 1)) / ny) * 2 - 1)
  );
  return { mesh, border, surface, posts };
}
function placePad(c, pad, cloth, cord, at, rotation) {
  c.add(pad.mesh, cloth, at, rotation);
  c.add(pipe(pad.border, 0.009, Math.ceil(pad.border.length * 0.82), true), cord, at, rotation);
}
function backPoint(p) {
  return new T.Vector3(...p)
    .applyAxisAngle(new T.Vector3(1, 0, 0), -0.15)
    .add(new T.Vector3(0, 1.075, -0.374))
    .toArray();
}

export function readingChair(tint) {
  const a = new Cast(),
    fabric = finish('leather', tint),
    piping = finish('leather', '#927451'),
    shadow = finish('leather', '#3e4438'),
    studs = brass();
  const feet = [];
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      const lx = side * 0.455,
        lz = end * 0.345,
        fx = side * 0.535,
        fz = end * (end === 1 ? 0.424 : 0.46);
      // Horizontal rings keep every ferrule flat on the floor even along raked rear legs.
      const leg = rings(
        [
          [fx, 0, fz, 0.044, 0.048],
          [fx, 0.018, fz, 0.06, 0.064],
          [fx, 0.05, fz, 0.06, 0.064],
          [fx - side * 0.012, 0.083, fz - end * 0.012, 0.046, 0.05],
          [fx - side * 0.035, 0.157, fz - end * 0.032, 0.036, 0.039],
          [lx + side * 0.03, 0.29, lz + end * 0.025, 0.048, 0.057],
          [lx + side * 0.052, 0.365, lz + end * 0.039, 0.074, 0.077],
          [lx + side * 0.043, 0.398, lz + end * 0.021, 0.084, 0.092],
          [lx, 0.452, lz, 0.075, 0.079],
          [lx, 0.496, lz, 0.065, 0.066]
        ],
        18
      );
      a.add(leg, walnut());
      a.add(
        turning(
          [
            [0, 0.045],
            [0.008, 0.062],
            [0.026, 0.062],
            [0.032, 0.057]
          ],
          16
        ),
        brass(),
        [fx, 0, fz]
      );
      feet.push([fx, 0, fz]);
    }
  // Mortised rails meet every leg on the underside. The lower apron remains open between them.
  for (const side of [-1, 1]) {
    a.box(dark(), [side * 0.459, 0.46, 0], 0.11, 0.121, 0.76, 0.019);
    a.box(walnut(), [0, 0.465, side * 0.35], 0.98, 0.125, 0.104, 0.019);
  }
  a.box(fabric, [0, 0.501, 0.012], 0.986, 0.133, 0.797, 0.049);
  const seat = coveredPad(0.976, 0.839, 0.163);
  placePad(a, seat, fabric, piping, [0, 0.595, 0.014], [-Math.PI / 2, 0, 0]);
  // The back has a closed, lacquered outer frame and a finished reverse panel.
  const outer = coveredPad(1.03, 0.94, 0.14, true);
  const back = coveredPad(0.935, 0.851, 0.169, true);
  a.add(outer.mesh, walnut(), [0, 1.069, -0.41], [-0.15, 0, 0]);
  a.add(pipe(outer.border, 0.027, 82, true), light(), [0, 1.069, -0.41], [-0.15, 0, 0]);
  placePad(a, back, fabric, piping, [0, 1.075, -0.374], [-0.15, 0, 0]);
  const reverse = coveredPad(0.906, 0.826, 0.045);
  a.add(reverse.mesh, shadow, [0, 1.076, -0.476], [-0.15, 0, 0]);
  a.add(pipe(reverse.border, 0.008, 54, true), piping, [0, 1.076, -0.5], [-0.15, 0, 0]);
  for (const [s, t] of back.posts) {
    const local = back.surface(s, t);
    local[2] += 0.005;
    a.ellipsoid(fabric, backPoint(local), 0.04, 0.036, 0.02, [-0.15, 0, 0]);
  }
  const crest = [
    [-0.49, 1.423, -0.466],
    [-0.405, 1.493, -0.478],
    [-0.18, 1.514, -0.493],
    [0, 1.552, -0.493],
    [0.18, 1.514, -0.493],
    [0.405, 1.493, -0.478],
    [0.49, 1.423, -0.466]
  ];
  a.line(walnut(), crest, 0.033, 34);
  a.line(
    light(),
    crest.map(([x, y, z]) => [x, y + 0.012, z + 0.015]),
    0.007,
    32
  );
  for (const s of [-1, 1]) {
    // Rear stiles run down into the seat frame; front arms have carved knees and shoulders.
    a.line(
      walnut(),
      [
        [s * 0.455, 0.435, -0.344],
        [s * 0.467, 0.662, -0.311],
        [s * 0.486, 1.025, -0.368],
        [s * 0.479, 1.43, -0.447]
      ],
      0.05,
      22
    );
    a.line(
      walnut(),
      [
        [s * 0.45, 0.462, 0.337],
        [s * 0.48, 0.57, 0.315],
        [s * 0.47, 0.66, 0.257],
        [s * 0.497, 0.735, 0.294],
        [s * 0.522, 0.778, 0.34]
      ],
      0.051,
      22
    );
    const wrist = [
      [s * 0.516, 0.783, 0.374],
      [s * 0.526, 0.802, 0.29],
      [s * 0.533, 0.806, 0.02],
      [s * 0.524, 0.852, -0.18],
      [s * 0.477, 0.919, -0.326]
    ];
    a.line(light(), wrist, 0.06, 24);
    a.ellipsoid(walnut(), [s * 0.516, 0.783, 0.375], 0.132, 0.124, 0.103);
    a.ellipsoid(brass(), [s * 0.516, 0.784, 0.427], 0.035, 0.035, 0.008);
    a.line(
      fabric,
      wrist.slice(1).map(([x, y, z]) => [x, y + 0.026, z]),
      0.062,
      20
    );
    a.ellipsoid(fabric, [s * 0.526, 0.828, 0.29], 0.126, 0.119, 0.091);
    a.line(
      piping,
      wrist.slice(1).map(([x, y, z]) => [x + s * 0.053, y + 0.024, z]),
      0.006,
      20
    );
    for (let j = 0; j < 8; j++) {
      const y = 0.654 + j * 0.104,
        x = s * (0.455 + (0.03 * j) / 8),
        z = -0.353 - (0.1 * j) / 8;
      a.ellipsoid(studs, [x, y, z + 0.037], 0.017, 0.017, 0.014);
    }
  }
  const model = a.meshes();
  model.name = 'Four-foot reading chair';
  model.userData.supports = feet;
  return model;
}

export function carvedTable(a, x, z, top, w, d, isCart = false) {
  const board = walnut(),
    edge = light(),
    brz = brass(),
    cx = (xx, yy, zz) => [x + xx, yy, z + zz];
  a.box(board, cx(0, top - 0.056, 0), w, 0.098, d, 0.026);
  a.box(edge, cx(0, top - 0.101, 0), w - 0.024, 0.033, d - 0.022, 0.014);
  a.box(board, cx(0, top - 0.119, 0), w - 0.085, 0.031, d - 0.077, 0.014);
  const sx = w / 2 - 0.134,
    sz = d / 2 - 0.13;
  for (const s of [-1, 1]) {
    a.box(board, cx(0, top - 0.19, s * sz), w - 0.22, 0.154, 0.067, 0.012);
    a.box(edge, cx(0, top - 0.249, s * sz + 0.005), w - 0.23, 0.02, 0.073, 0.007);
    a.box(board, cx(s * sx, top - 0.19, 0), 0.066, 0.148, d - 0.21, 0.01);
  }
  for (const sxn of [-1, 1])
    for (const szn of [-1, 1]) {
      const X = x + sx * sxn,
        Z = z + sz * szn,
        low = isCart ? 0.12 : 0,
        h = top - 0.2 - low;
      const profile = [
        [0, 0.044],
        [0.019, 0.061],
        [0.041, 0.06],
        [0.058, 0.042],
        [0.096, 0.039],
        [0.193, 0.047],
        [0.574, 0.052],
        [0.642, 0.076],
        [0.7, 0.08],
        [0.737, 0.059],
        [0.786, 0.057],
        [0.813, 0.075],
        [0.835, 0.078],
        [0.864, 0.063],
        [1, 0.067]
      ];
      a.add(turning(profile.map(([t, r]) => [t * h, r])), board, [X, low, Z]);
      a.add(
        turning(
          [
            [0, 0.047],
            [0.009, 0.06],
            [0.022, 0.06],
            [0.029, 0.052]
          ],
          16
        ),
        brz,
        [X, low, Z]
      );
      a.box(board, [X, top - 0.173, Z], 0.145, 0.154, 0.149, 0.017);
      if (isCart) {
        a.add(rod([X - 0.045, 0.067, Z], [X + 0.045, 0.067, Z], 0.072, 0.072, 16), dark());
        a.add(rod([X, 0.066, Z], [X, 0.15, Z], 0.019), brz);
      }
    }
  if (isCart) a.box(edge, cx(0, 0.31, 0), w - 0.16, 0.05, d - 0.14, 0.014);
  else {
    a.box(edge, cx(0, top - 0.186, sz + 0.038), Math.min(1.1, w - 0.42), 0.102, 0.025, 0.012);
    a.add(rod(cx(0, top - 0.185, sz + 0.045), cx(0, top - 0.185, sz + 0.082), 0.017, 0.017, 10), brz);
    a.ellipsoid(brz, cx(0, top - 0.185, sz + 0.085), 0.064, 0.047, 0.027);
  }
}
export function atelierLamp(a, x, z, y, emerald = false) {
  const bronze = antique(),
    gold = brass();
  const local = (xx, yy, zz) => [x + xx, y + yy, z + zz];
  a.add(
    turning(
      [
        [0, 0.14],
        [0.012, 0.177],
        [0.028, 0.186],
        [0.045, 0.178],
        [0.06, 0.144],
        [0.07, 0.144],
        [0.083, 0.118],
        [0.094, 0.099],
        [0.105, 0.069],
        [0.13, 0.047],
        [0.141, 0.05],
        [0.157, 0.033]
      ],
      28
    ),
    bronze,
    local(0, 0, 0)
  );
  a.add(
    turning(
      [
        [0, 0.12],
        [0.008, 0.149],
        [0.016, 0.147],
        [0.025, 0.104]
      ],
      24
    ),
    gold,
    local(0, 0.055, 0)
  );
  a.add(
    turning(
      [
        [0, 0.027],
        [0.035, 0.037],
        [0.079, 0.022],
        [0.37, 0.018],
        [0.405, 0.032],
        [0.433, 0.032],
        [0.455, 0.023]
      ],
      18
    ),
    gold,
    local(0, 0.144, 0)
  );
  if (emerald) {
    // Tilted, elongated banker's shade, open underside, both pivots attached to its yoke.
    for (const sign of [-1, 1]) {
      a.line(
        bronze,
        [
          local(0, 0.53, 0),
          local(sign * 0.12, 0.55, -0.015),
          local(sign * 0.28, 0.6, -0.013),
          local(sign * 0.304, 0.7, 0)
        ],
        0.016,
        16
      );
      a.ellipsoid(gold, local(sign * 0.302, 0.707, 0), 0.041, 0.045, 0.049);
    }
    const segments = 20,
      profile = 12,
      positions = [],
      uv = [],
      faces = [];
    for (let i = 0; i <= segments; i++)
      for (let j = 0; j <= profile; j++) {
        const u = i / segments,
          t = j / profile,
          theta = (0.04 + 0.92 * t) * Math.PI;
        const v = 2 * u - 1,
          round = Math.sqrt(Math.max(0.12, 1 - Math.pow(v, 8)));
        positions.push(
          x + v * 0.305,
          y + 0.691 + Math.sin(theta) * 0.153 * round,
          z + Math.cos(theta) * 0.155 * round + 0.03
        );
        uv.push(u, t);
        if (i && j) {
          const n = i * (profile + 1) + j;
          faces.push(n - profile - 2, n - 1, n, n - profile - 2, n, n - profile - 1);
        }
      }
    for (const edge of [0, segments]) {
      const centre = positions.length / 3;
      positions.push(x + (edge ? 1 : -1) * 0.305, y + 0.699, z + 0.03);
      uv.push(0.5, 0.5);
      for (let j = 0; j < profile; j++) {
        const a = edge * (profile + 1) + j;
        if (edge) faces.push(centre, a + 1, a);
        else faces.push(centre, a, a + 1);
      }
    }
    const shade = new T.BufferGeometry();
    shade.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    shade.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    shade.setIndex(faces);
    shade.computeVertexNormals();
    a.add(shade, finish('glass', '#1c795e'));
    for (const sign of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const v = i / 6 - 1,
          round = Math.sqrt(Math.max(0.12, 1 - Math.pow(v, 8)));
        pts.push(local(v * 0.305, 0.706, sign * 0.152 * round + 0.03));
      }
      a.line(gold, pts, 0.006, 22);
    }
    a.ellipsoid(finish('glass', '#f4d9a4'), local(0, 0.708, 0.02), 0.2, 0.058, 0.058);
    a.add(rod(local(0.16, 0.68, 0), local(0.16, 0.48, 0), 0.004), gold);
    a.ellipsoid(gold, local(0.16, 0.47, 0), 0.02, 0.028, 0.02);
  } else {
    const pts = [],
      indexes = [],
      uv = [],
      steps = 48;
    const prof = [
      [0.59, 0.255],
      [0.61, 0.255],
      [0.642, 0.242],
      [0.778, 0.178],
      [0.857, 0.11],
      [0.869, 0.102]
    ];
    for (let j = 0; j < prof.length; j++)
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * tau,
          radius = prof[j][1] * (i % 2 ? 0.985 : 1.025);
        pts.push(x + radius * Math.cos(angle), y + prof[j][0], z + radius * Math.sin(angle));
        uv.push(i / steps, j / (prof.length - 1));
        if (j && i) {
          const k = j * (steps + 1) + i;
          indexes.push(k - steps - 2, k - 1, k, k - steps - 2, k, k - steps - 1);
        }
      }
    const shade = new T.BufferGeometry();
    shade.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    shade.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    shade.setIndex(indexes);
    shade.computeVertexNormals();
    a.add(shade, finish('glass', '#e2b87a'));
    for (const [yy, rad] of [
      [0.596, 0.255],
      [0.862, 0.104]
    ])
      a.add(new T.TorusGeometry(rad, 0.009, 6, 32), gold, local(0, yy, 0), [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const t = (i * tau) / 8;
      const vert = prof.map(([h, r]) => local(Math.cos(t) * r, h, Math.sin(t) * r));
      a.line(bronze, vert, 0.0035, 11);
    }
    a.ellipsoid(finish('glass', '#ffe0a3'), local(0, 0.65, 0), 0.074, 0.115, 0.074);
    for (const sign of [-1, 1]) {
      a.line(
        bronze,
        [
          local(0, 0.594, 0),
          local(sign * 0.064, 0.63, 0),
          local(sign * 0.082, 0.775, 0),
          local(sign * 0.045, 0.845, 0),
          local(0, 0.863, 0)
        ],
        0.005,
        14
      );
      a.add(rod(local(0, 0.865, 0), local(sign * 0.104, 0.865, 0), 0.004), gold);
    }
    a.add(
      turning(
        [
          [0, 0.028],
          [0.011, 0.035],
          [0.031, 0.011],
          [0.056, 0.015],
          [0.076, 0.003]
        ],
        14
      ),
      gold,
      local(0, 0.87, 0)
    );
  }
}
