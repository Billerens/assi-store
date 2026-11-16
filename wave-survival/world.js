// «Выживание в волнах» — the run itself: a fixed-step simulation (60 Hz by default) that is
// deterministic from a seed. Shared subset of JavaScript: it runs on the screen
// (window.WaveWorld), in node for the tests and in Rhino for the checks. No class, no async,
// no f(...args), no for (let …); randomness only from the world's own generator.
//
//   var w = WaveWorld.create(cfg, {seed, hero, mode, storm, ws, bonus, cards, rules, freeFusions});
//   WaveWorld.step(w, moveX, moveY);   // one step of 1 / sim.hz seconds; the stick is -1..1
//   w.s.choice                         // three cards when a level came: pick(w, i), reroll, banish, skip
//   WaveWorld.save(w) -> data          // a snapshot for the save; WaveWorld.load(cfg, data) -> w
//   WaveWorld.result(w)                // what the run gave, when w.s.over
//
// Entities live in typed arrays (structure of arrays) with fixed caps, so a step allocates
// nothing. Collisions and targets go through a spatial grid of cells (grid.cell). Every
// number comes from cfg (config.json of the game).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/rng.js')) : make(root.Rng);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.WaveWorld = api; }
})(this, function (Rng) {
  'use strict';

  var TAU = Math.PI * 2;
  var VERSION = 1;

  var WEAPONS = ['spark', 'blades', 'needles', 'mortar', 'ice', 'sickle', 'chain', 'pulse', 'drones', 'beacon', 'seeds', 'ball'];
  var PASSIVES = ['armor', 'core', 'accel', 'lens', 'magnet', 'soles', 'multi', 'regen', 'coin', 'sharp', 'fuse', 'pupil', 'thorns', 'scope'];
  var ENEMIES = ['crawler', 'runner', 'splitter', 'splitling', 'shooter', 'ram', 'shield', 'leech', 'bomber', 'hive', 'reaper'];
  var FUSIONS = [
    { id: 'shower', weapon: 'spark', passive: 'accel' },
    { id: 'millstones', weapon: 'blades', passive: 'lens' },
    { id: 'raid', weapon: 'mortar', passive: 'fuse' },
    { id: 'net', weapon: 'chain', passive: 'coin' },
    { id: 'permafrost', weapon: 'ice', passive: 'soles' }
  ];
  var RARITY = ['common', 'rare', 'epic', 'legendary'];
  var PICKUPS = ['medkit', 'magnet', 'flash', 'gold', 'chest'];
  var DAILY = ['swarm', 'giants', 'glass', 'haste', 'elites', 'rich', 'dry', 'many', 'pull', 'heavy', 'bombers', 'calm'];
  var BRICKS = ['damage', 'cooldown', 'projectiles', 'area', 'duration', 'speed', 'pickup', 'xp', 'luck', 'regen', 'armor', 'hp', 'crit', 'slow', 'freeze'];

  var E_CRAWLER = 0;
  var E_RUNNER = 1;
  var E_SPLITTER = 2;
  var E_SPLITLING = 3;
  var E_SHOOTER = 4;
  var E_RAM = 5;
  var E_SHIELD = 6;
  var E_LEECH = 7;
  var E_BOMBER = 8;
  var E_HIVE = 9;
  var E_REAPER = 10;

  var F_ALIVE = 1;
  var F_ELITE = 2;
  var F_BOSS = 4;
  var F_RING = 8;
  var F_WALL = 16;
  var F_NOXP = 32;

  var P_SPARK = 0;
  var P_NEEDLE = 1;
  var P_MORTAR = 2;
  var P_SICKLE = 3;
  var P_DRONE = 4;
  var P_BALL = 5;
  var P_EBALL = 6;
  var P_ERING = 7;

  var K_MEDKIT = 0;
  var K_MAGNET = 1;
  var K_FLASH = 2;
  var K_GOLD = 3;
  var K_CHEST = 4;

  // Effects for the screen: what happened in a step, read from a ring buffer.
  var FX_HIT = 1;
  var FX_KILL = 2;
  var FX_LINE = 3;
  var FX_RING = 4;
  var FX_BOOM = 5;
  var FX_HURT = 6;
  var FX_PICK = 7;
  var FX_LEVEL = 8;
  var FX_SHOT = 9;
  var FX_BLOCK = 10;
  var FX_SWEEP = 11;
  var FX_SPAWN = 12;
  var FX_SIZE = 1024;

  var HAS_TA = typeof Float32Array !== 'undefined' && typeof Uint8Array !== 'undefined';

  function plain(n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = 0;
    return a;
  }
  function f32(n) { return HAS_TA ? new Float32Array(n) : plain(n); }
  function i32(n) { return HAS_TA ? new Int32Array(n) : plain(n); }
  function u8(n) { return HAS_TA ? new Uint8Array(n) : plain(n); }

  // ---- the numbers of the config, read once per world ---------------------------------------------

  function num(cfg, key, fallback) {
    var v = cfg[key];
    return typeof v === 'number' && v === v ? v : fallback;
  }

  function ints(text) {
    var out = [];
    String(text || '').split(/[\s,;]+/).forEach(function (p) {
      var n = Number(p);
      if (p !== '' && n === n) out.push(n);
    });
    return out;
  }

  /** "side crawler:6 runner:3" -> {side, kinds, weights, total}. */
  function parseWave(text) {
    var out = { side: false, kinds: [], weights: [], total: 0 };
    String(text || '').split(/[\s,;]+/).forEach(function (p) {
      if (!p) return;
      if (p === 'side') {
        out.side = true;
        return;
      }
      var m = /^([a-z]+):(\d+(?:\.\d+)?)$/.exec(p);
      if (!m) return;
      var k = ENEMIES.indexOf(m[1]);
      var wgt = Number(m[2]);
      if (k < 0 || k >= E_HIVE || !(wgt > 0)) return;
      out.kinds.push(k);
      out.weights.push(wgt);
      out.total += wgt;
    });
    if (!out.kinds.length) {
      out.kinds.push(E_CRAWLER);
      out.weights.push(1);
      out.total = 1;
    }
    return out;
  }

  function levelsAt(cfg, key) { return ints(cfg[key]); }

  function countAtLevel(list, lvl) {
    var n = 0;
    for (var i = 0; i < list.length; i++) if (lvl >= list[i]) n++;
    return n;
  }

  function rarityIndex(v) {
    var i = RARITY.indexOf(String(v));
    return i < 0 ? 0 : i;
  }

  /** Everything the step needs from the config, as plain numbers and arrays. */
  function derive(cfg) {
    var c = {};
    c.hz = num(cfg, 'sim.hz', 60);
    c.dt = 1 / c.hz;
    c.refW = num(cfg, 'view.refW', 344);
    c.refH = num(cfg, 'view.refH', 640);
    c.area = num(cfg, 'view.area', c.refW * c.refH);
    c.camY = num(cfg, 'camera.heroY', 0.42);
    c.arenaW = num(cfg, 'arena.screens', 3) * c.refW;
    c.arenaH = num(cfg, 'arena.screens', 3) * c.refH;
    c.edge = num(cfg, 'arena.edge', 48);
    c.push = num(cfg, 'arena.push', 6);
    c.cell = num(cfg, 'grid.cell', 64);
    c.gw = Math.ceil(c.arenaW / c.cell);
    c.gh = Math.ceil(c.arenaH / c.cell);
    c.capE = Math.max(16, Math.round(num(cfg, 'caps.enemies', 160)));
    c.capP = Math.max(16, Math.round(num(cfg, 'caps.projectiles', 300)));
    c.capG = Math.max(16, Math.round(num(cfg, 'caps.gems', 200)));
    c.capK = 24;
    c.capU = 64;
    c.capM = 32;
    c.runSeconds = num(cfg, 'run.seconds', 300);
    c.sprintSeconds = num(cfg, 'run.sprintSeconds', 180);
    c.waveSeconds = num(cfg, 'run.waveSeconds', 30);
    c.retarget = num(cfg, 'retargetMs', 100) / 1000;
    c.waves = [];
    for (var i = 1; i <= 10; i++) c.waves.push(parseWave(cfg['wave.' + i]));
    c.endlessWaves = ints(cfg['wave.endless']).map(function (n) { return Math.max(1, Math.min(10, n)) - 1; });
    if (!c.endlessWaves.length) c.endlessWaves = [6, 7, 8, 9];
    c.spawnBase = num(cfg, 'spawn.base', 1.2);
    c.spawnPerMinute = num(cfg, 'spawn.perMinute', 0.5);
    c.spawnMargin = num(cfg, 'spawn.margin', 40);
    c.pack = Math.max(1, Math.round(num(cfg, 'spawn.runnerPack', 5)));
    c.recycle = num(cfg, 'spawn.recycle', 420);
    c.leash = num(cfg, 'spawn.leash', 760);
    c.hpPerMinute = num(cfg, 'hp.perMinute', 0.22);
    c.dmgPerMinute = num(cfg, 'dmg.perMinute', 0.1);
    c.xpBase = num(cfg, 'xp.base', 5);
    c.xpLin = num(cfg, 'xp.lin', 4);
    c.xpSq = num(cfg, 'xp.sq', 0.5);
    c.gemPerMinute = num(cfg, 'xp.gemPerMinute', 0.25);
    c.xpElite = num(cfg, 'xp.eliteBonus', 25);
    c.xpBoss = num(cfg, 'xp.bossBonus', 80);
    c.sprintXp = num(cfg, 'sprint.xpMult', 1.5);
    c.rarityW = [num(cfg, 'rarity.common', 60), num(cfg, 'rarity.rare', 28), num(cfg, 'rarity.epic', 10), num(cfg, 'rarity.legendary', 2)];
    c.luckShift = num(cfg, 'luck.shift', 0.01);
    c.guarantee = cfg['guaranteeUpgrade'] !== false;
    c.slotsW = Math.round(num(cfg, 'slots.weapons', 6));
    c.slotsP = Math.round(num(cfg, 'slots.passives', 6));
    c.wMax = Math.round(num(cfg, 'w.maxLevel', 7));
    c.pMax = Math.round(num(cfg, 'p.maxLevel', 5));
    c.skipGold = num(cfg, 'skip.gold', 15);
    c.heroHp = num(cfg, 'hero.hp', 100);
    c.heroSpeed = num(cfg, 'hero.speed', 150);
    c.heroPickup = num(cfg, 'hero.pickup', 50);
    c.heroR = num(cfg, 'hero.radius', 12);
    c.iframes = num(cfg, 'iframesMs', 500) / 1000;
    c.reviveHp = num(cfg, 'revive.hp', 0.5);
    c.reviveInv = num(cfg, 'revive.invSec', 2);
    c.critMult = num(cfg, 'crit.mult', 2);
    c.critLuck = num(cfg, 'crit.perLuck', 0.001);
    c.aimElite = cfg['aim.priority'] === 'elite';
    c.viewPad = num(cfg, 'aim.viewPad', 24);
    c.elite = { hp: num(cfg, 'elite.hp', 8), dmg: num(cfg, 'elite.dmg', 1.5), xp: num(cfg, 'elite.xp', 10), r: num(cfg, 'elite.size', 1.3) };
    c.eliteTimes = ints(cfg['elite.times']);
    c.ringAt = num(cfg, 'ring.at', 120);
    c.ringCount = Math.round(num(cfg, 'ring.count', 40));
    c.ringRadius = num(cfg, 'ring.radius', 320);
    c.ringSpeed = num(cfg, 'ring.speed', 30);
    c.ringSec = num(cfg, 'ring.sec', 14);
    c.hiveAt = num(cfg, 'hive.at', 150);
    c.wallAt = num(cfg, 'wall.at', 210);
    c.wallCount = Math.round(num(cfg, 'wall.count', 30));
    c.wallSpeed = num(cfg, 'wall.speed', 70);
    c.wallSec = num(cfg, 'wall.sec', 24);
    c.bossAt = num(cfg, 'boss.at', 240);
    c.endlessEvery = num(cfg, 'endless.every', 60);
    c.endlessStep = num(cfg, 'endless.step', 0.25);
    c.ek = ENEMIES.map(function (id) {
      return {
        hp: num(cfg, 'e.' + id + '.hp', 10), spd: num(cfg, 'e.' + id + '.speed', 50), dmg: num(cfg, 'e.' + id + '.dmg', 5),
        xp: num(cfg, 'e.' + id + '.xp', 1), r: num(cfg, 'e.' + id + '.radius', 10)
      };
    });
    c.shooter = {
      range: num(cfg, 'e.shooter.range', 220), cd: num(cfg, 'e.shooter.cd', 2.6), windup: num(cfg, 'e.shooter.windup', 0.5),
      ball: num(cfg, 'e.shooter.ballSpeed', 105), ballDmg: num(cfg, 'e.shooter.ballDmg', 10), ballLife: num(cfg, 'e.shooter.ballLife', 4)
    };
    c.ram = {
      range: num(cfg, 'e.ram.range', 250), windup: num(cfg, 'e.ram.windup', 0.6), speed: num(cfg, 'e.ram.dashSpeed', 430),
      time: num(cfg, 'e.ram.dashTime', 0.5), dmg: num(cfg, 'e.ram.dashDmg', 18), stun: num(cfg, 'e.ram.stun', 1.2), cd: num(cfg, 'e.ram.cd', 2.5)
    };
    c.shieldArc = Math.cos(num(cfg, 'e.shield.arc', 60) * Math.PI / 180);
    c.leech = { heal: num(cfg, 'e.leech.heal', 8), search: num(cfg, 'e.leech.search', 300) };
    c.bomber = { trigger: num(cfg, 'e.bomber.trigger', 55), fuse: num(cfg, 'e.bomber.fuse', 1), radius: num(cfg, 'e.bomber.blastRadius', 70), dmg: num(cfg, 'e.bomber.blast', 24) };
    c.hive = { every: num(cfg, 'e.hive.ringEvery', 4.5), count: Math.round(num(cfg, 'e.hive.ringCount', 10)), stream: num(cfg, 'e.hive.stream', 2) };
    c.reaper = {
      p2: num(cfg, 'e.reaper.phase2', 0.66), p3: num(cfg, 'e.reaper.phase3', 0.33), p4: num(cfg, 'e.reaper.phase4', 0.15),
      dashEvery: num(cfg, 'e.reaper.dashEvery', 3), windup: num(cfg, 'e.reaper.windup', 0.7), dashSpeed: num(cfg, 'e.reaper.dashSpeed', 390),
      dashTime: num(cfg, 'e.reaper.dashTime', 0.7), shooters: Math.round(num(cfg, 'e.reaper.shooters', 8)), shootersEvery: num(cfg, 'e.reaper.shootersEvery', 12),
      ringEvery: num(cfg, 'e.reaper.ringEvery', 4.5), ringCount: Math.round(num(cfg, 'e.reaper.ringCount', 30)), ringGap: Math.round(num(cfg, 'e.reaper.ringGap', 4)),
      ringRadius: num(cfg, 'e.reaper.ringRadius', 300), ringSpeed: num(cfg, 'e.reaper.ringSpeed', 85), ringDmg: num(cfg, 'e.reaper.ringDmg', 14)
    };
    c.drop = {
      medkit: num(cfg, 'drop.medkit', 0.004), magnet: num(cfg, 'drop.magnet', 0.0015), flash: num(cfg, 'drop.flash', 0.001), gold: num(cfg, 'drop.gold', 0.03),
      heal: num(cfg, 'medkit.heal', 30), goldMin: num(cfg, 'gold.min', 1), goldMax: num(cfg, 'gold.max', 3), life: num(cfg, 'pickup.life', 40),
      two: num(cfg, 'chest.two', 0.3), three: num(cfg, 'chest.three', 0.1), chestLuck: num(cfg, 'chest.perLuck', 0.005)
    };
    c.gemSpeed = num(cfg, 'gem.speed', 420);
    c.w = {};
    WEAPONS.forEach(function (id) {
      var p = 'w.' + id + '.';
      c.w[id] = {
        dmg: num(cfg, p + 'dmg', 10), cd: num(cfg, p + 'cd', 1), lvlDmg: num(cfg, p + 'lvlDmg', 0.2), rarity: rarityIndex(cfg[p + 'rarity']),
        countAt: levelsAt(cfg, p + 'countAt'), count: num(cfg, p + 'count', 1), speed: num(cfg, p + 'speed', 300), life: num(cfg, p + 'life', 1),
        size: num(cfg, p + 'size', 6), range: num(cfg, p + 'range', 300), area: num(cfg, p + 'area', 50)
      };
    });
    var wb = c.w.blades;
    wb.radius = num(cfg, 'w.blades.radius', 64);
    wb.radiusLvl = num(cfg, 'w.blades.radiusLvl', 0.15);
    wb.spin = num(cfg, 'w.blades.spin', 3.2);
    wb.hitCd = num(cfg, 'w.blades.hitCd', 0.5);
    c.w.needles.spread = num(cfg, 'w.needles.spread', 50) * Math.PI / 180;
    c.w.needles.pierce = Math.round(num(cfg, 'w.needles.pierce', 1));
    c.w.needles.behindAt = num(cfg, 'w.needles.behindAt', 6);
    c.w.needles.behind = Math.round(num(cfg, 'w.needles.behindCount', 3));
    c.w.mortar.flight = num(cfg, 'w.mortar.flight', 0.8);
    c.w.ice.tick = num(cfg, 'w.ice.tick', 0.5);
    c.w.ice.slow = num(cfg, 'w.ice.slow', 0.4);
    c.w.ice.slowSec = num(cfg, 'w.ice.slowSec', 2);
    c.w.ice.every = num(cfg, 'w.ice.every', 0.22);
    c.w.ice.sizeLvl = num(cfg, 'w.ice.sizeLvl', 0.08);
    c.w.sickle.out = num(cfg, 'w.sickle.out', 0.55);
    c.w.sickle.hitCd = num(cfg, 'w.sickle.hitCd', 0.3);
    c.w.chain.jump = num(cfg, 'w.chain.jump', 130);
    c.w.chain.jumps = Math.round(num(cfg, 'w.chain.jumps', 3));
    c.w.chain.decay = num(cfg, 'w.chain.decay', 0.2);
    c.w.pulse.radiusLvl = num(cfg, 'w.pulse.radiusLvl', 0.08);
    c.w.pulse.knock = num(cfg, 'w.pulse.knock', 260);
    c.w.drones.orbit = num(cfg, 'w.drones.orbit', 42);
    c.w.beacon.sweep = num(cfg, 'w.beacon.sweep', 1);
    c.w.seeds.arm = num(cfg, 'w.seeds.arm', 0.5);
    c.w.seeds.trigger = num(cfg, 'w.seeds.trigger', 16);
    c.w.ball.tick = num(cfg, 'w.ball.tick', 0.25);
    c.f = {
      showerCd: num(cfg, 'f.shower.cd', 0.09), showerSpread: num(cfg, 'f.shower.spread', 30) * Math.PI / 180, showerDmg: num(cfg, 'f.shower.dmg', 0.55),
      millSize: num(cfg, 'f.millstones.size', 2), millSpin: num(cfg, 'f.millstones.spinMax', 2.5), millCrowd: num(cfg, 'f.millstones.crowd', 0.1),
      raidCount: Math.round(num(cfg, 'f.raid.count', 6)), raidDmg: num(cfg, 'f.raid.dmg', 1),
      netChance: num(cfg, 'f.net.chance', 0.85), netMax: Math.round(num(cfg, 'f.net.maxJumps', 60)), netDecay: num(cfg, 'f.net.decay', 0.1),
      frost: num(cfg, 'f.permafrost.freeze', 1), frostMult: num(cfg, 'f.permafrost.frozenMult', 2), frostImmune: num(cfg, 'f.permafrost.immune', 1.5)
    };
    c.multiZones = Math.max(0, Math.min(1, num(cfg, 'p.multi.zones', 0.5)));
    c.p = {};
    PASSIVES.forEach(function (id) {
      c.p[id] = { v: num(cfg, 'p.' + id + '.v', 0.1), rarity: rarityIndex(cfg['p.' + id + '.rarity']), max: Math.round(num(cfg, 'p.' + id + '.max', c.pMax)) };
    });
    c.ws = {
      power: num(cfg, 'ws.power.v', 0.05), vitality: num(cfg, 'ws.vitality.v', 10), armor: num(cfg, 'ws.armor.v', 1), speed: num(cfg, 'ws.speed.v', 0.03),
      attract: num(cfg, 'ws.attract.v', 0.1), luck: num(cfg, 'ws.luck.v', 5), xp: num(cfg, 'ws.xp.v', 0.05)
    };
    c.heroes = {
      keeperHp: num(cfg, 'hero.keeper.hp', 0.3), keeperSpeed: num(cfg, 'hero.keeper.speed', -0.1), bomberArea: num(cfg, 'hero.bomber.area', 0.2),
      bomberHp: num(cfg, 'hero.bomber.hp', -0.2), hunterSpeed: num(cfg, 'hero.hunter.speed', 0.15), mechanicDrones: Math.round(num(cfg, 'hero.mechanic.drones', 1)),
      hermitGems: num(cfg, 'hero.hermit.gems', 0.5)
    };
    c.storm = {
      hp: num(cfg, 'storm.hp', 0.15), elites: Math.round(num(cfg, 'storm.elites', 2)), medkits: num(cfg, 'storm.medkits', 0.5), speed: num(cfg, 'storm.speed', 0.1),
      stream: num(cfg, 'storm.stream', 0.2), dmg: num(cfg, 'storm.dmg', 0.25), xp: num(cfg, 'storm.xp', 0.1), bomber: num(cfg, 'storm.bomber', 0.4),
      hpGrowth: num(cfg, 'storm.hpGrowth', 0.22), hiveAt: num(cfg, 'storm.hiveAt', 225), ram: num(cfg, 'storm.ram', 0.3), leech: num(cfg, 'storm.leech', 1),
      reaperHp: num(cfg, 'storm.reaperHp', 0.5)
    };
    c.daily = {
      swarm: num(cfg, 'daily.swarm', 0.3), giants: num(cfg, 'daily.giants', 0.4), glass: num(cfg, 'daily.glass', 0.3), haste: num(cfg, 'daily.haste', 0.15),
      rich: num(cfg, 'daily.rich', 3), pull: num(cfg, 'daily.pull', 1), heavy: num(cfg, 'daily.heavy', 0.2), calm: num(cfg, 'daily.calm', 0.25)
    };
    c.brickMax = num(cfg, 'cards.brickMax', 0.5);
    c.scratchFrom = num(cfg, 'achieve.noScratchFrom', 180);
    c.scratchSec = num(cfg, 'achieve.noScratchSec', 60);
    return c;
  }

  // ---- making a world -----------------------------------------------------------------------------------

  function pools(c) {
    return {
      E: {
        x: f32(c.capE), y: f32(c.capE), vx: f32(c.capE), vy: f32(c.capE), mx: f32(c.capE), my: f32(c.capE), hp: f32(c.capE), max: f32(c.capE),
        r: f32(c.capE), spd: f32(c.capE), dmg: f32(c.capE), a: f32(c.capE), b: f32(c.capE), ang: f32(c.capE), face: f32(c.capE),
        slow: f32(c.capE), frz: f32(c.capE), cdBl: f32(c.capE), cdIce: f32(c.capE), cdBall: f32(c.capE), cdSk: f32(c.capE), cdTouch: f32(c.capE),
        sweep: i32(c.capE), kind: u8(c.capE), flag: u8(c.capE), st: u8(c.capE), gen: i32(c.capE), link: i32(c.capE), born: f32(c.capE)
      },
      P: {
        x: f32(c.capP), y: f32(c.capP), vx: f32(c.capP), vy: f32(c.capP), life: f32(c.capP), dmg: f32(c.capP), r: f32(c.capP), a: f32(c.capP),
        b: f32(c.capP), tx: f32(c.capP), ty: f32(c.capP), kind: u8(c.capP), on: u8(c.capP), pierce: i32(c.capP), hit: i32(c.capP), ws: i32(c.capP)
      },
      G: { x: f32(c.capG), y: f32(c.capG), v: f32(c.capG), st: u8(c.capG) },
      K: { x: f32(c.capK), y: f32(c.capK), life: f32(c.capK), v: f32(c.capK), kind: u8(c.capK), on: u8(c.capK) },
      U: { x: f32(c.capU), y: f32(c.capU), r: f32(c.capU), until: f32(c.capU), on: u8(c.capU) },
      M: { x: f32(c.capM), y: f32(c.capM), arm: f32(c.capM), until: f32(c.capM), dmg: f32(c.capM), r: f32(c.capM), on: u8(c.capM) }
    };
  }

  function scratch(w) {
    var c = w.c;
    var cells = c.gw * c.gh;
    w.grid = { start: i32(cells + 1), fill: i32(cells + 1), items: i32(c.capE), cell: i32(c.capE) };
    w.q = i32(c.capE);
    w.hitList = i32(c.capE);
    w.fx = { k: u8(FX_SIZE), x: f32(FX_SIZE), y: f32(FX_SIZE), a: f32(FX_SIZE), b: f32(FX_SIZE), n: 0 };
  }

  function modeScale(c, mode) { return mode === 'sprint' ? c.runSeconds / c.sprintSeconds : 1; }

  /**
   * A new run. opts: {seed, hero, mode: normal|sprint|endless|daily, storm, ws: {power, …},
   * bonus: '' | reroll | revive, cards: [data cards], rules: [daily rule ids], freeFusions, viewW, viewH}.
   */
  function create(cfg, opts) {
    opts = opts || {};
    var c = derive(cfg);
    var w = { cfg: cfg, c: c };
    var seed = (Number(opts.seed) >>> 0) || 1;
    w.rng = Rng.make(seed);
    var ws = opts.ws || {};
    var hero = opts.hero || 'wanderer';
    var mode = opts.mode || 'normal';
    var storm = Math.max(0, Math.min(15, Math.round(Number(opts.storm) || 0)));
    var s = {
      v: VERSION, seed: seed, t: 0, T: 0, steps: 0, mode: mode, scale: modeScale(c, mode), storm: storm, hero: hero,
      ws: {}, rules: (opts.rules || []).filter(function (r) { return DAILY.indexOf(r) >= 0; }).slice(0, 3),
      over: false, won: false, ended: '', viewW: 0, viewH: 0,
      hx: c.arenaW / 2, hy: c.arenaH / 2, hp: 0, hmax: 0, inv: 0, face: -Math.PI / 2, dirX: 0, dirY: -1, moving: 0, iceAcc: 0,
      wp: [], ps: {}, xcards: [], banned: {}, choice: null, pending: 0, chestQueue: 0,
      xp: 0, level: 1, need: 0, kills: 0, elites: 0, bosses: 0, hives: 0, gold: 0, medkits: 0, damage: 0, hurtAt: 0, hits: 0,
      rerolls: 0, banishes: 0, revives: 0, freeFusions: Math.max(0, Math.round(Number(opts.freeFusions) || 0)), fusions: [],
      spawnAcc: 0, wave: -1, side: 0, events: {}, sweepId: 0, ecur: 0, pcur: 0, gcount: 0, ecount: 0, pcount: 0,
      big: { x: 0, y: 0, v: 0 }, bossSlot: -1, bossGen: 0, hiveAlive: 0, noScratch: false, minutes: [], notes: [], multiTaken: 0, lastBoss: '',
      stat: {}
    };
    ['power', 'vitality', 'armor', 'speed', 'attract', 'luck', 'xp', 'loot', 'reroll', 'banish', 'wind'].forEach(function (k) {
      s.ws[k] = Math.max(0, Math.round(Number(ws[k]) || 0));
    });
    s.rerolls = s.ws.reroll + (opts.bonus === 'reroll' ? 1 : 0);
    s.banishes = s.ws.banish;
    s.revives = s.ws.wind + (opts.bonus === 'revive' ? 1 : 0);
    s.bonus = opts.bonus || '';
    (opts.cards || []).slice(0, 6).forEach(function (card, i) {
      var clean = cleanCard(card, c);
      if (clean) {
        clean.id = 'x' + i;
        s.xcards.push(clean);
      }
    });
    s.viewW = opts.viewW || 0;
    s.viewH = opts.viewH || 0;
    w.s = s;
    var P = pools(c);
    w.E = P.E;
    w.P = P.P;
    w.G = P.G;
    w.K = P.K;
    w.U = P.U;
    w.M = P.M;
    for (var i = 0; i < c.capE; i++) w.E.link[i] = -1;
    scratch(w);
    view(w, s.viewW, s.viewH);
    var start = HEROES[hero] || HEROES.wanderer;
    s.need = xpNeed(c, 1);
    addWeapon(w, start.weapon);
    stats(w);
    s.hp = s.hmax;
    return w;
  }

  /** A data card (from the model's stock) as the run uses it, or null when it is not one. */
  function cleanCard(card, c) {
    if (!card || typeof card !== 'object' || !Array.isArray(card.effects)) return null;
    var effects = [];
    card.effects.slice(0, 3).forEach(function (e) {
      if (!e || BRICKS.indexOf(e.stat) < 0) return;
      var v = Number(e.value);
      if (!(v === v) || v === 0) return;
      var lim = e.stat === 'projectiles' || e.stat === 'armor' ? 1 : e.stat === 'luck' ? 20 : e.stat === 'hp' ? 40 : e.stat === 'regen' ? 1 : c.brickMax;
      effects.push({ stat: e.stat, value: Math.max(-lim, Math.min(lim, v)) });
    });
    if (!effects.length) return null;
    return {
      title: String(card.title || 'Карточка').slice(0, 30), rarity: rarityIndex(card.rarity), max: Math.max(1, Math.min(5, Math.round(Number(card.max) || 3))),
      effects: effects
    };
  }

  var HEROES = {
    wanderer: { weapon: 'spark' },
    keeper: { weapon: 'blades' },
    bomber: { weapon: 'seeds' },
    hunter: { weapon: 'needles' },
    mechanic: { weapon: 'drones' },
    hermit: { weapon: 'pulse' }
  };

  function xpNeed(c, level) { return c.xpBase + c.xpLin * level + c.xpSq * level * level; }

  /** The size of the world the screen shows (the same area on every screen: view.area). */
  function view(w, width, height) {
    var c = w.c;
    var aspect = width > 0 && height > 0 ? width / height : c.refW / c.refH;
    aspect = Math.max(0.3, Math.min(3, aspect));
    w.s.vw = Math.sqrt(c.area * aspect);
    w.s.vh = Math.sqrt(c.area / aspect);
    w.s.viewW = width || 0;
    w.s.viewH = height || 0;
    return { w: w.s.vw, h: w.s.vh };
  }

  function stormOn(w, n) { return w.s.storm >= n; }
  function ruleOn(w, id) { return w.s.rules.indexOf(id) >= 0; }

  // ---- the hero's numbers from the workshop, the hero, passives and data cards ---------------------

  function stats(w) {
    var c = w.c;
    var s = w.s;
    var p = s.ps;
    var lv = function (id) { return p[id] || 0; };
    var st = s.stat;
    var brick = { damage: 0, cooldown: 0, projectiles: 0, area: 0, duration: 0, speed: 0, pickup: 0, xp: 0, luck: 0, regen: 0, armor: 0, hp: 0, crit: 0, slow: 0, freeze: 0 };
    s.xcards.forEach(function (card) {
      var l = p[card.id] || 0;
      if (!l) return;
      card.effects.forEach(function (e) { brick[e.stat] += e.value * l; });
    });
    var hpMult = 1;
    var speedMult = 1;
    var areaMult = 1;
    if (s.hero === 'keeper') {
      hpMult += c.heroes.keeperHp;
      speedMult += c.heroes.keeperSpeed;
    } else if (s.hero === 'bomber') {
      areaMult += c.heroes.bomberArea;
      hpMult += c.heroes.bomberHp;
    } else if (s.hero === 'hunter') {
      speedMult += c.heroes.hunterSpeed;
    }
    if (ruleOn(w, 'glass')) hpMult *= 1 - c.daily.glass;
    st.dmg = (1 + s.ws.power * c.ws.power) * (1 + lv('sharp') * c.p.sharp.v) * (1 + brick.damage) * (ruleOn(w, 'glass') ? 1 + c.daily.glass : 1);
    var oldMax = s.hmax;
    s.hmax = Math.max(1, (c.heroHp + s.ws.vitality * c.ws.vitality + brick.hp) * hpMult * (1 + lv('core') * c.p.core.v));
    if (oldMax > 0 && s.hmax > oldMax) s.hp += s.hmax - oldMax;
    if (s.hp > s.hmax) s.hp = s.hmax;
    st.armor = s.ws.armor * c.ws.armor + lv('armor') * c.p.armor.v + brick.armor;
    st.speed = c.heroSpeed * (1 + s.ws.speed * c.ws.speed) * (1 + lv('soles') * c.p.soles.v) * (1 + brick.speed) * speedMult * (ruleOn(w, 'heavy') ? 1 - c.daily.heavy : 1);
    st.pickup = c.heroPickup * (1 + s.ws.attract * c.ws.attract) * (1 + lv('magnet') * c.p.magnet.v) * (1 + brick.pickup) * (ruleOn(w, 'pull') ? 1 + c.daily.pull : 1);
    st.luck = s.ws.luck * c.ws.luck + lv('coin') * c.p.coin.v + brick.luck;
    st.xp = (1 + s.ws.xp * c.ws.xp) * (1 + lv('pupil') * c.p.pupil.v) * (1 + brick.xp) * (s.mode === 'sprint' ? c.sprintXp : 1) *
      (stormOn(w, 9) ? 1 - c.storm.xp : 1) * (ruleOn(w, 'giants') ? 1 + c.daily.giants * 0.75 : 1) * (ruleOn(w, 'heavy') ? 1 + c.daily.heavy : 1);
    st.cd = Math.max(0.3, (1 - lv('accel') * c.p.accel.v) * (1 - brick.cooldown));
    st.area = areaMult * (1 + lv('lens') * c.p.lens.v) * (1 + brick.area);
    st.dur = (1 + lv('fuse') * c.p.fuse.v) * (1 + brick.duration);
    st.proj = lv('multi') * Math.round(c.p.multi.v) + Math.floor(brick.projectiles + 1e-9) + (ruleOn(w, 'many') ? 1 : 0);
    // Beams of «Маяк» and rings of «Импульс» are zones, not shots: they get only a share of the extra ones.
    st.projZone = Math.floor(st.proj * c.multiZones + 1e-9);
    st.regen = lv('regen') * c.p.regen.v + brick.regen;
    st.thorns = lv('thorns') * c.p.thorns.v;
    st.crit = lv('scope') * c.p.scope.v + st.luck * c.critLuck + brick.crit;
    st.slowHit = Math.max(0, Math.min(1, brick.slow));
    st.freezeHit = Math.max(0, Math.min(1, brick.freeze));
    st.drones = s.hero === 'mechanic' ? c.heroes.mechanicDrones : 0;
    st.gemMult = s.hero === 'hermit' ? 1 + c.heroes.hermitGems : 1;
  }

  // ---- items ------------------------------------------------------------------------------------------

  function weaponOf(w, id) {
    for (var i = 0; i < w.s.wp.length; i++) if (w.s.wp[i].id === id) return w.s.wp[i];
    return null;
  }

  function addWeapon(w, id) {
    var have = weaponOf(w, id);
    if (have) {
      have.lvl = Math.min(w.c.wMax, have.lvl + 1);
      return have;
    }
    var wp = { id: id, lvl: 1, cd: 0.3, ts: -1, tg: 0, rt: 0, a: 0, b: 0, n: 0, fu: '' };
    w.s.wp.push(wp);
    return wp;
  }

  function itemMax(w, kind, id) {
    if (kind === 'w') return w.c.wMax;
    if (kind === 'x') {
      var card = xcard(w, id);
      return card ? card.max : 1;
    }
    return w.c.p[id] ? w.c.p[id].max : w.c.pMax;
  }

  function xcard(w, id) {
    for (var i = 0; i < w.s.xcards.length; i++) if (w.s.xcards[i].id === id) return w.s.xcards[i];
    return null;
  }

  function levelOf(w, kind, id) {
    if (kind === 'w') {
      var wp = weaponOf(w, id);
      return wp ? wp.lvl : 0;
    }
    return w.s.ps[id] || 0;
  }

  function passiveCount(w) {
    var n = 0;
    for (var k in w.s.ps) if (w.s.ps[k] > 0) n++;
    return n;
  }

  function rarityOf(w, kind, id) {
    if (kind === 'w') return w.c.w[id].rarity;
    if (kind === 'x') {
      var card = xcard(w, id);
      return card ? card.rarity : 0;
    }
    return w.c.p[id].rarity;
  }

  /** The cards one could get now: [{k, id, to, r}] (upgrades of what is owned, new items while slots are free). */
  function candidates(w, upgradesOnly) {
    var s = w.s;
    var out = [];
    var i;
    for (i = 0; i < s.wp.length; i++) {
      var wp = s.wp[i];
      if (wp.lvl < w.c.wMax && !s.banned[wp.id]) out.push({ k: 'w', id: wp.id, to: wp.lvl + 1, r: w.c.w[wp.id].rarity, up: true });
    }
    for (var id in s.ps) {
      var l = s.ps[id];
      var kind = id.charAt(0) === 'x' && xcard(w, id) ? 'x' : 'p';
      if (l > 0 && l < itemMax(w, kind, id) && !s.banned[id]) out.push({ k: kind, id: id, to: l + 1, r: rarityOf(w, kind, id), up: true });
    }
    if (upgradesOnly) return out;
    if (s.wp.length < w.c.slotsW) {
      for (i = 0; i < WEAPONS.length; i++) {
        if (!weaponOf(w, WEAPONS[i]) && !s.banned[WEAPONS[i]]) out.push({ k: 'w', id: WEAPONS[i], to: 1, r: w.c.w[WEAPONS[i]].rarity, up: false });
      }
    }
    if (passiveCount(w) < w.c.slotsP) {
      for (i = 0; i < PASSIVES.length; i++) {
        if (!s.ps[PASSIVES[i]] && !s.banned[PASSIVES[i]]) out.push({ k: 'p', id: PASSIVES[i], to: 1, r: w.c.p[PASSIVES[i]].rarity, up: false });
      }
      for (i = 0; i < s.xcards.length; i++) {
        var x = s.xcards[i];
        if (!s.ps[x.id] && !s.banned[x.id]) out.push({ k: 'x', id: x.id, to: 1, r: x.rarity, up: false });
      }
    }
    return out;
  }

  function cardWeight(w, card) {
    var luck = w.s.stat.luck || 0;
    return w.c.rarityW[card.r] * (1 + luck * w.c.luckShift * card.r);
  }

  function drawCards(w, n, upgradesOnly) {
    var rng = w.rng;
    var pool = candidates(w, upgradesOnly);
    var picked = [];
    while (picked.length < n && pool.length) {
      var total = 0;
      var i;
      for (i = 0; i < pool.length; i++) total += cardWeight(w, pool[i]);
      var x = rng.next() * total;
      var at = pool.length - 1;
      for (i = 0; i < pool.length; i++) {
        x -= cardWeight(w, pool[i]);
        if (x < 0) {
          at = i;
          break;
        }
      }
      picked.push(pool[at]);
      pool.splice(at, 1);
    }
    if (!upgradesOnly && w.c.guarantee && picked.length) {
      var hasUp = false;
      for (var j = 0; j < picked.length; j++) if (picked[j].up) hasUp = true;
      var ups = pool.filter(function (cd) { return cd.up; });
      if (!hasUp && ups.length) picked[picked.length - 1] = ups[Math.floor(rng.next() * ups.length)];
    }
    return picked;
  }

  function openChoice(w) {
    var cards = drawCards(w, 3, false);
    if (!cards.length) cards = [{ k: 'gold', id: 'gold', to: 0, r: 0, up: false }, { k: 'heal', id: 'heal', to: 0, r: 0, up: false }];
    w.s.choice = { cards: cards, at: w.s.t };
    fx(w, FX_LEVEL, w.s.hx, w.s.hy, w.s.level, 0);
  }

  function applyCard(w, card) {
    var s = w.s;
    if (card.k === 'w') {
      var wp = addWeapon(w, card.id);
      if (card.to > 1) wp.lvl = Math.min(w.c.wMax, Math.max(wp.lvl, card.to));
    } else if (card.k === 'p' || card.k === 'x') {
      s.ps[card.id] = Math.min(itemMax(w, card.k, card.id), (s.ps[card.id] || 0) + 1);
      if (card.id === 'multi' && s.ps.multi >= 2) s.multiTaken = 1;
    } else if (card.k === 'gold') {
      s.gold += w.c.skipGold;
    } else if (card.k === 'heal') {
      s.hp = Math.min(s.hmax, s.hp + w.c.drop.heal);
    }
    stats(w);
    tryFreeFusion(w);
  }

  function afterChoice(w) {
    var s = w.s;
    s.choice = null;
    s.pending = Math.max(0, s.pending - 1);
    if (s.pending > 0) openChoice(w);
  }

  /** Takes card i of the current choice. */
  function pick(w, i) {
    var ch = w.s.choice;
    if (!ch || !ch.cards[i]) return false;
    applyCard(w, ch.cards[i]);
    afterChoice(w);
    return true;
  }

  /** New three cards for a charge of «Перебросить». */
  function reroll(w) {
    var s = w.s;
    if (!s.choice || s.rerolls <= 0) return false;
    s.rerolls--;
    s.choice.cards = drawCards(w, 3, false);
    if (!s.choice.cards.length) s.choice.cards = [{ k: 'gold', id: 'gold', to: 0, r: 0, up: false }];
    return true;
  }

  /** «Убрать»: the card's item leaves the pool till the end of the run; another card takes its place. */
  function banish(w, i) {
    var s = w.s;
    if (!s.choice || s.banishes <= 0 || !s.choice.cards[i]) return false;
    var card = s.choice.cards[i];
    if (card.k === 'gold' || card.k === 'heal') return false;
    s.banishes--;
    s.banned[card.id] = true;
    var others = s.choice.cards.filter(function (cd, j) { return j !== i; });
    var pool = candidates(w, false).filter(function (cd) {
      for (var j = 0; j < others.length; j++) if (others[j].id === cd.id) return false;
      return true;
    });
    if (pool.length) {
      var total = 0;
      var k;
      for (k = 0; k < pool.length; k++) total += cardWeight(w, pool[k]);
      var x = w.rng.next() * total;
      var at = pool.length - 1;
      for (k = 0; k < pool.length; k++) {
        x -= cardWeight(w, pool[k]);
        if (x < 0) {
          at = k;
          break;
        }
      }
      s.choice.cards[i] = pool[at];
    } else {
      s.choice.cards.splice(i, 1);
      if (!s.choice.cards.length) s.choice.cards = [{ k: 'gold', id: 'gold', to: 0, r: 0, up: false }];
    }
    return true;
  }

  /** «Пропустить»: no card, skip.gold of gold instead. */
  function skip(w) {
    if (!w.s.choice) return false;
    w.s.gold += w.c.skipGold;
    afterChoice(w);
    return true;
  }

  function fusable(w) {
    var s = w.s;
    for (var i = 0; i < FUSIONS.length; i++) {
      var f = FUSIONS[i];
      var wp = weaponOf(w, f.weapon);
      if (wp && !wp.fu && wp.lvl >= w.c.wMax && (s.ps[f.passive] || 0) > 0) return { wp: wp, f: f };
    }
    return null;
  }

  function fuse(w, found) {
    found.wp.fu = found.f.id;
    found.wp.cd = 0.2;
    w.s.fusions.push(found.f.id);
    note(w, 'fusion', found.f.id);
  }

  function tryFreeFusion(w) {
    if (w.s.freeFusions <= 0) return;
    var found = fusable(w);
    if (!found) return;
    w.s.freeFusions--;
    fuse(w, found);
  }

  /** A chest from an elite or a boss: a fusion when one is ready, otherwise 1–3 upgrades. */
  function openChest(w) {
    var found = fusable(w);
    if (found) {
      fuse(w, found);
      return;
    }
    var luck = w.s.stat.luck || 0;
    var n = 1;
    var roll = w.rng.next();
    if (roll < w.c.drop.three + luck * w.c.drop.chestLuck * 0.5) n = 3;
    else if (roll < w.c.drop.two + luck * w.c.drop.chestLuck) n = 2;
    var got = [];
    for (var i = 0; i < n; i++) {
      var cards = drawCards(w, 1, true);
      if (!cards.length) break;
      applyCard(w, cards[0]);
      got.push(cards[0].id + ':' + cards[0].to);
    }
    if (!got.length) {
      w.s.gold += w.c.skipGold * 2;
      got.push('gold:' + w.c.skipGold * 2);
    }
    note(w, 'chest', got.join(','));
    stats(w);
  }

  function note(w, kind, text) {
    // The last 12 notes for the screen; noteN counts them all, so the screen knows which are new.
    w.s.noteN = (w.s.noteN || 0) + 1;
    w.s.notes.push({ k: kind, v: String(text), t: Math.round(w.s.t * 10) / 10, n: w.s.noteN });
    if (w.s.notes.length > 12) w.s.notes.shift();
  }

  // ---- effects for the screen ----------------------------------------------------------------------

  function fx(w, k, x, y, a, b) {
    var f = w.fx;
    var i = f.n % FX_SIZE;
    f.k[i] = k;
    f.x[i] = x;
    f.y[i] = y;
    f.a[i] = a;
    f.b[i] = b;
    f.n++;
  }

  // ---- the grid ---------------------------------------------------------------------------------------

  function buildGrid(w) {
    var c = w.c;
    var E = w.E;
    var g = w.grid;
    var cells = c.gw * c.gh;
    var i;
    for (i = 0; i <= cells; i++) g.start[i] = 0;
    for (i = 0; i < c.capE; i++) {
      if (!(E.flag[i] & F_ALIVE)) {
        g.cell[i] = -1;
        continue;
      }
      var cx = Math.floor(E.x[i] / c.cell);
      var cy = Math.floor(E.y[i] / c.cell);
      if (cx < 0) cx = 0;
      else if (cx >= c.gw) cx = c.gw - 1;
      if (cy < 0) cy = 0;
      else if (cy >= c.gh) cy = c.gh - 1;
      var cell = cy * c.gw + cx;
      g.cell[i] = cell;
      g.start[cell + 1]++;
    }
    for (i = 0; i < cells; i++) {
      g.start[i + 1] += g.start[i];
      g.fill[i] = g.start[i];
    }
    for (i = 0; i < c.capE; i++) {
      var ce = g.cell[i];
      if (ce >= 0) g.items[g.fill[ce]++] = i;
    }
  }

  /** Living enemies whose cells touch the square (x ± R, y ± R): their slots into w.q; returns how many. */
  function query(w, x, y, R) {
    var c = w.c;
    var g = w.grid;
    var x0 = Math.floor((x - R) / c.cell);
    var x1 = Math.floor((x + R) / c.cell);
    var y0 = Math.floor((y - R) / c.cell);
    var y1 = Math.floor((y + R) / c.cell);
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= c.gw) x1 = c.gw - 1;
    if (y1 >= c.gh) y1 = c.gh - 1;
    var n = 0;
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var cell = cy * c.gw + cx;
        for (var k = g.start[cell]; k < g.start[cell + 1]; k++) {
          var i = g.items[k];
          if (w.E.flag[i] & F_ALIVE) w.q[n++] = i;
        }
      }
    }
    return n;
  }

  function inView(w, x, y, pad) {
    var s = w.s;
    var left = s.hx - s.vw / 2 - pad;
    var top = s.hy - s.vh * w.c.camY - pad;
    return x >= left && x <= left + s.vw + 2 * pad && y >= top && y <= top + s.vh + 2 * pad;
  }

  /**
   * The nearest living enemy to (x, y) within R that is on the screen: rings of cells from the
   * point outward until a ring cannot hold anything nearer. elite: elites and bosses first.
   */
  function nearest(w, x, y, R, elite) {
    var c = w.c;
    var g = w.grid;
    var E = w.E;
    var cx = Math.floor(x / c.cell);
    var cy = Math.floor(y / c.cell);
    var best = -1;
    var bestD = R * R;
    var bestE = -1;
    var bestED = R * R;
    var kmax = Math.ceil(R / c.cell) + 1;
    var pad = c.viewPad;
    for (var k = 0; k <= kmax; k++) {
      var reach = (k - 1) * c.cell;
      if (k > 1 && reach * reach > (elite && bestE >= 0 ? bestED : bestD) && (best >= 0 || reach > R)) break;
      for (var dy = -k; dy <= k; dy++) {
        var yy = cy + dy;
        if (yy < 0 || yy >= c.gh) continue;
        var edge = dy === -k || dy === k;
        for (var dx = -k; dx <= k; dx += edge ? 1 : 2 * k) {
          var xx = cx + dx;
          if (xx >= 0 && xx < c.gw) {
            var cell = yy * c.gw + xx;
            for (var j = g.start[cell]; j < g.start[cell + 1]; j++) {
              var i = g.items[j];
              if (!(E.flag[i] & F_ALIVE)) continue;
              var ddx = E.x[i] - x;
              var ddy = E.y[i] - y;
              var d = ddx * ddx + ddy * ddy;
              if (d > R * R || !inView(w, E.x[i], E.y[i], pad)) continue;
              if (d < bestD) {
                bestD = d;
                best = i;
              }
              if (elite && (E.flag[i] & (F_ELITE | F_BOSS)) && d < bestED) {
                bestED = d;
                bestE = i;
              }
            }
          }
          if (k === 0) break;
        }
      }
    }
    return elite && bestE >= 0 ? bestE : best;
  }

  function toughest(w, x, y, R) {
    var n = query(w, x, y, R);
    var E = w.E;
    var best = -1;
    var hp = -1;
    for (var k = 0; k < n; k++) {
      var i = w.q[k];
      var dx = E.x[i] - x;
      var dy = E.y[i] - y;
      if (dx * dx + dy * dy > R * R || !inView(w, E.x[i], E.y[i], w.c.viewPad)) continue;
      if (E.hp[i] > hp) {
        hp = E.hp[i];
        best = i;
      }
    }
    return best;
  }

  function randomIn(w, x, y, R) {
    var n = query(w, x, y, R);
    var E = w.E;
    var m = 0;
    for (var k = 0; k < n; k++) {
      var i = w.q[k];
      var dx = E.x[i] - x;
      var dy = E.y[i] - y;
      if (dx * dx + dy * dy > R * R || !inView(w, E.x[i], E.y[i], w.c.viewPad)) continue;
      w.q[m++] = i;
    }
    if (!m) return -1;
    return w.q[Math.floor(w.rng.next() * m)];
  }

  function alive(w, i, gen) { return i >= 0 && (w.E.flag[i] & F_ALIVE) && w.E.gen[i] === gen; }

  /** The weapon's held target, kept while it lives and is in reach; a new one at most every retargetMs. */
  function target(w, wp, rule, R) {
    var E = w.E;
    var s = w.s;
    if (alive(w, wp.ts, wp.tg)) {
      var dx = E.x[wp.ts] - s.hx;
      var dy = E.y[wp.ts] - s.hy;
      if (dx * dx + dy * dy <= R * R && inView(w, E.x[wp.ts], E.y[wp.ts], w.c.viewPad)) return wp.ts;
    }
    if (wp.rt > 0) return -1;
    wp.rt = w.c.retarget;
    var i = rule === 'toughest' ? toughest(w, s.hx, s.hy, R) : rule === 'random' ? randomIn(w, s.hx, s.hy, R) : nearest(w, s.hx, s.hy, R, w.c.aimElite);
    wp.ts = i;
    wp.tg = i >= 0 ? E.gen[i] : 0;
    return i;
  }

  /** Where to aim a projectile of `speed` from (sx, sy) to meet enemy i (a linear guess). */
  var aim = { x: 0, y: 0 };
  function lead(w, i, sx, sy, speed) {
    var E = w.E;
    var dx = E.x[i] - sx;
    var dy = E.y[i] - sy;
    var t = Math.sqrt(dx * dx + dy * dy) / Math.max(1, speed);
    if (t > 1.5) t = 1.5;
    aim.x = E.x[i] + E.mx[i] * t;
    aim.y = E.y[i] + E.my[i] * t;
    return aim;
  }

  // ---- enemies ----------------------------------------------------------------------------------------

  function hpScale(w) {
    var s = w.s;
    // Storm 11: the health of the enemies grows faster through the run.
    var m = 1 + (w.c.hpPerMinute + (stormOn(w, 11) ? w.c.storm.hpGrowth : 0)) * (s.T / 60);
    if (stormOn(w, 1)) m *= 1 + w.c.storm.hp;
    if (ruleOn(w, 'giants')) m *= 1 + w.c.daily.giants;
    return m;
  }

  function speedScale(w) {
    var m = 1;
    if (stormOn(w, 6)) m *= 1 + w.c.storm.speed;
    if (ruleOn(w, 'haste')) m *= 1 + w.c.daily.haste;
    return m;
  }

  function dmgScale(w) {
    var m = 1 + w.c.dmgPerMinute * Math.min(w.s.T, w.c.runSeconds * 2) / 60;
    return stormOn(w, 8) ? m * (1 + w.c.storm.dmg) : m;
  }

  /**
   * At the cap a new enemy takes the place of the farthest ordinary one off the screen (it is
   * moved, not killed): so the stream keeps coming, and running from a crowd without killing it
   * does not empty the edges.
   */
  function recycle(w) {
    var c = w.c;
    var s = w.s;
    var E = w.E;
    var best = -1;
    var bd = c.recycle * c.recycle;
    for (var i = 0; i < c.capE; i++) {
      if (!(E.flag[i] & F_ALIVE) || (E.flag[i] & (F_ELITE | F_BOSS | F_WALL | F_RING)) || E.link[i] >= 0) continue;
      var dx = E.x[i] - s.hx;
      var dy = E.y[i] - s.hy;
      var d = dx * dx + dy * dy;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return -1;
    E.flag[best] = 0;
    s.ecount--;
    if (E.kind[best] === E_HIVE) s.hiveAlive = Math.max(0, s.hiveAlive - 1);
    return best;
  }

  function freeEnemy(w) {
    var c = w.c;
    var s = w.s;
    if (s.ecount >= c.capE) return recycle(w);
    for (var k = 0; k < c.capE; k++) {
      var i = (s.ecur + k) % c.capE;
      if (!(w.E.flag[i] & F_ALIVE)) {
        s.ecur = (i + 1) % c.capE;
        return i;
      }
    }
    return -1;
  }

  function flag0(E, i) { return E.flag[i]; }

  function spawnEnemy(w, kind, x, y, flags) {
    var i = freeEnemy(w);
    if (i < 0) return -1;
    var c = w.c;
    var E = w.E;
    var k = c.ek[kind];
    var boss = kind === E_HIVE || kind === E_REAPER;
    var elite = (flags & F_ELITE) !== 0;
    var hp = k.hp * (boss ? 1 : hpScale(w)) * (elite ? c.elite.hp : 1);
    if (kind === E_REAPER && stormOn(w, 15)) hp *= 1 + c.storm.reaperHp;
    E.x[i] = Math.max(k.r, Math.min(c.arenaW - k.r, x));
    E.y[i] = Math.max(k.r, Math.min(c.arenaH - k.r, y));
    E.vx[i] = 0;
    E.vy[i] = 0;
    E.mx[i] = 0;
    E.my[i] = 0;
    E.hp[i] = hp;
    E.max[i] = hp;
    E.r[i] = k.r * (elite ? c.elite.r : 1);
    E.spd[i] = k.spd * speedScale(w) * (kind === E_RAM && stormOn(w, 13) ? 1 + c.storm.ram : 1);
    E.dmg[i] = k.dmg * (elite ? c.elite.dmg : 1) * dmgScale(w);
    E.a[i] = 0;
    E.b[i] = 0;
    E.ang[i] = 0;
    E.face[i] = 0;
    E.slow[i] = 0;
    E.frz[i] = 0;
    E.cdBl[i] = 0;
    E.cdIce[i] = 0;
    E.cdBall[i] = 0;
    E.cdSk[i] = 0;
    E.cdTouch[i] = 0;
    E.sweep[i] = -1;
    E.kind[i] = kind;
    E.flag[i] = F_ALIVE | flags | (boss ? F_BOSS : 0);
    E.st[i] = 0;
    E.gen[i] = (E.gen[i] + 1) % 1000000;
    E.link[i] = -1;
    E.born[i] = w.s.t;
    w.s.ecount++;
    if (kind === E_SHOOTER) E.a[i] = c.shooter.cd * (0.5 + 0.5 * w.rng.next());
    if (kind === E_RAM) E.a[i] = c.ram.cd * 0.5;
    if (kind === E_HIVE) E.a[i] = 1;
    if (kind === E_REAPER) E.a[i] = 2;
    return i;
  }

  /** A point just outside the screen around the hero (side >= 0: on that side), inside the arena. */
  var spot = { x: 0, y: 0 };
  function edgePoint(w, side) {
    var s = w.s;
    var c = w.c;
    var m = c.spawnMargin;
    var vw = s.vw + 2 * m;
    var vh = s.vh + 2 * m;
    var left = s.hx - s.vw / 2 - m;
    var top = s.hy - s.vh * c.camY - m;
    for (var tries = 0; tries < 6; tries++) {
      var sd = side >= 0 ? side : Math.floor(w.rng.next() * 4);
      var u = w.rng.next();
      if (sd === 0) {
        spot.x = left + u * vw;
        spot.y = top;
      } else if (sd === 1) {
        spot.x = left + vw;
        spot.y = top + u * vh;
      } else if (sd === 2) {
        spot.x = left + u * vw;
        spot.y = top + vh;
      } else {
        spot.x = left;
        spot.y = top + u * vh;
      }
      spot.x = Math.max(16, Math.min(c.arenaW - 16, spot.x));
      spot.y = Math.max(16, Math.min(c.arenaH - 16, spot.y));
      if (!inView(w, spot.x, spot.y, -8)) return spot;
      side = -1;
    }
    return spot;
  }

  function waveIndex(w) {
    var s = w.s;
    var c = w.c;
    var n = Math.floor(s.T / c.waveSeconds);
    if (n < c.waves.length) return n;
    var cycle = c.endlessWaves;
    return cycle[(n - c.waves.length) % cycle.length];
  }

  function streamRate(w) {
    var s = w.s;
    var c = w.c;
    var r = c.spawnBase * (1 + c.spawnPerMinute * Math.min(s.T, c.runSeconds) / 60);
    if (s.T > c.runSeconds) r *= 1 + c.endlessStep * (Math.floor((s.T - c.runSeconds) / c.endlessEvery) + 1);
    if (stormOn(w, 7)) r *= 1 + c.storm.stream;
    if (ruleOn(w, 'swarm')) r *= 1 + c.daily.swarm;
    if (ruleOn(w, 'calm')) r *= 1 - c.daily.calm;
    if (s.hiveAlive > 0) r *= c.hive.stream;
    return r;
  }

  function spawnStream(w, dt) {
    var s = w.s;
    var c = w.c;
    var n = waveIndex(w);
    if (n !== s.wave) {
      s.wave = n;
      s.side = Math.floor(w.rng.next() * 4);
    }
    var wave = c.waves[n];
    s.spawnAcc += streamRate(w) * dt;
    if (s.spawnAcc > 6) s.spawnAcc = 6;
    while (s.spawnAcc >= 1) {
      s.spawnAcc -= 1;
      var x = w.rng.next() * wave.total;
      var kind = wave.kinds[wave.kinds.length - 1];
      for (var i = 0; i < wave.kinds.length; i++) {
        x -= wave.weights[i];
        if (x < 0) {
          kind = wave.kinds[i];
          break;
        }
      }
      if (ruleOn(w, 'bombers') && w.rng.next() < 0.12) kind = E_BOMBER;
      if (kind === E_BOMBER && stormOn(w, 10) && w.rng.next() < c.storm.bomber) kind = E_BOMBER;
      var p = edgePoint(w, wave.side ? s.side : -1);
      if (kind === E_RUNNER) {
        for (var k = 0; k < c.pack; k++) spawnEnemy(w, E_RUNNER, p.x + (w.rng.next() - 0.5) * 40, p.y + (w.rng.next() - 0.5) * 40, 0);
      } else {
        spawnEnemy(w, kind, p.x, p.y, 0);
      }
    }
  }

  function eliteKind(w) {
    var wave = w.c.waves[waveIndex(w)];
    var k = wave.kinds[Math.floor(w.rng.next() * wave.kinds.length)];
    return k === E_RUNNER ? E_CRAWLER : k;
  }

  /** The timeline: elites, «Кольцо», «Улей», «Стена», «Жнец», the end (scale seconds T). */
  function timeline(w) {
    var s = w.s;
    var c = w.c;
    var ev = s.events;
    var cycle = s.mode === 'endless' && s.T >= c.runSeconds ? Math.floor(s.T / c.runSeconds) : 0;
    var base = cycle * c.runSeconds;
    var tt = s.T - base;
    var key;
    for (var i = 0; i < c.eliteTimes.length; i++) {
      key = 'e' + cycle + ':' + i;
      if (tt >= c.eliteTimes[i] && !ev[key]) {
        ev[key] = 1;
        var count = (stormOn(w, 2) ? c.storm.elites : 1) * (ruleOn(w, 'elites') ? 2 : 1);
        for (var e = 0; e < count; e++) {
          var p = edgePoint(w, -1);
          spawnEnemy(w, eliteKind(w), p.x, p.y, F_ELITE);
        }
        note(w, 'elite', count);
      }
    }
    key = 'ring' + cycle;
    if (tt >= c.ringAt && !ev[key]) {
      ev[key] = 1;
      for (var r = 0; r < c.ringCount; r++) {
        var a = r / c.ringCount * TAU;
        var j = spawnEnemy(w, E_CRAWLER, s.hx + Math.cos(a) * c.ringRadius, s.hy + Math.sin(a) * c.ringRadius, F_RING);
        if (j >= 0) w.E.b[j] = s.t + c.ringSec;
      }
      note(w, 'ring', 1);
    }
    key = 'hive' + cycle;
    if (tt >= c.hiveAt && !ev[key]) {
      ev[key] = 1;
      spawnHive(w);
    }
    key = 'hive2' + cycle;
    if (stormOn(w, 12) && tt >= c.storm.hiveAt && !ev[key]) {
      ev[key] = 1;
      spawnHive(w);
    }
    key = 'wall' + cycle;
    if (tt >= c.wallAt && !ev[key]) {
      ev[key] = 1;
      spawnWall(w);
      note(w, 'wall', 1);
    }
    key = 'boss' + cycle;
    if (tt >= c.bossAt && !ev[key]) {
      ev[key] = 1;
      if (!(s.bossSlot >= 0 && alive(w, s.bossSlot, s.bossGen))) {
        var a2 = w.rng.next() * TAU;
        var b = spawnEnemy(w, E_REAPER, s.hx + Math.cos(a2) * 300, s.hy + Math.sin(a2) * 300, 0);
        if (b >= 0) {
          s.bossSlot = b;
          s.bossGen = w.E.gen[b];
          s.lastBoss = 'reaper';
          note(w, 'boss', 'reaper');
        }
      }
    }
    if (s.mode !== 'endless' && s.T >= c.runSeconds) {
      if (s.bossSlot >= 0 && alive(w, s.bossSlot, s.bossGen)) {
        // The Reaper leaves: a victory without its reward.
        kill(w, s.bossSlot, true);
        note(w, 'boss-left', 'reaper');
      }
      end(w, true, 'time');
    }
  }

  function spawnHive(w) {
    var s = w.s;
    var a = -Math.PI / 2 + (w.rng.next() - 0.5) * 1.6;
    var i = spawnEnemy(w, E_HIVE, s.hx + Math.cos(a) * 230, s.hy + Math.sin(a) * 230, 0);
    if (i >= 0) {
      s.hiveAlive++;
      note(w, 'boss', 'hive');
    }
  }

  function spawnWall(w) {
    var s = w.s;
    var c = w.c;
    var side = Math.floor(w.rng.next() * 4);
    var dir = side === 0 ? Math.PI / 2 : side === 1 ? Math.PI : side === 2 ? -Math.PI / 2 : 0;
    var span = Math.max(s.vw, s.vh) * 1.6;
    var cx = s.hx - Math.cos(dir) * (Math.max(s.vw, s.vh) * 0.75);
    var cy = s.hy - Math.sin(dir) * (Math.max(s.vw, s.vh) * 0.75);
    var px = -Math.sin(dir);
    var py = Math.cos(dir);
    for (var k = 0; k < c.wallCount; k++) {
      var off = (k / Math.max(1, c.wallCount - 1) - 0.5) * span;
      var i = spawnEnemy(w, E_CRAWLER, cx + px * off, cy + py * off, F_WALL);
      if (i >= 0) {
        w.E.ang[i] = dir;
        w.E.b[i] = s.t + c.wallSec;
      }
    }
  }

  function dropGem(w, x, y, value) {
    var c = w.c;
    var G = w.G;
    var s = w.s;
    if (s.gcount >= c.capG) {
      // Over the cap: into one large crystal by the hero.
      if (s.big.v <= 0) {
        s.big.x = s.hx + Math.cos(s.face) * 70;
        s.big.y = s.hy + Math.sin(s.face) * 70;
      }
      s.big.v += value;
      return;
    }
    for (var i = 0; i < c.capG; i++) {
      if (!G.st[i]) {
        G.x[i] = x;
        G.y[i] = y;
        G.v[i] = value;
        G.st[i] = 1;
        s.gcount++;
        return;
      }
    }
  }

  function dropPickup(w, kind, x, y, value) {
    var K = w.K;
    for (var i = 0; i < w.c.capK; i++) {
      if (!K.on[i]) {
        K.on[i] = 1;
        K.kind[i] = kind;
        K.x[i] = x;
        K.y[i] = y;
        K.v[i] = value || 0;
        K.life[i] = kind === K_CHEST ? 9999 : w.c.drop.life;
        return i;
      }
    }
    return -1;
  }

  function kill(w, i, quiet) {
    var E = w.E;
    var s = w.s;
    var c = w.c;
    var kind = E.kind[i];
    var flag = E.flag[i];
    var x = E.x[i];
    var y = E.y[i];
    E.flag[i] = 0;
    s.ecount--;
    if (quiet) {
      if (kind === E_HIVE) s.hiveAlive = Math.max(0, s.hiveAlive - 1);
      return;
    }
    s.kills++;
    fx(w, FX_KILL, x, y, kind, flag & F_ELITE ? 1 : 0);
    if (!(flag & F_NOXP)) {
      var value = c.ek[kind].xp * (1 + c.gemPerMinute * s.T / 60) * (flag & F_ELITE ? c.elite.xp : 1);
      dropGem(w, x, y, value * s.stat.gemMult);
    }
    if (kind === E_SPLITTER) {
      for (var k = 0; k < 2; k++) {
        var j = spawnEnemy(w, E_SPLITLING, x + (k ? 10 : -10), y + (k ? -6 : 6), 0);
        if (j >= 0) {
          E.vx[j] = (k ? 1 : -1) * 120;
          E.vy[j] = 0;
        }
      }
    }
    if (flag & F_ELITE) {
      s.elites++;
      dropPickup(w, K_CHEST, x, y, 0);
      if (s.hero !== 'hermit') gainXp(w, c.xpElite, true);
    }
    if (kind === E_HIVE) {
      s.hives++;
      s.hiveAlive = Math.max(0, s.hiveAlive - 1);
      dropPickup(w, K_CHEST, x, y, 0);
      if (s.hero !== 'hermit') gainXp(w, c.xpBoss * 0.5, true);
      note(w, 'killed', 'hive');
    }
    if (kind === E_REAPER) {
      s.bosses++;
      dropPickup(w, K_CHEST, x, y, 1);
      if (s.hero !== 'hermit') gainXp(w, c.xpBoss, true);
      note(w, 'killed', 'reaper');
      s.bossSlot = -1;
    }
    // Small drops: medkits, magnets, flashes, gold.
    var r = w.rng.next();
    var med = c.drop.medkit * (stormOn(w, 3) ? c.storm.medkits : 1) * (ruleOn(w, 'dry') ? 0 : 1);
    var luck = 1 + (s.stat.luck || 0) * 0.01;
    if (r < med * luck) dropPickup(w, K_MEDKIT, x, y, 0);
    else if (r < (med + c.drop.magnet) * luck) dropPickup(w, K_MAGNET, x, y, 0);
    else if (r < (med + c.drop.magnet + c.drop.flash) * luck) dropPickup(w, K_FLASH, x, y, 0);
    else if (r < (med + c.drop.magnet + c.drop.flash + c.drop.gold) * luck) {
      var gold = c.drop.goldMin + Math.floor(w.rng.next() * (c.drop.goldMax - c.drop.goldMin + 1));
      dropPickup(w, K_GOLD, x, y, gold * (ruleOn(w, 'rich') ? c.daily.rich : 1));
    }
  }

  /**
   * Damage to enemy i. type: 0 a projectile (a shield in front stops it), 1 an area or a beam
   * (passes shields). (sx, sy): where it came from.
   */
  function hurt(w, i, dmg, type, sx, sy) {
    var E = w.E;
    var s = w.s;
    if (!(E.flag[i] & F_ALIVE)) return false;
    if (type === 0 && E.kind[i] === E_SHIELD) {
      var fx0 = Math.cos(E.face[i]);
      var fy0 = Math.sin(E.face[i]);
      var dx = sx - E.x[i];
      var dy = sy - E.y[i];
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      if ((dx * fx0 + dy * fy0) / d >= w.c.shieldArc) {
        fx(w, FX_BLOCK, E.x[i], E.y[i], E.face[i], 0);
        return false;
      }
    }
    var crit = false;
    if (s.stat.crit > 0 && w.rng.next() < s.stat.crit) {
      dmg *= w.c.critMult;
      crit = true;
    }
    if (E.frz[i] > s.t) dmg *= w.c.f.frostMult;
    E.hp[i] -= dmg;
    s.hits++;
    fx(w, FX_HIT, E.x[i], E.y[i] - E.r[i], dmg, crit ? 1 : 0);
    if (s.stat.slowHit > 0 && w.rng.next() < s.stat.slowHit) E.slow[i] = s.t + 1.5;
    if (s.stat.freezeHit > 0 && !(E.flag[i] & F_BOSS) && w.rng.next() < s.stat.freezeHit * 0.25) E.frz[i] = s.t + 0.6;
    if (E.hp[i] <= 0) {
      kill(w, i, false);
      return true;
    }
    return false;
  }

  function knock(w, i, fromX, fromY, power) {
    var E = w.E;
    if (E.flag[i] & F_BOSS) return;
    var dx = E.x[i] - fromX;
    var dy = E.y[i] - fromY;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var m = E.flag[i] & F_ELITE ? 0.35 : 1;
    E.vx[i] += dx / d * power * m;
    E.vy[i] += dy / d * power * m;
  }

  function hurtHero(w, dmg) {
    var s = w.s;
    if (s.inv > 0 || s.over) return;
    var d = Math.max(1, dmg - (s.stat.armor || 0));
    s.hp -= d;
    s.inv = w.c.iframes;
    s.hurtAt = s.t;
    s.damage += d;
    fx(w, FX_HURT, s.hx, s.hy, d, 0);
    if (s.hp <= 0) {
      if (s.revives > 0) {
        s.revives--;
        s.hp = s.hmax * w.c.reviveHp;
        s.inv = w.c.reviveInv;
        note(w, 'revive', s.revives);
        var n = query(w, s.hx, s.hy, 160);
        for (var k = 0; k < n; k++) knock(w, w.q[k], s.hx, s.hy, 500);
        fx(w, FX_RING, s.hx, s.hy, 160, 1);
      } else {
        s.hp = 0;
        end(w, false, 'dead');
      }
    }
  }

  function end(w, won, why) {
    var s = w.s;
    if (s.over) return;
    s.over = true;
    s.won = won;
    s.ended = why;
    s.choice = null;
  }

  function freeProj(w) {
    var c = w.c;
    var s = w.s;
    if (s.pcount >= c.capP) return -1;
    for (var k = 0; k < c.capP; k++) {
      var i = (s.pcur + k) % c.capP;
      if (!w.P.on[i]) {
        s.pcur = (i + 1) % c.capP;
        return i;
      }
    }
    return -1;
  }

  function shoot(w, kind, x, y, vx, vy, life, dmg, r, pierce, slot) {
    var i = freeProj(w);
    if (i < 0) return -1;
    var P = w.P;
    P.x[i] = x;
    P.y[i] = y;
    P.vx[i] = vx;
    P.vy[i] = vy;
    P.life[i] = life;
    P.dmg[i] = dmg;
    P.r[i] = r;
    P.a[i] = 0;
    P.b[i] = 0;
    P.tx[i] = 0;
    P.ty[i] = 0;
    P.kind[i] = kind;
    P.on[i] = 1;
    P.pierce[i] = pierce;
    P.hit[i] = -1;
    P.ws[i] = slot;
    w.s.pcount++;
    return i;
  }

  function enemyShot(w, x, y, angle, speed, dmg, life, kind) {
    return shoot(w, kind, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, life, dmg, kind === P_ERING ? 7 : 8, 0, -1);
  }

  function enemies(w, dt) {
    var c = w.c;
    var s = w.s;
    var E = w.E;
    var hx = s.hx;
    var hy = s.hy;
    for (var i = 0; i < c.capE; i++) {
      if (!(E.flag[i] & F_ALIVE)) continue;
      var kind = E.kind[i];
      var x = E.x[i];
      var y = E.y[i];
      var dx = hx - x;
      var dy = hy - y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / d;
      var uy = dy / d;
      var spd = E.spd[i];
      if (E.slow[i] > s.t) spd *= 1 - c.w.ice.slow;
      var frozen = E.frz[i] > s.t;
      var mvx = 0;
      var mvy = 0;
      var flag = E.flag[i];
      E.face[i] = Math.atan2(dy, dx);
      // Left far behind: brought back to the edge of the screen (the crowd keeps up with the hero).
      if (d > c.leash && !(flag0(E, i) & (F_ELITE | F_BOSS | F_WALL | F_RING)) && E.link[i] < 0) {
        var back = edgePoint(w, -1);
        E.x[i] = back.x;
        E.y[i] = back.y;
        E.vx[i] = 0;
        E.vy[i] = 0;
        continue;
      }
      if (flag & F_RING) {
        if (s.t > E.b[i]) E.flag[i] &= ~F_RING;
        mvx = ux * c.ringSpeed;
        mvy = uy * c.ringSpeed;
      } else if (flag & F_WALL) {
        mvx = Math.cos(E.ang[i]) * c.wallSpeed;
        mvy = Math.sin(E.ang[i]) * c.wallSpeed;
        if (s.t > E.b[i]) E.flag[i] &= ~F_WALL;
        if (x < -40 || y < -40 || x > c.arenaW + 40 || y > c.arenaH + 40) {
          kill(w, i, true);
          continue;
        }
      } else if (kind === E_SHOOTER) {
        var range = c.shooter.range;
        if (d > range + 25) {
          mvx = ux * spd;
          mvy = uy * spd;
        } else if (d < range - 25) {
          mvx = -ux * spd * 0.8;
          mvy = -uy * spd * 0.8;
        } else {
          mvx = -uy * spd * 0.4;
          mvy = ux * spd * 0.4;
        }
        E.a[i] -= dt;
        if (E.st[i] === 0 && E.a[i] <= c.shooter.windup && d < range + 80) E.st[i] = 1;
        if (E.st[i] === 1) {
          mvx *= 0.3;
          mvy *= 0.3;
          if (E.a[i] <= 0) {
            var ang = Math.atan2(dy, dx);
            enemyShot(w, x, y, ang, c.shooter.ball, c.shooter.ballDmg * dmgScale(w), c.shooter.ballLife, P_EBALL);
            if (stormOn(w, 4)) enemyShot(w, x, y, ang + 0.18, c.shooter.ball, c.shooter.ballDmg * dmgScale(w), c.shooter.ballLife, P_EBALL);
            E.st[i] = 0;
            E.a[i] = c.shooter.cd;
            fx(w, FX_SHOT, x, y, ang, 1);
          }
        }
      } else if (kind === E_RAM) {
        var st = E.st[i];
        E.a[i] -= dt;
        if (st === 0) {
          mvx = ux * spd;
          mvy = uy * spd;
          if (d < c.ram.range && E.a[i] <= 0) {
            E.st[i] = 1;
            E.a[i] = c.ram.windup;
            E.ang[i] = Math.atan2(dy, dx);
          }
        } else if (st === 1) {
          if (E.a[i] <= 0) {
            E.st[i] = 2;
            E.a[i] = c.ram.time * (stormOn(w, 13) ? 1 + c.storm.ram : 1);
          }
        } else if (st === 2) {
          mvx = Math.cos(E.ang[i]) * c.ram.speed;
          mvy = Math.sin(E.ang[i]) * c.ram.speed;
          var nx = x + mvx * dt;
          var ny = y + mvy * dt;
          if (nx < E.r[i] || ny < E.r[i] || nx > c.arenaW - E.r[i] || ny > c.arenaH - E.r[i]) {
            // Into the wall: stunned.
            E.st[i] = 3;
            E.a[i] = c.ram.stun;
            mvx = 0;
            mvy = 0;
            fx(w, FX_BOOM, x, y, 20, 2);
          } else if (E.a[i] <= 0) {
            E.st[i] = 0;
            E.a[i] = c.ram.cd;
          }
        } else if (E.a[i] <= 0) {
          E.st[i] = 0;
          E.a[i] = c.ram.cd;
        }
      } else if (kind === E_LEECH) {
        var host = E.link[i];
        if (host >= 0 && (!(E.flag[host] & F_ALIVE) || E.gen[host] !== E.b[i])) {
          host = -1;
          E.link[i] = -1;
        }
        if (host >= 0) {
          E.x[i] = E.x[host] + Math.cos(E.ang[i]) * (E.r[host] + 2);
          E.y[i] = E.y[host] + Math.sin(E.ang[i]) * (E.r[host] + 2);
          var heal = c.leech.heal * (stormOn(w, 14) ? 1 + c.storm.leech : 1) * dt;
          E.hp[host] = Math.min(E.max[host], E.hp[host] + heal);
          E.mx[i] = E.mx[host];
          E.my[i] = E.my[host];
          continue;
        }
        E.a[i] -= dt;
        if (E.a[i] <= 0) {
          E.a[i] = 0.5;
          var n = query(w, x, y, c.leech.search);
          var best = -1;
          var bd = c.leech.search * c.leech.search;
          for (var q = 0; q < n; q++) {
            var j = w.q[q];
            if (j === i || E.kind[j] === E_LEECH || (E.flag[j] & (F_BOSS | F_WALL | F_RING))) continue;
            var ex = E.x[j] - x;
            var ey = E.y[j] - y;
            var dd = ex * ex + ey * ey;
            if (dd < bd) {
              bd = dd;
              best = j;
            }
          }
          E.ang[i] = best;
        }
        var tgt = E.ang[i] | 0;
        if (tgt >= 0 && tgt < c.capE && (E.flag[tgt] & F_ALIVE) && tgt !== i) {
          var lx = E.x[tgt] - x;
          var ly = E.y[tgt] - y;
          var ld = Math.sqrt(lx * lx + ly * ly) || 1;
          if (ld < E.r[tgt] + E.r[i] + 2) {
            E.link[i] = tgt;
            E.b[i] = E.gen[tgt];
            E.ang[i] = Math.atan2(-ly, -lx);
          } else {
            mvx = lx / ld * spd;
            mvy = ly / ld * spd;
          }
        } else {
          mvx = ux * spd;
          mvy = uy * spd;
        }
      } else if (kind === E_BOMBER) {
        if (E.st[i] === 0) {
          mvx = ux * spd;
          mvy = uy * spd;
          if (d < c.bomber.trigger + E.r[i]) {
            E.st[i] = 1;
            E.a[i] = c.bomber.fuse;
          }
        } else {
          mvx = ux * spd * 0.25;
          mvy = uy * spd * 0.25;
          E.a[i] -= dt;
          if (E.a[i] <= 0) {
            var R = c.bomber.radius * (stormOn(w, 10) ? 1 + c.storm.bomber : 1);
            fx(w, FX_BOOM, x, y, R, 1);
            if (d < R + c.heroR) hurtHero(w, c.bomber.dmg * dmgScale(w) * (flag & F_ELITE ? c.elite.dmg : 1) * (stormOn(w, 10) ? 1 + c.storm.bomber : 1));
            kill(w, i, true);
            continue;
          }
        }
      } else if (kind === E_HIVE) {
        E.a[i] -= dt;
        if (E.a[i] <= 0) {
          E.a[i] = c.hive.every;
          for (var h = 0; h < c.hive.count; h++) {
            var ha = h / c.hive.count * TAU + w.rng.next() * 0.3;
            var hj = spawnEnemy(w, E_CRAWLER, x + Math.cos(ha) * (E.r[i] + 14), y + Math.sin(ha) * (E.r[i] + 14), F_NOXP);
            if (hj >= 0) {
              E.vx[hj] = Math.cos(ha) * 90;
              E.vy[hj] = Math.sin(ha) * 90;
              E.flag[hj] &= ~F_NOXP;
            }
          }
          fx(w, FX_RING, x, y, E.r[i] + 20, 2);
        }
      } else if (kind === E_REAPER) {
        reaper(w, i, dt, d, ux, uy);
        mvx = E.mx[i];
        mvy = E.my[i];
      } else {
        mvx = ux * spd;
        mvy = uy * spd;
      }
      if (frozen) {
        mvx = 0;
        mvy = 0;
      }
      if (kind !== E_REAPER) {
        E.mx[i] = mvx;
        E.my[i] = mvy;
      }
      var kx = E.vx[i];
      var ky = E.vy[i];
      E.x[i] = x + (mvx + kx) * dt;
      E.y[i] = y + (mvy + ky) * dt;
      var decay = Math.exp(-6 * dt);
      E.vx[i] = kx * decay;
      E.vy[i] = ky * decay;
      if (!(E.flag[i] & F_WALL)) {
        var r = E.r[i];
        if (E.x[i] < r) E.x[i] = r;
        else if (E.x[i] > c.arenaW - r) E.x[i] = c.arenaW - r;
        if (E.y[i] < r) E.y[i] = r;
        else if (E.y[i] > c.arenaH - r) E.y[i] = c.arenaH - r;
      }
    }
  }

  /** «Жнец волн»: dashes; a circle of shooters; a ring of closing shots with a way out; (storm 5) all at once. */
  function reaper(w, i, dt, d, ux, uy) {
    var c = w.c;
    var s = w.s;
    var E = w.E;
    var R = c.reaper;
    var frac = E.hp[i] / E.max[i];
    var phase = frac > R.p2 ? 1 : frac > R.p3 ? 2 : (stormOn(w, 5) && frac <= R.p4) ? 4 : 3;
    if (phase !== E.st[i] >> 2 && E.st[i] >> 2 < phase) {
      E.st[i] = phase << 2;
      E.a[i] = phase === 2 ? 0.5 : 1.5;
      E.b[i] = 0;
      note(w, 'phase', phase);
    }
    var sub = E.st[i] & 3;
    var spd = E.spd[i];
    E.a[i] -= dt;
    E.b[i] -= dt;
    var dashing = phase === 1 || phase === 4;
    if (dashing && sub === 1) {
      E.mx[i] = 0;
      E.my[i] = 0;
      if (E.a[i] <= 0) {
        E.st[i] = (E.st[i] & ~3) | 2;
        E.a[i] = R.dashTime;
      }
      return;
    }
    if (dashing && sub === 2) {
      var sp = R.dashSpeed * (phase === 4 ? 1.25 : 1);
      E.mx[i] = Math.cos(E.ang[i]) * sp;
      E.my[i] = Math.sin(E.ang[i]) * sp;
      if (E.a[i] <= 0) {
        E.st[i] = E.st[i] & ~3;
        E.a[i] = R.dashEvery * (phase === 4 ? 0.7 : 1);
      }
      return;
    }
    E.mx[i] = ux * spd * (phase === 1 ? 1 : 0.6);
    E.my[i] = uy * spd * (phase === 1 ? 1 : 0.6);
    if (dashing && E.a[i] <= 0) {
      E.st[i] = (E.st[i] & ~3) | 1;
      E.a[i] = R.windup * (phase === 4 ? 0.7 : 1);
      E.ang[i] = Math.atan2(s.hy - E.y[i], s.hx - E.x[i]);
      fx(w, FX_LINE, E.x[i], E.y[i], E.ang[i], 3);
    }
    if (phase === 2 && E.a[i] <= 0) {
      E.a[i] = R.shootersEvery;
      for (var k = 0; k < R.shooters; k++) {
        var a = k / R.shooters * TAU;
        spawnEnemy(w, E_SHOOTER, s.hx + Math.cos(a) * 260, s.hy + Math.sin(a) * 260, 0);
      }
      fx(w, FX_RING, s.hx, s.hy, 260, 2);
    }
    if ((phase === 3 || phase === 4) && E.b[i] <= 0) {
      E.b[i] = R.ringEvery * (phase === 4 ? 0.8 : 1);
      var gapAt = Math.floor(w.rng.next() * R.ringCount);
      for (var r = 0; r < R.ringCount; r++) {
        var off = (r - gapAt + R.ringCount) % R.ringCount;
        if (off < R.ringGap) continue;
        var ra = r / R.ringCount * TAU;
        var px = s.hx + Math.cos(ra) * R.ringRadius;
        var py = s.hy + Math.sin(ra) * R.ringRadius;
        enemyShot(w, px, py, ra + Math.PI, R.ringSpeed, R.ringDmg * dmgScale(w), R.ringRadius / R.ringSpeed + 1.5, P_ERING);
      }
      fx(w, FX_RING, s.hx, s.hy, R.ringRadius, 3);
    }
  }

  /** Enemies that overlap push each other apart (only the neighbours in the grid). */
  function separate(w) {
    var c = w.c;
    var E = w.E;
    for (var i = 0; i < c.capE; i++) {
      if (!(E.flag[i] & F_ALIVE) || (E.flag[i] & F_BOSS) || E.link[i] >= 0) continue;
      var n = query(w, E.x[i], E.y[i], E.r[i] + 16);
      for (var k = 0; k < n; k++) {
        var j = w.q[k];
        if (j <= i || E.link[j] >= 0) continue;
        var dx = E.x[j] - E.x[i];
        var dy = E.y[j] - E.y[i];
        var rr = E.r[i] + E.r[j];
        var d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        var d = Math.sqrt(d2);
        var push = (rr - d) * 0.25 / d;
        if (E.flag[j] & F_BOSS) {
          E.x[i] -= dx * push * 2;
          E.y[i] -= dy * push * 2;
        } else {
          E.x[i] -= dx * push;
          E.y[i] -= dy * push;
          E.x[j] += dx * push;
          E.y[j] += dy * push;
        }
      }
    }
  }

  // ---- weapons ----------------------------------------------------------------------------------------

  function wdmg(w, wp) {
    var b = w.c.w[wp.id];
    return b.dmg * (1 + b.lvlDmg * (wp.lvl - 1)) * w.s.stat.dmg;
  }

  function wcount(w, wp, base) {
    var b = w.c.w[wp.id];
    return Math.max(1, base + countAtLevel(b.countAt, wp.lvl) + w.s.stat.proj);
  }

  function weapons(w, dt) {
    var s = w.s;
    var c = w.c;
    var st = s.stat;
    for (var n = 0; n < s.wp.length; n++) {
      var wp = s.wp[n];
      var b = c.w[wp.id];
      wp.rt -= dt;
      wp.cd -= dt;
      var id = wp.id;
      if (id === 'blades') {
        blades(w, wp, n, dt);
        continue;
      }
      if (id === 'ice') {
        ice(w, wp, dt);
        continue;
      }
      if (id === 'beacon') {
        beacon(w, wp, n, dt);
        continue;
      }
      if (wp.cd > 0) continue;
      var cd = (wp.fu === 'shower' ? c.f.showerCd : b.cd) * st.cd;
      var dmg = wdmg(w, wp);
      var i;
      var k;
      var count;
      if (id === 'spark') {
        i = target(w, wp, 'nearest', b.range);
        if (i < 0) continue;
        var base = Math.atan2(w.E.y[i] - s.hy, w.E.x[i] - s.hx);
        if (wp.fu === 'shower') {
          count = Math.max(1, 1 + st.proj);
          for (k = 0; k < count; k++) {
            var ang = base + (w.rng.next() - 0.5) * c.f.showerSpread;
            shoot(w, P_SPARK, s.hx, s.hy, Math.cos(ang) * b.speed, Math.sin(ang) * b.speed, b.life * st.dur, dmg * c.f.showerDmg, b.size * st.area, 0, n);
          }
        } else {
          count = wcount(w, wp, b.count);
          for (k = 0; k < count; k++) {
            var off = (k - (count - 1) / 2) * 0.14;
            shoot(w, P_SPARK, s.hx, s.hy, Math.cos(base + off) * b.speed, Math.sin(base + off) * b.speed, b.life * st.dur, dmg, b.size * st.area, 0, n);
          }
        }
      } else if (id === 'needles') {
        count = wcount(w, wp, b.count);
        var face = s.face;
        for (k = 0; k < count; k++) {
          var a = face + (count > 1 ? (k / (count - 1) - 0.5) * c.w.needles.spread : 0);
          shoot(w, P_NEEDLE, s.hx, s.hy, Math.cos(a) * b.speed, Math.sin(a) * b.speed, b.life * st.dur, dmg, b.size * st.area, c.w.needles.pierce, n);
        }
        if (wp.lvl >= c.w.needles.behindAt) {
          var back = face + Math.PI;
          var nb = c.w.needles.behind;
          for (k = 0; k < nb; k++) {
            var ab = back + (nb > 1 ? (k / (nb - 1) - 0.5) * c.w.needles.spread * 0.6 : 0);
            shoot(w, P_NEEDLE, s.hx, s.hy, Math.cos(ab) * b.speed, Math.sin(ab) * b.speed, b.life * st.dur, dmg, b.size * st.area, c.w.needles.pierce, n);
          }
        }
      } else if (id === 'mortar') {
        i = target(w, wp, 'random', b.range);
        if (i < 0) continue;
        if (wp.fu === 'raid') {
          // A strip of shells across the screen through the target.
          count = c.f.raidCount + st.proj;
          var row = w.E.y[i];
          for (k = 0; k < count; k++) {
            var rx = s.hx - s.vw / 2 + (k + 0.5) / count * s.vw;
            mortarShell(w, n, rx, row, dmg * c.f.raidDmg, b.area * st.area, c.w.mortar.flight * (0.85 + 0.03 * k));
          }
        } else {
          count = wcount(w, wp, b.count);
          for (k = 0; k < count; k++) {
            var j = k === 0 ? i : randomIn(w, s.hx, s.hy, b.range);
            if (j < 0) j = i;
            var p = lead(w, j, s.hx, s.hy, 300 / c.w.mortar.flight);
            mortarShell(w, n, p.x, p.y, dmg, b.area * st.area, c.w.mortar.flight);
          }
        }
      } else if (id === 'sickle') {
        i = target(w, wp, 'nearest', b.range);
        if (i < 0) continue;
        var pl = lead(w, i, s.hx, s.hy, b.speed);
        var sa = Math.atan2(pl.y - s.hy, pl.x - s.hx);
        count = wcount(w, wp, b.count);
        for (k = 0; k < count; k++) {
          var so = sa + (k - (count - 1) / 2) * 0.22;
          var pi = shoot(w, P_SICKLE, s.hx, s.hy, Math.cos(so) * b.speed, Math.sin(so) * b.speed, 6, dmg, b.size * st.area, 9999, n);
          if (pi >= 0) w.P.a[pi] = c.w.sickle.out * st.dur;
        }
      } else if (id === 'chain') {
        i = target(w, wp, 'nearest', b.range);
        if (i < 0) continue;
        count = Math.max(1, 1 + st.proj);
        for (k = 0; k < count; k++) {
          var start = k === 0 ? i : randomIn(w, s.hx, s.hy, b.range);
          if (start >= 0) chain(w, wp, start, dmg);
        }
      } else if (id === 'pulse') {
        pulse(w, wp, dmg);
        if (st.projZone > 0) wp.b = st.projZone;
      } else if (id === 'drones') {
        count = wcount(w, wp, b.count) + st.drones;
        var fired = false;
        for (k = 0; k < count; k++) {
          var da = wp.a + k / count * TAU;
          var dxp = s.hx + Math.cos(da) * c.w.drones.orbit;
          var dyp = s.hy + Math.sin(da) * c.w.drones.orbit;
          var t = randomIn(w, dxp, dyp, b.range);
          if (t < 0) continue;
          var ta = Math.atan2(w.E.y[t] - dyp, w.E.x[t] - dxp);
          shoot(w, P_DRONE, dxp, dyp, Math.cos(ta) * b.speed, Math.sin(ta) * b.speed, b.range / b.speed * 1.4, dmg, b.size * st.area, 0, n);
          fired = true;
        }
        if (!fired) continue;
      } else if (id === 'seeds') {
        count = wcount(w, wp, b.count);
        for (k = 0; k < count; k++) {
          var ma = k * 2.4;
          mine(w, s.hx + (k ? Math.cos(ma) * 22 : 0), s.hy + (k ? Math.sin(ma) * 22 : 0), dmg, b.area * st.area, b.life * st.dur);
        }
      } else if (id === 'ball') {
        i = target(w, wp, 'toughest', b.range);
        if (i < 0) continue;
        var bl = lead(w, i, s.hx, s.hy, b.speed);
        var ba = Math.atan2(bl.y - s.hy, bl.x - s.hx);
        count = wcount(w, wp, b.count);
        for (k = 0; k < count; k++) {
          var bo = ba + (k - (count - 1) / 2) * 0.35;
          shoot(w, P_BALL, s.hx, s.hy, Math.cos(bo) * b.speed, Math.sin(bo) * b.speed, b.life * st.dur, dmg, b.size * st.area, 9999, n);
        }
      }
      wp.cd = cd;
      fx(w, FX_SHOT, s.hx, s.hy, n, 0);
    }
    // Delayed extra rings of «Импульс» (one per extra projectile).
    for (var m = 0; m < s.wp.length; m++) {
      var pw = s.wp[m];
      if (pw.id === 'pulse' && pw.b > 0 && pw.cd < c.w.pulse.cd * st.cd - 0.25 * (st.projZone - pw.b + 1)) {
        pw.b--;
        pulse(w, pw, wdmg(w, pw));
      }
      if (pw.id === 'drones') pw.a += dt * 2.2;
    }
  }

  function mortarShell(w, slot, tx, ty, dmg, area, flight) {
    var s = w.s;
    var i = shoot(w, P_MORTAR, s.hx, s.hy, (tx - s.hx) / flight, (ty - s.hy) / flight, flight, dmg, area, 0, slot);
    if (i >= 0) {
      w.P.tx[i] = tx;
      w.P.ty[i] = ty;
      w.P.a[i] = flight;
    }
  }

  function mine(w, x, y, dmg, r, life) {
    var M = w.M;
    var s = w.s;
    var at = -1;
    var oldest = 1e9;
    for (var i = 0; i < w.c.capM; i++) {
      if (!M.on[i]) {
        at = i;
        break;
      }
      if (M.until[i] < oldest) {
        oldest = M.until[i];
        at = i;
      }
    }
    M.on[at] = 1;
    M.x[at] = x;
    M.y[at] = y;
    M.arm[at] = s.t + w.c.w.seeds.arm;
    M.until[at] = s.t + life;
    M.dmg[at] = dmg;
    M.r[at] = r;
  }

  function area(w, x, y, R, dmg, kb) {
    var n = query(w, x, y, R + 40);
    var E = w.E;
    var count = 0;
    for (var k = 0; k < n; k++) w.hitList[k] = w.q[k];
    for (var m = 0; m < n; m++) {
      var i = w.hitList[m];
      if (!(E.flag[i] & F_ALIVE)) continue;
      var dx = E.x[i] - x;
      var dy = E.y[i] - y;
      var rr = R + E.r[i];
      if (dx * dx + dy * dy > rr * rr) continue;
      count++;
      if (kb > 0) knock(w, i, x, y, kb);
      hurt(w, i, dmg, 1, x, y);
    }
    return count;
  }

  function pulse(w, wp, dmg) {
    var s = w.s;
    var b = w.c.w.pulse;
    var R = b.range * (1 + w.c.w.pulse.radiusLvl * (wp.lvl - 1)) * s.stat.area;
    area(w, s.hx, s.hy, R, dmg, w.c.w.pulse.knock);
    fx(w, FX_RING, s.hx, s.hy, R, 0);
  }

  function chain(w, wp, start, dmg) {
    var c = w.c;
    var s = w.s;
    var E = w.E;
    var net = wp.fu === 'net';
    var jumps = net ? c.f.netMax : c.w.chain.jumps + countAtLevel(c.w.chain.countAt, wp.lvl);
    var decay = net ? c.f.netDecay : c.w.chain.decay;
    var used = 0;
    var cur = start;
    var px = s.hx;
    var py = s.hy;
    var d = dmg;
    for (var j = 0; j <= jumps && cur >= 0; j++) {
      w.hitList[used++] = cur;
      var cx = E.x[cur];
      var cy = E.y[cur];
      fx(w, FX_LINE, px, py, cx, cy);
      hurt(w, cur, d, j === 0 ? 0 : 1, px, py);
      px = cx;
      py = cy;
      d *= 1 - decay;
      if (net && j > 0 && w.rng.next() > c.f.netChance) break;
      if (used >= c.capE) break;
      // The next: the nearest enemy not hit yet.
      var n = query(w, cx, cy, c.w.chain.jump);
      var best = -1;
      var bd = c.w.chain.jump * c.w.chain.jump;
      for (var k = 0; k < n; k++) {
        var i = w.q[k];
        var seen = false;
        for (var u = 0; u < used; u++) {
          if (w.hitList[u] === i) {
            seen = true;
            break;
          }
        }
        if (seen) continue;
        var dx = E.x[i] - cx;
        var dy = E.y[i] - cy;
        var dd = dx * dx + dy * dy;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      cur = best;
    }
  }

  function blades(w, wp, slot, dt) {
    var c = w.c;
    var s = w.s;
    var E = w.E;
    var b = c.w.blades;
    var count = Math.max(1, 2 + countAtLevel(b.countAt, wp.lvl) + s.stat.proj);
    var radiusSteps = (wp.lvl - 1) - countAtLevel(b.countAt, wp.lvl);
    var R = b.radius * (1 + b.radiusLvl * Math.max(0, radiusSteps)) * s.stat.area;
    var size = b.size * s.stat.area * (wp.fu === 'millstones' ? c.f.millSize : 1);
    var spin = b.spin;
    if (wp.fu === 'millstones') {
      var crowd = query(w, s.hx, s.hy, R + 40);
      spin *= Math.min(c.f.millSpin, 1 + crowd * c.f.millCrowd);
    }
    wp.a = (wp.a + spin * dt) % TAU;
    wp.n = count;
    wp.b = R;
    var dmg = wdmg(w, wp);
    var n = query(w, s.hx, s.hy, R + size + 30);
    for (var k = 0; k < n; k++) w.hitList[k] = w.q[k];
    for (var m = 0; m < n; m++) {
      var i = w.hitList[m];
      if (!(E.flag[i] & F_ALIVE) || E.cdBl[i] > s.t) continue;
      for (var q = 0; q < count; q++) {
        var a = wp.a + q / count * TAU;
        var bx = s.hx + Math.cos(a) * R;
        var by = s.hy + Math.sin(a) * R;
        var dx = E.x[i] - bx;
        var dy = E.y[i] - by;
        var rr = size + E.r[i];
        if (dx * dx + dy * dy <= rr * rr) {
          E.cdBl[i] = s.t + b.hitCd;
          hurt(w, i, dmg, 1, bx, by);
          break;
        }
      }
    }
  }

  function ice(w, wp, dt) {
    var c = w.c;
    var s = w.s;
    var b = c.w.ice;
    if (s.moving) s.iceAcc += dt;
    if (s.iceAcc >= b.every) {
      s.iceAcc = 0;
      var U = w.U;
      var at = -1;
      var oldest = 1e9;
      for (var i = 0; i < c.capU; i++) {
        if (!U.on[i] || U.until[i] <= s.t) {
          at = i;
          break;
        }
        if (U.until[i] < oldest) {
          oldest = U.until[i];
          at = i;
        }
      }
      U.on[at] = 1;
      U.x[at] = s.hx;
      U.y[at] = s.hy;
      U.r[at] = b.size * (1 + b.sizeLvl * (wp.lvl - 1)) * s.stat.area;
      U.until[at] = s.t + b.life * s.stat.dur;
    }
    wp.n = wdmg(w, wp);
  }

  function puddles(w) {
    var c = w.c;
    var s = w.s;
    var U = w.U;
    var E = w.E;
    var wp = weaponOf(w, 'ice');
    if (!wp) return;
    var frost = wp.fu === 'permafrost';
    var dmg = wp.n;
    for (var u = 0; u < c.capU; u++) {
      if (!U.on[u]) continue;
      if (U.until[u] <= s.t) {
        U.on[u] = 0;
        continue;
      }
      var R = U.r[u];
      var n = query(w, U.x[u], U.y[u], R + 30);
      for (var k = 0; k < n; k++) w.hitList[k] = w.q[k];
      for (var m = 0; m < n; m++) {
        var i = w.hitList[m];
        if (!(E.flag[i] & F_ALIVE)) continue;
        var dx = E.x[i] - U.x[u];
        var dy = E.y[i] - U.y[u];
        var rr = R + E.r[i] * 0.5;
        if (dx * dx + dy * dy > rr * rr) continue;
        E.slow[i] = s.t + c.w.ice.slowSec * s.stat.dur;
        if (frost && !(E.flag[i] & F_BOSS) && E.frz[i] < s.t - c.f.frostImmune) E.frz[i] = s.t + c.f.frost * s.stat.dur;
        if (E.cdIce[i] <= s.t) {
          E.cdIce[i] = s.t + c.w.ice.tick;
          hurt(w, i, dmg, 1, U.x[u], U.y[u]);
        }
      }
    }
  }

  function beacon(w, wp, slot, dt) {
    var c = w.c;
    var s = w.s;
    var E = w.E;
    var b = c.w.beacon;
    if (wp.b <= 0) {
      if (wp.cd > 0) return;
      // A new sweep: a full turn in w.beacon.sweep seconds.
      wp.b = c.w.beacon.sweep;
      wp.a = s.face;
      s.sweepId++;
      wp.n = s.sweepId;
      wp.cd = b.cd * s.stat.cd;
      fx(w, FX_SWEEP, s.hx, s.hy, slot, 0);
    }
    var turn = TAU / c.w.beacon.sweep;
    var a0 = wp.a;
    var a1 = a0 + turn * dt;
    wp.a = a1;
    wp.b -= dt;
    var beams = Math.max(1, 1 + countAtLevel(b.countAt, wp.lvl) + s.stat.projZone);
    var L = b.range * s.stat.area;
    var dmg = wdmg(w, wp);
    var n = query(w, s.hx, s.hy, L + 20);
    for (var k = 0; k < n; k++) w.hitList[k] = w.q[k];
    for (var m = 0; m < n; m++) {
      var i = w.hitList[m];
      if (!(E.flag[i] & F_ALIVE) || E.sweep[i] === wp.n) continue;
      var dx = E.x[i] - s.hx;
      var dy = E.y[i] - s.hy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > L + E.r[i]) continue;
      var ea = Math.atan2(dy, dx);
      var widen = Math.atan2(E.r[i] + 6, Math.max(d, 1));
      for (var q = 0; q < beams; q++) {
        var from = a0 + q / beams * TAU;
        var span = a1 - a0;
        var rel = ((ea - from) % TAU + TAU) % TAU;
        if (rel <= span + widen || rel >= TAU - widen) {
          E.sweep[i] = wp.n;
          hurt(w, i, dmg, 1, s.hx, s.hy);
          break;
        }
      }
    }
  }

  function projectiles(w, dt) {
    var c = w.c;
    var s = w.s;
    var P = w.P;
    var E = w.E;
    for (var p = 0; p < c.capP; p++) {
      if (!P.on[p]) continue;
      var kind = P.kind[p];
      P.life[p] -= dt;
      if (kind === P_SICKLE) {
        P.a[p] -= dt;
        if (P.a[p] <= 0) {
          // Back to the hero.
          var bx = s.hx - P.x[p];
          var by = s.hy - P.y[p];
          var bd = Math.sqrt(bx * bx + by * by) || 1;
          var sp = c.w.sickle.speed * 1.1;
          P.vx[p] = bx / bd * sp;
          P.vy[p] = by / bd * sp;
          if (bd < c.heroR + 6) {
            P.on[p] = 0;
            s.pcount--;
            continue;
          }
        }
      }
      P.x[p] += P.vx[p] * dt;
      P.y[p] += P.vy[p] * dt;
      var x = P.x[p];
      var y = P.y[p];
      if (kind === P_MORTAR) {
        if (P.life[p] <= 0) {
          area(w, P.tx[p], P.ty[p], P.r[p], P.dmg[p], 0);
          fx(w, FX_BOOM, P.tx[p], P.ty[p], P.r[p], 0);
          P.on[p] = 0;
          s.pcount--;
        }
        continue;
      }
      if (P.life[p] <= 0 || x < -50 || y < -50 || x > c.arenaW + 50 || y > c.arenaH + 50) {
        P.on[p] = 0;
        s.pcount--;
        continue;
      }
      if (kind === P_EBALL || kind === P_ERING) {
        var hx = s.hx - x;
        var hy = s.hy - y;
        var rr = c.heroR + P.r[p];
        if (hx * hx + hy * hy <= rr * rr) {
          hurtHero(w, P.dmg[p]);
          P.on[p] = 0;
          s.pcount--;
        }
        continue;
      }
      var R = P.r[p];
      var n = query(w, x, y, R + 30);
      for (var k = 0; k < n; k++) w.hitList[k] = w.q[k];
      for (var m = 0; m < n && P.on[p]; m++) {
        var i = w.hitList[m];
        if (!(E.flag[i] & F_ALIVE)) continue;
        var dx = E.x[i] - x;
        var dy = E.y[i] - y;
        var r2 = R + E.r[i];
        if (dx * dx + dy * dy > r2 * r2) continue;
        if (kind === P_BALL) {
          if (E.cdBall[i] > s.t) continue;
          E.cdBall[i] = s.t + c.w.ball.tick;
          hurt(w, i, P.dmg[p], 1, x, y);
          continue;
        }
        if (kind === P_SICKLE) {
          if (E.cdSk[i] > s.t) continue;
          E.cdSk[i] = s.t + c.w.sickle.hitCd;
          hurt(w, i, P.dmg[p], 0, x - P.vx[p] * 0.05, y - P.vy[p] * 0.05);
          continue;
        }
        if (P.hit[p] === i) continue;
        hurt(w, i, P.dmg[p], 0, x - P.vx[p] * 0.05, y - P.vy[p] * 0.05);
        P.hit[p] = i;
        if (P.pierce[p] > 0) P.pierce[p]--;
        else {
          P.on[p] = 0;
          s.pcount--;
        }
      }
    }
  }

  function mines(w) {
    var c = w.c;
    var s = w.s;
    var M = w.M;
    var E = w.E;
    for (var m = 0; m < c.capM; m++) {
      if (!M.on[m]) continue;
      if (M.until[m] <= s.t) {
        M.on[m] = 0;
        continue;
      }
      if (M.arm[m] > s.t) continue;
      var n = query(w, M.x[m], M.y[m], c.w.seeds.trigger + 30);
      var boom = false;
      for (var k = 0; k < n; k++) {
        var i = w.q[k];
        var dx = E.x[i] - M.x[m];
        var dy = E.y[i] - M.y[m];
        var rr = c.w.seeds.trigger + E.r[i];
        if (dx * dx + dy * dy <= rr * rr) {
          boom = true;
          break;
        }
      }
      if (boom) {
        M.on[m] = 0;
        area(w, M.x[m], M.y[m], M.r[m], M.dmg[m], 120);
        fx(w, FX_BOOM, M.x[m], M.y[m], M.r[m], 0);
      }
    }
  }

  function contact(w) {
    var c = w.c;
    var s = w.s;
    var E = w.E;
    var n = query(w, s.hx, s.hy, c.heroR + 60);
    for (var k = 0; k < n; k++) w.hitList[k] = w.q[k];
    for (var m = 0; m < n; m++) {
      var i = w.hitList[m];
      if (!(E.flag[i] & F_ALIVE)) continue;
      var dx = E.x[i] - s.hx;
      var dy = E.y[i] - s.hy;
      var rr = E.r[i] + c.heroR;
      if (dx * dx + dy * dy > rr * rr) continue;
      var dmg = E.dmg[i];
      if (E.kind[i] === E_RAM && E.st[i] === 2) dmg = c.ram.dmg * dmgScale(w) * (E.flag[i] & F_ELITE ? c.elite.dmg : 1);
      if (E.frz[i] > s.t) continue;
      hurtHero(w, dmg);
      if (s.stat.thorns > 0 && E.cdTouch[i] <= s.t) {
        E.cdTouch[i] = s.t + 0.5;
        hurt(w, i, dmg * s.stat.thorns, 1, s.hx, s.hy);
      }
      if (s.over) return;
    }
  }

  function gainXp(w, v, direct) {
    var s = w.s;
    s.xp += v * (direct ? 1 : s.stat.xp);
    while (s.xp >= s.need) {
      s.xp -= s.need;
      s.level++;
      s.need = xpNeed(w.c, s.level);
      s.pending++;
    }
  }

  function collect(w, dt) {
    var c = w.c;
    var s = w.s;
    var G = w.G;
    var K = w.K;
    var pick = s.stat.pickup;
    var grab = c.heroR + 6;
    var i;
    for (i = 0; i < c.capG; i++) {
      if (!G.st[i]) continue;
      var dx = s.hx - G.x[i];
      var dy = s.hy - G.y[i];
      var d2 = dx * dx + dy * dy;
      if (G.st[i] === 1 && d2 <= pick * pick) G.st[i] = 2;
      if (G.st[i] === 2) {
        var d = Math.sqrt(d2) || 1;
        if (d <= grab + 4) {
          G.st[i] = 0;
          s.gcount--;
          gainXp(w, G.v[i], false);
          continue;
        }
        var sp = Math.min(d / dt, c.gemSpeed);
        G.x[i] += dx / d * sp * dt;
        G.y[i] += dy / d * sp * dt;
      }
    }
    if (s.big.v > 0) {
      var bx = s.hx - s.big.x;
      var by = s.hy - s.big.y;
      var bd = Math.sqrt(bx * bx + by * by) || 1;
      if (bd <= pick) {
        if (bd <= grab + 6) {
          gainXp(w, s.big.v, false);
          s.big.v = 0;
        } else {
          var bs = Math.min(bd / dt, c.gemSpeed);
          s.big.x += bx / bd * bs * dt;
          s.big.y += by / bd * bs * dt;
        }
      }
    }
    for (i = 0; i < c.capK; i++) {
      if (!K.on[i]) continue;
      K.life[i] -= dt;
      if (K.life[i] <= 0) {
        K.on[i] = 0;
        continue;
      }
      var kx = s.hx - K.x[i];
      var ky = s.hy - K.y[i];
      var kd = Math.sqrt(kx * kx + ky * ky) || 1;
      if (kd <= grab + 8) {
        K.on[i] = 0;
        take(w, K.kind[i], K.v[i], K.x[i], K.y[i]);
      } else if (kd <= pick) {
        var ks = Math.min(kd / dt, c.gemSpeed * 0.8);
        K.x[i] += kx / kd * ks * dt;
        K.y[i] += ky / kd * ks * dt;
      }
    }
    if (s.pending > 0 && !s.choice && !s.over) openChoice(w);
  }

  function take(w, kind, v, x, y) {
    var s = w.s;
    var c = w.c;
    fx(w, FX_PICK, x, y, kind, 0);
    if (kind === K_MEDKIT) {
      s.hp = Math.min(s.hmax, s.hp + c.drop.heal);
      s.medkits++;
    } else if (kind === K_MAGNET) {
      for (var i = 0; i < c.capG; i++) if (w.G.st[i]) w.G.st[i] = 2;
      if (s.big.v > 0) {
        s.big.x = s.hx + 1;
        s.big.y = s.hy + 1;
      }
    } else if (kind === K_FLASH) {
      var E = w.E;
      for (var j = 0; j < c.capE; j++) {
        if ((E.flag[j] & F_ALIVE) && !(E.flag[j] & (F_ELITE | F_BOSS)) && inView(w, E.x[j], E.y[j], 0)) kill(w, j, false);
      }
      fx(w, FX_RING, s.hx, s.hy, Math.max(s.vw, s.vh), 4);
    } else if (kind === K_GOLD) {
      s.gold += v;
    } else if (kind === K_CHEST) {
      openChest(w);
    }
  }

  function hero(w, mx, my, dt) {
    var c = w.c;
    var s = w.s;
    var m = Math.sqrt(mx * mx + my * my);
    if (m > 1) {
      mx /= m;
      my /= m;
      m = 1;
    }
    s.moving = m > 0.15 ? 1 : 0;
    if (m > 0.15) {
      s.face = Math.atan2(my, mx);
      s.dirX = mx / m;
      s.dirY = my / m;
    }
    var sp = s.stat.speed;
    s.hx += mx * sp * dt;
    s.hy += my * sp * dt;
    // The edge of the arena pushes back softly, then holds.
    var e = c.edge;
    if (s.hx < e) s.hx += (e - s.hx) * Math.min(1, c.push * dt);
    if (s.hy < e) s.hy += (e - s.hy) * Math.min(1, c.push * dt);
    if (s.hx > c.arenaW - e) s.hx -= (s.hx - (c.arenaW - e)) * Math.min(1, c.push * dt);
    if (s.hy > c.arenaH - e) s.hy -= (s.hy - (c.arenaH - e)) * Math.min(1, c.push * dt);
    s.hx = Math.max(c.heroR, Math.min(c.arenaW - c.heroR, s.hx));
    s.hy = Math.max(c.heroR, Math.min(c.arenaH - c.heroR, s.hy));
    if (s.inv > 0) s.inv -= dt;
    if (s.stat.regen > 0 && s.hp < s.hmax) s.hp = Math.min(s.hmax, s.hp + s.stat.regen * dt);
  }

  function marks(w) {
    var s = w.s;
    var minute = Math.floor(s.t / 60);
    while (s.minutes.length < minute) s.minutes.push([s.kills, s.level]);
    var c = w.c;
    if (s.T >= c.scratchFrom && !s.noScratch) {
      var since = Math.max(s.hurtAt, c.scratchFrom / s.scale);
      if (s.t - since >= c.scratchSec) s.noScratch = true;
    }
  }

  /** One fixed step of the run. (mx, my): the stick, -1..1; nothing moves while a choice is open. */
  function step(w, mx, my) {
    var s = w.s;
    if (s.over || s.choice) return false;
    var dt = w.c.dt;
    s.t += dt;
    s.T = s.t * s.scale;
    s.steps++;
    timeline(w);
    if (s.over) return true;
    spawnStream(w, dt);
    hero(w, mx || 0, my || 0, dt);
    buildGrid(w);
    enemies(w, dt);
    separate(w);
    buildGrid(w);
    weapons(w, dt);
    projectiles(w, dt);
    mines(w);
    puddles(w);
    contact(w);
    if (s.over) return true;
    collect(w, dt);
    marks(w);
    return true;
  }

  // ---- what a run gave -------------------------------------------------------------------------------

  function result(w) {
    var s = w.s;
    var weaponsOwned = s.wp.map(function (wp) { return wp.id; });
    var items = weaponsOwned.slice();
    for (var id in s.ps) if (s.ps[id] > 0 && id.charAt(0) !== 'x') items.push(id);
    return {
      won: s.won, over: s.over, ended: s.ended, time: s.t, T: s.T, mode: s.mode, storm: s.storm, hero: s.hero,
      kills: s.kills, level: s.level, elites: s.elites, bosses: s.bosses, hives: s.hives, gold: s.gold, medkits: s.medkits,
      damage: Math.round(s.damage), weapons: weaponsOwned, items: items, fusions: s.fusions.slice(), noScratch: s.noScratch,
      multi2: !!s.multiTaken, onlyPulse: weaponsOwned.length === 1 && weaponsOwned[0] === 'pulse', minutes: s.minutes.slice(),
      rules: s.rules.slice(), bonus: s.bonus, freeFusionsLeft: s.freeFusions
    };
  }

  // ---- snapshots --------------------------------------------------------------------------------------

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var B64R = {};
  for (var bi = 0; bi < B64.length; bi++) B64R[B64.charAt(bi)] = bi;

  function bytesOf(arr) { return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); }

  function encode(bytes) {
    var out = [];
    var i = 0;
    var n = bytes.length;
    for (; i + 2 < n; i += 3) {
      var v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out.push(B64.charAt(v >> 18 & 63) + B64.charAt(v >> 12 & 63) + B64.charAt(v >> 6 & 63) + B64.charAt(v & 63));
    }
    if (i < n) {
      var a = bytes[i];
      var b = i + 1 < n ? bytes[i + 1] : 0;
      var x = (a << 16) | (b << 8);
      out.push(B64.charAt(x >> 18 & 63) + B64.charAt(x >> 12 & 63) + (i + 1 < n ? B64.charAt(x >> 6 & 63) : '=') + '=');
    }
    return out.join('');
  }

  function decode(text, bytes) {
    var n = 0;
    for (var i = 0; i + 3 < text.length + 0 && n < bytes.length; i += 4) {
      var a = B64R[text.charAt(i)] || 0;
      var b = B64R[text.charAt(i + 1)] || 0;
      var cc = text.charAt(i + 2);
      var d = text.charAt(i + 3);
      var v = (a << 18) | (b << 12) | ((B64R[cc] || 0) << 6) | (B64R[d] || 0);
      if (n < bytes.length) bytes[n++] = v >> 16 & 255;
      if (cc !== '=' && n < bytes.length) bytes[n++] = v >> 8 & 255;
      if (d !== '=' && n < bytes.length) bytes[n++] = v & 255;
    }
  }

  function packPool(pool) {
    var out = {};
    for (var k in pool) {
      var arr = pool[k];
      out[k] = HAS_TA && arr.buffer ? encode(bytesOf(arr)) : arr.slice();
    }
    return out;
  }

  function unpackPool(pool, data) {
    for (var k in pool) {
      var v = data && data[k];
      if (v === undefined || v === null) continue;
      var arr = pool[k];
      if (typeof v === 'string' && HAS_TA && arr.buffer) decode(v, bytesOf(arr));
      else if (Array.isArray(v)) {
        for (var i = 0; i < arr.length && i < v.length; i++) arr[i] = Number(v[i]) || 0;
      }
    }
  }

  /** The run as data for the save: scalars as they are, entity arrays packed (base64 of their bytes). */
  function save(w) {
    var s = JSON.parse(JSON.stringify(w.s));
    s.rng = w.rng.state();
    return {
      v: VERSION, s: s, caps: [w.c.capE, w.c.capP, w.c.capG],
      E: packPool(w.E), P: packPool(w.P), G: packPool(w.G), K: packPool(w.K), U: packPool(w.U), M: packPool(w.M)
    };
  }

  /** A run back from save(w): the same step, the same enemies. null when the data does not fit. */
  function load(cfg, data) {
    if (!data || data.v !== VERSION || !data.s || typeof data.s !== 'object') return null;
    var c = derive(cfg);
    if (!data.caps || data.caps[0] !== c.capE || data.caps[1] !== c.capP || data.caps[2] !== c.capG) return null;
    var w = { cfg: cfg, c: c };
    w.s = JSON.parse(JSON.stringify(data.s));
    w.rng = Rng.make(w.s.rng >>> 0);
    delete w.s.rng;
    w.s.scale = modeScale(c, w.s.mode);
    var P = pools(c);
    w.E = P.E;
    w.P = P.P;
    w.G = P.G;
    w.K = P.K;
    w.U = P.U;
    w.M = P.M;
    unpackPool(w.E, data.E);
    unpackPool(w.P, data.P);
    unpackPool(w.G, data.G);
    unpackPool(w.K, data.K);
    unpackPool(w.U, data.U);
    unpackPool(w.M, data.M);
    scratch(w);
    view(w, w.s.viewW, w.s.viewH);
    stats(w);
    var e = 0;
    var p = 0;
    var g = 0;
    for (var i = 0; i < c.capE; i++) if (w.E.flag[i] & F_ALIVE) e++;
    for (i = 0; i < c.capP; i++) if (w.P.on[i]) p++;
    for (i = 0; i < c.capG; i++) if (w.G.st[i]) g++;
    w.s.ecount = e;
    w.s.pcount = p;
    w.s.gcount = g;
    return w;
  }

  /** A short fingerprint of the run (determinism checks). */
  function hash(w) {
    var h = 0x811c9dc5;
    function mix(v) {
      var x = Math.round(v * 1000) | 0;
      h ^= x & 0xffff;
      h = Math.imul ? Math.imul(h, 0x01000193) : (h * 0x01000193) | 0;
      h ^= (x >>> 16) & 0xffff;
      h = Math.imul ? Math.imul(h, 0x01000193) : (h * 0x01000193) | 0;
    }
    var s = w.s;
    mix(s.t);
    mix(s.hx);
    mix(s.hy);
    mix(s.hp);
    mix(s.kills);
    mix(s.level);
    mix(s.xp);
    for (var i = 0; i < w.c.capE; i++) {
      if (!(w.E.flag[i] & F_ALIVE)) continue;
      mix(i);
      mix(w.E.x[i]);
      mix(w.E.y[i]);
      mix(w.E.hp[i]);
    }
    for (i = 0; i < w.c.capP; i++) {
      if (!w.P.on[i]) continue;
      mix(w.P.x[i]);
      mix(w.P.y[i]);
    }
    return (h >>> 0).toString(16);
  }

  /** null when every number of the run is finite and every count fits its cap; otherwise what is wrong. */
  function check(w) {
    var s = w.s;
    var c = w.c;
    var names = ['t', 'T', 'hx', 'hy', 'hp', 'hmax', 'xp', 'need', 'kills', 'level', 'gold', 'spawnAcc'];
    for (var n = 0; n < names.length; n++) {
      var v = s[names[n]];
      if (typeof v !== 'number' || v !== v || v === Infinity || v === -Infinity) return 's.' + names[n] + ' = ' + v;
    }
    var pools2 = { E: w.E, P: w.P, G: w.G, K: w.K, U: w.U, M: w.M };
    for (var pn in pools2) {
      var pool = pools2[pn];
      for (var k in pool) {
        var arr = pool[k];
        for (var i = 0; i < arr.length; i++) {
          var x = arr[i];
          if (x !== x || x === Infinity || x === -Infinity) return pn + '.' + k + '[' + i + '] = ' + x;
        }
      }
    }
    var e = 0;
    var p = 0;
    var g = 0;
    for (i = 0; i < c.capE; i++) if (w.E.flag[i] & F_ALIVE) e++;
    for (i = 0; i < c.capP; i++) if (w.P.on[i]) p++;
    for (i = 0; i < c.capG; i++) if (w.G.st[i]) g++;
    if (e !== s.ecount) return 'врагов ' + e + ', а счётчик ' + s.ecount;
    if (p !== s.pcount) return 'снарядов ' + p + ', а счётчик ' + s.pcount;
    if (g !== s.gcount) return 'кристаллов ' + g + ', а счётчик ' + s.gcount;
    if (e > c.capE || p > c.capP || g > c.capG) return 'сверх предела';
    return null;
  }

  // ---- the test bot: runs from the nearest enemies in a circle, picks cards greedily -----------------

  var BOT_W = {
    spark: 1, blades: 1, needles: 0.9, mortar: 1.05, ice: 0.8, sickle: 1, chain: 1.05, pulse: 0.9, drones: 1.05, beacon: 1, seeds: 0.85, ball: 1.05,
    armor: 0.95, core: 0.9, accel: 1.1, lens: 0.8, magnet: 0.8, soles: 0.85, multi: 1.3, regen: 0.85, coin: 0.7, sharp: 1.1, fuse: 0.7, pupil: 0.8,
    thorns: 0.6, scope: 0.9
  };

  /** A bot's brain: its own generator (the world's stays as the run makes it) and preferences. */
  function brain(seed, o) {
    o = o || {};
    var rng = Rng.make((Number(seed) >>> 0) ^ 0x5bd1e995);
    var prefs = {};
    for (var k in BOT_W) prefs[k] = BOT_W[k] * (1 + (rng.next() - 0.5) * (o.noise === undefined ? 0.6 : o.noise));
    return { rng: rng, prefs: prefs, mx: 0, my: 0, skill: o.skill === undefined ? 1 : o.skill, react: 0, ox: 0, oy: 0 };
  }

  /** The bot's stick for this step: into b.mx, b.my. */
  function botMove(w, b) {
    var s = w.s;
    var c = w.c;
    var E = w.E;
    b.react -= c.dt;
    if (b.react > 0) return b;
    // A human looks a few times a second, not every step.
    b.react = 0.1 / Math.max(0.2, b.skill);
    var ax = 0;
    var ay = 0;
    var danger = 0;
    var R = 150 + 40 * b.skill;
    var n = query(w, s.hx, s.hy, R);
    for (var k = 0; k < n; k++) {
      var i = w.q[k];
      var dx = s.hx - E.x[i];
      var dy = s.hy - E.y[i];
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > R) continue;
      var wgt = (1 - d / R);
      wgt *= wgt;
      if (E.flag[i] & F_BOSS) wgt *= 3;
      else if (E.flag[i] & F_ELITE) wgt *= 2;
      if (E.kind[i] === E_BOMBER && E.st[i] === 1) wgt *= 4;
      if (E.kind[i] === E_RAM && E.st[i] >= 1) {
        // Off the line of the dash.
        var la = E.ang[i];
        var px = -Math.sin(la);
        var py = Math.cos(la);
        var side = dx * px + dy * py >= 0 ? 1 : -1;
        ax += px * side * 2;
        ay += py * side * 2;
      }
      ax += dx / d * wgt;
      ay += dy / d * wgt;
      danger += wgt;
    }
    var P = w.P;
    for (var p = 0; p < c.capP; p++) {
      if (!P.on[p] || (P.kind[p] !== P_EBALL && P.kind[p] !== P_ERING)) continue;
      var qx = s.hx - P.x[p];
      var qy = s.hy - P.y[p];
      var qd = Math.sqrt(qx * qx + qy * qy) || 1;
      if (qd > 110 * b.skill) continue;
      var vx = P.vx[p];
      var vy = P.vy[p];
      var vs = Math.sqrt(vx * vx + vy * vy) || 1;
      // Sideways from the shot's path.
      var sx = -vy / vs;
      var sy = vx / vs;
      var sgn = qx * sx + qy * sy >= 0 ? 1 : -1;
      var pw = (1 - qd / 110) * 1.5;
      ax += sx * sgn * pw;
      ay += sy * sgn * pw;
      danger += pw * 0.5;
    }
    // Round the middle of the arena, so it never corners itself.
    var cx = s.hx - c.arenaW / 2;
    var cy = s.hy - c.arenaH / 2;
    var cd = Math.sqrt(cx * cx + cy * cy) || 1;
    var tx = -cy / cd;
    var ty = cx / cd;
    ax += tx * 0.35;
    ay += ty * 0.35;
    var far = cd / (Math.min(c.arenaW, c.arenaH) * 0.38);
    if (far > 1) {
      ax -= cx / cd * (far - 1) * 1.5;
      ay -= cy / cd * (far - 1) * 1.5;
    }
    // Crystals and pickups when it is calm.
    if (danger < 0.6) {
      var G = w.G;
      var best = -1;
      var bd = 260 * 260;
      for (var g = 0; g < c.capG; g++) {
        if (G.st[g] !== 1) continue;
        var gx = G.x[g] - s.hx;
        var gy = G.y[g] - s.hy;
        var gd = gx * gx + gy * gy;
        if (gd < bd) {
          bd = gd;
          best = g;
        }
      }
      var K = w.K;
      for (var kk = 0; kk < c.capK; kk++) {
        if (!K.on[kk]) continue;
        if (K.kind[kk] === K_MEDKIT && s.hp > s.hmax * 0.7) continue;
        var kx = K.x[kk] - s.hx;
        var ky = K.y[kk] - s.hy;
        var kd = kx * kx + ky * ky;
        if (kd < 400 * 400) {
          ax += kx / Math.sqrt(kd + 1) * 0.9;
          ay += ky / Math.sqrt(kd + 1) * 0.9;
        }
      }
      if (best >= 0) {
        var bx = G.x[best] - s.hx;
        var by = G.y[best] - s.hy;
        var bl = Math.sqrt(bx * bx + by * by) || 1;
        ax += bx / bl * 0.7 * (1 - danger);
        ay += by / bl * 0.7 * (1 - danger);
      }
    }
    // A clumsy thumb: a little drift.
    var jitter = 0.35 * (1.2 - Math.min(1.2, b.skill));
    ax += (b.rng.next() - 0.5) * jitter;
    ay += (b.rng.next() - 0.5) * jitter;
    var m = Math.sqrt(ax * ax + ay * ay);
    if (m < 0.05) {
      b.mx = 0;
      b.my = 0;
    } else {
      b.mx = ax / m;
      b.my = ay / m;
    }
    return b;
  }

  /** The bot at a choice: the card worth most to it; rerolls when nothing is worth much. */
  function botPick(w, b) {
    var s = w.s;
    var ch = s.choice;
    if (!ch) return -1;
    var best = -1;
    var score = -1;
    for (var i = 0; i < ch.cards.length; i++) {
      var cd = ch.cards[i];
      var v = cd.k === 'gold' ? 0.1 : cd.k === 'heal' ? 0.2 : cd.k === 'x' ? 0.9 : b.prefs[cd.id] || 0.5;
      if (cd.k === 'w' && !cd.up) v *= s.wp.length < 3 ? 1.4 : 1;
      if (cd.up) v *= 0.95;
      if (cd.k === 'w' && cd.up && cd.to === w.c.wMax) {
        for (var f = 0; f < FUSIONS.length; f++) if (FUSIONS[f].weapon === cd.id && (s.ps[FUSIONS[f].passive] || 0) > 0) v *= 1.4;
      }
      if (cd.k === 'p' && !cd.up) {
        for (var g = 0; g < FUSIONS.length; g++) {
          var fw = weaponOf(w, FUSIONS[g].weapon);
          if (FUSIONS[g].passive === cd.id && fw && fw.lvl >= 4) v *= 1.3;
        }
      }
      if (cd.id === 'core' && s.hp < s.hmax * 0.5) v *= 1.3;
      v *= 1 + (b.rng.next() - 0.5) * 0.2;
      if (v > score) {
        score = v;
        best = i;
      }
    }
    if (score < 0.55 && s.rerolls > 0 && b.rng.next() < 0.5) {
      reroll(w);
      return botPick(w, b);
    }
    pick(w, best);
    return best;
  }

  /** A whole run by the bot, as fast as the computer goes: the result. maxSec: stop there (endless). */
  function botRun(cfg, opts, o) {
    o = o || {};
    var w = create(cfg, opts);
    var b = brain(opts.seed, o);
    var limit = (o.maxSec || 3600) * w.c.hz;
    var peak = { e: 0, p: 0, g: 0 };
    for (var i = 0; i < limit && !w.s.over; i++) {
      if (w.s.choice) botPick(w, b);
      botMove(w, b);
      step(w, b.mx, b.my);
      if (w.s.ecount > peak.e) peak.e = w.s.ecount;
      if (w.s.pcount > peak.p) peak.p = w.s.pcount;
      if (w.s.gcount > peak.g) peak.g = w.s.gcount;
      if (o.every && i % o.every === 0) o.on(w, i);
    }
    var r = result(w);
    r.peak = peak;
    r.check = check(w);
    return r;
  }

  return {
    VERSION: VERSION, WEAPONS: WEAPONS, PASSIVES: PASSIVES, ENEMIES: ENEMIES, FUSIONS: FUSIONS, RARITY: RARITY, PICKUPS: PICKUPS,
    DAILY: DAILY, BRICKS: BRICKS, HEROES: HEROES,
    FX: { HIT: FX_HIT, KILL: FX_KILL, LINE: FX_LINE, RING: FX_RING, BOOM: FX_BOOM, HURT: FX_HURT, PICK: FX_PICK, LEVEL: FX_LEVEL, SHOT: FX_SHOT,
      BLOCK: FX_BLOCK, SWEEP: FX_SWEEP, SPAWN: FX_SPAWN, SIZE: FX_SIZE },
    F: { ALIVE: F_ALIVE, ELITE: F_ELITE, BOSS: F_BOSS, RING: F_RING, WALL: F_WALL },
    PK: { SPARK: P_SPARK, NEEDLE: P_NEEDLE, MORTAR: P_MORTAR, SICKLE: P_SICKLE, DRONE: P_DRONE, BALL: P_BALL, EBALL: P_EBALL, ERING: P_ERING },
    derive: derive, create: create, step: step, view: view, pick: pick, reroll: reroll, banish: banish, skip: skip, result: result,
    save: save, load: load, hash: hash, check: check, xpNeed: xpNeed, candidates: candidates, stats: stats, cleanCard: cleanCard,
    weaponOf: weaponOf, inView: inView, wdmg: wdmg, countAtLevel: countAtLevel, parseWave: parseWave,
    brain: brain, botMove: botMove, botPick: botPick, botRun: botRun
  };
});
