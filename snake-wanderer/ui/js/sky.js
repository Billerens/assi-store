// Небо, время суток и погода: свет, туман, звёзды, дождь.
import * as THREE from 'three';
import { sstep, lerp, damp, rand, pickW, clamp } from './util.js';

const C = (hex) => new THREE.Color(hex);
const SKY_DAY = C('#8fd0f2'), SKY_NIGHT = C('#0c1230'), SKY_WARM = C('#f59b6a'), SKY_GREY = C('#9ba9b3');
const SUN = C('#fff1d2'), SUN_WARM = C('#ffa765'), MOON = C('#8fa6ff');
const HEMI_DAY = C('#d4ecff'), HEMI_NIGHT = C('#33427c'), GND_DAY = C('#86a070'), GND_NIGHT = C('#141a2e');
const bump = (t, c, w) => Math.max(0, 1 - Math.abs(t - c) / w);

export const DAY_LEN = 420;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.t = 0.3;            // 0 — полночь, 0.5 — полдень
    this.day = 1;            // 1 — день, 0 — ночь
    this.night = false;
    this.weather = 'clear';
    this.fogAmt = 0; this.rainAmt = 0; this.weatherT = rand(90, 160);
    this.color = new THREE.Color();
    scene.background = this.color;
    scene.fog = new THREE.Fog(0xffffff, 50, 130);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    scene.add(this.hemi, this.sun, this.sun.target);
    // Тени от солнца и луны: квадрат вокруг героя.
    this.sun.castShadow = true;
    const sh = this.sun.shadow, sc = sh.camera;
    sh.mapSize.set(matchMedia('(pointer: coarse)').matches ? 1024 : 2048, matchMedia('(pointer: coarse)').matches ? 1024 : 2048);
    sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 180;
    sh.bias = -0.0006; sh.normalBias = 0.45;
    this.blood = 0; this.bloodTarget = 0;

    // Звёзды: купол точек вокруг камеры.
    const n = 420, sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92, r = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(a) * r * 400; sp[i * 3 + 1] = y * 400; sp[i * 3 + 2] = Math.sin(a) * r * 400;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    const disc = (hex, r) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: hex, fog: false, transparent: true, depthWrite: false }));
      m.frustumCulled = false; scene.add(m); return m;
    };
    this.sunDisc = disc(0xfff3c4, 16);
    this.moonDisc = disc(0xdfe6ff, 11);

    // Дождь: короткие штрихи в коробке вокруг камеры.
    this.rainN = 520;
    this.rainPos = new Float32Array(this.rainN * 6);
    this.rainSeed = new Float32Array(this.rainN * 3);
    for (let i = 0; i < this.rainN; i++) {
      this.rainSeed[i * 3] = rand(-26, 26); this.rainSeed[i * 3 + 1] = rand(0, 22); this.rainSeed[i * 3 + 2] = rand(-26, 26);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this.sunDir = new THREE.Vector3();
  }

  setWeather(w) { this.weather = w; this.weatherT = rand(90, 210); }

  /** Часы мира в виде «ЧЧ:ММ». */
  clock() {
    const m = Math.floor(this.t * 24 * 60);
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor((m % 60) / 10) * 10).padStart(2, '0');
  }

  update(dt, cam, focus) {
    this.t = (this.t + dt / DAY_LEN) % 1;
    const t = this.t;
    this.day = sstep(0.17, 0.25, t) * (1 - sstep(0.75, 0.83, t));
    this.night = this.day < 0.3;
    const warm = Math.max(bump(t, 0.21, 0.075), bump(t, 0.79, 0.075));

    this.weatherT -= dt;
    if (this.weatherT <= 0) this.setWeather(pickW([['clear', 55], ['fog', 20], ['rain', 25]]));
    this.fogAmt = lerp(this.fogAmt, this.weather === 'fog' ? 1 : 0, damp(0.25, dt));
    this.rainAmt = lerp(this.rainAmt, this.weather === 'rain' ? 1 : 0, damp(0.3, dt));
    const grey = clamp(this.fogAmt * 0.75 + this.rainAmt * 0.6, 0, 0.85);

    // Цвет неба и тумана.
    this.color.copy(SKY_NIGHT).lerp(SKY_DAY, this.day).lerp(SKY_WARM, warm * 0.7);
    const g = 0.18 + 0.82 * this.day;
    this.color.r = lerp(this.color.r, SKY_GREY.r * g, grey);
    this.color.g = lerp(this.color.g, SKY_GREY.g * g, grey);
    this.color.b = lerp(this.color.b, SKY_GREY.b * g, grey);
    // Кровавая луна красит ночь.
    this.blood = lerp(this.blood, this.bloodTarget, damp(0.6, dt || 0.016));
    const bl = this.blood * (1 - this.day);
    this.color.r = lerp(this.color.r, 0.2, bl * 0.8); this.color.g *= 1 - bl * 0.55; this.color.b *= 1 - bl * 0.5;
    const fog = this.scene.fog;
    fog.color.copy(this.color);
    fog.near = lerp(lerp(58, 34, 1 - this.day), 6, this.fogAmt) - this.rainAmt * 14;
    fog.far = lerp(lerp(138, 112, 1 - this.day), 52, this.fogAmt) - this.rainAmt * 26;

    // Светила.
    const sa = ((t - 0.2) / 0.6) * Math.PI;
    const nt = t > 0.8 ? (t - 0.8) / 0.4 : (t + 0.2) / 0.4;
    const ma = nt * Math.PI;
    const sunV = this.sunDir.set(Math.cos(sa), Math.sin(sa), 0.4).normalize();
    this.sunDisc.position.copy(cam.position).addScaledVector(sunV, 430);
    this.sunDisc.lookAt(cam.position);
    this.sunDisc.material.opacity = sstep(-0.12, 0.05, Math.sin(sa)) * (1 - grey);
    this.sunDisc.material.color.copy(SUN).lerp(SUN_WARM, warm);
    const mx = Math.cos(ma), my = Math.sin(ma), ml = Math.hypot(mx, my, 0.35);
    this.moonDisc.position.set(cam.position.x + (mx / ml) * 430, cam.position.y + (my / ml) * 430, cam.position.z - (0.35 / ml) * 430);
    this.moonDisc.lookAt(cam.position);
    this.moonDisc.material.opacity = (1 - this.day) * (1 - grey) * sstep(-0.1, 0.1, my);

    const lightDay = this.day > 0.5;
    const lx = lightDay ? sunV.x : mx / ml, ly = Math.max(0.25, lightDay ? sunV.y : my / ml), lz = lightDay ? sunV.z : -0.35 / ml;
    // Цель света ходит по сетке, чтобы края теней не дрожали при движении.
    const fx = Math.round(focus.x / 2) * 2, fz = Math.round(focus.z / 2) * 2;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lx * 80, focus.y + ly * 80, fz + lz * 80);
    this.sun.color.copy(MOON).lerp(SUN, this.day).lerp(SUN_WARM, warm * 0.8);
    this.sun.color.r = lerp(this.sun.color.r, 1, bl); this.sun.color.g *= 1 - bl * 0.6; this.sun.color.b *= 1 - bl * 0.65;
    this.moonDisc.material.color.setRGB(lerp(0.75, 2.2, this.blood), lerp(0.8, 0.35, this.blood), lerp(1, 0.3, this.blood));
    this.sunDisc.material.color.multiplyScalar(1.6);
    this.sun.intensity = lerp(0.95, 2.7, this.day) * (1 - grey * 0.45);
    this.hemi.color.copy(HEMI_NIGHT).lerp(HEMI_DAY, this.day);
    this.hemi.groundColor.copy(GND_NIGHT).lerp(GND_DAY, this.day);
    this.hemi.intensity = lerp(1.25, 1.75, this.day);

    this.stars.position.copy(cam.position);
    this.stars.material.opacity = (1 - this.day) * (1 - grey) * 0.9;
    this.stars.visible = this.stars.material.opacity > 0.02;

    // Дождь.
    this.rain.visible = this.rainAmt > 0.03;
    if (this.rain.visible) {
      this.rain.material.opacity = this.rainAmt * 0.5;
      const p = this.rainPos, s = this.rainSeed, cx = cam.position.x, cz = cam.position.z, base = focus.y - 3;
      for (let i = 0; i < this.rainN; i++) {
        s[i * 3 + 1] -= dt * 30;
        if (s[i * 3 + 1] < 0) s[i * 3 + 1] += 22;
        const x = cx + s[i * 3], y = base + s[i * 3 + 1], z = cz + s[i * 3 + 2];
        p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x + 0.12; p[i * 6 + 4] = y + 0.9; p[i * 6 + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
}
