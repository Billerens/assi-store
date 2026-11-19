// События мира: случаются сами, но идти на них или нет — решает игрок.
// Звездопад, золотая ящерка, набег, ягодная поляна — по одному за раз. Кровавая луна — на всю ночь.
import * as THREE from 'three';
import { heightAt, moistAt, biomeOf, B } from './terrain.js';
import { build, part, M, G as P } from './mesh.js';
import { rand, pickW, angDiff, clamp, pointInPoly } from './util.js';

const TAU = Math.PI * 2;
const LIZARD = build([
  part(P.box(0.34, 0.22, 1.0), '#ffd24a', M(0, 0.24, 0)),
  part(P.box(0.3, 0.2, 0.36), '#ffe27a', M(0, 0.3, 0.62)),
  part(P.cone(0.13, 0.9, 5), '#f0b82e', M(0, 0.22, -0.9, 1, [-Math.PI / 2, 0, 0])),
  ...[[-0.28, 0.3], [0.28, 0.3], [-0.28, -0.3], [0.28, -0.3]].map(([x, z]) => part(P.box(0.2, 0.08, 0.1), '#f0b82e', M(x, 0.1, z))),
  part(P.ico(0.05), '#1b1b22', M(0.11, 0.38, 0.74)), part(P.ico(0.05), '#1b1b22', M(-0.11, 0.38, 0.74)),
]);

export class Events {
  constructor(game, scene) {
    this.G = game; this.scene = scene; this.cur = null; this.cool = 45; this.nights = 0;
    this.star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb066).multiplyScalar(2.6) }));
    const bg = new THREE.CylinderGeometry(0.12, 0.36, 44, 8, 1, true); bg.translate(0, 22, 0);
    this.beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.lizard = new THREE.Mesh(LIZARD, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffb020, emissiveIntensity: 0.9 }));
    this.lizard.castShadow = true;
    for (const m of [this.star, this.beam, this.lizard]) { m.visible = false; scene.add(m); }
  }

  resetRun() {
    this.hide(); this.cur = null; this.cool = rand(32, 46); this.nights = 0;
    this.G.bloodMoon = false; this.G.sky.bloodTarget = 0; this.G.ui.setEvent(null);
  }
  hide() { this.star.visible = false; this.beam.visible = false; this.lizard.visible = false; }

  /** Сухая точка на расстоянии rmin..rmax от героя, чаще по ходу движения. */
  place(rmin, rmax, minH = 1.2, green = false) {
    const s = this.G.snake;
    for (let i = 0; i < 16; i++) {
      const a = i < 10 ? s.heading + rand(-1.4, 1.4) : rand(0, TAU), r = rand(rmin, rmax), x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r, h = heightAt(x, z);
      if (h < minH || h > 10.5) continue;
      if (green) { const b = biomeOf(h, moistAt(x, z)); if (b !== B.MEADOW && b !== B.FOREST) continue; }
      return { x, z, y: h };
    }
    return null;
  }

  start(type) {
    const G = this.G, s = G.snake, E = G.enemies;
    if (type === 'meteor') {
      const p = this.place(48, 78);
      if (!p) return false;
      this.cur = { type, ...p, t: 62, fall: 2.8, guards: false };
      this.star.visible = true; this.star.scale.setScalar(1);
      G.ui.toast('Звездопад! Упавшая звезда скоро остынет', 'gold'); G.sound.sfx('relic');
    } else if (type === 'lizard') {
      const p = this.place(13, 19, 0.8);
      if (!p) return false;
      this.cur = { type, ...p, t: 30, dir: s.heading, hits: 0, inv: 0.8, boost: 0, stun: 0, ph: rand(0, 6) };
      this.lizard.visible = true;
      G.fx.burst(p.x, p.y + 0.5, p.z, 0xffd24a, 14, 4, 1, 4);
      G.ui.toast('Золотая ящерка! Догони, пока не скрылась', 'gold'); G.sound.sfx('shard');
    } else if (type === 'raid') {
      const a = rand(0, TAU);
      let o = null;
      for (let i = 0; i < 8 && !o; i++) { const x = s.x + Math.sin(a + i * 0.8) * 46, z = s.z + Math.cos(a + i * 0.8) * 46; if (heightAt(x, z) > 1) o = { x, z }; }
      if (!o) return false;
      const side = Math.random() < 0.5 ? 1 : -1, ox = s.x - o.x, oz = s.z - o.z, od = Math.hypot(ox, oz);
      let mx = ox / od + (-oz / od) * 0.24 * side, mz = oz / od + (ox / od) * 0.24 * side;
      const ml = Math.hypot(mx, mz); mx /= ml; mz /= ml;
      const march = () => ({ x: mx, z: mz });
      const lead = G.diff > 2.6 ? 'brute' : G.diff > 1.6 ? 'spiker' : 'slime';
      E.raidAggro = false;
      const leader = E.spawn(lead, o.x, o.z, { elite: true, tag: 'raid', hpMul: 1.5, march: march(), quiet: true });
      if (!leader) return false;
      const n = clamp(Math.round((4 + G.diff * 2) / (G.run.arts.elites ? 2.5 : 1)), 3, 12);
      for (let i = 0; i < n; i++) {
        let t = E.pickType(G.diff); if (t === 'swarm' || t === 'spitter') t = 'slime';
        const back = 2.2 + Math.floor(i / 2) * 1.7, lat = (i % 2 ? 1 : -1) * 1.3;
        E.spawn(t, o.x - mx * back - mz * lat, o.z - mz * back + mx * lat, { tag: 'raid', march: march(), quiet: true });
      }
      this.cur = { type, x: o.x, z: o.z, t: 85, leader };
      G.ui.toast('Набег! Отряд с вожаком идёт мимо — перехвати, если хочешь добычу', 'bad'); G.sound.sfx('warn');
    } else if (type === 'bloom') {
      const p = this.place(40, 62, 1.5, true);
      if (!p) return false;
      for (let i = 0; i < 28; i++) {
        const a = rand(0, TAU), r = i < 8 ? rand(0, 1.6) : rand(2.5, 5.5), x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
        if (heightAt(x, z) > 0.6) G.pickups.add(i % 9 === 8 ? 'gold' : 'berry', x, z, { keep: true, life: 80 });
      }
      this.cur = { type, ...p, t: 75 };
      G.ui.toast('Где-то рядом созрела ягодная поляна', 'good'); G.sound.sfx('berry');
    }
    const c = this.cur;
    if (type === 'meteor' || type === 'bloom') {
      this.beam.visible = type === 'bloom'; this.beam.position.set(c.x, c.y, c.z);
      this.beam.material.color.set(type === 'bloom' ? 0xff7a8a : 0xffb066);
    }
    return true;
  }

  finish(msg, kind = '') {
    if (!this.cur) return;
    this.hide(); this.cur = null; this.cool = rand(48, 82);
    this.G.ui.setEvent(null);
    if (msg) this.G.ui.toast(msg, kind);
  }

  count() { const st = this.G.save.stats; st.events = (st.events || 0) + 1; }

  catchLizard() {
    const G = this.G, c = this.cur;
    for (let i = 0; i < 12; i++) G.pickups.add(i % 4 === 3 ? 'gold' : 'shard', c.x, c.z, { pop: true, life: 50 });
    G.addXp(25); G.sound.sfx('chest'); G.hitStop(0.09); G.shake(0.3);
    G.fx.burst(c.x, c.y + 0.5, c.z, 0xffd24a, 26, 6, 1.2, 6); G.fx.ring(c.x, c.y, c.z, 0xffd24a, 0.4, 5, 0.5);
    this.count(); this.finish('Золотая ящерка поймана!', 'gold');
  }

  /** Кольцо поймало ящерку? */
  inLoop(px, pz, n) { const c = this.cur; if (c && c.type === 'lizard' && pointInPoly(c.x, c.z, px, pz, n)) this.catchLizard(); }
  /** Хлыст оглушает ящерку. */
  onWhip() { const c = this.cur, s = this.G.snake; if (c && c.type === 'lizard' && Math.hypot(c.x - s.x, c.z - s.z) < 5) c.stun = 1.5; }

  onKill(e) {
    const c = this.cur, G = this.G;
    if (!c || c.type !== 'raid' || e !== c.leader) return;
    G.pickups.add('relic', e.x, e.z, { rar: pickW([[0, 40], [1, 50], [2, 10]]), keep: true });
    for (let i = 0; i < 9; i++) G.pickups.add(i % 3 === 2 ? 'gold' : 'shard', e.x, e.z, { pop: true, life: 50 });
    G.addXp(40); G.unlock('raid1'); G.sound.sfx('win'); G.hitStop(0.12);
    for (const q of G.enemies.list) if (q.tag === 'raid') q.tag = 'amb';   // остатки отряда разбегутся сами
    this.count(); this.finish('Набег разбит! Вожак обронил реликвию', 'gold');
  }

  /** Наступила ночь: иногда она кровавая. */
  dusk() {
    const G = this.G;
    this.nights++;
    if (this.nights < 2 || Math.random() > 0.3) return;
    G.bloodMoon = true; G.sky.bloodTarget = 1;
    G.ui.center('Кровавая луна', 'Врагов больше, осколков с них вдвое'); G.sound.sfx('curse');
  }
  dawn() { this.G.bloodMoon = false; this.G.sky.bloodTarget = 0; }

  update(dt) {
    const G = this.G, s = G.snake, c = this.cur;
    if (!c) {
      if (G.pois.active) return;
      this.cool -= dt;
      if (this.cool > 0) return;
      const opts = [['meteor', 3], ['lizard', 3]];
      if (G.run.t > 80) opts.push(['raid', 3.5]);
      if (!G.sky.night) opts.push(['bloom', 2.5]);
      if (!this.start(pickW(opts))) this.cool = 6;
      return;
    }
    c.t -= dt;
    const d = Math.hypot(c.x - s.x, c.z - s.z), note = Math.max(0, Math.ceil(c.t)) + ' с';
    if (c.type === 'meteor') {
      if (c.fall > 0) {
        c.fall -= dt;
        const k = Math.max(0, c.fall) / 2.8;
        this.star.position.set(c.x + k * 46, c.y + 0.6 + k * 90, c.z + k * 28);
        G.fx.burst(this.star.position.x, this.star.position.y, this.star.position.z, 0xffb066, 2, 1.5, 1.3, 0);
        if (c.fall <= 0) {
          this.beam.visible = true;
          G.fx.ring(c.x, c.y, c.z, 0xffb066, 1, 12, 0.8); G.fx.burst(c.x, c.y + 0.5, c.z, 0xffb066, 30, 9, 1.5, 7);
          if (d < 60) { G.shake(0.7 * (1 - d / 60)); G.sound.sfx('slam'); }
        }
      } else {
        this.star.position.set(c.x, c.y + 0.7 + Math.sin(G.time * 3) * 0.15, c.z);
        this.star.rotation.y += dt * 1.5; this.star.scale.setScalar(0.8 + Math.sin(G.time * 5) * 0.08);
        this.beam.material.opacity = 0.22 + Math.sin(G.time * 4) * 0.08;
        if (!c.guards && G.diff > 1.7 && d < 17) { c.guards = true; for (let i = 0; i < 2 + Math.floor(G.diff); i++) G.enemies.spawnPack(c.x, c.z, 3, 7, { tag: 'amb' }); }
        if (d < 2.5) {
          if (Math.random() < 0.6) G.grantRelic(G.rollRelic(pickW([[0, 45], [1, 45], [2, 10]])), true);
          else G.ui.toast(`Осколок звезды: +${G.addShards(25 + G.run.level * 3)} осколков`, 'gold');
          G.addXp(30); G.sound.sfx('chest'); G.hitStop(0.08);
          G.fx.burst(c.x, c.y + 1, c.z, 0xffd24a, 28, 7, 1.3, 7);
          this.count(); return this.finish(null);
        }
      }
      if (c.t <= 0) return this.finish('Звезда остыла');
    } else if (c.type === 'lizard') {
      c.ph += dt; c.inv -= dt; c.boost -= dt;
      let sp = 0;
      if (c.stun > 0) c.stun -= dt;
      else {
        const far = d > 24, want = far ? c.dir + Math.sin(c.ph) * 0.5 : Math.atan2(c.x - s.x, c.z - s.z) + Math.sin(c.ph * 2.6) * 0.85;
        sp = far ? 1.6 : c.boost > 0 ? 10.5 : 6.7;   // чуть быстрее змейки: догоняется рывком, хлыстом или кольцом
        c.dir += clamp(angDiff(c.dir, want), -7 * dt, 7 * dt);
        const nx = c.x + Math.sin(c.dir) * sp * dt, nz = c.z + Math.cos(c.dir) * sp * dt;
        if (heightAt(nx, nz) > 0.5) { c.x = nx; c.z = nz; } else c.dir += 2.6;
      }
      c.y = heightAt(c.x, c.z);
      this.lizard.position.set(c.x, c.y + (c.stun > 0 ? 0 : Math.abs(Math.sin(c.ph * 14)) * 0.08), c.z);
      this.lizard.rotation.y = c.dir + Math.sin(c.ph * 14) * 0.25 * (sp > 0 ? 1 : 0);
      this.lizard.rotation.z = c.stun > 0 ? Math.PI : 0;
      if (Math.random() < dt * 10) G.fx.burst(c.x, c.y + 0.3, c.z, 0xffe27a, 1, 0.8, 0.7, 2);
      if (d < 1.6 && c.inv <= 0) {
        c.hits++; c.inv = 0.7; c.boost = 0.8; c.stun = 0;
        for (let i = 0; i < 3; i++) G.pickups.add('shard', c.x, c.z, { pop: true, life: 40 });
        G.sound.sfx('bite'); G.sound.sfx('shard'); G.hitStop(0.05); G.snake.biteAnim = 0.14;
        G.fx.burst(c.x, c.y + 0.4, c.z, 0xffd24a, 8, 4, 0.9, 4);
        if (c.hits >= 3) return this.catchLizard();
      }
      if (c.t <= 0) return this.finish('Ящерка скрылась');
    } else if (c.type === 'raid') {
      const l = c.leader;
      c.x = l.x; c.z = l.z;
      const ld = Math.hypot(l.x - s.x, l.z - s.z);
      if ((!G.enemies.raidAggro && c.t <= 0) || ld > 96) { G.enemies.clear('raid'); return this.finish('Набег прошёл мимо'); }
    } else if (c.type === 'bloom') {
      this.beam.material.opacity = 0.2 + Math.sin(G.time * 3) * 0.06;
      if (d < 7) { this.count(); return this.finish(null); }
      if (c.t <= 0) return this.finish(null);
    }
    G.ui.setEvent({ x: c.x, z: c.z, icon: { meteor: 'meteor', lizard: 'lizard', raid: 'raid', bloom: 'berry' }[c.type], hex: { meteor: 0xffb066, lizard: 0xffd24a, raid: 0xff6a5a, bloom: 0xff8b95 }[c.type], note: c.type === 'raid' && G.enemies.raidAggro ? '' : note, hot: c.type === 'lizard' });
  }
}
