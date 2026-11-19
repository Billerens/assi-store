// Игра целиком: состояние забега, правила, главный цикл. Графика и звук — в соседних файлах.
import * as THREE from 'three';
import { World, Grass } from './world.js';
import { Events } from './events.js';
import { Shots } from './shots.js';
import { MiniMap } from './map.js';
import { makePost } from './post.js';
import { Sky, DAY_LEN } from './sky.js';
import { Snake, MAXSEG } from './snake.js';
import { Enemies } from './enemies.js';
import { Pickups } from './pickups.js';
import { Pois } from './poi.js';
import { Life } from './life.js';
import { Fx } from './fx.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { findLand, heightAt, moistAt, biomeAt, B } from './terrain.js';

/** Что сказать игроку, когда он впервые за забег вползает в особый край. */
const BIOME_NOTE = {
  [B.SWAMP]: ['Болото', 'Топь замедляет'],
  [B.VOLCANO]: ['Вулканическое плато', 'Красные круги — гейзеры. Осколков здесь больше'],
  [B.CRYSTAL]: ['Кристальные пустоши', 'Осколков втрое больше, ягод почти нет'],
  [B.MUSHROOM]: ['Грибной лес', 'Ягод много, но попадаются поганки'],
  [B.DUNES]: ['Дюны', 'Днём жара отнимает здоровье, ночью спокойнее'],
};
import { RELICS, RELIC, LEVELUPS, PERMS, permCost, SKINS, ACHS, DIFFS, ARTIFACTS, activeArts, computeStats, normSave, threatOf, ACTIVE, PETS, PET, lookOf, EVOS, MODULES, MODULE, modSlots, SPECIES, MAX_CIRCLE } from './data.js';
import { loadSave, storeSave, stage, back, vibrate, achieve, hubMenu, watchHub } from './host.js';
import { clamp, lerp, damp, rand, shuffle, pickW, pointInPoly } from './util.js';

const _v = new THREE.Vector3();

class Game {
  constructor() {
    const canvas = document.getElementById('c');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
    this.pr = Math.min(devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(this.pr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.post = null; this.stopT = 0; this.bloodMoon = false; this.skinHex = 0x8edb5c;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 700);
    this.camYaw = 0.6; this.camFwd = new THREE.Vector3(0, 0, -1); this.look = new THREE.Vector3(); this.shakeAmt = 0;
    this.state = 'boot'; this.time = 0; this.diff = 1; this.threat = threatOf(1); this.run = null; this.stats = null;
    this.offers = []; this.choice = null; this.screenName = ''; this.startIdx = 0; this.frameMs = 16; this.slowT = 0;

    this.sound = new Sound();
    this.world = new World(this.scene);
    this.sky = new Sky(this.scene);
    this.snake = new Snake(this.scene);
    this.fx = new Fx(this.scene);
    this.enemies = new Enemies(this, this.scene);
    this.pickups = new Pickups(this, this.scene);
    this.pois = new Pois(this, this.scene);
    this.life = new Life(this, this.scene);
    this.grass = new Grass(this.scene);
    this.shots = new Shots(this, this.scene);
    this.style = {}; this.pets = []; this.petPull = 0; this.lure = null;
    this.lureMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7ab8).multiplyScalar(2.2) }));
    this.lureMesh.visible = false; this.scene.add(this.lureMesh);
    this.ui = new UI(this);
    this.map = new MiniMap(this, document.getElementById('mini'));
    this.snake.blocked = (x, z) => this.pois.blockedAt(x, z);
    this.events = new Events(this, this.scene);
    this.input = new Input(this);
    this.wispMeshes = []; this.orbMeshes = []; this.petXp = 0; this.modMeshes = []; this.modN = 0;

    // Устройство может на время отобрать графику (нехватка памяти, сон). Ставим паузу и ждём возврата.
    canvas.addEventListener('webglcontextlost', () => {
      this.gfxLost = true;
      if (this.state === 'play') this.act('pause');
      document.getElementById('gfx').hidden = false;
    });
    canvas.addEventListener('webglcontextrestored', () => { this.gfxLost = false; document.getElementById('gfx').hidden = true; this.resize(); });
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.act('pause'); });
    this.resize();
  }

  async init() {
    this.save = normSave(await loadSave());
    // Игротека может сама менять осколки: ставка на день сыграла, пришёл сундук за поездку.
    watchHub((m) => { this.save.shards = m.shards; this.save.moons = m.moons; if (this.state === 'menu' && this.screenName === 'menu') this.ui.showMenu(); });
    this.sound.on = this.save.sound;
    this.home = findLand(0, 0, 80, 3, 7);
    this.world.prime(this.home.x, this.home.z);
    this.snake.setSkin(this.skin());
    this.snake.reset(this.home.x, this.home.z, 0.8, 10 + (this.save.perms.p_len || 0) * 2);
    this.look.set(this.home.x, heightAt(this.home.x, this.home.z), this.home.z);
    this.camera.position.set(this.home.x + 10, this.look.y + 12, this.home.z + 10);
    this.toMenu();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    // Свечение подгружается отдельно: игра не ждёт его и работает без него.
    makePost(this.renderer, this.scene, this.camera).then((p) => { this.post = p; this.resize(); });
  }

  skin() { return SKINS.find((s) => s.id === this.save.skin) || SKINS[0]; }
  persist(now = false) { storeSave(this.save, now); }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  /** Микропауза на удар: мир на мгновение замирает, удар ощущается весомее. */
  hitStop(sec) { this.stopT = Math.max(this.stopT, sec); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.post) this.post.resize(w, h, this.pr);
  }

  /** Слабому устройству — по шагу: чёткость, свечение, тени, дальность. */
  lowerQuality() {
    if (this.pr > 1.25) this.pr = 1.25;
    else if (this.post && this.post.on) this.post.on = false;
    else if (this.sky.sun.castShadow) { this.sky.sun.castShadow = false; this.snake.setBlob(true); }
    else if (this.pr > 1) this.pr = 1;
    else if (this.world.radius > 2) this.world.radius = 2;
    else return;
    this.renderer.setPixelRatio(this.pr); this.resize();
  }

  /** Какой артефакт лежит в этих руинах: первый из ещё не найденных, свой для каждого места. */
  nextArtifact(site) {
    const left = ARTIFACTS.filter((a) => !this.save.arts[a.id]);
    if (!left.length) return null;
    let h = 0;
    for (const ch of site.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return left[h % left.length];
  }

  project(x, y, z) {
    _v.set(x, y, z).project(this.camera);
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, vis: _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 };
  }

  /** Откуда можно начать: начало мира и пройденные аванпосты (самые дальние). */
  startPoints() {
    const pts = this.save.waypoints.map((w) => ({ ...w, dist: Math.round(Math.hypot(w.x, w.z)) })).sort((a, b) => b.dist - a.dist).slice(0, 6).reverse();
    return [{ name: 'Начало мира', x: this.home.x, z: this.home.z, dist: 0 }, ...pts];
  }

  // ---- Кнопки интерфейса
  act(name, arg) {
    const sv = this.save;
    switch (name) {
      case 'play': this.newRun(); break;
      case 'menu': this.toMenu(); break;
      case 'shop': this.screenName = 'shop'; this.ui.showShop(); break;
      case 'journal': this.screenName = 'journal'; this.ui.showJournal(arg); break;
      case 'item': this.ui.showItem(arg); break;
      case 'itemnav': this.ui.navItem(Number(arg)); break;
      case 'itemclose': this.ui.closeItem(); break;
      case 'arts': this.screenName = 'arts'; this.ui.showArts(); break;
      case 'art': if (sv.arts[arg]) { sv.artsOn[arg] = !sv.artsOn[arg]; this.sound.sfx('ui'); this.persist(); this.ui.showArts(); } break;
      case 'diff': sv.diff = (sv.diff + 1) % DIFFS.length; this.persist(); this.ui.showMenu(); break;
      case 'species': {   // по кругу — только открытые виды
        const open = SPECIES.filter((q) => !q.unlock || sv.ach[q.unlock]);
        sv.species = open[(open.findIndex((q) => q.id === sv.species) + 1) % open.length].id;
        this.sound.sfx('ui'); this.persist(); this.ui.showMenu();
        break;
      }
      case 'circle': sv.circleOn = (sv.circleOn + 1) % (sv.circle + 1); this.sound.sfx('ui'); this.persist(); this.ui.showMenu(); break;
      case 'startpt': this.startIdx = (this.startIdx + 1) % this.startPoints().length; this.ui.showMenu(); break;
      case 'sound':
        sv.sound = !sv.sound; this.sound.setOn(sv.sound); this.persist();
        if (this.screenName === 'pause') this.ui.showPause(); else this.ui.showMenu();
        break;
      case 'exit': this.persist(true); stage(false); back(); break;
      case 'hubmenu': hubMenu(); break;
      case 'buy': {
        const p = PERMS.find((q) => q.id === arg), lvl = sv.perms[arg] || 0;
        if (!p || lvl >= p.max) break;
        const cost = permCost(p, lvl);
        if (sv.shards < cost) break;
        sv.shards -= cost; sv.perms[arg] = lvl + 1; this.sound.sfx('buy'); this.persist(); this.ui.showShop();
        break;
      }
      case 'skin': {
        const s = SKINS.find((q) => q.id === arg);
        if (!s || (s.unlock && !sv.ach[s.unlock])) break;
        if (!sv.skins.includes(arg)) { if (sv.shards < s.cost) break; sv.shards -= s.cost; sv.skins.push(arg); this.sound.sfx('buy'); }
        sv.skin = arg; this.snake.setSkin(s); this.persist(); this.ui.showShop();
        break;
      }
      case 'pause':
        if (this.state === 'play') { this.state = 'pause'; this.screenName = 'pause'; this.ui.showPause(); }
        else if (this.state === 'pause') this.act('resume');
        break;
      case 'hub':   // экран забега: с клавиши Tab — сразу на карту; повторное нажатие закрывает
        if (this.state === 'play') { this.state = 'pause'; this.screenName = 'pause'; this.ui.showPause(arg); }
        else if (this.state === 'pause') { if (arg && arg !== this.ui.pauseTab) this.ui.showPause(arg); else this.act('resume'); }
        break;
      case 'mapzoom': if (this.state === 'pause') { this.ui.mapR = clamp((this.ui.mapR || 420) * (Number(arg) > 0 ? 1.6 : 0.625), 160, 1100); this.ui.showPause('map'); } break;
      case 'unpin': if (this.run) { this.run.pin = null; if (this.state === 'pause') this.ui.showPause('map'); } break;
      case 'resume': if (this.state === 'pause') { this.state = 'play'; this.ui.close(); this.input.reset(); } break;
      case 'quit': if (this.state === 'pause') this.die(true); break;
      case 'accept': this.acceptNear(); break;
      case 'pick': this.pick(Number(arg)); break;
      case 'reroll': this.reroll(); break;
    }
  }

  toMenu() {
    this.state = 'menu'; this.screenName = 'menu';
    this.enemies.clear(); this.pickups.clear(); this.pois.resetRun(); this.events.resetRun();
    this.shots.clear(); this.clearPets(); this.lure = null; this.lureMesh.visible = false;
    this.ui.setMarks([]); this.ui.setWisp(null);
    this.ui.hud(false); stage(false);
    for (const m of this.wispMeshes) m.visible = false;
    for (const m of this.orbMeshes) m.visible = false;
    for (const m of this.modMeshes) m.visible = false;
    this.ui.showMenu();
  }

  // ---- Забег
  newRun() {
    const sv = this.save, arts = activeArts(sv), P = (id) => (arts.bare ? 0 : sv.perms[id] || 0);
    const pts = this.startPoints(), sp = pts[this.startIdx] || pts[0];
    const land = sp.dist ? findLand(sp.x + 14, sp.z + 6, 60) : this.home;
    this.run = {
      t: 0, level: 1, xp: 0, xpNext: 20, hp: 1, berries: 0, kills: 0, shards: 0, relics: {}, ups: {}, curses: 0, loop: 0, challenges: 0,
      arts, combo: 0, comboT: 0, bestCombo: 0,
      active: null, activeCd: 0, caches: 0, hatched: 0, spitT: 1, atkN: 0, shieldT: 0, shellT: 0, shedT: 0, rageT: 0, eatN: 0, eaten: 0, snail: false, snailT: 0, echo: null,
      species: sv.species, circle: sv.circleOn, lordT: 0, lord: null, lordDone: false,
      len: Math.min(arts.short ? 10 : MAXSEG, 8 + P('p_len') * 2 + (arts.giant ? 18 : 0) + (sv.species === 'boa' ? 6 : 0)), bonusHp: 0, bonusBite: 0, dashCd: 0, whipCd: 0, biteT: 0, loopCd: 0, inv: 1, hurtFlash: 0, lives: P('p_life'),
      dashN: 0, barrier: 0, hitN: 0, volN: 0, killN: 0, sproutT: 0, staticT: 0, skyT: 1, slimeT: 0, slimeTick: 0, slime: [], auraT: 0, gaspT: 0, bombs: [], hasteT: 0, slowT: 0, mutT: 90, rerolls: P('p_reroll'), shadow: null,
      nextCamp: 110, campId: 0, flareT: 0, pin: null, mods: [], modT: [], biome: B.MEADOW, bioT: 0, bioSeen: {}, geyT: 3, graveUp: false, toadT: 0,
      far: 0, biteN: 0, wispT: 0, thornT: 0, fireT: 0, fire: [], spawnT: 4, pending: 0, unlocks: [], dashId: 0, saveT: 15, hint: 0, lenHint: false, maxLen: 0,
    };
    for (let i = 0; i < P('p_relic'); i++) { const id = this.rollRelic(0); this.run.relics[id] = (this.run.relics[id] || 0) + 1; }
    this.stats = computeStats(sv, this.run);
    this.run.hp = this.stats.maxHp; this.run.dashN = this.stats.dashMax;
    this.offers.length = 0; this.choice = null;
    this.enemies.clear(); this.pickups.clear(); this.pois.resetRun(); this.events.resetRun();
    this.shots.clear(); this.clearPets(); this.lure = null; this.lureMesh.visible = false;
    this.applyLook();
    this.world.prime(land.x, land.z);
    this.snake.setSkin(this.skin());
    this.skinHex = new THREE.Color(this.skin().a).getHex();
    this.snake.reset(land.x, land.z, rand(0, 6.28), this.run.len);
    this.pickups.seed(land.x, land.z);
    this.sky.t = arts.night ? 0.88 : 0.27; this.sky.setWeather('clear'); this.wasNight = false;
    this.look.set(land.x, heightAt(land.x, land.z), land.z);
    this.diff = DIFFS[sv.diff].enemy; this.threat = threatOf(this.diff);
    this.state = 'play'; this.screenName = '';
    this.ui.close(); this.ui.hud(true); this.ui.relicRow(); this.ui.itemButton(); this.input.reset(); stage(true);
    this.sound.init();
  }

  /** Предел длины тела: артефакт «Коротышка» его урезает. */
  maxLen() { return this.run.arts.short ? 10 : MAXSEG; }

  refreshStats() {
    const old = this.stats ? this.stats.maxHp : 0;
    this.run.len = clamp(this.run.len, 3, this.maxLen());
    this.stats = computeStats(this.save, this.run);
    if (old && this.stats.maxHp > old) this.run.hp += this.stats.maxHp - old;
    this.run.hp = Math.min(this.run.hp, this.stats.maxHp);
    this.applyLook();
  }

  unlock(id) {
    if (this.save.ach[id]) return;
    this.save.ach[id] = 1;
    achieve(id);
    const a = ACHS.find((q) => q.id === id);
    if (id === 'boss1' && !this.save.skins.includes('ember')) this.save.skins.push('ember');
    if (this.run) this.run.unlocks.push(a);
    this.ui.toast('Достижение: ' + a.name, 'gold');
    this.sound.sfx('relic');
    this.persist();
  }

  addShards(n) {
    const got = Math.max(1, Math.round(n * this.stats.shardMul)), sv = this.save;
    this.run.shards += got; sv.shards += got; sv.stats.shardsTotal += got;
    if (sv.stats.shardsTotal >= 500) this.unlock('shards500');
    return got;
  }

  addXp(n) {
    const run = this.run, was = run.level;
    run.xp += n * this.stats.xpMul * (1 + this.petXp);
    while (run.xp >= run.xpNext) { run.xp -= run.xpNext; run.level++; run.xpNext = Math.round(run.xpNext * 1.28); run.pending++; }
    if (run.level !== was && run.relics.growth) this.refreshStats();   // «Вечный рост»
    if (run.level >= 5) this.unlock('lvl5');
    if (run.level >= 10) this.unlock('lvl10');
  }

  heal(n) { this.run.hp = Math.min(this.stats.maxHp, this.run.hp + n); }

  rollRelic(rar, exclude = []) {
    for (let r = rar; r >= 0; r--) {
      const pool = RELICS.filter((q) => q.rar === r && !q.trophy && (!q.unlock || this.save.ach[q.unlock]) && !exclude.includes(q.id));
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)].id;
    }
    return 'fang';
  }

  /** Отметить предмет в альманахе: сколько раз он попадался. */
  see(key) {
    const s = this.save.seen; s[key] = (s[key] || 0) + 1;
    if (Object.keys(s).length + Object.keys(this.save.arts).length >= 40) this.unlock('almanac40');
  }

  grantRelic(id, announce) {
    const run = this.run, r = RELIC[id];
    // «Стеклянное сердце»: всё, кроме лунного, приходит в двух экземплярах.
    run.relics[id] = (run.relics[id] || 0) + (this.stats.double && r.rar < 3 ? 2 : 1);
    this.see(id);
    this.refreshStats(); this.ui.relicRow();
    if (id === 'chick') this.addPet('chick', this.snake.x, this.snake.z, true);
    if (id === 'mimic') {   // «Пересмешник»: по копии трёх случайных обычных или редких
      const got = [];
      for (let i = 0; i < 3; i++) {
        const ids = Object.keys(run.relics).filter((q) => RELIC[q].rar <= 1);
        if (!ids.length) break;
        const q = ids[Math.floor(Math.random() * ids.length)];
        run.relics[q]++; got.push(RELIC[q].name);
      }
      if (got.length) { this.refreshStats(); this.ui.relicRow(); this.ui.toast('Пересмешник повторил: ' + got.map((n) => (window.ui ? window.ui.t(n) : n)).join(', '), 'rar2'); }
    }
    if (r.rar === 3) this.unlock('lunar1');
    this.checkEvos();
    let total = 0;
    for (const k in run.relics) total += run.relics[k];
    if (total >= 20) this.unlock('relics20');
    if (announce) { this.ui.toast('Реликвия: ' + r.name, 'rar' + r.rar); this.sound.sfx('relic'); }
    const s = this.snake;
    this.fx.burst(s.x, s.y + 1, s.z, [0xdfe8ee, 0x6fd6ff, 0xffc94a, 0x9d8cff, 0xff9ad5][r.rar], 16, 5, 1.1, 5);
  }

  /** Эволюция: собраны обе реликвии пары — сама собой складывается особая третья. */
  checkEvos() {
    const R = this.run.relics, s = this.snake;
    for (const ev of EVOS) {
      if (R[ev.id] || !R[ev.evo[0]] || !R[ev.evo[1]]) continue;
      R[ev.id] = 1; this.see(ev.id);
      this.refreshStats(); this.ui.relicRow();
      this.fx.ring(s.x, s.y, s.z, 0xff9ad5, 0.5, 8, 0.6); this.fx.burst(s.x, s.y + 1, s.z, 0xff9ad5, 36, 7, 1.3, 7);
      this.sound.sfx('win'); this.shake(0.4);
      this.ui.center('Эволюция: ' + ev.name, `«${RELIC[ev.evo[0]].name}» и «${RELIC[ev.evo[1]].name}» срослись`);
    }
  }

  offerRelics(weights, title) {
    if (this.run.arts.chaos) {   // артефакт «Хаос»: выбора нет, зато реликвий две
      for (let i = 0; i < 2; i++) this.grantRelic(this.rollRelic(pickW([[0, weights[0]], [1, weights[1]], [2, weights[2]]])), true);
      return;
    }
    this.offers.push({ weights, title });
  }

  openChoice() {
    const run = this.run;
    if (run.pending > 0) this.choice = { kind: 'level', title: 'Уровень ' + (run.level - run.pending + 1), free: this.stats.dice };
    else { const o = this.offers.shift(); this.choice = { kind: o.kind || 'relic', title: o.title, weights: o.weights, ids: o.ids, free: this.stats.dice }; }
    this.sound.sfx(this.choice.kind === 'level' ? 'level' : 'relic');
    this.state = 'choice'; this.screenName = 'choice';
    this.rollChoice();
  }

  /** Разложить три варианта текущего выбора. Вызывается и при перебросе. */
  rollChoice() {
    const run = this.run, c = this.choice, left = c.free + run.rerolls;
    if (c.kind === 'level') {
      const pool = LEVELUPS.filter((u) => !(u.id === 'lu_len' && run.len > this.maxLen() - 3));
      c.opts = shuffle(pool.slice()).slice(0, 3);
      this.ui.showChoice(c.title, 'Выбери улучшение — оно действует до конца забега', c.opts.map((u) => ({ icon: u.icon, pic: u.id, name: u.name, desc: u.desc, have: run.ups[u.id] })), left);
    } else if (c.kind === 'fixed') {
      c.opts = c.ids;
      this.ui.showChoice(c.title, 'Выбери стихию — реликвия останется с тобой до конца забега', c.ids.map((id) => { const r = RELIC[id]; return { icon: r.icon || r.id, pic: id, name: r.name, desc: r.desc, rar: r.rar, have: run.relics[id], id }; }), 0);
    } else if (c.kind === 'module') {
      c.opts = shuffle(MODULES.slice()).slice(0, 3);
      const free = modSlots(this.snake.n) - run.mods.length;
      this.ui.showChoice(c.title, free > 0 ? 'Выбери модуль — он сядет на свободное звено' : 'Свободных звеньев нет: модуль подождёт, пока тело подрастёт', c.opts.map((m) => ({ icon: 'star', pic: 'mod_' + m.id, name: m.name, desc: m.desc, have: run.mods.filter((q) => q === m.id).length })), left);
    } else {
      const ids = [], w = c.weights;
      for (let i = 0; i < 3; i++) ids.push(this.rollRelic(pickW([[0, w[0]], [1, w[1]], [2, w[2]]]), ids));
      c.opts = ids;
      this.ui.showChoice(c.title, 'Выбери реликвию — она с тобой до конца забега', ids.map((id) => { const r = RELIC[id]; return { icon: r.icon || r.id, pic: id, name: r.name, desc: r.desc, rar: r.rar, have: run.relics[id], id }; }), left);
    }
  }

  reroll() {
    const c = this.choice, run = this.run;
    if (this.state !== 'choice' || !c || c.kind === 'fixed') return;
    if (c.free > 0) c.free--; else if (run.rerolls > 0) run.rerolls--; else return;
    this.sound.sfx('ui');
    this.rollChoice();
  }

  pick(i) {
    const c = this.choice, run = this.run;
    if (this.state !== 'choice' || !c || !c.opts[i]) return;
    if (c.kind === 'level') {
      const id = c.opts[i].id;
      run.ups[id] = (run.ups[id] || 0) + 1; run.pending--;
      if (id === 'lu_len') run.len += 2;
      this.refreshStats();
      if (id === 'lu_hp') this.heal(15);
    } else if (c.kind === 'module') {
      const m = c.opts[i];
      run.mods.push(m.id); run.modT.push(0); this.see('mod_' + m.id);
      this.ui.toast(run.mods.length > modSlots(this.snake.n) ? `Модуль «${m.name}» ждёт: тело пока коротко` : `Модуль «${m.name}» встал на звено`, 'good');
    } else this.grantRelic(c.opts[i], false);
    this.sound.sfx('ui');
    this.choice = null;
    if (run.pending > 0 || this.offers.length) this.openChoice();
    else { this.state = 'play'; this.screenName = ''; this.ui.close(); this.input.reset(); run.inv = Math.max(run.inv, 0.8); }
  }

  // ---- Бой
  hit(e, dmg, cause, kx = 0, kz = 0) {
    const st = this.stats, run = this.run;
    const attack = cause === 'bite' || cause === 'spit' || cause === 'dash' || cause === 'whip';
    let shown = cause;
    if (attack) {
      // Стихии цепляются к любой атаке: укус, плевок, рывок, хлыст.
      if (st.poison || st.plague) { e.poisonT = 3; e.poisonDps = st.bite * (st.poison + st.plague * 0.15); }
      if (st.burn) { e.burnT = 3; e.burnDps = st.bite * st.burn; }
      if ((st.chill || st.shatter) && !e.boss) { e.slowT = 2.5; if (Math.random() < st.freezeChance) e.freeze = Math.max(e.freeze, 1.2); }
      if (st.chain && ++run.atkN % 4 === 0) this.chain(e);
      if (cause === 'bite' && st.exec && !e.boss && !e.elite && Math.random() < st.exec) dmg = e.hp + 1;
      // Критический удар. «Семь чешуек» делают критической каждую седьмую атаку.
      const sure = st.lucky7 > 0 && ++run.hitN % 7 === 0;
      if (sure || (st.crit && Math.random() < st.crit)) {
        dmg *= st.critMul * (sure ? 1 + st.lucky7 : 1); shown = 'crit';
        if (st.bleed) { e.bleedT = 3; e.bleedDps = st.bite * st.bleed; }
      }
    }
    if (cause !== 'poison' && cause !== 'fire') {
      let k = 1 + Math.min(1, run.combo * st.lust) + (this.sky.night ? st.moon : st.sun)
        + Math.min(0.6, Math.floor(run.berries / 10) * st.hoard) + (run.hp < st.maxHp * 0.4 ? st.berserk : 0);
      if (st.catalyst && (e.poisonT > 0) + (e.burnT > 0) + (e.slowT > 0 || e.freeze > 0) >= 2) k *= 1 + st.catalyst;
      if (e.markT > 0) k *= 1.5;
      if (st.frostSet && (e.slowT > 0 || e.freeze > 0)) k *= 1 + st.frostSet;
      if (cause === 'zap') k *= st.zapMul;
      if (cause === 'wisp') k *= st.petMul;
      if (e.acidT > 0) k *= 1 + e.acid * 0.08;
      if (st.eclipse) k *= this.sky.night ? 3 : 0.5;
      dmg *= k;
    }
    return this.enemies.hurt(e, dmg, shown, kx, kz);
  }

  summonLord() {
    const run = this.run, s = this.snake;
    const e = this.enemies.spawnNear('lord', s.x, s.z, 13, 17, { tag: 'lord' });
    if (!e) { run.lordT = 2; return; }
    run.lord = e;
    this.sound.sfx('curse'); this.shake(0.9);
    this.ui.center('Хозяин архипелага', 'Три логова пали — он пришёл сам');
  }

  /** Победа над хозяином: круг пройден, открывается следующий. Забег при этом продолжается. */
  lordDown() {
    const run = this.run, sv = this.save;
    run.lordDone = true; run.lord = null; this.ui.boss(null);
    sv.stats.lords = (sv.stats.lords || 0) + 1;
    const opened = run.circle + 1 > sv.circle && sv.circle < MAX_CIRCLE;
    if (opened) sv.circle = Math.min(MAX_CIRCLE, run.circle + 1);
    this.unlock('lord1');
    if (!run.relics.tr_lord) this.grantRelic('tr_lord', true);
    const got = this.addShards(150);
    this.sound.sfx('win'); this.hitStop(0.3);
    this.ui.center('Круг пройден!', opened ? `+${got} осколков · в меню открыт круг ${sv.circle + 1}` : `+${got} осколков`);
    this.persist(true);
  }

  /** Запись в бестиарий: сколько раз побеждён враг или пойман зверь. */
  meet(key) { const b = this.save.bestiary; b[key] = (b[key] || 0) + 1; }

  /** Зверь пойман — догнали или обвели кольцом. */
  onCatch(type, x, z) {
    const run = this.run, s = this.snake;
    if (!run || this.state !== 'play') return;
    this.meet('beast_' + type);
    this.fx.burst(x, s.y + 0.7, z, 0x9be07a, 16, 4.5, 1, 4); this.fx.ring(x, s.y, z, 0x9be07a, 0.3, 2.2, 0.3);
    this.sound.sfx('chest'); this.addXp(6);
    if (type === 'hare') { run.hasteT = Math.max(run.hasteT, 12); this.ui.toast('Заяц пойман: 12 секунд ползёшь быстрее', 'good'); }
    else if (type === 'deer') { run.bonusHp += 4; this.refreshStats(); this.heal(30); this.ui.toast('Олень пойман: +30 здоровья и +4 к запасу', 'good'); }
    else {
      for (let i = 0; i < 4; i++) this.pickups.add(i ? 'shard' : 'gold', x, z, { pop: true, life: 50 });
      const relic = Math.random() < 0.25;
      if (relic) this.pickups.add('relic', x, z, { rar: 0, keep: true });
      this.ui.toast(relic ? 'Лиса бросила добычу — и реликвию!' : 'Лиса бросила добычу', 'gold');
    }
  }

  onKill(e, cause) {
    const run = this.run, st = this.stats, sv = this.save;
    run.kills++; sv.stats.kills++;
    this.meet('mob_' + e.type);
    if (e.type === 'lord') this.lordDown();
    if (sv.stats.kills >= 100) this.unlock('kills100');
    if (cause === 'loop') { sv.stats.loopKills++; if (sv.stats.loopKills >= 50) this.unlock('loop50'); }
    this.addXp(e.xp);
    if (st.leech) this.heal(st.leech);
    this.sound.sfx('kill');
    this.hitStop(e.boss ? 0.25 : e.elite ? 0.07 : 0.028);
    // Серия: враги падают один за другим — растёт счётчик, каждые десять побед дают осколки.
    run.combo++; run.comboT = 3.2; run.bestCombo = Math.max(run.bestCombo, run.combo);
    if (run.combo % 10 === 0) { const got = this.addShards(run.combo / 5); this.ui.toast(`Серия ${run.combo}! +${got} осколков`, 'gold'); this.sound.sfx('level'); }
    if (run.combo >= 25) this.unlock('combo25');
    if (!e.boss) {
      const n = (e.elite ? (run.arts.elites ? 2 : 3) * (1 + st.bounty) : Math.random() < 0.55 * st.luck ? 1 : 0) * (this.bloodMoon ? 2 : 1);
      for (let i = 0; i < n; i++) this.pickups.add(Math.random() < 0.1 * st.luck ? 'gold' : 'shard', e.x, e.z, { pop: true, life: 50 });
      const relicChance = run.arts.elites ? 0.08 : e.tag === 'amb' ? 0.3 : 0;
      if (e.elite && Math.random() < relicChance) this.pickups.add('relic', e.x, e.z, { rar: Math.random() < 0.25 ? 1 : 0, keep: true });
    }
    if (st.magpie && ++run.killN % Math.max(2, 7 - st.magpie) === 0) this.pickups.add('berry', e.x, e.z, { pop: true });
    if (cause === 'loop' && st.harvest) for (let i = 0; i < st.harvest; i++) { this.pickups.add('berry', e.x, e.z, { pop: true }); this.pickups.add('shard', e.x, e.z, { pop: true, life: 50 }); }
    if (e.elite && st.bounty) for (let i = 0; i < 3 * st.bounty; i++) this.pickups.add('berry', e.x, e.z, { pop: true });
    // Гремучие враги (артефакт или свойство вожака) взрываются после гибели; «матка» распадается на мелочь.
    if (!e.boss && (run.arts.volatile || e.affix === 'volatile')) this.bomb(e.x, e.z, 0.6, 2.2 + e.r, e.dmg * 0.6, true);
    if (e.affix === 'splitter') for (let i = 0; i < 3; i++) this.enemies.spawn(e.type === 'brute' ? 'slime' : e.type, e.x + rand(-1, 1), e.z + rand(-1, 1), { tag: e.tag === 'amb' ? 'amb' : 'add', affix: null, hpMul: 0.5, scale: 0.8 });
    // Связки на победу.
    if (st.corpse) { this.fx.ring(e.x, e.y, e.z, 0xb6e36a, 0.3, 2.4, 0.25); this.enemies.each(e.x, e.z, 2.2, (q) => { if (q !== e) this.hit(q, st.bite * st.corpse, 'boom'); }); }
    if (st.shatter && (e.slowT > 0 || e.freeze > 0)) { this.fx.ring(e.x, e.y, e.z, 0x8fe3ff, 0.3, 3, 0.3); this.enemies.each(e.x, e.z, 2.8, (q) => { if (q !== e) { q.slowT = 2.5; this.hit(q, st.bite * st.shatter, 'frost'); } }); }
    if (st.plague && e.poisonT > 0) { this.fx.burst(e.x, e.y + e.r, e.z, 0xb06cff, 10, 4, 0.9, 3); this.enemies.each(e.x, e.z, 3.2, (q) => { if (q !== e) { q.poisonT = 3; q.poisonDps = st.bite * (st.poison + st.plague * 0.15) * 1.5; } }); }
    // Лунные чешуйки: с вожаков гнёзд и набегов, стражей и — изредка — с кого угодно.
    if (e.boss || (e.elite && Math.random() < (e.tag === 'den' || e.tag === 'raid' ? 0.5 : 0.1)) || Math.random() < 0.006) this.pickups.add('moon', e.x, e.z, { pop: true, keep: true });
    this.pois.onKill(e);
    this.events.onKill(e);
  }

  bite() {
    const s = this.snake, st = this.stats, run = this.run, E = this.enemies;
    const hx = s.x + Math.sin(s.heading) * 0.5, hz = s.z + Math.cos(s.heading) * 0.5;
    const first = E.nearest(hx, hz, 1.5);
    if (!first) { run.biteT = 0.05; return; }
    run.biteT = st.biteCd * (run.rageT > 0 ? 0.5 : 1); run.biteN++;
    const targets = [first];
    for (let i = 1; i < st.targets; i++) { const e = E.nearest(hx, hz, 2.3, targets); if (e) targets.push(e); }
    s.biteAnim = 0.14; this.sound.sfx('bite');
    for (const e of targets) {
      const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz) || 1;
      this.fx.burst(e.x, e.y + e.r, e.z, 0xffffff, 4, 3.5, 0.8, 2);
      this.fx.ring(e.x, e.y + e.r * 0.5, e.z, 0xffffff, 0.2, e.r + 0.7, 0.14);
      this.hit(e, st.bite * st.biteMul, 'bite', (dx / d) * 3.5, (dz / d) * 3.5);
    }
    if (st.nova) for (let i = 0; i < 6; i++) this.shots.fire(s.x, s.z, s.heading + i * 1.047, st.spit * 0.7 * st.nova, { split: 0, bounce: 0, life: 0.45 });
    if (st.shadow) run.shadow = { t: 0.14, list: targets };   // «Двойная тень» повторит укус
  }

  whip(mul = 1) {
    const s = this.snake, st = this.stats, run = this.run;
    if (mul === 1) { run.whipCd = st.whipCd; if (st.echo) run.echo = { t: 0.4, kind: 'whip' }; }
    this.sound.sfx('whip'); this.shake(0.25);
    this.fx.ring(s.x, s.y, s.z, 0xffffff, 0.6, 3.4, 0.32);
    const mid = Math.floor(s.n / 2);
    if (s.n > 6) this.fx.ring(s.sx[mid], s.sy[mid], s.sz[mid], 0xfff2b0, 0.4, 2.2, 0.32);
    const dmg = st.bite * st.whipMul * mul;
    this.events.onWhip();
    for (let i = 0; i < s.n; i += 3) this.fx.burst(s.sx[i], s.sy[i] + 0.2, s.sz[i], this.skinHex, 2, 4, 0.8, 2);
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz) || 1;
      if (d < st.whipR + e.r || s.nearBody(e.x, e.z, 1.7 + e.r)) {
        this.hit(e, dmg, 'whip', (dx / d) * 10, (dz / d) * 10);
        if (st.freeze && !e.dead && !e.boss) e.freeze = Math.max(e.freeze, st.freeze);
      }
    }
  }

  /** Кольцо: голова коснулась своего тела — всё, что внутри, получает сильный удар. */
  closeLoop(li) {
    const s = this.snake, st = this.stats, run = this.run, n = li + 2;
    const px = new Float32Array(n), pz = new Float32Array(n);
    px[0] = s.x; pz[0] = s.z;
    for (let i = 0; i <= li; i++) { px[i + 1] = s.sx[i]; pz[i + 1] = s.sz[i]; }
    let area = 0, cx = 0, cz = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) { area += px[j] * pz[i] - px[i] * pz[j]; cx += px[i]; cz += pz[i]; }
    if (Math.abs(area) / 2 < 5) return;
    cx /= n; cz /= n;
    run.loopCd = st.loopCd;
    let hits = 0;
    let rad = 0;
    for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
    // «Тугая спираль»: тесное кольцо бьёт сильнее.
    const dmg = st.bite * st.loopMul * (1 + 1.5 * st.coil * clamp((6 - rad) / 4, 0, 1)), inside = [];
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const ed = Math.hypot(e.x - cx, e.z - cz);
      if (pointInPoly(e.x, e.z, px, pz, n)) inside.push(e);
      else if (e.body && this.enemies.segsIn(e, px, pz, n) >= 8) inside.push(e);   // соперника можно обвести и по телу
      else if (st.vortex && ed < rad + 1.6 * st.vortex + e.r) { inside.push(e); e.kx += ((cx - e.x) / (ed || 1)) * 9; e.kz += ((cz - e.z) / (ed || 1)) * 9; }   // «Водоворот»
    }
    if (st.echo && inside.length) run.echo = { t: 0.45, kind: 'loop', x: cx, z: cz, r: rad + 1, dmg: dmg * 0.6 };
    for (const e of inside) { hits++; if (!e.boss) e.freeze = Math.max(e.freeze, 0.7 + st.snare); this.hit(e, dmg, 'loop'); }
    for (const it of this.pickups.items) if (!it.mesh && pointInPoly(it.x, it.z, px, pz, n)) it.pull = true;
    this.events.inLoop(px, pz, n);
    this.life.inLoop(px, pz, n);
    this.fx.polyFlash(px, pz, n, s.y + 0.35, hits ? 0xfff0a0 : 0x8fd8ff);
    if (!hits) { this.sound.sfx('tick'); return; }
    this.sound.sfx('loop'); this.shake(0.55); vibrate(30); this.hitStop(0.11);
    for (let i = 0; i < n; i += 2) this.fx.burst(px[i], s.y + 0.3, pz[i], 0xfff0a0, 2, 3, 0.9, 5);
    if (st.thunder) {
      for (const e of this.enemies.list) {
        if (e.dead || inside.includes(e) || Math.hypot(e.x - cx, e.z - cz) > 9) continue;
        this.fx.bolt(e.x + rand(-1, 1), e.y + 14, e.z + rand(-1, 1), e.x, e.y + 0.5, e.z, 0xfff3a0);
        this.hit(e, st.bite * 1.5 * st.thunder, 'zap');
      }
    }
    if (!this.save.hints.loop) { this.save.hints.loop = 1; this.ui.toast('Кольцо! Чем длиннее тело, тем больше врагов в него войдёт', 'good'); }
  }

  damagePlayer(dmg, x, z, src) {
    const run = this.run, s = this.snake;
    if (this.state !== 'play') return;
    if (run.shellT > 0) {   // «Раковина»: кто коснулся — получил сам
      const e = this.enemies.nearest(x, z, 1.5);
      if (e) this.hit(e, this.stats.bite * 2, 'thorn');
      return;
    }
    if (run.inv > 0 || s.dashT > 0) return;
    const st = this.stats;
    const block = (text, hex) => { run.inv = 0.5; this.fx.ring(s.x, s.y, s.z, hex, 0.5, 3, 0.35); this.sound.sfx('tick'); this.ui.dmg(s.x, s.y + 1.4, s.z, text, 'zap'); };
    if (st.dodge && Math.random() < st.dodge) return block('мимо', 0xdfe8ee);
    if (st.shield && run.shieldT <= 0) { run.shieldT = st.shield; return block('щит', 0xffd24a); }
    if (run.snail && run.snailT <= 0) { run.snailT = 14; return block('щит', 0xc59dff); }
    dmg *= st.armor;
    if (run.barrier > 0) {   // «Варенье»: запас прочности принимает удар первым
      const a = Math.min(run.barrier, dmg); run.barrier -= a; dmg -= a;
      if (dmg < 0.5) return block('запас', 0xff8b95);
    }
    this.hurtPet();
    if (src && src.affix === 'frost') { run.slowT = 2; this.ui.dmg(s.x, s.y + 1.8, s.z, 'стужа', 'zap'); }
    run.hp -= dmg; run.inv = 0.6; run.hurtFlash = 0.4; s.hurtT = 0.3;
    this.shake(0.45); vibrate(40); this.sound.sfx('hurt'); this.hitStop(0.06);
    run.combo = 0;
    this.fx.burst(s.x, s.y + 0.6, s.z, 0xff5a5a, 7, 4, 0.9, 3);
    if (st.revenge) for (let i = 0; i < 8; i++) this.shots.fire(s.x, s.z, i * 0.785, st.spit * 1.2 * st.revenge, { split: 0, bounce: 0, life: 0.5 });
    if (st.lastgasp && run.gaspT <= 0 && run.hp > 0 && run.hp < st.maxHp * 0.25) {
      run.gaspT = 40; run.inv = 3;
      this.fx.ring(s.x, s.y, s.z, 0xffffff, 0.5, 7.5, 0.5); this.shake(0.7); this.sound.sfx('loop');
      this.enemies.each(s.x, s.z, 7, (e) => { const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz) || 1; this.hit(e, st.bite * 6 * st.lastgasp, 'boom', (dx / d) * 14, (dz / d) * 14); });
      this.ui.toast('Последний вздох! Три секунды неуязвимости', 'gold');
    }
    if (run.hp > 0) return;
    const saved = run.relics.molt > 0 ? 'molt' : run.lives > 0 ? 'life' : null;
    if (!saved) return this.die(false);
    if (saved === 'molt') { run.relics.molt--; if (!run.relics.molt) delete run.relics.molt; run.len = Math.max(4, run.len - 5); this.ui.relicRow(); }
    else run.lives--;
    this.refreshStats();
    run.hp = this.stats.maxHp * (saved === 'molt' ? 0.4 : 0.5); run.inv = 2.5;
    for (const e of this.enemies.list) { const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz) || 1; if (d < 9) { e.kx += (dx / d) * 16; e.kz += (dz / d) * 16; } }
    this.fx.ring(s.x, s.y, s.z, 0xffffff, 0.5, 9, 0.6);
    this.sound.sfx('relic');
    this.ui.center(saved === 'molt' ? 'Запасная кожа спасла тебя' : 'Вторая жизнь', 'Змейка снова в строю');
  }

  die(quit) {
    const run = this.run, sv = this.save, st = sv.stats;
    this.state = 'dead';
    if (!quit) {   // на месте гибели останется надгробие с одной из реликвий
      const ids = Object.keys(run.relics).filter((id) => RELIC[id].rar < 3 && !RELIC[id].trophy);
      if (ids.length) sv.grave = { x: this.snake.x, z: this.snake.z, id: ids[Math.floor(Math.random() * ids.length)] };
    }
    st.runs++; st.bestTime = Math.max(st.bestTime, Math.floor(run.t)); st.bestLevel = Math.max(st.bestLevel, run.level);
    st.bestBerries = Math.max(st.bestBerries, run.eaten); st.maxLen = Math.max(st.maxLen, run.maxLen); st.farthest = Math.max(st.farthest, Math.round(run.far));
    st.bestCombo = Math.max(st.bestCombo, run.bestCombo);
    this.stopT = 0;
    this.unlock('first');
    this.persist(true);
    this.ui.hud(false); this.ui.close();
    if (!quit) { this.sound.sfx('death'); this.shake(0.8); this.fx.burst(this.snake.x, this.snake.y + 0.6, this.snake.z, 0xffffff, 30, 7, 1.4, 6); }
    const result = { quit, time: run.t, level: run.level, len: run.maxLen, berries: run.eaten, kills: run.kills, challenges: run.challenges, far: Math.round(run.far), shards: run.shards, unlocks: run.unlocks.slice(), combo: run.bestCombo };
    setTimeout(() => {
      if (this.state !== 'dead') return;
      this.enemies.clear(); this.pois.resetRun(); this.events.resetRun(); this.shots.clear(); this.clearPets(); this.ui.setMarks([]); this.ui.setWisp(null);
      this.screenName = 'result'; this.ui.showResult(result);
    }, quit ? 0 : 1300);
  }

  onPickup(it) {
    const run = this.run, st = this.stats, s = this.snake;
    switch (it.type) {
      case 'berry': {
        // Грибной лес: среди ягод попадаются поганки.
        if (run.biome === B.MUSHROOM && Math.random() < 0.13) { run.hp = Math.max(1, run.hp - 4); this.fx.burst(it.x, s.y + 0.5, it.z, 0xb55ad6, 8, 3, 0.8, 3); this.sound.sfx('hurt'); this.ui.dmg(s.x, s.y + 1.4, s.z, 'поганка −4', 'psn'); break; }
        run.berries++; run.eaten++; this.save.stats.berries++;
        if (st.jam && run.hp >= st.maxHp - 0.01) run.barrier = Math.min(st.jam, run.barrier + 2);
        if (st.pits) { const e = this.enemies.nearest(s.x, s.z, 10); if (e) for (let i = 0; i < st.pits; i++) this.shots.fire(s.x, s.z, Math.atan2(e.x - s.x, e.z - s.z) + (i - (st.pits - 1) / 2) * 0.16, st.spit * 2, { life: 0.8 }); }
        if (st.feast && ++run.eatN % 10 === 0) { run.rageT = 5 * st.feast; this.ui.toast('Пир! Атаки вдвое чаще', 'good'); this.sound.sfx('level'); }
        const before = Math.floor(run.len);
        run.len = Math.min(this.maxLen(), run.len + st.grow);
        this.addXp(st.berryXp); this.heal(st.berryHeal); this.sound.sfx('berry');
        this.fx.burst(it.x, s.y + 0.5, it.z, 0xff6b7a, 4, 2.5, 0.7, 3);
        if (Math.floor(run.len) !== before && run.relics.star) this.refreshStats();
        if (this.save.stats.berries >= 300) this.unlock('berries300');
        break;
      }
      case 'shard': case 'gold':
        this.addShards(it.type === 'gold' ? 2 : 1); this.addXp(2); this.sound.sfx('shard');
        this.fx.burst(it.x, s.y + 0.6, it.z, it.type === 'gold' ? 0xffd24a : 0x7fe9ff, 4, 2.5, 0.7, 3);
        break;
      case 'chest': {
        const got = this.addShards(6 + Math.floor(Math.random() * 6)), r = Math.random();
        let bonus;
        if (r < 0.5) { run.bonusBite += 0.4; bonus = 'укус сильнее'; }
        else if (r < 0.8) { run.bonusHp += 6; bonus = '+6 здоровья'; }
        else { run.len += 1; bonus = '+1 звено'; }
        this.addXp(12); this.refreshStats(); this.sound.sfx('chest');
        this.fx.burst(it.x, s.y + 0.8, it.z, 0xffd24a, 18, 5, 1.1, 6);
        this.ui.toast(`Сундук: +${got} осколков, ${bonus}`, 'gold');
        break;
      }
      case 'relic': this.grantRelic(this.rollRelic(it.rar || 0), true); break;
      case 'moon':
        this.save.moons++; this.sound.sfx('relic');
        this.fx.burst(it.x, s.y + 0.6, it.z, 0x9d8cff, 12, 4, 0.9, 5);
        this.ui.toast(`Лунная чешуйка! Всего: ${this.save.moons}. Трать в лунном омуте`, 'rar3'); this.persist();
        break;
    }
  }

  // ---- Предметы: облик, обмен, активный предмет, спутники
  applyLook() {
    const L = (this.style = lookOf(this.run.relics)), sp = this.run.species;
    if (sp === 'cobra') L.wings = true;          // капюшон
    else if (sp === 'viper') L.fangs = true;
    else if (sp === 'boa') L.scale *= 1.12;
    this.snake.setLook(L);
  }

  acceptNear() { if (this.pois.near) this.pois.accept(); else this.pickups.useNear(); }

  /** Забрать у игрока случайную реликвию данной редкости (для плавильни и копировальни). */
  takeRelic(rar, except) {
    const R = this.run.relics, ids = Object.keys(R).filter((id) => RELIC[id].rar === rar && id !== except);
    if (!ids.length) return null;
    const id = ids[Math.floor(Math.random() * ids.length)];
    if (--R[id] <= 0) delete R[id];
    this.refreshStats(); this.ui.relicRow();
    return id;
  }

  /** Плевок: залп в ближайшего врага. Хвост и звенья тела стреляют, если на то есть предметы. */
  spit() {
    const s = this.snake, st = this.stats, run = this.run, E = this.enemies;
    const t = E.nearest(s.x, s.z, 9.5 * (1 + st.sniper * 0.4));
    if (!t) { run.spitT = 0.12; return; }
    run.spitT = st.spitCd;
    const drum = st.volley && ++run.volN % 5 === 0 ? 4 * st.volley : 0;   // «Барабан»
    this.shots.volley(s.x + Math.sin(s.heading) * 0.6, s.z + Math.cos(s.heading) * 0.6, t.x, t.z, st.spit, undefined, drum);
    this.sound.sfx('spit');
    if (st.tailgun && s.n > 3) {
      const li = s.n - 1, q = E.nearest(s.sx[li], s.sz[li], 8.5);
      if (q) for (let i = 0; i < st.tailgun; i++) this.shots.volley(s.sx[li], s.sz[li], q.x, q.z, st.spit);
    }
    if (st.spine) {
      for (let i = 5; i < s.n; i += 6) {
        const q = E.nearest(s.sx[i], s.sz[i], 7);
        if (q) this.shots.fire(s.sx[i], s.sz[i], Math.atan2(q.x - s.sx[i], q.z - s.sz[i]), st.spit * 0.6 * st.spine, { split: 0, bounce: 0 });
      }
    }
  }

  /** Цепная молния от цели к соседям. */
  chain(first) {
    const st = this.stats, zapped = [first];
    for (let i = 0; i < 1 + st.chain; i++) {
      const e = this.enemies.nearest(first.x, first.z, 6.5, zapped);
      if (!e) break;
      zapped.push(e);
      this.fx.bolt(first.x, first.y + 0.8, first.z, e.x, e.y + 0.8, e.z);
      this.hit(e, st.bite * 0.8, 'zap');
    }
    if (zapped.length > 1) this.sound.sfx('zap');
  }

  useActive() {
    const run = this.run, a = ACTIVE[run.active], s = this.snake, st = this.stats;
    if (!a || run.activeCd > 0) return;
    run.activeCd = a.cd * st.cd;
    this.sound.sfx('start'); this.fx.ring(s.x, s.y, s.z, 0x7fe9ff, 0.5, 4, 0.4);
    if (a.id === 'lure') this.lure = { x: s.x + Math.sin(s.heading) * 6, z: s.z + Math.cos(s.heading) * 6, t: 4.5 };
    else if (a.id === 'shell') { run.shellT = 3; run.inv = Math.max(run.inv, 3); }
    else if (a.id === 'horn') {
      this.shake(0.6); this.sound.sfx('loop');
      for (const e of this.enemies.list) {
        if (e.dead || Math.hypot(e.x - s.x, e.z - s.z) > 14) continue;
        this.fx.bolt(e.x + rand(-1, 1), e.y + 14, e.z + rand(-1, 1), e.x, e.y + 0.5, e.z, 0xfff3a0);
        this.hit(e, st.bite * 3, 'zap');
      }
    } else if (a.id === 'burrow') {
      let d = 14;
      while (d > 2 && heightAt(s.x + Math.sin(s.heading) * d, s.z + Math.cos(s.heading) * d) < 0.2) d -= 1;
      this.fx.burst(s.x, s.y + 0.4, s.z, 0x9a7a55, 16, 5, 1.1, 4);
      s.reset(s.x + Math.sin(s.heading) * d, s.z + Math.cos(s.heading) * d, s.heading, run.len);
      this.fx.burst(s.x, s.y + 0.4, s.z, 0x9a7a55, 16, 5, 1.1, 4);
      run.inv = Math.max(run.inv, 0.7);
    } else if (a.id === 'seed') {
      for (let i = 0; i < 10; i++) { const an = (i / 10) * 6.283, r = rand(4.2, 6.5), x = s.x + Math.sin(an) * r, z = s.z + Math.cos(an) * r; if (heightAt(x, z) > 0.5) this.pickups.add('berry', x, z, { pop: false }); }
      this.fx.burst(s.x, s.y + 0.5, s.z, 0x8fe07a, 20, 5, 1, 5);
    } else if (a.id === 'flare') {
      run.flareT = 30; this.fx.burst(s.x, s.y + 1, s.z, 0xffb066, 30, 6, 1.2, 9); this.ui.toast('Сигнальный огонь: карта видит всё', 'gold');
    } else if (a.id === 'root') {
      this.heal(st.maxHp / 3); this.fx.burst(s.x, s.y + 0.6, s.z, 0x8fe07a, 22, 4, 1.1, 6);
    } else if (a.id === 'bomb') this.bomb(s.x, s.z, 1.1, 6, st.bite * 12, false);
    else if (a.id === 'sand') { run.hasteT = 6; run.rageT = Math.max(run.rageT, 6); this.fx.burst(s.x, s.y + 0.6, s.z, 0xffd24a, 22, 5, 1, 5); }
    else if (a.id === 'bell') {
      this.fx.ring(s.x, s.y, s.z, 0xffd24a, 1, 18, 0.7); this.sound.sfx('level');
      for (const it of this.pickups.items) if (!it.mesh && Math.hypot(it.x - s.x, it.z - s.z) < 40) it.pull = true;
      for (const e of this.enemies.list) if (!e.dead && Math.hypot(e.x - s.x, e.z - s.z) < 9) e.freeze = Math.max(e.freeze, e.boss ? 0.4 : 1.2);
    } else if (a.id === 'shed') {
      const li = s.n - 1, x = s.sx[li], z = s.sz[li];
      if (run.len > 6) run.len -= 3;
      this.heal(15); this.shake(0.5); this.sound.sfx('slam');
      this.fx.ring(x, s.sy[li], z, 0xb6e36a, 0.5, 5.2, 0.4); this.fx.burst(x, s.sy[li] + 0.5, z, this.skinHex, 24, 7, 1.3, 5);
      this.enemies.each(x, z, 5, (e) => { const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz) || 1; this.hit(e, st.bite * 8, 'boom', (dx / d) * 10, (dz / d) * 10); });
    } else if (a.id === 'stasis') {
      this.fx.ring(s.x, s.y, s.z, 0x8fe3ff, 1, 16, 0.6);
      for (const e of this.enemies.list) if (!e.dead && Math.hypot(e.x - s.x, e.z - s.z) < 16) e.freeze = Math.max(e.freeze, e.boss ? 1 : 3);
    }
  }

  /** Новый спутник. Без id — случайный из яйца. immortal — пришедший с реликвией, его не ранят. */
  addPet(id, x, z, immortal = false) {
    const P = id ? PET[id] : PETS[Math.floor(Math.random() * PETS.length)];
    const geo = { chick: () => new THREE.OctahedronGeometry(0.3), glow: () => new THREE.IcosahedronGeometry(0.2, 1), beetle: () => new THREE.SphereGeometry(0.3, 8, 6), snail: () => new THREE.TorusGeometry(0.2, 0.11, 6, 12),
      hedgehog: () => new THREE.IcosahedronGeometry(0.3, 0), moth: () => new THREE.TetrahedronGeometry(0.28), crab: () => new THREE.BoxGeometry(0.46, 0.2, 0.32) }[P.id]();
    const mat = P.id === 'glow' || P.id === 'moth' ? new THREE.MeshBasicMaterial({ color: new THREE.Color(P.hex).multiplyScalar(1.5) }) : new THREE.MeshLambertMaterial({ color: P.hex, emissive: P.hex, emissiveIntensity: 0.35 });
    const mesh = new THREE.Mesh(geo, mat);
    if (P.id === 'beetle') mesh.scale.set(1.2, 0.6, 1.4);
    mesh.castShadow = P.id !== 'glow' && P.id !== 'moth';
    this.scene.add(mesh);
    this.pets.push({ id: P.id, hp: this.stats.petHp, immortal, mesh, x, z, t: rand(0, 6), cd: 1 });
    this.see('pet_' + P.id);
    this.ui.toast(`Спутник: ${P.name}. ${P.desc}`, 'gold');
  }

  clearPets() { for (const p of this.pets) this.scene.remove(p.mesh); this.pets.length = 0; this.petPull = 0; this.petXp = 0; }

  /** Змейку ранили — один из спутников теряет сердце. */
  hurtPet() {
    const mortal = this.pets.filter((p) => !p.immortal);
    if (!mortal.length) return;
    const p = mortal[Math.floor(Math.random() * mortal.length)];
    if (--p.hp > 0) return this.ui.toast(`${PET[p.id].name} ранен: осталось сердец ${p.hp}`, 'bad');
    this.fx.burst(p.x, this.snake.y + 1, p.z, PET[p.id].hex, 14, 4, 1, 4);
    this.scene.remove(p.mesh); this.pets.splice(this.pets.indexOf(p), 1);
    this.ui.toast(`${PET[p.id].name} покинул тебя`, 'bad');
  }

  updatePets(dt) {
    const s = this.snake, run = this.run, st = this.stats;
    let pull = 0, snail = false, xp = 0;
    this.pets.forEach((p, i) => {
      p.t += dt;
      const k = Math.min(s.n - 1, 2 + i * 2), tx = s.sx[k] + Math.sin(p.t * 1.3 + i) * 0.9, tz = s.sz[k] + Math.cos(p.t * 1.1 + i * 2) * 0.9;
      p.x = lerp(p.x, tx, damp(5, dt)); p.z = lerp(p.z, tz, damp(5, dt));
      p.mesh.position.set(p.x, s.sy[k] + 1.1 + Math.sin(p.t * 3) * 0.2, p.z);
      p.mesh.rotation.y = p.t * 1.5;
      if (p.id === 'chick') {
        p.cd -= dt;
        if (p.cd <= 0) {
          const e = this.enemies.nearest(p.x, p.z, 7);
          if (e) { p.cd = 1.5; this.fx.bolt(p.x, p.mesh.position.y, p.z, e.x, e.y + e.r, e.z, 0xffd24a); this.hit(e, st.bite * 0.8, 'wisp'); } else p.cd = 0.2;
        }
      } else if (p.id === 'glow') this.heal(1.2 * dt);
      else if (p.id === 'beetle') pull = 5;
      else if (p.id === 'snail') snail = true;
      else if (p.id === 'moth') xp += 0.25;
      else if (p.id === 'hedgehog') {
        p.cd -= dt;
        if (p.cd <= 0) {
          if (this.enemies.nearest(p.x, p.z, 6)) { p.cd = 4; for (let k = 0; k < 8; k++) this.shots.fire(p.x, p.z, k * 0.785 + p.t, st.bite * 0.6, { split: 0, bounce: 0, pierce: 0, life: 0.45 }); } else p.cd = 0.3;
        }
      } else if (p.id === 'crab') {
        p.cd -= dt;
        if (p.cd <= 0) {
          const e = this.enemies.nearest(p.x, p.z, 6);
          if (e) { p.cd = 1.2; e.slowT = Math.max(e.slowT, 2); this.fx.burst(e.x, e.y + e.r, e.z, 0xff8a4a, 3, 2, 0.8, 2); this.hit(e, st.bite * 0.6, 'wisp'); } else p.cd = 0.2;
        }
      }
    });
    this.petPull = pull; this.petXp = xp;
    run.snail = snail;
    if (snail && run.snailT > 0) run.snailT -= dt;
  }

  // ---- Один шаг забега
  tick(dt) {
    const run = this.run, st = this.stats, s = this.snake, I = this.input, sv = this.save;
    run.t += dt;
    const dist = Math.hypot(s.x, s.z);
    this.diff = DIFFS[sv.diff].enemy * (1 + 0.25 * run.circle) * (1 + (run.t / 60) * 0.12 * (st.pact ? 2 : 1) + run.challenges * 0.1 + run.loop * 0.6 + run.curses * 0.5 + (dist / 320) * 0.3);
    this.threat = threatOf(this.diff);

    const mv = I.move(), f = this.camFwd;
    s.len = run.len;
    s.update(dt, -f.z * mv.x + f.x * mv.y, f.x * mv.x + f.z * mv.y, mv.mag, st.speed * (run.hasteT > 0 ? 1.33 : 1) * (run.slowT > 0 ? 0.6 : 1) * (run.biome === B.SWAMP ? (st.bogbelly ? 1.15 : 0.82) : 1), st.turn);

    run.whipCd = Math.max(0, run.whipCd - dt);
    // Заряды рывка: обычно один, «Двойной рывок» добавляет ещё.
    if (run.dashN < st.dashMax) { run.dashCd -= dt; if (run.dashCd <= 0) { run.dashN++; run.dashCd = st.dashCd; } } else run.dashCd = 0;
    run.gaspT = Math.max(0, run.gaspT - dt); run.hasteT = Math.max(0, run.hasteT - dt); run.slowT = Math.max(0, run.slowT - dt);
    this.passives(dt);
    this.biomeFx(dt);
    run.inv = Math.max(0, run.inv - dt); run.hurtFlash = Math.max(0, run.hurtFlash - dt); run.loopCd -= dt;
    if (st.regen) this.heal(st.regen * dt);
    if (run.comboT > 0) { run.comboT -= dt; if (run.comboT <= 0) run.combo = 0; }
    run.activeCd = Math.max(0, run.activeCd - dt); run.shellT = Math.max(0, run.shellT - dt);
    run.shieldT = Math.max(0, run.shieldT - dt); run.rageT = Math.max(0, run.rageT - dt);
    if (st.roots && s.v < 0.4) this.heal(st.roots * dt);
    if (st.shed) { run.shedT += dt; if (run.shedT >= st.shed) { run.shedT = 0; if (run.len > 5) run.len -= 1; } }
    if (run.shellT > 0 && Math.random() < dt * 12) this.fx.ring(s.x, s.y, s.z, 0x9fd8ff, 0.8, 1.6, 0.25);
    if (run.echo && (run.echo.t -= dt) <= 0) {   // «Эхо»: хлыст и кольцо повторяются слабее
      const k = run.echo; run.echo = null;
      if (k.kind === 'whip') this.whip(0.6);
      else { this.fx.ring(k.x, s.y, k.z, 0xfff0a0, 0.5, k.r, 0.35); this.sound.sfx('loop'); this.enemies.each(k.x, k.z, k.r, (e) => this.hit(e, k.dmg, 'loop')); }
    }
    if (this.lure) {
      const l = this.lure; l.t -= dt;
      this.lureMesh.visible = true; this.lureMesh.position.set(l.x, heightAt(l.x, l.z) + 1 + Math.sin(this.time * 6) * 0.2, l.z); this.lureMesh.rotation.y += dt * 3;
      if (l.t <= 0) { this.fx.burst(l.x, this.lureMesh.position.y, l.z, 0xff7ab8, 14, 5, 1, 4); this.lure = null; this.lureMesh.visible = false; }
    }
    if (I.take('item')) this.useActive();
    if (run.arts.rush) this.sky.t = (this.sky.t + dt / DAY_LEN) % 1;
    if (run.arts.fog && this.sky.weather !== 'fog') this.sky.setWeather('fog');
    if (run.arts.mutation && (run.mutT -= dt) <= 0) { run.mutT = 90; this.mutate(); }
    if (run.arts.night && this.sky.t > 0.15 && this.sky.t < 0.85) this.sky.t = 0.86;
    if (run.arts.hunger && run.hp > 1) run.hp = Math.max(1, run.hp - 0.7 * dt);

    if (I.take('dash') && run.dashN > 0 && s.dashT <= 0.08) {
      if (run.dashN === st.dashMax) run.dashCd = st.dashCd;
      run.dashN--; s.dashT = 0.3; run.dashId++;
      if (st.dashCost && run.hp > st.dashCost + 1) run.hp -= st.dashCost;
      if (st.afterimage) for (let i = 0; i < 3 * st.afterimage; i++) for (const side of [-1, 1]) this.shots.fire(s.x, s.z, s.heading + side * (1.2 + i * 0.25), st.spit, { split: 0 });
      this.sound.sfx('dash'); this.fx.burst(s.x, s.y + 0.4, s.z, 0xffffff, 8, 3, 0.8, 1);
    }
    if (s.dashT > 0) {
      this.fx.burst(s.x, s.y + 0.4, s.z, this.skinHex, 2, 1.4, 1.2, 0.6);
      this.enemies.each(s.x, s.z, 1.15, (e) => {
        if (e.dashId === run.dashId) return;
        e.dashId = run.dashId;
        const kb = st.dashMul > 1.5 ? 16 : 6;
        if (st.mark) e.markT = 5;   // «Метка охотника»
        this.hit(e, st.bite * st.dashMul, 'dash', Math.sin(s.heading) * kb, Math.cos(s.heading) * kb);
      });
      if (st.fire) { run.fireT -= dt; if (run.fireT <= 0) { run.fireT = 0.07; run.fire.push({ x: s.x, z: s.z, t: 2.6, tick: 0 }); if (run.fire.length > 40) run.fire.shift(); } }
    }
    if (I.take('whip') && run.whipCd <= 0) this.whip();
    if (I.take('accept')) this.acceptNear();

    if (!run.arts.toothless) { run.biteT -= dt; if (run.biteT <= 0) this.bite(); }   // артефакт «Беззубая» отключает укус
    run.spitT -= dt * (run.rageT > 0 ? 2 : 1);
    if (run.spitT <= 0) this.spit();
    if (run.loopCd <= 0) { const li = s.loopIndex(); if (li >= 0) this.closeLoop(li); }

    if (st.thorns) {
      run.thornT -= dt;
      if (run.thornT <= 0) { run.thornT = 0.5; for (const e of this.enemies.list) if (!e.dead && s.nearBody(e.x, e.z, 0.5 + e.r)) this.hit(e, st.bite * st.thorns, 'thorn'); }
    }
    for (let i = run.fire.length - 1; i >= 0; i--) {
      const p = run.fire[i];
      p.t -= dt; p.tick -= dt;
      if (Math.random() < dt * 9) this.fx.burst(p.x + rand(-0.4, 0.4), heightAt(p.x, p.z) + 0.2, p.z + rand(-0.4, 0.4), Math.random() < 0.5 ? 0xff8a3d : 0xffd24a, 1, 0.6, 0.9, 3);
      if (p.tick <= 0) { p.tick = 0.5; this.enemies.each(p.x, p.z, 1.2, (e) => this.hit(e, st.bite * st.fire, 'fire')); }
      if (p.t <= 0) run.fire.splice(i, 1);
    }
    this.updateWisps(dt);
    this.updateOrbit(dt);
    this.updateMods(dt);

    // Ночь будит врагов; рассвет их прогоняет. Проклятие не даёт им спать и днём.
    const night = this.sky.night;
    if (night !== this.wasNight) {
      this.wasNight = night;
      if (night) { this.ui.toast('Ночь. Просыпаются враги', 'bad'); this.events.dusk(); }
      else { this.events.dawn(); if (!run.curses && run.circle < 4) this.enemies.clear('amb'); this.ui.toast('Рассвет. Ночные твари уходят', 'good'); }
    }
    // Днём враги спят стоянками у сундука: можно обойти, подкрасться или напасть первой.
    if (!night && !this.pois.active && this.pickups.travel > run.nextCamp) {
      run.nextCamp = this.pickups.travel + rand(230, 340);
      const a = s.heading + rand(-0.8, 0.8), r = rand(34, 44), cx = s.x + Math.sin(a) * r, cz = s.z + Math.cos(a) * r;
      if (heightAt(cx, cz) > 1) {
        const id = ++run.campId, n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const type = this.enemies.pickType(this.diff);
          this.enemies.spawnNear(type === 'swarm' ? 'slime' : type, cx, cz, 1.2, 3.4, { tag: 'camp', sleep: true, camp: id, quiet: true, elite: i === 0 && Math.random() < 0.25 });
        }
        this.pickups.add('chest', cx, cz);
      }
    }
    const few = run.arts.elites ? 3 : 1, moon = this.bloodMoon ? 1.6 : 1;
    const rate = (this.pois.active ? 0 : night ? moon : run.curses ? 0.4 : 0) * (run.biome === B.DUNES ? 0.5 : 1);
    if (rate) {
      run.spawnT -= dt * rate;
      if (run.spawnT <= 0) {
        run.spawnT = clamp(1.9 - this.diff * 0.3, 0.4, 1.6) * few;
        if (this.enemies.count('amb') < Math.min(36, 5 + this.diff * 4.5) * moon / few) this.enemies.spawnPack(s.x, s.z, 19, 30, { tag: 'amb', elite: Math.random() < (0.03 + this.diff * 0.008) * (this.bloodMoon ? 3 : 1) * (run.circle >= 2 ? 2 : 1) });
      }
    }

    this.enemies.update(dt);
    if (this.state !== 'play') return;
    this.shots.update(dt);
    this.updatePets(dt);
    this.pickups.update(dt);
    this.pois.update(dt);
    this.pois.structures();
    // Финал: хозяин архипелага приходит сам, когда пали три логова.
    if (run.lordT > 0 && (run.lordT -= dt) <= 0) this.summonLord();
    if (run.lord) { if (run.lord.dead) run.lord = null; else if (!this.pois.active) this.ui.boss('Хозяин архипелага', Math.max(0, run.lord.hp / run.lord.maxHp)); }
    this.map.update(dt);
    if (run.pin && Math.hypot(run.pin.x - s.x, run.pin.z - s.z) < 5) { run.pin = null; this.ui.toast('Метка достигнута', 'good'); }
    if (this.state !== 'play') return;
    this.events.update(dt);

    run.far = Math.max(run.far, dist); run.maxLen = Math.max(run.maxLen, Math.floor(run.len));
    if (run.far >= 1000) this.unlock('far1000');
    if (run.t >= 480) this.unlock('time8');
    run.saveT -= dt;
    if (run.saveT <= 0) { run.saveT = 15; this.persist(); }
    this.hints(dt);

    if (this.state === 'play' && (run.pending > 0 || this.offers.length)) this.openChoice();
  }

  /** Особые края: у каждого своя опасность. */
  biomeFx(dt) {
    const run = this.run, s = this.snake, st = this.stats, sv = this.save;
    if ((run.bioT -= dt) <= 0) {
      run.bioT = 0.4;
      run.biome = biomeAt(s.x, s.z, heightAt(s.x, s.z), moistAt(s.x, s.z));
      const note = BIOME_NOTE[run.biome];
      if (note && !run.bioSeen[run.biome]) { run.bioSeen[run.biome] = 1; this.ui.center(note[0], note[1]); }
      // Надгробие прошлой змейки появляется, когда подползёшь к месту её гибели.
      if (sv.grave && !run.graveUp && RELIC[sv.grave.id] && Math.hypot(sv.grave.x - s.x, sv.grave.z - s.z) < 70) { run.graveUp = true; this.pickups.add('grave', sv.grave.x, sv.grave.z, { keep: true, rid: sv.grave.id }); }
    }
    if (run.biome === B.VOLCANO) {
      if ((run.geyT -= dt) <= 0) {
        run.geyT = rand(1.5, 2.7);
        const a = rand(0, 6.283), r = rand(0, 5.5);
        this.bomb(s.x + Math.sin(s.heading) * 3 + Math.sin(a) * r, s.z + Math.cos(s.heading) * 3 + Math.cos(a) * r, 1.05, 2.3, 8 * (1 + this.diff * 0.25), true, 'lava');
      }
    } else if (run.biome === B.DUNES && !this.sky.night && run.hp > st.maxHp * 0.2) run.hp -= 0.7 * dt;
  }

  /** Отложенный взрыв. hostile — вражеский: ранит и змейку, и соседей. */
  bomb(x, z, t, r, dmg, hostile, kind) {
    this.run.bombs.push({ x, z, t, r, dmg, hostile, kind });
    this.fx.ring(x, heightAt(x, z), z, hostile ? 0xff3b2f : 0xffd24a, r, 0.4, t);
  }

  /** Всё, что работает само по себе: ауры, следы, молнии, взрывы, тень. */
  passives(dt) {
    const run = this.run, st = this.stats, s = this.snake, E = this.enemies;
    for (let i = run.bombs.length - 1; i >= 0; i--) {
      const b = run.bombs[i];
      if (!b.hostile && Math.random() < dt * 20) this.fx.burst(b.x, heightAt(b.x, b.z) + 0.8, b.z, 0xffb066, 1, 2, 0.7, 3);
      if ((b.t -= dt) > 0) continue;
      run.bombs.splice(i, 1);
      const y = heightAt(b.x, b.z), hex = b.hostile ? 0xff5a3a : 0xffc266;
      this.fx.ring(b.x, y, b.z, hex, 0.4, b.r, 0.3); this.fx.burst(b.x, y + 0.6, b.z, hex, b.hostile ? 10 : 30, 7, 1.3, 5);
      if (b.hostile) {
        if (Math.hypot(s.x - b.x, s.z - b.z) < b.r && !(b.kind === 'lava' && st.obsidian)) this.damagePlayer(b.dmg, b.x, b.z);
        E.each(b.x, b.z, b.r, (e) => this.hit(e, st.bite, 'boom'));
      } else {
        this.shake(0.7); this.sound.sfx('slam'); this.hitStop(0.05);
        E.each(b.x, b.z, b.r, (e) => { const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz) || 1; this.hit(e, b.dmg, 'boom', (dx / d) * 12, (dz / d) * 12); });
      }
      if (this.state !== 'play') return;
    }
    if (run.shadow && (run.shadow.t -= dt) <= 0) {
      for (const e of run.shadow.list) if (!e.dead) { this.fx.burst(e.x, e.y + e.r, e.z, 0x9d8cff, 5, 3.5, 0.9, 2); this.hit(e, st.bite * st.shadow, 'bite'); }
      run.shadow = null;
    }
    if (st.sprout && (run.sproutT += dt) >= 10 / st.sprout) {
      run.sproutT = 0;
      const a = rand(0, 6.283), x = s.x + Math.sin(a) * 3.6, z = s.z + Math.cos(a) * 3.6;
      if (heightAt(x, z) > 0.5) { this.pickups.add('berry', x, z); this.fx.burst(x, heightAt(x, z) + 0.3, z, 0x8fe07a, 5, 2, 0.8, 3); }
    }
    if (st.aura && (run.auraT -= dt) <= 0) {
      run.auraT = 0.3;
      E.each(s.x, s.z, 3 + st.aura, (e) => { if (!e.boss) e.slowT = Math.max(e.slowT, 0.6); });
    }
    if (st.static && (run.staticT -= dt) <= 0) {
      run.staticT = 1.5 * st.cd;
      let any = false;
      for (const e of E.list) {
        if (e.dead || !s.nearBody(e.x, e.z, 1.2 + e.r)) continue;
        any = true;
        this.fx.bolt(e.x + rand(-0.6, 0.6), e.y + 2.6, e.z + rand(-0.6, 0.6), e.x, e.y + e.r, e.z, 0x9fd8ff);
        this.hit(e, st.bite * 0.7 * st.static, 'zap');
      }
      if (any) this.sound.sfx('zap');
    }
    if (st.skyfire && (run.skyT -= dt) <= 0) {
      const near = E.list.filter((e) => !e.dead && Math.hypot(e.x - s.x, e.z - s.z) < 12);
      if (!near.length) run.skyT = 0.3;
      else {
        run.skyT = 3 * st.cd;
        const e = near[Math.floor(Math.random() * near.length)];
        this.fx.bolt(e.x + rand(-1.5, 1.5), e.y + 15, e.z + rand(-1.5, 1.5), e.x, e.y + 0.5, e.z, 0xfff3a0);
        this.fx.ring(e.x, e.y, e.z, 0xfff3a0, 0.3, 2.4, 0.25); this.sound.sfx('zap');
        E.each(e.x, e.z, 2, (q) => { if (q !== e) this.hit(q, st.bite * 1.2 * st.skyfire, 'zap'); });
        this.hit(e, st.bite * 3.5 * st.skyfire, 'zap');
      }
    }
    // «Едкий след»: лужицы за хвостом.
    if (st.slime && (run.slimeT -= dt) <= 0 && s.v > 1) {
      run.slimeT = 0.3;
      const li = s.n - 1;
      run.slime.push({ x: s.sx[li], z: s.sz[li], t: 4 });
      if (run.slime.length > 28) run.slime.shift();
    }
    if (run.slime.length) {
      for (let i = run.slime.length - 1; i >= 0; i--) {
        const p = run.slime[i];
        if (Math.random() < dt * 3) this.fx.burst(p.x + rand(-0.4, 0.4), heightAt(p.x, p.z) + 0.15, p.z + rand(-0.4, 0.4), 0xb6e36a, 1, 0.4, 0.8, 1.5);
        if ((p.t -= dt) <= 0) run.slime.splice(i, 1);
      }
      if ((run.slimeTick -= dt) <= 0) {
        run.slimeTick = 0.5;
        for (const e of E.list) {
          if (e.dead) continue;
          for (const p of run.slime) {
            const dx = e.x - p.x, dz = e.z - p.z, rr = 1.1 + e.r;
            if (dx * dx + dz * dz < rr * rr) { this.hit(e, st.bite * 0.25 * Math.max(1, st.slime), 'poison'); break; }
          }
        }
      }
    }
  }

  /** Модули на звеньях: каждый работает от своего места на теле. */
  updateMods(dt) {
    const run = this.run, s = this.snake, st = this.stats, E = this.enemies;
    const n = Math.min(run.mods.length, modSlots(s.n));
    while (this.modMeshes.length < n) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      m.castShadow = true; this.scene.add(m); this.modMeshes.push(m);
    }
    for (let k = 0; k < this.modMeshes.length; k++) this.modMeshes[k].visible = k < n;
    let heal = 0;
    for (let k = 0; k < n; k++) {
      const i = 3 + k * 4, id = run.mods[k], x = s.sx[i], z = s.sz[i], y = s.sy[i], m = this.modMeshes[k], M0 = MODULE[id];
      if (m.userData.id !== id) { m.userData.id = id; m.material.color.set(M0.hex); m.material.emissive.set(M0.hex); m.material.emissiveIntensity = id === 'lantern' || id === 'coil' ? 0.9 : 0.25; }
      m.position.set(x, y + 0.62 * (s.scale || 1) + Math.sin(this.time * 3 + k) * 0.05, z); m.rotation.y = this.time * 1.5 + k;
      run.modT[k] -= dt;
      const ready = run.modT[k] <= 0;
      if (id === 'healer') heal += 0.6 * dt;
      else if (id === 'turret') {
        if (ready) { const e = E.nearest(x, z, 8); if (e) { run.modT[k] = 1.5 * st.cd; this.shots.fire(x, z, Math.atan2(e.x - x, e.z - z), st.spit * 0.9, { split: 0, bounce: 0, life: 0.7 }); } else run.modT[k] = 0.2; }
      } else if (id === 'shield') {
        if (ready) {
          run.modT[k] = 0.25;
          E.each(x, z, 1.25, (e) => { if ((e.modT || 0) > this.time) return; e.modT = this.time + 0.7; const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz) || 1; this.fx.ring(x, y + 0.3, z, 0xc98a4a, 0.3, 1.6, 0.2); this.hit(e, st.bite * 0.6, 'thorn', (dx / d) * 11, (dz / d) * 11); });
          for (let q = E.shots.length - 1; q >= 0; q--) { const sh = E.shots[q]; if (Math.hypot(sh.x - x, sh.z - z) < 1.5) { this.fx.burst(sh.x, sh.y, sh.z, 0xc98a4a, 5, 3, 0.7); this.scene.remove(sh.mesh); E.shots.splice(q, 1); } }
        }
      } else if (id === 'spike') {
        if (ready) { run.modT[k] = 0.5; E.each(x, z, 1.4, (e) => this.hit(e, st.bite * 0.9, 'thorn')); }
      } else if (id === 'magnet') {
        if (ready) { run.modT[k] = 0.3; for (const it of this.pickups.items) if (!it.mesh && !it.pull && Math.hypot(it.x - x, it.z - z) < 6) it.pull = true; }
      } else if (id === 'lantern') {
        if (ready) { run.modT[k] = 0.3; E.each(x, z, 3.2, (e) => { if (!e.boss && !e.boss) e.slowT = Math.max(e.slowT, 0.6); }); }
      } else if (id === 'coil') {
        if (ready) { const e = E.nearest(x, z, 5.5); if (e) { run.modT[k] = 2 * st.cd; this.fx.bolt(x, y + 0.9, z, e.x, e.y + e.r, e.z, 0x9fd8ff); this.sound.sfx('zap'); this.hit(e, st.bite * 1.6, 'zap'); } else run.modT[k] = 0.2; }
      } else if (id === 'sac') {
        if (ready) { run.modT[k] = 12; const bx = x + rand(-1.2, 1.2), bz = z + rand(-1.2, 1.2); if (heightAt(bx, bz) > 0.5) this.pickups.add('berry', bx, bz, { pop: true }); }
      }
    }
    if (heal) this.heal(heal);
  }

  /** «Хоровод клыков»: клыки кружат вокруг головы и режут тех, кого задели. */
  updateOrbit(dt) {
    const n = this.stats.orbit, s = this.snake, st = this.stats;
    while (this.orbMeshes.length < n) {
      const g = new THREE.ConeGeometry(0.16, 0.7, 5); g.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xfff2d8, emissive: 0xffe0a0, emissiveIntensity: 0.6 }));
      m.castShadow = true; this.scene.add(m); this.orbMeshes.push(m);
    }
    this.orbMeshes.forEach((m, i) => {
      m.visible = i < n;
      if (!m.visible) return;
      const a = this.time * 3.4 + (i / n) * Math.PI * 2, x = s.x + Math.sin(a) * 2.5, z = s.z + Math.cos(a) * 2.5;
      m.position.set(x, s.y + 0.7, z); m.rotation.y = a + Math.PI / 2;
      this.enemies.each(x, z, 0.55, (e) => {
        if ((e.orbT || 0) > this.time) return;
        e.orbT = this.time + 0.4;
        this.fx.burst(e.x, e.y + e.r, e.z, 0xfff2d8, 3, 3, 0.7, 2);
        this.hit(e, st.bite * 0.7, 'thorn', Math.sin(a) * 3, Math.cos(a) * 3);
      });
    });
  }

  /** Артефакт «Мутация»: случайная реликвия превращается в другую той же редкости. */
  mutate() {
    const R = this.run.relics, ids = Object.keys(R);
    if (!ids.length) return;
    const id = ids[Math.floor(Math.random() * ids.length)], rar = RELIC[id].rar;
    const pool = RELICS.filter((q) => q.rar === rar && !q.trophy && q.id !== id && q.id !== 'mimic' && (!q.unlock || this.save.ach[q.unlock]));
    if (!pool.length || RELIC[id].evo || RELIC[id].trophy) return;
    const to = pool[Math.floor(Math.random() * pool.length)].id, s = this.snake;
    if (--R[id] <= 0) delete R[id];
    R[to] = (R[to] || 0) + 1; this.see(to);
    this.refreshStats(); this.ui.relicRow();
    if (to === 'chick') this.addPet('chick', s.x, s.z, true);
    this.fx.burst(s.x, s.y + 1, s.z, 0xb8f27a, 18, 5, 1.1, 5); this.sound.sfx('relic');
    this.ui.toast(`Мутация: «${RELIC[id].name}» стала «${RELIC[to].name}»`, 'rar' + rar);
    this.checkEvos();
  }

  hints() {
    const run = this.run, sv = this.save;
    if (sv.stats.runs === 0) {
      const touch = matchMedia('(pointer: coarse)').matches;
      const steps = [[1.5, touch ? 'Веди пальцем по левой половине экрана — змейка поползёт' : 'Тяни джойстик или жми WASD — змейка поползёт'], [9, 'Ягоды лечат и растят тело'], [20, 'Лучи света вдали — вызовы. Принимать их или нет — решать тебе'], [34, touch ? 'Кусаешь ты сама: просто подведи голову к врагу. Справа — рывок и удар хвостом' : 'Кусаешь ты сама: просто подведи голову к врагу. Рывок — пробел, хвост — Shift']];
      if (run.hint < steps.length && run.t > steps[run.hint][0]) this.ui.toast(steps[run.hint++][1]);
    }
    if (!run.lenHint && run.len >= 15 && !sv.hints.loop) { run.lenHint = true; this.ui.toast('Тело выросло. Обведи врагов и коснись головой хвоста — кольцо ударит всех внутри', 'good'); }
  }

  /** Светляки-спутники: кружат у головы и жалят ближайшего врага. */
  updateWisps(dt) {
    const n = this.stats.wisps, s = this.snake, run = this.run;
    while (this.wispMeshes.length < n) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2ff9a).multiplyScalar(3) }));
      this.scene.add(m); this.wispMeshes.push(m);
    }
    run.wispT -= dt;
    const fire = n > 0 && run.wispT <= 0;
    if (fire) run.wispT = 1.1;
    this.wispMeshes.forEach((m, i) => {
      m.visible = i < n;
      if (!m.visible) return;
      const a = this.time * 2.2 + (i / n) * Math.PI * 2;
      m.position.set(s.x + Math.sin(a) * 1.9, s.y + 1.3 + Math.sin(this.time * 3 + i) * 0.2, s.z + Math.cos(a) * 1.9);
      if (fire) {
        const e = this.enemies.nearest(m.position.x, m.position.z, 7);
        if (e) { this.fx.bolt(m.position.x, m.position.y, m.position.z, e.x, e.y + e.r, e.z, 0xf2ff9a); this.hit(e, this.stats.bite * 0.6, 'wisp'); }
      }
    });
  }

  // ---- Кадр
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0, raw));
    this.time += dt;
    if (raw < 0.2) this.frameMs = lerp(this.frameMs, raw * 1000, 0.05);   // длинные паузы (вкладка в фоне) — не тормоза
    // Если телефон не тянет — сначала снижаем чёткость, потом дальность прорисовки.
    if (this.frameMs > 27 && raw < 0.2) { this.slowT += dt; if (this.slowT > 2.5) { this.slowT = 0; this.lowerQuality(); } } else this.slowT = 0;

    const s = this.snake, playing = this.state === 'play', idle = this.state === 'menu' || this.state === 'dead';
    let gdt = dt;
    if (this.stopT > 0) { this.stopT -= raw; gdt = dt * 0.05; }
    if (playing) { this.camYaw -= this.input.takeCam() * 0.0065; this.tick(gdt); }
    else { this.camYaw += dt * 0.07; if (idle) s.update(dt, 0, 0, 0, 0); }
    this.camFwd.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));

    const live = this.state === 'play' || idle;
    this.fx.update(dt);
    if (live) this.life.update(dt, this.time, 1 - this.sky.day);

    // Камера: сверху-сзади, смотрит чуть вперёд по ходу движения.
    const portrait = this.camera.aspect < 1, cd = (portrait ? 17.5 : 14) * (idle ? 0.8 : 1), ch = (portrait ? 15.5 : 11.5) * (idle ? 0.75 : 1);
    const ahead = Math.min(1, s.v / 5) * 2.4;
    _v.set(s.x + Math.sin(s.heading) * ahead, s.y + 0.8, s.z + Math.cos(s.heading) * ahead);
    this.look.lerp(_v, damp(7, dt));
    const cam = this.camera;
    _v.set(this.look.x + Math.sin(this.camYaw) * cd, this.look.y + ch, this.look.z + Math.cos(this.camYaw) * cd);
    cam.position.lerp(_v, damp(playing ? 9 : 3, dt));
    cam.position.y = Math.max(cam.position.y, heightAt(cam.position.x, cam.position.z) + 3);
    if (this.shakeAmt > 0.01) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt; cam.position.y += (Math.random() - 0.5) * this.shakeAmt; cam.position.z += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-9 * dt);
    }
    cam.lookAt(this.look);
    // Рывок слегка «раздвигает» обзор — так он ощущается быстрее.
    const fov = lerp(cam.fov, playing && s.dashT > 0 ? 61 : 52, damp(playing && s.dashT > 0 ? 18 : 6, dt));
    if (Math.abs(fov - cam.fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

    this.sky.update(live ? dt : 0, cam, this.look);
    this.world.update(s.x, s.z, this.time, this.sky.day);
    this.grass.update(this.look.x + this.camFwd.x * 10, this.look.z + this.camFwd.z * 10, this.time);
    this.sound.update(dt, {
      day: this.sky.day, rain: this.sky.rainAmt, fog: this.sky.fogAmt, speed: Math.min(1, s.v / 8),
      tension: playing ? (this.pois.active ? 1 : clamp(this.enemies.list.length / 12, 0, 0.8)) : 0,
    });
    if (playing) this.ui.frame(dt);
    if (this.post && this.post.on) this.post.composer.render(); else this.renderer.render(this.scene, cam);
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => { console.error(e); document.getElementById('screen').hidden = false; document.getElementById('screen').innerHTML = '<div class="panel narrow"><h2>Игра не запустилась</h2><p class="lead">' + String(e && e.message ? e.message : e) + '</p></div>'; });
