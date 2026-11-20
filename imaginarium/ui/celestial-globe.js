import * as T from './vendor/three.module.js';
import { Cast } from './artisan.js';

// The horizon, equatorial axis and three curved supports meet at the same
// pivots. The chart and the stand can be inspected from behind the table.
export function createCelestialGlobe() {
  const stand = new T.Group();
  stand.name = 'Настольный небесный глобус';
  const brass = new T.MeshPhongMaterial({ color: 0xb09164, specular: 0xcbb69a, shininess: 52 });
  const gold = new T.MeshPhongMaterial({ color: 0xe3be79, specular: 0xfde2ab, shininess: 85 });
  const grain = document.createElement('canvas');
  grain.width = 256;
  grain.height = 64;
  const painter = grain.getContext('2d');
  const image = painter.createImageData(grain.width, grain.height);
  for (let y = 0; y < grain.height; y++) {
    for (let x = 0; x < grain.width; x++) {
      const a = x * Math.PI / 128;
      const fold = Math.sin(y * .76 + 2.1 * Math.sin(a) + .75 * Math.sin(5 * a + y * .09));
      const stripe = 12 * fold ** 3 + 5 * Math.sin(y * .21 + 3 * Math.cos(a));
      image.data.set([128 + stripe, 83 + .77 * stripe, 61 + .55 * stripe, 255], 4 * (x + grain.width * y));
    }
  }
  painter.putImageData(image, 0, 0);
  const wood = new T.CanvasTexture(grain);
  wood.colorSpace = T.SRGBColorSpace;
  wood.wrapS = T.RepeatWrapping;
  const walnut = new T.MeshPhongMaterial({ map: wood, color: 0xdbc5ac, specular: 0x847469, shininess: 48 });
  const bronze = new T.MeshStandardMaterial({ color: 0x473a31, metalness: 0.30, roughness: 0.48 });
  const chart = new T.TextureLoader().load(new URL('./art/celestial-atlas.webp', import.meta.url).href);
  chart.colorSpace = T.SRGBColorSpace;
  chart.wrapS = T.RepeatWrapping;
  const enamel = new T.MeshStandardMaterial({ map: chart, roughness: 0.53 });

  const casting = new Cast();
  function turn(material, profile) {
    casting.add(new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), 40), material, [0, 0, 0]);
  }
  function bead(material, x, y, z, radius, scale = [1, 1, 1]) {
    casting.add(new T.SphereGeometry(radius, 12, 8), material, [x, y, z], [0, 0, 0], scale);
  }
  function tube(material, path, radius) {
    const curve = new T.CatmullRomCurve3(path.map(p => new T.Vector3(...p)));
    casting.add(new T.TubeGeometry(curve, 16, radius, 7, false), material, [0, 0, 0]);
  }

  // A weighted, turned walnut foot with a felt pad, an ogee and a brass collar.
  turn(bronze, [[0, 0], [.125, 0], [.128, .007], [.128, .012], [0, .012]]);
  turn(walnut, [[.002, .009], [.131, .009], [.138, .016], [.14, .025], [.136, .035],
    [.127, .039], [.125, .046], [.117, .051], [.105, .055], [.10, .066],
    [.086, .074], [.069, .08], [.057, .091], [.048, .108], [.045, .128],
    [.05, .139], [.054, .144], [.052, .151], [.04, .156], [.002, .156]]);
  turn(gold, [[.133, .033], [.137, .034], [.136, .038], [.131, .040]]);
  turn(brass, [[.041, .148], [.052, .149], [.055, .157], [.046, .163],
    [.033, .168], [.03, .19], [.041, .198], [.038, .208], [.014, .214], [0, .214]]);

  const centerY = .456;
  const radius = .193;
  for (const angle of [0, Math.PI, Math.PI * 1.5]) {
    const point = (distance, y) => [Math.cos(angle) * distance, y, Math.sin(angle) * distance];
    tube(brass, [point(.026, .176), point(.095, .187), point(.176, .232),
      point(.207, .306), point(.224, .397), point(.237, centerY)], .0095);
    tube(gold, [point(.029, .185), point(.097, .204), point(.155, .244), point(.204, .303)], .0033);
    bead(brass, ...point(.236, centerY), .015);
  }
  // A thick wooden horizon with concentric brass lips and an engraved dial.
  turn(walnut, [[.217, .449], [.237, .449], [.241, .454], [.241, .46], [.236, .464], [.217, .464], [.217, .449]]);
  turn(gold, [[.235, .462], [.235, .466], [.219, .466], [.219, .462]]);
  for (let i = 0; i < 72; i++) {
    const angle = i * Math.PI / 36;
    const major = i % 6 === 0;
    const r = major ? .225 : .222;
    casting.add(new T.BoxGeometry(major ? .0019 : .0011, .0007, major ? .011 : .006),
      bronze, [r * Math.sin(angle), .4663, r * Math.cos(angle)], [0, angle, 0]);
  }
  const tilt = .30;
  casting.add(new T.SphereGeometry(radius, 40, 24), enamel, [0, centerY, 0], [0, -.40, tilt]);
  casting.add(new T.TorusGeometry(.2075, .0051, 8, 72), brass, [0, centerY, 0]);
  const tip = (distance) => [-Math.sin(tilt) * distance, centerY + Math.cos(tilt) * distance, 0];
  for (const sign of [-1, 1]) {
    casting.add(new T.CylinderGeometry(.0065, .0065, .035, 12), gold, tip(sign * .205), [0, 0, tilt]);
    bead(brass, ...tip(sign * .224), .0105, [1, 1.12, 1]);
  }
  casting.meshes(stand);
  for (const mesh of stand.children) mesh.castShadow = mesh.receiveShadow = true;
  return stand;
}
