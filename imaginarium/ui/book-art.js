import * as T from './vendor/three.module.js';
import { Cast, bevel, finish, seeded } from './artisan.js';
function ornament(c, x, y, scale, mirror) {
  c.save();
  c.translate(x, y);
  c.scale(scale * (mirror ? -1 : 1), scale);
  c.beginPath();
  c.moveTo(0, 76);
  c.bezierCurveTo(0, 15, 21, 0, 80, 0);
  c.moveTo(5, 56);
  c.bezierCurveTo(24, 50, 27, 26, 17, 31);
  c.bezierCurveTo(8, 37, 12, 45, 24, 40);
  c.moveTo(7, 39);
  c.bezierCurveTo(2, 21, 24, 4, 44, 8);
  c.bezierCurveTo(56, 11, 40, 23, 32, 17);
  c.stroke();
  for (let i = 0; i < 5; i++) {
    const px = 14 + i * 8,
      py = 22 * Math.exp(-i * 0.63);
    c.beginPath();
    c.ellipse(px, py, 3.5, 1.6, -0.63, 0, 2 * Math.PI);
    c.fill();
  }
  c.restore();
}
function emblem(c, kind) {
  c.save();
  c.translate(259, 255);
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(0, 0, 95, 104, 0, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.ellipse(0, 0, 88, 97, 0, 0, Math.PI * 2);
  c.stroke();
  if (kind === 0) {
    // A lighthouse cut in brass foil. Small waves and the Fresnel beams survive the large cover view.
    c.beginPath();
    c.moveTo(-25, 51);
    c.lineTo(-14, -26);
    c.lineTo(14, -26);
    c.lineTo(23, 51);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(-21, -24);
    c.lineTo(-20, -52);
    c.lineTo(0, -67);
    c.lineTo(20, -52);
    c.lineTo(19, -24);
    c.closePath();
    c.stroke();
    c.strokeRect(-15, -49, 30, 20);
    c.strokeRect(-4, 2, 8, 13);
    for (const side of [-1, 1])
      for (let j = 0; j < 5; j++) {
        c.beginPath();
        c.moveTo(side * 22, -39);
        c.lineTo(side * (45 + j * 7), -60 + j * 10);
        c.stroke();
      }
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(-61, 51 + i * 7);
      for (let x = -61; x < 65; x += 14) c.quadraticCurveTo(x + 7, 47 + i * 7, x + 14, 51 + i * 7);
      c.stroke();
    }
  } else if (kind === 1) {
    c.strokeRect(-56, -25, 112, 52);
    c.strokeRect(-49, -18, 22, 23);
    c.strokeRect(-16, -18, 22, 23);
    c.strokeRect(18, -18, 22, 23);
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(33 * s, 31, 11, 0, Math.PI * 2);
      c.stroke();
    }
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(-65 + i * 7, 52 + i * 5);
      c.lineTo(65 - i * 2, 52 + i * 5);
      c.stroke();
    }
    c.beginPath();
    c.arc(25, -49, 9, 0, Math.PI * 2);
    c.stroke();
  } else {
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(0, 0, 73, 23, -0.67 + i * 0.65, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.arc(0, 0, 20, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        r = 61 + (i % 3) * 7;
      c.fillRect(Math.cos(a) * r, Math.sin(a) * r, 3, 3);
    }
  }
  c.restore();
}
function jacket(book) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 768;
  const a = c.getContext('2d'),
    rand = seeded(41);
  a.fillStyle = book.color;
  a.fillRect(0, 0, 512, 768);
  for (let i = 0; i < 8500; i++) {
    a.fillStyle = i % 2 ? 'rgba(255,229,184,.13)' : 'rgba(25,16,13,.14)';
    a.fillRect(rand() * 512, rand() * 768, 0.8 + rand() * 2, 1);
  }
  const spine = a.createLinearGradient(0, 0, 45, 0);
  spine.addColorStop(0, '#29180e50');
  spine.addColorStop(0.3, '#ffedbf32');
  spine.addColorStop(0.53, '#251a132e');
  spine.addColorStop(1, '#34231800');
  a.fillStyle = spine;
  a.fillRect(0, 0, 46, 768);
  a.fillStyle = a.strokeStyle = '#dfbd7d';
  a.lineWidth = 2;
  for (const inset of [27, 33, 42]) a.strokeRect(inset + 9, inset, 512 - 2 * inset - 9, 768 - 2 * inset);
  ornament(a, 57, 52, 1, false);
  ornament(a, 462, 52, 1, true);
  a.save();
  a.translate(0, 768);
  a.scale(1, -1);
  ornament(a, 57, 52, 1, false);
  ornament(a, 462, 52, 1, true);
  a.restore();
  let k = 0;
  for (const l of book.id || book.title) k = (k * 31 + l.charCodeAt(0)) >>> 0;
  emblem(a, book.id?.startsWith('found-') ? Number(book.id.slice(-1)) : k % 3);
  a.textAlign = 'center';
  a.fillStyle = '#f1d59b';
  a.font = '19px Georgia';
  a.fillText('I M A G I N A R I U M', 258, 108);
  const words = book.title.trim().split(/\s+/),
    lines = [];
  a.font = 'bold 47px Georgia';
  let line = '';
  for (const word of words) {
    const next = (line + ' ' + word).trim();
    if (line && a.measureText(next).width > 364) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  lines.push(line);
  lines.slice(0, 4).forEach((s, i) => a.fillText(s, 260, 425 + i * 52, 368));
  a.font = 'italic 23px Georgia';
  a.fillText('Ex libris', 259, 661);
  a.beginPath();
  a.moveTo(194, 689);
  a.lineTo(324, 689);
  a.stroke();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new T.MeshStandardMaterial({ map: t, roughness: 0.62 });
  m.userData.ownedMap = true;
  return m;
}
export function boundVolume(book) {
  const c = new Cast(),
    leather = finish('leather', book.color),
    edge = finish('paper', '#e6d4b3'),
    foil = finish('metal', '#c6a162'),
    ribbon = finish('cloth', '#9e6747');
  c.box(edge, [0.007, 0, 0], 0.386, 0.053, 0.562, 0.009);
  for (const sign of [-1, 1]) c.box(leather, [0, sign * 0.0325, 0], 0.411, 0.011, 0.59, 0.004);
  c.add(
    new T.CylinderGeometry(0.038, 0.038, 0.587, 12),
    leather,
    [-0.194, 0, 0],
    [Math.PI / 2, 0, 0],
    [0.65, 1, 1]
  );
  for (const z of [-0.22, -0.175, 0.175, 0.22])
    c.add(
      new T.CylinderGeometry(0.039, 0.039, 0.011, 12),
      foil,
      [-0.194, 0, z],
      [Math.PI / 2, 0, 0],
      [0.66, 1, 1]
    );
  for (let i = 0; i < 6; i++)
    c.box(
      finish('paper', i % 2 ? '#c3b298' : '#e0ccad'),
      [0.2002, -0.02 + i * 0.008, 0],
      0.002,
      0.0012,
      0.541,
      0.0003
    );
  c.box(ribbon, [0.103, -0.014, 0.298], 0.033, 0.003, 0.052, 0.001, [-0.11, 0, 0.03]);
  const root = c.meshes(),
    cover = new T.Mesh(new T.PlaneGeometry(0.397, 0.574), jacket(book));
  cover.rotation.x = -Math.PI / 2;
  cover.position.set(0.001, 0.0385, 0);
  root.add(cover);
  return root;
}
