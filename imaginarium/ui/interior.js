import * as T from './vendor/three.module.js';
import { rooms } from './data.js';
import { Cast, studioLight } from './artisan.js';
import { readingChair, carvedTable, atelierLamp } from './joinery.js';
import { pottedTree, bookPress, displayCabinet, caseTrim } from './room-objects.js';
import { createCelestialGlobe } from './celestial-globe.js';
export const descriptions = [
  'Коллекция на выставочном столе',
  'Сад за стеклом',
  'Бумага, ткань и тёплая латунь'
];
function picture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
function rng(seed) {
  let n = seed;
  return () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const random = rng(217);
function landscape() {
  return picture(1024, 608, (c, w, h) => {
    const rand = rng(9127),
      sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#739095');
    sky.addColorStop(0.55, '#d0ba92');
    sky.addColorStop(0.74, '#e7c997');
    sky.addColorStop(1, '#819481');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    const light = c.createRadialGradient(w * 0.68, h * 0.32, 3, w * 0.68, h * 0.32, 106);
    light.addColorStop(0, '#f7e3b2');
    light.addColorStop(0.13, '#f7e6b5');
    light.addColorStop(0.18, 'rgba(248,222,166,.35)');
    light.addColorStop(1, 'rgba(248,220,160,0)');
    c.fillStyle = light;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 100; i++) {
      const x = rand() * w,
        y = rand() * h * 0.53;
      c.fillStyle = 'rgba(255,234,201,' + (0.025 + rand() * 0.05) + ')';
      c.beginPath();
      c.ellipse(x, y, 16 + rand() * 99, 2 + rand() * 7, -0.03, 0, Math.PI * 2);
      c.fill();
    }
    function ridge(x, k) {
      return (
        h * (0.48 + 0.074 * k) +
        24 * Math.sin(x * 0.008 + k * 1.4) +
        12 * Math.cos(x * 0.023 + k) +
        7 * Math.sin(x * 0.052 + k * 0.7)
      );
    }
    const hills = ['#a2a997', '#909e8c', '#81927e', '#6c816e'];
    for (let k = 0; k < 4; k++) {
      c.fillStyle = hills[k];
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x < w + 4; x += 3) c.lineTo(x, ridge(x, k));
      c.lineTo(w, h);
      c.fill();
      for (let i = 0; i < 318; i++) {
        const x = rand() * w,
          y = ridge(x, k) + rand() * 65,
          s = (k + 1) * (0.9 + rand() * 2.2);
        c.fillStyle = k > 1 ? 'rgba(37,66,54,.19)' : 'rgba(71,98,81,.13)';
        c.beginPath();
        c.moveTo(x, y - s * 1.8);
        for (let j = 0; j < 4; j++) {
          c.lineTo(x + (0.12 + j * 0.07) * s, y - s * (1.5 - j * 0.4));
          c.lineTo(x + 0.06 * s, y - s * (1.33 - j * 0.4));
        }
        c.lineTo(x, y + 0.6 * s);
        c.lineTo(x - 0.32 * s, y);
        c.lineTo(x - 0.15 * s, y - s * 0.52);
        c.closePath();
        c.fill();
      }
    }
    const bank = (x) => h * 0.765 + 20 * Math.sin(x * 0.006) + 6 * Math.cos(x * 0.023);
    const water = c.createLinearGradient(0, h * 0.73, 0, h);
    water.addColorStop(0, '#a5b3a0');
    water.addColorStop(1, '#718f88');
    c.fillStyle = water;
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) c.lineTo(x, bank(x));
    c.lineTo(w, h);
    c.fill();
    for (let i = 0; i < 1200; i++) {
      const x = rand() * w,
        y = bank(x) + rand() * h * 0.25;
      c.fillStyle = i % 3 ? 'rgba(209,213,184,.23)' : 'rgba(59,91,80,.17)';
      c.fillRect(x, y, 2 + rand() * 24, 0.4 + rand());
    }
    for (let i = 0; i < 8000; i++) {
      c.fillStyle = i % 2 ? 'rgba(94,84,66,.025)' : 'rgba(255,237,204,.028)';
      c.fillRect(rand() * w, rand() * h, 1, 2);
    }
  });
}
function rug(color) {
  return picture(768, 1152, (c, w, h) => {
    const rnd = rng(917),
      mint = '#aaa88a',
      gold = '#b39b6e',
      dark = '#544e3f',
      rose = '#aa795b';
    c.fillStyle = color;
    c.fillRect(0, 0, w, h);
    function flower(x, y, r, hue) {
      c.save();
      c.translate(x, y);
      c.fillStyle = hue;
      for (let j = 0; j < 8; j++) {
        c.rotate(Math.PI / 4);
        c.beginPath();
        c.ellipse(0, -r * 0.59, r * 0.21, r * 0.48, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = gold;
      c.beginPath();
      c.arc(0, 0, r * 0.23, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    function spray(x, y, s, angle) {
      c.save();
      c.translate(x, y);
      c.rotate(angle);
      c.scale(s, s);
      c.strokeStyle = gold;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(-27, -21, 23, -38, 0, -71);
      c.stroke();
      for (let j = 0; j < 6; j++) {
        const side = j % 2 ? 1 : -1;
        c.fillStyle = j % 3 ? mint : rose;
        c.beginPath();
        c.ellipse(side * (5 + j * 0.9), -15 - j * 8, 3.3, 9, -side * 0.75, 0, Math.PI * 2);
        c.fill();
      }
      flower(0, -68, 7, rose);
      c.restore();
    }
    for (let inset = 5; inset < 64; inset += 7) {
      c.strokeStyle = [dark, gold, mint, rose][((inset - 5) / 7) % 4];
      c.lineWidth = inset === 26 ? 9 : 2.8;
      c.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset);
    }
    for (let y = 91; y < h - 80; y += 54) {
      flower(39, y, 12, rose);
      flower(w - 39, y, 12, rose);
    }
    for (let x = 88; x < w - 80; x += 54) {
      flower(x, 39, 12, rose);
      flower(x, h - 39, 12, rose);
    }
    for (let j = 0; j < 9; j++)
      for (let i = 0; i < 5; i++) {
        const x = 106 + i * 135 + (j % 2 ? 18 : 0),
          y = 122 + j * 112;
        if (Math.abs(x - w / 2) / (w * 0.35) + Math.abs(y - h / 2) / (h * 0.31) < 0.95) continue;
        spray(x, y, 0.72, (i + j) % 2 ? 0.58 : -0.58);
        spray(w - x, h - y, 0.52, Math.PI + 0.3);
      }
    c.save();
    c.translate(w / 2, h / 2);
    function medallion(ratio, fill) {
      c.save();
      c.scale(ratio, ratio);
      c.fillStyle = fill;
      c.beginPath();
      c.moveTo(0, -325);
      for (let i = 0; i < 4; i++) {
        c.bezierCurveTo(10, -265, 35, -268, 39, -234);
        c.bezierCurveTo(60, -186, 90, -212, 100, -162);
        c.bezierCurveTo(120, -110, 166, -145, 178, -87);
        c.bezierCurveTo(196, -48, 178, -38, 208, 0);
        c.scale(1, -1);
        c.bezierCurveTo(178, -38, 196, -48, 178, -87);
        c.bezierCurveTo(166, -145, 120, -110, 100, -162);
        c.bezierCurveTo(90, -212, 60, -186, 39, -234);
        c.bezierCurveTo(35, -268, 10, -265, 0, -325);
        c.scale(-1, 1);
        if (i === 1) break;
      }
      c.closePath();
      c.fill();
      c.restore();
    }
    medallion(1, gold);
    medallion(0.974, dark);
    medallion(0.917, rose);
    medallion(0.893, color);
    for (let j = 0; j < 12; j++) spray(0, 0, 1.32, (j * Math.PI) / 6);
    flower(0, 0, 36, rose);
    c.restore();
    for (let j = 0; j < 18500; j++) {
      c.fillStyle = j % 2 ? 'rgba(239,219,175,.09)' : 'rgba(53,36,26,.08)';
      c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 1);
    }
    c.fillStyle = 'rgba(75,53,38,.075)';
    for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
  });
}
function printed(title, sub, background) {
  return picture(512, 236, (c, w, h) => {
    c.fillStyle = background;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#caa36f';
    c.lineWidth = 3;
    c.strokeRect(9, 9, w - 18, h - 18);
    c.strokeRect(15, 15, w - 30, h - 30);
    c.textAlign = 'center';
    c.fillStyle = '#e5c592';
    c.font = '18px Georgia';
    c.fillText(sub, w / 2, 65);
    c.font = 'italic 46px Georgia';
    c.fillText(title, w / 2, 140, w - 43);
    c.fillRect(w / 2 - 28, 169, 56, 2);
  });
}
export function buildInterior(scene) {
  let roomIndex = 0;
  const built = [new Cast(), new Cast(), new Cast()],
    spaces = rooms.map(() => new T.Group());
  spaces.forEach((group) => scene.add(group));
  studioLight(scene);
  const spinePositions = [],
    spineNormals = [],
    spineUV = [];
  const spines = picture(1024, 512, (c) => {
    const hues = ['#6e4338', '#4a6353', '#41545b', '#886f45', '#704b4b', '#8b6449', '#566042', '#555265'];
    const titles = ['ATLAS', 'POESIE', 'BOTANICA', 'HISTORIA', 'FOLIO', 'MARE', 'ARCHIV', 'LUMEN'];
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 8; i++) {
        const x = i * 128,
          y = j * 256;
        c.fillStyle = hues[(i + j) % 8];
        c.fillRect(x, y, 128, 256);
        const light = c.createLinearGradient(x, 0, x + 128, 0);
        light.addColorStop(0, '#1a161536');
        light.addColorStop(0.3, '#f5d4a626');
        light.addColorStop(1, '#221a1955');
        c.fillStyle = light;
        c.fillRect(x, y, 128, 256);
        c.strokeStyle = '#d9bd83';
        c.lineWidth = 2;
        c.strokeRect(x + 10, y + 13, 108, 230);
        for (const band of [27, 32, 68, 125, 191, 214, 219]) {
          c.fillStyle = '#c2a173';
          c.fillRect(x + 12, y + band, 104, band % 2 ? 3 : 1);
        }
        c.fillStyle = '#3c3431';
        c.fillRect(x + 14, y + 74, 100, 37);
        c.fillStyle = '#e4ce9d';
        c.font = 'bold 18px Georgia';
        c.textAlign = 'center';
        c.fillText(titles[(i + 2 * j) % 8], x + 64, y + 99, 90);
        c.font = 'italic 21px Georgia';
        c.fillText(['I', 'II', 'III', 'IV', 'V'][i % 5], x + 64, y + 173);
      }
  });
  function spineFace(x, y, z, w, h, variant) {
    const col = variant % 8,
      row = Math.floor(variant / 8);
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
      [1, 1],
      [0, 1]
    ]) {
      spinePositions.push(x + (u - 0.5) * w, y + v * h, z);
      spineNormals.push(0, 0, 1);
      spineUV.push((col + 0.024 + u * 0.952) / 8, 1 - (row + 0.018 + (1 - v) * 0.964) / 2);
    }
  }
  const batches = new Map(),
    object = new T.Object3D(),
    geos = {
      box: new T.BoxGeometry(1, 1, 1),
      cylinder: new T.CylinderGeometry(0.5, 0.5, 1, 16),
      sphere: new T.SphereGeometry(0.5, 14, 10),
      cone: new T.ConeGeometry(0.5, 1, 16)
    };
  const grain = picture(256, 128, (c, w, h) => {
    c.fillStyle = '#f6ead6';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 210; i++) {
      const y = random() * h;
      c.strokeStyle = i % 4 ? 'rgba(93,54,31,.11)' : 'rgba(255,246,223,.56)';
      c.lineWidth = 0.4 + random() * 1.5;
      c.beginPath();
      c.moveTo(-3, y);
      c.bezierCurveTo(w * 0.25, y + random() * 8, w * 0.67, y - random() * 6, w + 3, y + random() * 8);
      c.stroke();
    }
  });
  const contact = picture(128, 128, (c, w, h) => {
    const fade = c.createRadialGradient(64, 64, 8, 64, 64, 62);
    fade.addColorStop(0, 'rgba(40,26,16,.54)');
    fade.addColorStop(0.65, 'rgba(44,28,18,.21)');
    fade.addColorStop(1, 'rgba(44,28,18,0)');
    c.fillStyle = fade;
    c.fillRect(0, 0, w, h);
  });
  const contactMaterial = new T.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false });
  function shadow(x, y, z, width, depth) {
    built[roomIndex].add(new T.PlaneGeometry(width, depth), contactMaterial, [x, y, z], [-Math.PI / 2, 0, 0]);
  }
  const woodColors = new Set([
    '#583a2e',
    '#483a2d',
    '#704933',
    '#ac8152',
    '#613f2e',
    '#45342a',
    '#6d4e38',
    '#6c5240',
    '#70543f',
    '#8e7253',
    '#946f4e',
    '#947454',
    '#896e50',
    '#9f7754',
    '#896446',
    '#93694a',
    '#805e46',
    '#463c30',
    '#69523d',
    '#75573c',
    '#a57549'
  ]);
  const covers = ['#753e35', '#394e4a', '#313e44', '#6e5e40', '#71514b', '#7d674b', '#565b41', '#4b4b55'];
  function part(kind, c, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) {
    const wood = woodColors.has(c),
      key = roomIndex + kind + (wood ? 'wood' : 'solid');
    if (!batches.has(key)) batches.set(key, { kind, wood, room: roomIndex, matrices: [], colors: [] });
    object.position.set(x, y, z);
    object.rotation.set(rx, ry, rz);
    object.scale.set(w, h, d);
    object.updateMatrix();
    batches.get(key).matrices.push(object.matrix.clone());
    batches.get(key).colors.push(new T.Color(c));
  }
  const box = (...v) => part('box', ...v),
    cyl = (...v) => part('cylinder', ...v);
  function panel(texture, x, y, z, w, h, rotation = 0, flat = false) {
    const m = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide })
    );
    m.position.set(x, y, z);
    if (flat) m.rotation.x = -Math.PI / 2;
    else m.rotation.y = rotation;
    spaces[roomIndex].add(m);
  }
  function shelving(x, z, width) {
    caseTrim(built[roomIndex], x, z, width);
    const wood = '#583a2e',
      trim = '#a57549';
    box('#483a2d', x, 1.55, z, width, 3.1, 0.18);
    for (const side of [-1, 1]) {
      box(wood, x + side * width * 0.5, 1.58, z + 0.18, 0.12, 3.16, 0.5);
      box(trim, x + side * width * 0.5, 1.57, z + 0.45, 0.04, 3.11, 0.04);
    }
    for (let row = 0; row < 5; row++) {
      const base = 0.22 + row * 0.58;
      box(wood, x, base, z + 0.19, width + 0.12, 0.085, 0.56);
      box(trim, x, base + 0.01, z + 0.485, width + 0.16, 0.043, 0.05);
      let left = x - width / 2 + 0.095;
      while (left < x + width / 2 - 0.16) {
        const bw = 0.085 + random() * 0.075,
          bh = 0.3 + random() * 0.19;
        const shade = covers[Math.floor(random() * covers.length)];
        const front = z + 0.391 + random() * 0.035,
          xx = left + bw * 0.5;
        box(shade, xx, base + 0.05 + bh * 0.5, front - 0.126, bw - 0.008, bh, 0.25);
        spineFace(xx, base + 0.05, front + 0.001, bw - 0.009, bh, Math.floor(random() * 16));
        box('#b6a689', xx, base + 0.05 + bh - 0.004, front - 0.128, bw - 0.021, 0.011, 0.217);
        left += bw + 0.009 + random() * 0.014;
      }
    }
    box(wood, x, 3.03, z + 0.18, width + 0.22, 0.15, 0.64);
    box(trim, x, 3.12, z + 0.2, width + 0.28, 0.055, 0.67);
  }
  function table(x, z, y, w, d, isCart = false) {
    shadow(x, 0.021, z, w * 1.54, d * 1.84);
    carvedTable(built[roomIndex], x, z, y, w, d, isCart);
  }
  function lamp(x, z, y) {
    shadow(x, y + 0.013, z, 0.51, 0.51);
    atelierLamp(built[roomIndex], x, z, y, roomIndex !== 1);
  }
  function chair(x, z) {
    const base = roomIndex === 1 ? 0.011 : 0;
    shadow(x, base + 0.006, z, 1.56, 1.46);
    const model = readingChair(roomIndex === 1 ? '#346456' : '#854c38');
    model.position.set(x, base, z);
    for (const [fx, , fz] of model.userData.supports) shadow(x + fx, base + 0.007, z + fz, 0.28, 0.28);
    spaces[roomIndex].add(model);
  }
  function plant(x, z, h) {
    shadow(x, 0.019, z, 1.0, 0.91);
    pottedTree(built[roomIndex], x, z, h);
  }
  const view = landscape();
  const rainMap = picture(512, 256, (c, w, h) => {
    c.strokeStyle = 'rgba(210,229,220,.46)';
    c.lineWidth = 1;
    for (let i = 0; i < 170; i++) {
      const x = random() * w,
        y = random() * h;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - 2, y + 5 + 10 * random());
      c.stroke();
    }
  });
  rainMap.wrapT = T.RepeatWrapping;
  const drops = new T.Mesh(
    new T.PlaneGeometry(8.78, 2.63),
    new T.MeshBasicMaterial({ map: rainMap, transparent: true, depthWrite: false })
  );
  drops.position.set(10, 2.38, -4.16);
  spaces[1].add(drops);
  rooms.forEach((r, i) => {
    roomIndex = i;
    const x = r.x;
    for (let j = 0; j < 22; j++) {
      const board = i === 1 ? ['#947454', '#896e50', '#9f7754'] : ['#896446', '#93694a', '#805e46'];
      box(board[j % 3], x - 4.76 + j * 0.455, -0.07, 0, 0.448, 0.14, 9.3);
    }
    box(r.wall, x, 2.1, -4.48, 10, 4.25, 0.18);
    box('#463c30', x, 0.47, -4.31, 10, 0.96, 0.2);
    box('#a8875b', x, 0.96, -4.15, 10, 0.06, 0.1);
    for (let col = 0; col < 10; col++) box('#75573c', x - 4.5 + col, 0.48, -4.16, 0.047, 0.82, 0.06);
    box('#69523d', x, 4.12, -4.2, 10, 0.2, 0.38);
    for (let beam = -4; beam <= 4; beam += 2) box('#6c5240', x + beam, 4.07, 0, 0.13, 0.2, 9);
    box('#8e7253', x, 4.27, 0, 10, 0.12, 9.25);
    for (const side of [-1, 1]) {
      const boundary = x + side * 4.94;
      box(r.wall, boundary, 1.97, -2.17, 0.16, 3.95, 4.62);
      box('#95744c', boundary, 1.98, 0.1, 0.22, 4.0, 0.19);
      box('#594937', boundary, 3.62, 2.34, 0.22, 0.65, 4.62);
    }
    // Finish the approach side too. Internal passages are framed below the lintel,
    // and the end rooms have real outside walls behind their chairs.
    box(r.wall, x, 2.08, 4.64, 10, 4.22, 0.16);
    box('#463c30', x, 0.5, 4.49, 10, 1.0, 0.15);
    box('#a8875b', x, 1.007, 4.38, 10, 0.05, 0.08);
    for (let j = 0; j < 8; j++) {
      const xx = x - 4.37 + j * 1.25;
      box('#75573c', xx, 0.5, 4.37, 0.05, 0.9, 0.054);
    }
    for (const side of [-1, 1]) {
      const bound = x + side * 4.94,
        exterior = Math.abs(bound) > 14;
      box(r.wall, bound, 1.95, exterior ? 2.27 : 3.91, 0.17, 3.92, exterior ? 4.65 : 1.55);
      if (!exterior) {
        box('#75573c', bound, 1.59, 0.29, 0.24, 3.18, 0.14);
        box('#75573c', bound, 1.59, 3.04, 0.24, 3.18, 0.14);
        box('#95744c', bound, 3.16, 1.67, 0.24, 0.15, 2.87);
      } else {
        box('#463c30', bound - side * 0.1, 0.49, 0.05, 0.12, 0.98, 9.25);
        box('#a8875b', bound - side * 0.16, 1.005, 0.05, 0.065, 0.052, 9.25);
      }
    }
    for (const side of [-1, 1]) {
      const xx = x + side * 2.65;
      box('#75573c', xx, 2.31, 4.482, 2.8, 1.75, 0.09);
      const pane = view.clone();
      pane.repeat.x = 0.4;
      pane.offset.x = side < 0 ? 0.54 : 0.055;
      panel(pane, xx, 2.31, 4.422, 2.64, 1.59, Math.PI);
      box('#75573c', xx, 2.31, 4.398, 0.04, 1.59, 0.049);
      box('#75573c', xx, 2.47, 4.398, 2.62, 0.04, 0.045);
      box('#95744c', xx, 1.47, 4.368, 2.86, 0.069, 0.17);
    }
    for (const z of [-3.92, -1.43, 1.0, 3.65]) box('#70543f', x, 3.95, z, 9.7, 0.25, 0.15);
    panel(rug(i === 1 ? '#425d51' : i === 2 ? '#765448' : '#80513e'), x, 0.011, 1.1, 3.55, 5.4, 0, true);
    if (i === 1) {
      panel(view, x, 2.38, -4.175, 8.8, 2.65);
      for (let k = -4; k <= 4; k++) box('#5c5746', x + k * 1.04, 2.42, -4.12, 0.075, 2.78, 0.09);
      box('#705e46', x, 2.64, -4.08, 9.2, 0.07, 0.09);
      box('#856b47', x, 1.026, -4.03, 9, 0.1, 0.34);
      for (const col of [-3, -1, 1, 3]) {
        const mid = x + col * 1.04;
        for (let j = 0; j < 11; j++) {
          const angle = (Math.PI * j) / 10;
          box(
            '#907951',
            mid + Math.cos(angle) * 0.99,
            3.06 + Math.sin(angle) * 0.56,
            -4.027,
            0.23,
            0.048,
            0.049,
            0,
            0,
            angle + Math.PI * 0.5
          );
        }
      }
      table(8.45, -1.22, 0.84, 2.1, 1);
      chair(10.6, -0.7);
      plant(13.1, -2.6, 1.75);
      plant(6.5, -3.4, 1.25);
      lamp(7.76, -1.33, 0.84);
    } else if (i === 0) {
      shelving(x - 2.55, -3.98, 3.6);
      shelving(x + 2.55, -3.98, 3.6);
      box('#8d6743', x, 2.0, -4.12, 1.41, 2.04, 0.1);
      panel(view, x, 2.05, -4.04, 1.22, 1.81);
      table(1.73, 0.16, 1, 1.43, 1.1);
      lamp(2.16, -0.03, 1);
      box('#493c2e', -0.62, 0.51, -0.85, 2.06, 1.02, 0.53);
      box('#395347', -0.62, 1.33, -0.94, 2.03, 0.65, 0.075);
      box('#976d48', -0.62, 0.99, -0.63, 2.18, 0.08, 0.76);
      box('#b8915b', -0.62, 1.023, -0.245, 2.2, 0.055, 0.06);
      for (const sign of [-1, 1]) {
        box('#70543a', -0.62 + sign * 1.045, 1.31, -0.69, 0.075, 0.62, 0.53);
        box('#a68553', -0.62 + sign * 1.045, 1.635, -0.69, 0.095, 0.045, 0.56);
      }
      displayCabinet(built[i], -0.62, -0.85);
      panel(printed('Полка читателя', 'COLLECTION', '#2f453b'), -0.62, 0.895, -0.475, 1.03, 0.215);
      for (let j = 0; j < 19; j++) {
        const a = (Math.PI * j) / 18,
          cx = x + Math.cos(a) * 0.72,
          cy = 2.96 + Math.sin(a) * 0.63;
        box('#b39362', cx, cy, -4.04, 0.17, 0.055, 0.06, 0, 0, a + Math.PI / 2);
      }
      plant(4.05, -1.31, 1.5);
      chair(-3.6, -0.9);
      table(-2.48, -2.91, 1.43, 2.3, 0.6);
      const globe = createCelestialGlobe();
      globe.position.set(-1.93, 1.43, -2.94);
      spaces[0].add(globe);
    } else {
      table(-10, -0.65, 0.96, 3.65, 1.6);
      table(-7.15, 0.2, 0.88, 1.25, 0.73, true);
      bookPress(built[i], -8.99, 0.96, -0.91);
      table(-13, -2.88, 0.95, 1.65, 1.0);
      lamp(-11.34, -0.76, 0.96);
      cyl('#95744c', x - 0.11, 3.38, -4.0, 0.058, 6.4, 0.058, 0, 0, Math.PI / 2);
      for (let j = 0; j < 8; j++) {
        const x0 = x - 2.6 + j * 0.7;
        box(covers[j], x0, 2.52, -4.08, 0.52, 1.63, 0.08);
        cyl('#bb9762', x0, 3.35, -4.02, 0.065, 0.66, 0.065, 0, 0, Math.PI / 2);
      }
      box('#755837', x, 1.33, -3.88, 7, 0.14, 0.52);
      for (let j = 0; j < 19; j++) cyl(covers[j % 8], x - 2.9 + j * 0.32, 1.56, -3.85, 0.22, 0.34, 0.22);
      panel(printed('Reliure', 'ATELIER  ·  PAPIER', '#704c3e'), x, 3.7, -4.1, 1.87, 0.62);
      plant(-13.3, 0.1, 0.91);
    }
  });
  const jackets = new T.BufferGeometry();
  jackets.setAttribute('position', new T.Float32BufferAttribute(spinePositions, 3));
  jackets.setAttribute('normal', new T.Float32BufferAttribute(spineNormals, 3));
  jackets.setAttribute('uv', new T.Float32BufferAttribute(spineUV, 2));
  spaces[0].add(new T.Mesh(jackets, new T.MeshLambertMaterial({ map: spines })));
  built.forEach((c, i) => spaces[i].add(c.meshes()));
  const stained = new T.MeshLambertMaterial({ map: grain }),
    painted = new T.MeshLambertMaterial();
  for (const b of batches.values()) {
    const mesh = new T.InstancedMesh(geos[b.kind], b.wood ? stained : painted, b.matrices.length);
    b.matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, b.colors[i]);
    });
    mesh.computeBoundingSphere();
    spaces[b.room].add(mesh);
  }
  const ambient = new T.HemisphereLight(0xffedce, 0x8b8377, 1.19);
  scene.add(ambient);
  const sun = new T.DirectionalLight(0xffe1b5, 2.26);
  sun.position.set(-3, 5, 3);
  scene.add(sun);
  const fill = new T.DirectionalLight(0xd3e5e0, 0.68);
  fill.position.set(5, 2, -2);
  scene.add(fill);
  const frustum = new T.Frustum(),
    matrix = new T.Matrix4();
  const portals = [-5, 5].map(
    (x) => new T.Box3(new T.Vector3(x - 0.17, 0, 0.09), new T.Vector3(x + 0.17, 3.26, 3.23))
  );
  function visibility(camera, room) {
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    );
    const west = frustum.intersectsBox(portals[0]),
      east = frustum.intersectsBox(portals[1]);
    spaces[0].visible = room === 0 || (room === 2 ? west : east);
    spaces[1].visible = room === 1 || (room === 0 ? east : west && east);
    spaces[2].visible = room === 2 || (room === 0 ? west : east && west);
  }
  return { drops, rainMap, visibility };
}
