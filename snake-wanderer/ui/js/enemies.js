// Враги: пять обычных видов, их усиленные вожаки и страж логова. Плюс снаряды и ударные волны.
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { build, part, M, G as P, vcMat } from './mesh.js';
import { rand, pickW, clamp, angDiff, pointInPoly } from './util.js';

const H = Math.PI / 2;
export const DEF = {
  slime: { hp: 6, spd: 2.7, dmg: 6, r: 0.6, xp: 3, name: 'Слизень' },
  spiker: { hp: 9, spd: 3.8, dmg: 10, r: 0.6, xp: 5, name: 'Шипастик' },
  spitter: { hp: 7, spd: 2.8, dmg: 8, r: 0.55, xp: 5, name: 'Плевун' },
  swarm: { hp: 2, spd: 6.7, dmg: 3, r: 0.36, xp: 1, name: 'Мошка' },
  brute: { hp: 34, spd: 2.3, dmg: 18, r: 1.1, xp: 14, name: 'Панцирник' },
  boss: { hp: 420, spd: 2.5, dmg: 17, r: 2.5, xp: 150, name: 'Страж', boss: true },
  rival: { hp: 360, spd: 6.3, dmg: 13, r: 0.8, xp: 150, name: 'Змей-соперник', boss: true },
  queen: { hp: 330, spd: 3.4, dmg: 12, r: 1.5, xp: 150, name: 'Королева улья', boss: true },
  worm: { hp: 400, spd: 0, dmg: 19, r: 1.7, xp: 150, name: 'Ледяной червь', boss: true },
  turret: { hp: 13, spd: 0, dmg: 8, r: 0.65, xp: 6, name: 'Каменная голова' },
  lord: { hp: 1050, spd: 2.2, dmg: 22, r: 3, xp: 400, name: 'Хозяин архипелага', boss: true },
};
const eye = (x, y, z, s = 0.09, hex = '#10222a') => part(P.ico(s), hex, M(x, y, z));
const GEO = {
  slime: build([part(P.ico(0.6, 1), '#58c9a0', M(0, 0.42, 0, [1, 0.74, 1])), eye(-0.2, 0.56, 0.47), eye(0.2, 0.56, 0.47)]),
  spiker: build([
    part(P.dod(0.55), '#6a4a9c', M(0, 0.58, 0)),
    part(P.cone(0.16, 0.6, 5), '#ece4ff', M(0, 1.2, 0)),
    part(P.cone(0.16, 0.6, 5), '#ece4ff', M(0.62, 0.62, 0, 1, [0, 0, -H])),
    part(P.cone(0.16, 0.6, 5), '#ece4ff', M(-0.62, 0.62, 0, 1, [0, 0, H])),
    part(P.cone(0.16, 0.6, 5), '#ece4ff', M(0, 0.62, -0.62, 1, [-H, 0, 0])),
    part(P.cone(0.14, 0.5, 5), '#ece4ff', M(0.4, 1.05, -0.3, 1, [-0.6, 0, -0.7])),
    part(P.cone(0.14, 0.5, 5), '#ece4ff', M(-0.4, 1.05, -0.3, 1, [-0.6, 0, 0.7])),
    eye(-0.2, 0.7, 0.46, 0.1, '#ff4b4b'), eye(0.2, 0.7, 0.46, 0.1, '#ff4b4b'),
  ]),
  spitter: build([
    part(P.cyl(0.2, 0.3, 0.7, 6), '#eadccb', M(0, 0.35, 0)),
    part(P.cone(0.66, 0.62, 7), '#d94f9a', M(0, 0.98, 0)),
    part(P.ico(0.13), '#ffe9f4', M(0.3, 1.0, 0.36)), part(P.ico(0.11), '#ffe9f4', M(-0.34, 0.95, 0.2)),
    eye(-0.12, 0.5, 0.27, 0.07), eye(0.12, 0.5, 0.27, 0.07),
  ]),
  swarm: build([part(P.oct(0.26), '#ffcf4d', M(0, 0, 0, [1, 0.8, 1.5])), part(P.box(0.8, 0.03, 0.24), '#fff6d8', M(0, 0.12, 0)), eye(0, 0.02, 0.36, 0.08)]),
  brute: build([
    part(P.dod(1.05), '#8a6a4f', M(0, 0.92, 0, [1.12, 0.86, 1])),
    part(P.dod(0.55), '#9c7c5e', M(0, 1.1, 0.85)),
    part(P.cone(0.2, 0.8, 5), '#f1e6d0', M(0.5, 1.75, 0.75, 1, [0.5, 0, -0.5])),
    part(P.cone(0.2, 0.8, 5), '#f1e6d0', M(-0.5, 1.75, 0.75, 1, [0.5, 0, 0.5])),
    eye(-0.2, 1.2, 1.36, 0.1, '#ffd24a'), eye(0.2, 1.2, 1.36, 0.1, '#ffd24a'),
  ]),
  boss: build([
    part(P.dod(2.0), '#565a70', M(0, 2.0, 0, [1, 1.1, 1])),
    part(P.dod(1.15), '#6a6f88', M(2.0, 2.7, 0)), part(P.dod(1.15), '#6a6f88', M(-2.0, 2.7, 0)),
    part(P.dod(0.85), '#7b819b', M(0, 4.2, 0.3)),
    part(P.oct(0.75), '#ff5252', M(0, 2.3, 1.75)),
    part(P.cone(0.35, 1.4, 5), '#9aa0bb', M(0.5, 5.2, 0.2, 1, [0, 0, -0.3])), part(P.cone(0.35, 1.4, 5), '#9aa0bb', M(-0.5, 5.2, 0.2, 1, [0, 0, 0.3])),
    eye(-0.3, 4.3, 1.05, 0.14, '#ff5252'), eye(0.3, 4.3, 1.05, 0.14, '#ff5252'),
  ]),
  turret: build([part(P.cyl(0.5, 0.65, 0.9, 6), '#6f7a68', M(0, 0.45, 0)), part(P.dod(0.62), '#7f8a76', M(0, 1.25, 0)), part(P.cyl(0.22, 0.22, 0.3, 6), '#2a1c1c', M(0, 1.2, 0.55, 1, [H, 0, 0])), eye(-0.24, 1.48, 0.46, 0.09, '#b8f27a'), eye(0.24, 1.48, 0.46, 0.09, '#b8f27a')]),
  rival: build([part(P.ico(0.62, 1), '#8f1d2c', M(0, 0.55, 0, [1, 0.8, 1.25])), part(P.cone(0.1, 0.3, 4), '#f1e6d0', M(0.18, 0.3, 0.62, 1, [H * 2, 0, 0])), part(P.cone(0.1, 0.3, 4), '#f1e6d0', M(-0.18, 0.3, 0.62, 1, [H * 2, 0, 0])),
    eye(-0.28, 0.72, 0.5, 0.13, '#ffd24a'), eye(0.28, 0.72, 0.5, 0.13, '#ffd24a')]),
  queen: build([
    part(P.ico(1.25, 1), '#e9a92c', M(0, 1.2, -0.7, [1, 0.9, 1.5])), part(P.cyl(1.27, 1.27, 0.3, 10), '#3a2a18', M(0, 1.2, -0.2, 1, [H, 0, 0])), part(P.cyl(1.1, 1.1, 0.3, 10), '#3a2a18', M(0, 1.2, -1.3, 1, [H, 0, 0])),
    part(P.ico(0.7, 1), '#c98a1e', M(0, 1.5, 1.1)), part(P.box(2.4, 0.06, 0.9), '#fff6d8', M(1.5, 2.1, 0, 1, [0, 0, 0.3])), part(P.box(2.4, 0.06, 0.9), '#fff6d8', M(-1.5, 2.1, 0, 1, [0, 0, -0.3])),
    part(P.cone(0.12, 0.4, 4), '#ffd24a', M(0, 2.3, 1.1)), part(P.cone(0.1, 0.32, 4), '#ffd24a', M(0.25, 2.2, 1.05)), part(P.cone(0.1, 0.32, 4), '#ffd24a', M(-0.25, 2.2, 1.05)),
    eye(-0.3, 1.6, 1.7, 0.16, '#2a1010'), eye(0.3, 1.6, 1.7, 0.16, '#2a1010'),
  ]),
  worm: build([
    part(P.cyl(1.35, 1.7, 2.2, 9), '#9fc9e6', M(0, 1.1, 0)), part(P.cyl(1.2, 1.35, 1.8, 9), '#b6dbf2', M(0, 3.1, 0)), part(P.dod(1.3), '#cfeaff', M(0, 4.6, 0.2)),
    part(P.cyl(0.8, 0.8, 0.25, 10), '#5a1f2a', M(0, 4.7, 1.25, 1, [H, 0, 0])),
    ...[0, 1, 2, 3, 4, 5].map((i) => part(P.cone(0.13, 0.5, 4), '#ffffff', M(Math.sin(i * 1.047) * 0.62, 4.7 + Math.cos(i * 1.047) * 0.62, 1.5, 1, [H, 0, 0]))),
  ]),
  lord: build([
    part(P.cyl(2.2, 2.9, 2.6, 9), '#4f6a52', M(0, 1.3, 0)), part(P.cyl(1.7, 2.2, 2.4, 9), '#5c7a5e', M(0, 3.8, 0)), part(P.dod(1.9), '#6f8f70', M(0, 6.2, 0.5)),
    part(P.oct(0.5), '#7dff9a', M(0.7, 6.6, 1.9)), part(P.oct(0.5), '#7dff9a', M(-0.7, 6.6, 1.9)),
    ...[0, 1, 2, 3, 4].map((i) => part(P.cone(0.3, 1.3, 5), '#9dffb0', M(Math.sin(i * 1.257) * 1.3, 8.2, Math.cos(i * 1.257) * 1.3 + 0.5))),
  ]),
};
const SEG = new THREE.SphereGeometry(0.46, 8, 6), SEG_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff });
const _m4 = new THREE.Matrix4(), _c3 = new THREE.Color();
const MAT = vcMat();
const ELITE = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xff5a1f, emissiveIntensity: 0.55 });
const FROZEN = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x4fa8ff, emissiveIntensity: 0.9 });
const FLASH = new THREE.MeshBasicMaterial({ color: 0xffffff });
/** Свойства вожаков: у каждого своё свечение и своя повадка. */
const tint = (hex) => new THREE.MeshLambertMaterial({ vertexColors: true, emissive: hex, emissiveIntensity: 0.5 });
export const AFFIX = {
  swift: { name: 'Быстрый', mat: tint(0xd9a800) },
  shield: { name: 'Щитоносец', mat: tint(0x3f8cff) },
  volatile: { name: 'Гремучий', mat: tint(0xff2a1f) },
  frost: { name: 'Стылый', mat: tint(0x7fc8e8) },
  splitter: { name: 'Матка', mat: tint(0x3fc02a) },
};
const AFFIXES = Object.keys(AFFIX);
const CAP = 96;

export class Enemies {
  constructor(game, scene) {
    this.G = game; this.scene = scene; this.list = []; this.shots = []; this.waves = [];
    this.shotGeo = new THREE.IcosahedronGeometry(0.3, 1);
    this.shotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7ac8).multiplyScalar(3) });
    this.waveGeo = new THREE.RingGeometry(0.93, 1, 56); this.waveGeo.rotateX(-H);
    // Полосы-предупреждения: куда бросится шипастик, куда плюнет плевун.
    this.lines = [];
    const lg = new THREE.PlaneGeometry(0.6, 1); lg.rotateX(-H); lg.translate(0, 0, 0.5);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; m.frustumCulled = false; scene.add(m);
      this.lines.push({ m, t: 0, dur: 1 });
    }
  }

  pickType(diff) {
    const w = [['slime', 10]];
    if (diff > 1.25) w.push(['spiker', 4 + diff]);
    if (diff > 1.7) w.push(['swarm', 3 + diff]);
    if (diff > 2.1) w.push(['spitter', 3 + diff]);
    if (diff > 2.7) w.push(['brute', 1.5 + diff * 0.6]);
    return pickW(w);
  }

  spawn(type, x, z, o = {}) {
    if (this.list.length >= CAP) return null;
    const arts = (this.G.run && this.G.run.arts) || {};
    const def = DEF[type], diff = this.G.diff, elite = !!o.elite || (!!arts.elites && !def.boss), k = elite ? 1.5 : 1;
    if (arts.swarm) o = { ...o, hpMul: (o.hpMul || 1) * 0.5 };
    // Вожак может прийти со свойством: чем выше угроза, тем чаще.
    let affix = null;
    if (elite && !def.boss) affix = o.affix !== undefined ? o.affix : Math.random() < (this.G.run && this.G.run.circle >= 3 ? 1 : arts.elites ? 0.3 : diff > 1.5 ? 0.75 : 0) ? AFFIXES[Math.floor(Math.random() * AFFIXES.length)] : null;
    const e = {
      type, x, z, y: heightAt(x, z), r: def.r * k, scale: k * (o.scale || 1), spd: def.spd * (elite ? 1.1 : 1) * (affix === 'swift' ? 1.45 : 1), affix,
      hp: def.hp * Math.pow(diff, 1.22) * (elite ? 5 : 1) * (o.hpMul || 1), dmg: def.dmg * (1 + (diff - 1) * 0.4) * (elite ? 1.3 : 1),
      xp: def.xp * (elite ? 4 : 1), elite, tag: o.tag || 'amb', state: 'chase', st: rand(0.3, 1.6), hitCd: 0.5, flashT: 0,
      kx: 0, kz: 0, freeze: 0, poisonT: 0, poisonDps: 0, poisonAcc: 0, anim: rand(0, 6), seed: rand(0, 6), fireCd: rand(1, 2.6),
      atkT: 4, sumT: 9, ddx: 0, ddz: 1, sleep: !!o.sleep, camp: o.camp || 0, hitT: 0, hitS: 1, armT: 0, aiming: false, face: 0, dead: false, base: affix ? AFFIX[affix].mat : elite ? ELITE : MAT, markT: 0, acid: 0, acidT: 0, bleedT: 0, bleedDps: 0, bleedAcc: 0, wardT: 0, thornT: 0, dashId: 0, born: 0, march: o.march || null, burnT: 0, burnDps: 0, burnAcc: 0, slowT: 0,
    };
    e.maxHp = e.hp; e.boss = !!def.boss; e.hidden = false; e.rage = false;
    if (type === 'rival') this.makeRival(e);
    if (type === 'worm') { e.state = 'up'; e.st = 3; }
    if (type === 'queen') { e.state = 'air'; e.st = 9; e.sumT = 3; }
    if (o.sleep) e.born = 1;
    const sn = this.G.snake; e.face = Math.atan2(sn.x - x, sn.z - z);
    e.mesh = new THREE.Mesh(GEO[type], e.base);
    e.mesh.castShadow = true; e.mesh.scale.setScalar(0.01);
    e.mesh.position.set(x, e.y, z);
    this.scene.add(e.mesh);
    this.list.push(e);
    if (!o.quiet) this.G.fx.burst(x, e.y + 0.5, z, elite ? 0xff9a3d : 0x9a7bd0, 6, 2.5, 0.8, 2);
    if (affix && !o.quiet) this.G.ui.dmg(x, e.y + e.r * 2 + 0.8, z, AFFIX[affix].name, 'zap');
    return e;
  }

  /** Показать на земле полосу от точки в заданную сторону. */
  line(x, z, dx, dz, len, hex, dur) {
    const l = this.lines.find((q) => q.t <= 0) || this.lines[0];
    l.t = l.dur = dur;
    l.m.position.set(x, Math.max(heightAt(x, z), heightAt(x + dx * len, z + dz * len)) + 0.25, z);
    l.m.rotation.y = Math.atan2(dx, dz); l.m.scale.set(1, 1, len);
    l.m.material.color.set(hex); l.m.visible = true;
  }

  /** Разбудить стоянку: проснулся один — проснулись все. */
  wake(e) {
    for (const q of this.list) {
      if (q.dead || !q.sleep || q.camp !== e.camp) continue;
      q.sleep = false; q.st = rand(0.2, 0.9); q.hitCd = 0.6;
      this.G.ui.dmg(q.x, q.y + q.r * 2 + 0.6, q.z, '!', 'big');
    }
    this.G.sound.sfx('warn');
  }

  /** Тело змея-соперника: звенья идут по следу головы, как у героя. */
  makeRival(e) {
    const n = 26;
    e.body = new THREE.InstancedMesh(SEG, SEG_MAT, n); e.body.castShadow = true; e.body.frustumCulled = false;
    for (let i = 0; i < n; i++) e.body.setColorAt(i, _c3.set(i % 3 === 2 ? 0x1c1218 : 0x8f1d2c));
    e.bx = new Float32Array(n); e.bz = new Float32Array(n); e.bn = n; e.trail = [];
    for (let i = 0; i < n; i++) { e.bx[i] = e.x; e.bz[i] = e.z; }
    e.head = Math.atan2(this.G.snake.x - e.x, this.G.snake.z - e.z); e.dirS = Math.random() < 0.5 ? 1 : -1; e.sweep = 0; e.lastA = null; e.state = 'circle'; e.st = 4; e.bodyCd = 0;
    this.scene.add(e.body);
  }

  /** Сколько звеньев тела соперника внутри кольца игрока. */
  segsIn(e, px, pz, n) { let k = 0; for (let i = 0; i < e.bn; i++) if (pointInPoly(e.bx[i], e.bz[i], px, pz, n)) k++; return k; }

  spawnNear(type, cx, cz, rmin, rmax, o) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(rmin, rmax), x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      if (heightAt(x, z) > -0.3) return this.spawn(type, x, z, o);
    }
    return null;
  }

  /** Случайный враг по текущей угрозе; мошки приходят стайкой. */
  spawnPack(cx, cz, rmin, rmax, o = {}) {
    const reps = this.G.run && this.G.run.arts.swarm ? 2 : 1;
    for (let n = 0; n < reps; n++) {
      const type = this.pickType(this.G.diff);
      if (type === 'swarm') {
        const a = Math.random() * Math.PI * 2, r = rand(rmin, rmax);
        for (let i = 0; i < 4; i++) this.spawnNear('swarm', cx + Math.sin(a) * r, cz + Math.cos(a) * r, 0, 2.5, o);
      } else this.spawnNear(type, cx, cz, rmin, rmax, o);
    }
  }

  count(tag) { let n = 0; for (const e of this.list) if (!e.dead && e.tag === tag) n++; return n; }

  nearest(x, z, r, skip) {
    // Расстояние считаем до края врага, а не до центра: крупного можно кусать, не заползая в него.
    let best = null, bd = r;
    for (const e of this.list) {
      if (e.dead || e.hidden || (skip && skip.includes(e))) continue;
      const d = Math.hypot(e.x - x, e.z - z) - e.r;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  each(x, z, r, fn) {
    for (const e of this.list) {
      if (e.dead || e.hidden) continue;
      const dx = e.x - x, dz = e.z - z, rr = r + e.r;
      if (dx * dx + dz * dz < rr * rr) fn(e);
    }
  }

  hurt(e, dmg, cause, kx = 0, kz = 0) {
    if (e.dead || e.hidden) return false;
    // Королева в воздухе почти неуязвима: ждать, пока сядет.
    if (e.type === 'queen' && e.state === 'air' && cause !== 'poison' && cause !== 'fire' && cause !== 'bleed') { dmg *= 0.25; if (e.armT <= 0) { e.armT = 1.2; this.G.ui.dmg(e.x, e.y + 4.6, e.z, 'высоко', 'zap'); } }
    // «Щитоносец»: раз в три секунды гасит удар. Кольцо и медленный урон щит не замечает.
    if (e.affix === 'shield' && e.wardT <= 0 && cause !== 'loop' && cause !== 'poison' && cause !== 'fire' && cause !== 'bleed') {
      e.wardT = 3; this.G.fx.ring(e.x, e.y + e.r, e.z, 0x6fd6ff, 0.3, e.r + 1.2, 0.2);
      this.G.ui.dmg(e.x, e.y + e.r * 1.7 + 0.4, e.z, 'щит', 'zap');
      return false;
    }
    // Панцирник закрыт спереди: удар в лоб почти не проходит. Кольцо и удары сбоку — проходят.
    if (e.type === 'brute' && (kx || kz) && cause !== 'loop') {
      const k = Math.hypot(kx, kz);
      if ((kx / k) * Math.sin(e.face) + (kz / k) * Math.cos(e.face) < -0.35) {
        dmg *= 0.35;
        if (e.armT <= 0) { e.armT = 0.9; this.G.ui.dmg(e.x, e.y + e.r * 2.2, e.z, 'броня', 'zap'); this.G.fx.burst(e.x + Math.sin(e.face) * e.r, e.y + e.r, e.z + Math.cos(e.face) * e.r, 0xd8d0c0, 5, 4, 0.7, 2); }
      }
    }
    e.hp -= dmg; e.flashT = 0.09; e.mesh.material = FLASH; e.hitT = 0.16; e.hitS = Math.random() < 0.5 ? -1 : 1;
    const kb = e.boss ? 0 : e.type === 'brute' ? 0.3 : 1;
    e.kx += kx * kb; e.kz += kz * kb;
    this.G.ui.dmg(e.x, e.y + e.r * 1.7 + 0.4, e.z, Math.max(1, Math.round(dmg)) + (cause === 'crit' ? '!' : ''), cause);
    if (e.hp <= 0) { this.kill(e, cause); return true; }
    return false;
  }

  kill(e, cause, silent = false) {
    if (e.dead) return;
    e.dead = true;
    this.scene.remove(e.mesh);
    if (e.body) this.scene.remove(e.body);
    const hex = e.elite ? 0xffb052 : e.type === 'slime' ? 0x6fe0b6 : e.type === 'swarm' ? 0xffd86a : e.type === 'brute' ? 0xb08a66 : 0xb79cf0, big = e.boss;
    this.G.fx.burst(e.x, e.y + e.r, e.z, hex, big ? 40 : e.elite ? 16 : 9, big ? 9 : 4.5, big ? 2.2 : e.elite ? 1.5 : 1.1);
    if (cause !== 'far' && cause !== 'clear') {
      this.G.fx.burst(e.x, e.y + e.r * 0.6, e.z, 0xffffff, 4, 6, 0.6, 5);
      this.G.fx.ring(e.x, e.y, e.z, hex, 0.3, e.r * 2.8 + 0.6, 0.3);
    }
    if (!silent) this.G.onKill(e, cause);
  }

  clear(tag) {
    for (const e of this.list) if (!tag || e.tag === tag) this.kill(e, 'clear', true);
    if (!tag) { for (const l of this.lines) { l.t = 0; l.m.visible = false; } for (const s of this.shots) this.scene.remove(s.mesh); this.shots.length = 0; for (const w of this.waves) this.scene.remove(w.mesh); this.waves.length = 0; }
  }

  shoot(e, dx, dz) {
    const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
    this.scene.add(mesh);
    this.shots.push({ x: e.x, z: e.z, y: e.y + 1, vx: dx * 8.5, vz: dz * 8.5, life: 3.2, dmg: e.dmg, mesh });
  }

  wave(x, z, dmg, max) {
    const mesh = new THREE.Mesh(this.waveGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a4a).multiplyScalar(3), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.waves.push({ x, z, y: heightAt(x, z) + 0.3, r: 1.5, max, dmg, hit: false, mesh });
  }

  update(dt) {
    const G = this.G, s = G.snake, px = s.x, pz = s.z, L = this.list, live = G.state === 'play', lure = G.lure;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.dead) continue;
      // Цель — змейка, а если стоит манок, то он (стража манком не обмануть).
      const baited = lure && !e.boss;
      let dx = (baited ? lure.x : px) - e.x, dz = (baited ? lure.z : pz) - e.z;
      const d = Math.hypot(dx, dz) || 0.001, pd = baited ? Math.hypot(px - e.x, pz - e.z) : d;
      dx /= d; dz /= d;
      e.anim += dt;
      if (e.hitCd > 0) e.hitCd -= dt;
      if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) e.mesh.material = e.freeze > 0 ? FROZEN : e.base; }
      if (e.poisonT > 0) {
        e.poisonT -= dt; e.poisonAcc += e.poisonDps * dt;
        if (Math.random() < dt * 4) G.fx.burst(e.x, e.y + e.r, e.z, 0xb06cff, 1, 0.8, 0.6, 2);
        if (e.poisonAcc >= 1) { const a = e.poisonAcc; e.poisonAcc = 0; if (this.hurt(e, a, 'poison')) continue; }
      }
      if (e.burnT > 0) {
        e.burnT -= dt; e.burnAcc += e.burnDps * dt;
        if (Math.random() < dt * 7) G.fx.burst(e.x, e.y + e.r, e.z, 0xff8a3d, 1, 0.8, 0.8, 3);
        if (e.burnAcc >= 1) { const a = e.burnAcc; e.burnAcc = 0; if (this.hurt(e, a, 'fire')) continue; }
      }
      if (e.bleedT > 0) {
        e.bleedT -= dt; e.bleedAcc += e.bleedDps * dt;
        if (Math.random() < dt * 6) G.fx.burst(e.x, e.y + e.r, e.z, 0xff3b4a, 1, 0.8, 0.7, 2);
        if (e.bleedAcc >= 1) { const a = e.bleedAcc; e.bleedAcc = 0; if (this.hurt(e, a, 'bleed')) continue; }
      }
      if (e.markT > 0) { e.markT -= dt; if (Math.random() < dt * 5) G.fx.burst(e.x, e.y + e.r * 2, e.z, 0xff3b2f, 1, 0.4, 0.7, 1); }
      if (e.acidT > 0 && (e.acidT -= dt) <= 0) e.acid = 0;
      if (e.wardT > 0) e.wardT -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (Math.random() < dt * 4) G.fx.burst(e.x, e.y + e.r, e.z, 0x8fe3ff, 1, 0.6, 0.6, 1); }
      if ((e.tag === 'amb' && pd > 64) || (e.tag === 'camp' && pd > 100)) { this.kill(e, 'far', true); continue; }
      if (e.armT > 0) e.armT -= dt;
      // Стоянка спит днём. Будит ночь, удар или змейка, которая подползла слишком близко — быстрая слышна дальше.
      if (e.sleep) {
        if (G.sky.night || e.hp < e.maxHp || (live && pd < (s.v > 3 ? 5.5 : 2.4))) this.wake(e);
        else {
          const br = 1 + Math.sin(e.anim * 1.6 + e.seed) * 0.06;
          if (Math.random() < dt * 0.6) G.fx.burst(e.x, e.y + e.r * 1.8, e.z, 0xbfd8ff, 1, 0.3, 0.7, 1.4);
          e.mesh.position.set(e.x, e.y, e.z); e.mesh.rotation.y = e.face;
          e.mesh.scale.set(e.scale * (2 - br), e.scale * br * 0.78, e.scale * (2 - br));
          continue;
        }
      }

      let mx = dx, mz = dz, sp = e.spd, lift = 0, sq = 1, fx = dx, fz = dz;
      e.born += dt;
      // Отряд набега идёт своей дорогой, пока его не потревожат.
      if (e.march && (this.raidAggro || d < 12 || e.hp < e.maxHp)) { this.raidAggro = true; e.march = null; }
      if (e.march && e.freeze <= 0) {
        mx = fx = e.march.x; mz = fz = e.march.z; sp = 2.5;
        lift = Math.abs(Math.sin(e.anim * 4)) * 0.12;
      } else if (e.freeze > 0) {
        e.freeze -= dt; sp = 0;
        if (e.freeze <= 0 && e.flashT <= 0) e.mesh.material = e.base;
      } else if (e.type === 'slime') {
        const hop = Math.abs(Math.sin(e.anim * 5));
        sp *= 0.45 + hop; lift = hop * 0.35; sq = 0.85 + hop * 0.3;
      } else if (e.type === 'swarm') {
        const w = Math.sin(e.anim * 4 + e.seed) * 0.7;
        mx = dx - dz * w; mz = dz + dx * w; lift = 0.9 + Math.sin(e.anim * 9) * 0.15;
      } else if (e.type === 'spiker') {
        e.st -= dt;
        if (e.state === 'chase') { if (d < 7.5 && e.st <= 0) { e.state = 'wind'; e.st = 0.6; e.ddx = dx; e.ddz = dz; this.line(e.x, e.z, dx, dz, 6.6, 0xff4a3a, 0.6); } }
        else if (e.state === 'wind') { sp = 0; fx = e.ddx; fz = e.ddz; lift = Math.abs(Math.sin(e.anim * 40)) * 0.12; sq = 0.8; if (e.st <= 0) { e.state = 'dash'; e.st = 0.42; } }
        else if (e.state === 'dash') { mx = fx = e.ddx; mz = fz = e.ddz; sp = 15; sq = 1.15; if (e.st <= 0) { e.state = 'rest'; e.st = 0.9; } }
        else { sp *= 0.25; if (e.st <= 0) { e.state = 'chase'; e.st = 1.3; } }
      } else if (e.type === 'spitter') {
        if (d < 7) { mx = -dx; mz = -dz; } else if (d < 11) { mx = -dz * 0.6; mz = dx * 0.6; }
        e.fireCd -= dt;
        // Перед плевком замирает, раздувается и показывает линию: полсекунды, чтобы уйти.
        if (live && !e.aiming && e.fireCd <= 0.5 && d < 15) { e.aiming = true; e.ddx = dx; e.ddz = dz; this.line(e.x, e.z, dx, dz, Math.min(d + 2, 15), 0xff5aa8, 0.5); }
        if (e.aiming) {
          sp = 0; fx = e.ddx; fz = e.ddz; sq = 1.28 - Math.max(0, e.fireCd) * 0.5;
          if (e.fireCd <= 0) { e.fireCd = 2.6; e.aiming = false; this.shoot(e, e.ddx, e.ddz); }
        } else if (e.fireCd > 2.35) sq = 0.8;
      } else if (e.type === 'brute') {
        // Поворачивается неторопливо — его можно обойти.
        e.face += clamp(angDiff(e.face, Math.atan2(dx, dz)), -1.7 * dt, 1.7 * dt);
        mx = fx = Math.sin(e.face); mz = fz = Math.cos(e.face);
        lift = Math.abs(Math.sin(e.anim * 3.2)) * 0.1;
      } else if (AI[e.type]) {
        const o = AI[e.type](this, e, dt, dx, dz, d, live);
        mx = o[0]; mz = o[1]; sp = o[2]; lift = o[3]; sq = o[4]; fx = o[5]; fz = o[6];
      } else if (e.type === 'boss') {
        e.atkT -= dt; e.sumT -= dt;
        const rage = e.hp < e.maxHp * 0.5;
        if (e.state === 'wind') {
          sp = 0; e.st -= dt; sq = 1 + (1.1 - e.st) * 0.18; lift = (1.1 - e.st) * 0.8;
          if (e.st <= 0) {
            e.state = 'chase'; e.atkT = rage ? 3 : 4.8;
            this.wave(e.x, e.z, e.dmg, 17);
            if (rage) this.wave(e.x, e.z, e.dmg, 9);
            G.sound.sfx('slam'); G.shake(0.9);
            G.fx.burst(e.x, e.y + 0.5, e.z, 0xff7a5a, 24, 9, 1.6, 2);
          }
        } else {
          if (rage) sp *= 1.35;
          if (live && e.atkT <= 0 && d < 20) { e.state = 'wind'; e.st = 1.1; G.sound.sfx('warn'); G.fx.ring(e.x, e.y, e.z, 0xff5a4a, 6, 1.5, 1.0); }
          if (live && e.sumT <= 0) { e.sumT = rage ? 8 : 12; for (let k = 0; k < 3; k++) this.spawnPack(e.x, e.z, 3, 7, { tag: 'add' }); }
        }
      }
      if (e.slowT > 0) sp *= 0.65;
      const ex = e.x + (mx * sp + e.kx) * dt, ez = e.z + (mz * sp + e.kz) * dt, P0 = G.pois;
      // Стены лабиринта держат и врагов; летуны и хозяева логов их не замечают.
      if (!P0.mazeN || e.boss || e.type === 'swarm' || !P0.blockedAt(ex, ez)) { e.x = ex; e.z = ez; }
      else if (!P0.blockedAt(ex, e.z)) e.x = ex; else if (!P0.blockedAt(e.x, ez)) e.z = ez;
      const kd = Math.exp(-7 * dt); e.kx *= kd; e.kz *= kd;
      e.y = Math.max(heightAt(e.x, e.z), -0.15);

      if (live && e.freeze <= 0 && e.hitCd <= 0 && !e.hidden && !(e.type === 'queen' && e.state === 'air') && pd < e.r * 0.85 + 0.45) { e.hitCd = e.boss ? 1.5 : 1; G.damagePlayer(e.dmg, e.x, e.z, e); }

      const m = e.mesh;
      m.position.set(e.x, e.y + lift, e.z);
      m.rotation.y = Math.atan2(fx, fz);
      // Отдача от удара: враг сплющивается и дёргается.
      let rc = 0;
      if (e.hitT > 0) { e.hitT -= dt; rc = Math.sin(Math.max(0, e.hitT / 0.16) * Math.PI); }
      m.rotation.z = rc * 0.28 * e.hitS;
      // Появление: вырастает из земли с лёгким перелётом.
      const bt = e.born / 0.32, grow = bt < 1 ? bt * (2.3 - 1.3 * bt) : 1, es = e.scale * grow;
      m.scale.set(es * (2 - sq) * (1 + rc * 0.2), es * sq * (1 - rc * 0.22), es * (2 - sq) * (1 + rc * 0.2));
    }
    for (const l of this.lines) {
      if (l.t <= 0) continue;
      l.t -= dt; l.m.material.opacity = 0.18 + 0.5 * (1 - Math.max(0, l.t) / l.dur);
      if (l.t <= 0) l.m.visible = false;
    }

    // Расталкивание, чтобы враги не слипались в одну точку.
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.dead) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z, rr = (a.r + b.r) * 0.9, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = ((rr - d) / d) * 0.5, wa = a.boss ? 0 : 1, wb = b.boss ? 0 : 1;
          a.x -= dx * push * wa; a.z -= dz * push * wa; b.x += dx * push * wb; b.z += dz * push * wb;
        }
      }
    }
    let k = 0;
    for (let i = 0; i < L.length; i++) if (!L[i].dead) L[k++] = L[i];
    L.length = k;

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const q = this.shots[i];
      q.life -= dt; q.x += q.vx * dt; q.z += q.vz * dt;
      q.y = Math.max(q.y - dt * 0.4, heightAt(q.x, q.z) + 0.6);
      q.mesh.position.set(q.x, q.y, q.z);
      const hit = live && Math.hypot(q.x - px, q.z - pz) < 0.85;
      if (hit) G.damagePlayer(q.dmg, q.x, q.z);
      if (hit || q.life <= 0) { G.fx.burst(q.x, q.y, q.z, 0xff7ac8, 5, 3, 0.7); this.scene.remove(q.mesh); this.shots.splice(i, 1); }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += 9.5 * dt;
      w.mesh.position.set(w.x, w.y, w.z); w.mesh.scale.set(w.r, 1, w.r);
      w.mesh.material.opacity = 0.85 * (1 - w.r / w.max);
      if (live && !w.hit && s.dashT <= 0 && Math.abs(Math.hypot(px - w.x, pz - w.z) - w.r) < 0.8) { w.hit = true; G.damagePlayer(w.dmg, w.x, w.z); }
      if (w.r >= w.max) { this.scene.remove(w.mesh); w.mesh.material.dispose(); this.waves.splice(i, 1); }
    }
  }
}

/** Поведение боссов. Каждая функция возвращает [mx, mz, скорость, подъём, сжатие, взгляд-x, взгляд-z]. */
const AI = {
  // Каменная голова: стоит на месте и плюётся, показав полосу.
  turret(E, e, dt, dx, dz, d, live) {
    e.fireCd -= dt;
    if (live && !e.aiming && e.fireCd <= 0.55 && d < 11) { e.aiming = true; e.ddx = dx; e.ddz = dz; E.line(e.x, e.z, dx, dz, Math.min(d + 2, 12), 0xb8f27a, 0.55); }
    if (e.aiming && e.fireCd <= 0) { e.fireCd = 2.2; e.aiming = false; E.shoot(e, e.ddx, e.ddz); }
    if (!e.aiming && e.fireCd <= 0) e.fireCd = 0.3;
    return [0, 0, 0, 0, e.aiming ? 1.15 : 1, e.aiming ? e.ddx : dx, e.aiming ? e.ddz : dz];
  },

  // Змей-соперник: кружит, чтобы замкнуть кольцо вокруг змейки, и время от времени бросается.
  rival(E, e, dt, dx, dz, d, live) {
    const G = E.G, s = G.snake, rage = e.hp < e.maxHp * 0.5;
    let sp = DEF.rival.spd * (rage ? 1.18 : 1), want = e.head;
    e.st -= dt; e.bodyCd -= dt;
    if (e.state === 'circle') {
      // Держится по касательной на расстоянии около шести шагов.
      const tang = Math.atan2(dx, dz) + e.dirS * (Math.PI / 2 + clamp((6 - d) * 0.22, -0.9, 0.9));
      want = tang;
      const a = Math.atan2(e.x - s.x, e.z - s.z);
      if (e.lastA !== null && d < 9.5) e.sweep += Math.abs(angDiff(e.lastA, a)); else if (d >= 9.5) e.sweep = 0;
      e.lastA = a;
      if (e.sweep > 5.9) {   // круг замкнут: кто внутри — тому сжатие
        e.sweep = 0;
        if (live && pointInPoly(s.x, s.z, e.bx, e.bz, e.bn)) {
          G.fx.polyFlash(e.bx, e.bz, e.bn, s.y + 0.4, 0xff4a5a); G.sound.sfx('loop'); G.shake(0.6);
          G.ui.center('Кольцо соперника!', 'Вырывайся рывком');
          G.damagePlayer(e.dmg * 2.2, e.x, e.z, e);
        }
        e.dirS = -e.dirS;
      }
      if (live && e.st <= 0 && d < 11) { e.state = 'aim'; e.st = 0.55; e.ddx = dx; e.ddz = dz; E.line(e.x, e.z, dx, dz, 9, 0xff4a3a, 0.55); G.sound.sfx('warn'); }
    } else if (e.state === 'aim') { sp = 0; want = Math.atan2(e.ddx, e.ddz); if (e.st <= 0) { e.state = 'strike'; e.st = 0.55; } }
    else if (e.state === 'strike') { sp = 14; want = Math.atan2(e.ddx, e.ddz); if (e.st <= 0) { e.state = 'rest'; e.st = rage ? 1 : 1.5; } }
    else { sp *= 0.25; if (e.st <= 0) { e.state = 'circle'; e.st = rage ? 3.2 : 5; e.sweep = 0; e.lastA = null; } }   // отдыхает после броска — время кусать
    if (e.freeze > 0) { e.freeze -= dt; sp = 0; }
    e.head += clamp(angDiff(e.head, want), -(e.state === 'strike' ? 1 : 3.4) * dt, (e.state === 'strike' ? 1 : 3.4) * dt);
    const hx = Math.sin(e.head), hz = Math.cos(e.head);
    // След и звенья.
    const tr = e.trail, last = tr[tr.length - 1];
    if (!last || Math.hypot(e.x - last[0], e.z - last[1]) > 0.3) { tr.push([e.x, e.z]); if (tr.length > 80) tr.shift(); }
    for (let i = 0; i < e.bn; i++) {
      const p = tr[Math.max(0, tr.length - 1 - (i + 1) * 3)] || [e.x, e.z];
      e.bx[i] = p[0]; e.bz[i] = p[1];
      const k = 1 - (i / e.bn) * 0.45;
      _m4.makeScale(k, k, k); _m4.setPosition(p[0], Math.max(heightAt(p[0], p[1]), -0.1) + 0.42 * k, p[1]);
      e.body.setMatrixAt(i, _m4);
      if (live && e.bodyCd <= 0 && Math.hypot(p[0] - s.x, p[1] - s.z) < 0.75) { e.bodyCd = 1; G.damagePlayer(e.dmg * 0.6, p[0], p[1], e); }
    }
    e.body.instanceMatrix.needsUpdate = true;
    return [hx, hz, sp, 0, e.state === 'aim' ? 0.8 : 1, hx, hz];
  },

  // Королева улья: в воздухе рожает мошек и почти неуязвима; время от времени садится — тогда и бить.
  queen(E, e, dt, dx, dz, d, live) {
    const G = E.G, rage = e.hp < e.maxHp * 0.5;
    e.st -= dt; e.sumT -= dt;
    let mx = dx, mz = dz, sp = DEF.queen.spd, lift = 2.6 + Math.sin(e.anim * 2) * 0.3, sq = 1;
    if (e.freeze > 0) { e.freeze -= dt; sp = 0; }
    if (e.state === 'air') {
      if (d < 7) { mx = -dz; mz = dx; } else if (d < 10) { mx = -dz * 0.8 + dx * 0.2; mz = dx * 0.8 + dz * 0.2; }
      if (live && e.sumT <= 0) { e.sumT = rage ? 3.2 : 4.6; for (let i = 0; i < (rage ? 5 : 4); i++) E.spawnNear('swarm', e.x, e.z, 0.5, 2, { tag: 'add' }); G.fx.burst(e.x, e.y + 2.5, e.z, 0xffd86a, 12, 5, 1, 2); }
      if (e.st <= 0) { e.state = 'land'; e.st = rage ? 3.6 : 4.6; G.sound.sfx('warn'); G.fx.ring(e.x, e.y, e.z, 0xffd24a, 3.5, 0.5, 0.5); }
    } else {
      sp = 0; sq = 0.85 + Math.sin(e.anim * 6) * 0.05;
      lift = Math.max(0, lift * Math.min(1, (e.st - (rage ? 3.1 : 4.1)) * 2));
      if (!e.landed && lift <= 0.05) { e.landed = true; E.wave(e.x, e.z, e.dmg, 8); G.sound.sfx('slam'); G.shake(0.5); }
      if (e.st <= 0) { e.state = 'air'; e.st = rage ? 7 : 10; e.landed = false; }
    }
    return [mx, mz, sp, lift, sq, dx, dz];
  },

  // Ледяной червь: ныряет под землю и выныривает под змейкой. Под землёй его не достать.
  worm(E, e, dt, dx, dz, d, live) {
    const G = E.G, s = G.snake, rage = e.hp < e.maxHp * 0.5;
    e.st -= dt;
    let sq = 1;
    if (e.state === 'up') {
      e.fireCd -= dt;
      if (live && e.fireCd <= 0 && d < 22) { e.fireCd = rage ? 0.8 : 1.15; E.shoot(e, dx, dz); }
      sq = 1 + Math.sin(e.anim * 3) * 0.04;
      if (e.st <= 0) { e.state = 'dive'; e.st = 0.5; G.fx.burst(e.x, e.y + 0.5, e.z, 0xcfeaff, 18, 6, 1.2, 4); }
    } else if (e.state === 'dive') {
      sq = Math.max(0.05, e.st / 0.5);
      if (e.st <= 0) { e.state = 'under'; e.st = rage ? 1.1 : 1.7; e.hidden = true; e.mesh.visible = false; }
    } else if (e.state === 'under') {
      sq = 0.05;
      if (e.st <= 0) {   // выбрал место: под змейкой, чуть на опережение
        e.state = 'rise'; e.st = 1.05;
        e.x = s.x + Math.sin(s.heading) * Math.min(3, s.v * 0.4); e.z = s.z + Math.cos(s.heading) * Math.min(3, s.v * 0.4); e.y = heightAt(e.x, e.z);
        G.fx.ring(e.x, e.y, e.z, 0x8fe3ff, 3.4, 0.4, 1.05); G.sound.sfx('warn');
      }
    } else {   // rise: земля дрожит, через секунду — удар снизу
      sq = 0.05;
      if (Math.random() < dt * 30) G.fx.burst(e.x + rand(-2, 2), e.y + 0.2, e.z + rand(-2, 2), 0xcfeaff, 1, 2, 0.8, 3);
      if (e.st <= 0) {
        e.state = 'up'; e.st = rage ? 2.8 : 3.6; e.hidden = false; e.mesh.visible = true; e.fireCd = 0.8; e.born = 0;
        G.sound.sfx('slam'); G.shake(0.8); G.fx.burst(e.x, e.y + 1, e.z, 0xcfeaff, 30, 9, 1.5, 6);
        if (live && Math.hypot(s.x - e.x, s.z - e.z) < 3.1) G.damagePlayer(e.dmg * 1.5, e.x, e.z, e);
        if (rage) E.wave(e.x, e.z, e.dmg, 9);
      }
    }
    return [0, 0, 0, 0, sq, dx, dz];
  },

  // Хозяин архипелага: волны стража, броски из-под земли и свита. Три ступени.
  lord(E, e, dt, dx, dz, d, live) {
    const G = E.G, s = G.snake, f = e.hp / e.maxHp, stage = f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
    e.atkT -= dt; e.sumT -= dt; e.st -= dt;
    let sp = DEF.lord.spd * (1 + stage * 0.25), lift = 0, sq = 1;
    if (e.freeze > 0) { e.freeze -= dt; sp = 0; }
    if (e.stage !== stage) { e.stage = stage; if (stage) { G.ui.center(stage === 1 ? 'Хозяин гневается' : 'Хозяин в ярости', 'Острова дрожат'); G.sound.sfx('curse'); for (let i = 0; i < 4; i++) E.wave(e.x, e.z, e.dmg, 10 + i * 5); } }
    if (e.state === 'wind') {
      sp = 0; sq = 1 + (1.1 - e.st) * 0.16; lift = (1.1 - e.st) * 0.9;
      if (e.st <= 0) {
        e.state = 'chase'; e.atkT = 4.2 - stage * 0.8;
        E.wave(e.x, e.z, e.dmg, 19); if (stage >= 1) E.wave(e.x, e.z, e.dmg, 11); if (stage >= 2) E.wave(e.x, e.z, e.dmg, 27);
        G.sound.sfx('slam'); G.shake(1); G.fx.burst(e.x, e.y + 0.5, e.z, 0x7dff9a, 30, 10, 1.7, 2);
      }
    } else {
      if (live && e.atkT <= 0 && d < 24) { e.state = 'wind'; e.st = 1.1; G.sound.sfx('warn'); G.fx.ring(e.x, e.y, e.z, 0x7dff9a, 7, 1.5, 1.0); }
      if (live && e.sumT <= 0) {
        e.sumT = 11 - stage * 2.5;
        for (let k = 0; k < 3 + stage; k++) E.spawnPack(e.x, e.z, 4, 9, { tag: 'add', elite: stage === 2 && k === 0 });
        // Удары из-под земли: круги под змейкой, как у червя.
        for (let k = 0; k <= stage; k++) G.bomb(s.x + rand(-3, 3) * k, s.z + rand(-3, 3) * k, 1.1 + k * 0.25, 3, e.dmg, true);
      }
    }
    return [dx, dz, sp, lift, sq, dx, dz];
  },
};
