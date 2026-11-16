// Логика «Искр в кольце»: искры летят от края кольца к ядру в середине. Встречную (f=1) нужно
// отразить тапом, пока она в полосе-кольце; улетающую (f=-1) трогать нельзя. Общее подмножество
// JavaScript: работает на экране (window.GameSim), в движке (Rhino) и в node. Без class, async,
// f(...args) и for (const …); случайность — только из ctx.rng.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('modules/games/engine/big.js')) : make(root.Big);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big) {
  'use strict';

  var TAU = Math.PI * 2;
  var MAX_SPARKS = 40;

  function cfgNum(cfg, key, dflt) {
    var v = cfg ? cfg[key] : undefined;
    return typeof v === 'number' && isFinite(v) ? v : dflt;
  }

  // ---- хелперы, которые зовут экран и проверки ----

  /** Ступень темпа: каждые spawn.rampEverySec секунд захода — на одну выше. */
  function ramp(run, cfg) {
    var every = Math.max(1, cfgNum(cfg, 'spawn.rampEverySec', 10));
    return Math.floor((run.elapsedMs || 0) / (every * 1000));
  }

  /** Сколько миллисекунд искра летит от края к ядру на этой ступени. */
  function travel(run, cfg) {
    var base = cfgNum(cfg, 'spark.travelMs', 1500);
    var min = cfgNum(cfg, 'spark.minTravelMs', 900);
    var g = cfgNum(cfg, 'spark.travelGrowth', 0.94);
    var t = base * Math.pow(g, ramp(run, cfg));
    return Math.max(min, t);
  }

  /** Промежуток до следующей искры на этой ступени (с разбросом ×0,75…×1,25). */
  function gap(run, cfg) {
    var base = cfgNum(cfg, 'spawn.baseMs', 1450);
    var min = cfgNum(cfg, 'spawn.minMs', 620);
    var g = cfgNum(cfg, 'spawn.growth', 0.9);
    var v = base * Math.pow(g, ramp(run, cfg));
    return Math.max(min, v) * (0.75 + (run.gapJitter || 0) * 0.5);
  }

  /** Искра целиком в полосе-кольце: её можно отразить. */
  function inZone(sp, cfg) {
    var outer = cfgNum(cfg, 'spark.zoneOuter', 0.92);
    var inner = cfgNum(cfg, 'spark.zoneInner', 0.45);
    return sp.f >= inner && sp.f <= outer;
  }

  /** Насколько точно тап пришёлся в середину полосы (0…1, 1 — самое ядро полосы). */
  function accuracy(sp, cfg) {
    var outer = cfgNum(cfg, 'spark.zoneOuter', 0.92);
    var inner = cfgNum(cfg, 'spark.zoneInner', 0.45);
    var mid = (outer + inner) / 2;
    var half = Math.max(0.0001, (outer - inner) / 2);
    return Math.max(0, 1 - Math.abs(sp.f - mid) / half);
  }

  function newRun(cfg) {
    return {
      score: 0,
      best: 0,
      lives: cfgNum(cfg, 'lives.start', 3),
      combo: 0,
      comboBest: 0,
      reflected: 0,
      perfects: 0,
      missed: 0,
      wrong: 0,
      empty: 0,
      elapsedMs: 0,
      spawnAt: cfgNum(cfg, 'spawn.firstMs', 900),
      sparks: [],
      rings: [],
      cooldownMs: 0,
      hurtMs: 0,
      level: 1,
      live: false,
      over: false,
      lastAt: 0,
      gapJitter: 0.5,
      lastWrongAt: 0
    };
  }

  /** Новая искра: up — встречная (летит внутрь), иначе улетающая. Время — в мс захода. */
  function spawn(state, cfg, up, rng) {
    var run = state.run;
    if (run.sparks.length >= MAX_SPARKS) return null;
    run.nextId = (run.nextId || 1) + 1;
    var sp = {
      id: run.nextId,
      up: up ? 1 : 0,
      a: rng.range(0, 360),
      f: up ? 1 : 0,
      speed: 1000 / travel(run, cfg),
      born: run.elapsedMs,
      hit: 0,
      dead: 0
    };
    run.sparks.push(sp);
    return sp;
  }

  /** Когда выпускать следующую: сейчас плюс промежуток этой ступени. */
  function scheduleNext(state, cfg, rng) {
    var run = state.run;
    run.gapJitter = rng.next();
    run.spawnAt = run.elapsedMs + gap(run, cfg);
  }

  function addRing(run, kind, at) {
    run.rings.push({ kind: kind, at: at });
    if (run.rings.length > 8) run.rings.shift();
  }

  // ---- функции, которые зовёт движок ----

  function init(ctx) {
    return { run: newRun(ctx && ctx.config), layers: {}, meta: {} };
  }

  function tick(state, dt, ctx) {
    var run = state.run;
    if (!run || run.over || !run.live || dt <= 0) return;
    var cfg = ctx.config;
    var now = ctx.now;
    if (run.lastAt && now - run.lastAt > Math.max(1000, cfgNum(cfg, 'run.abandonMs', 5000))) {
      // Экран спал посреди захода: заход обрывается, а не идёт вслепую.
      finish(state, cfg, now, 'pause');
      run.lastAt = now;
      return;
    }
    run.lastAt = now;
    run.elapsedMs += dt * 1000;
    run.level = ramp(run, cfg) + 1;
    run.cooldownMs = Math.max(0, (run.cooldownUntil || 0) - run.elapsedMs);
    run.hurtMs = Math.max(0, (run.hurtMs || 0) - dt * 1000);

    var i;
    for (i = 0; i < run.sparks.length; i++) {
      var sp = run.sparks[i];
      sp.f -= sp.up ? sp.speed * dt : -sp.speed * dt;
      if (sp.up) {
        if (sp.f <= 0) {
          sp.f = 0;
          sp.dead = 1;
          if (!sp.hit) {
            run.lives--;
            run.combo = 0;
            run.missed++;
            run.hurtMs = 400;
            addRing(run, 'miss', run.elapsedMs);
            if (run.lives <= 0) {
              finish(state, cfg, now, 'lives');
            }
          } else if (sp.hit === 1) {
            addRing(run, 'ok', run.elapsedMs);
          } else {
            addRing(run, 'perfect', run.elapsedMs);
          }
        }
      } else if (sp.f >= 1.05) {
        sp.dead = 1;
        sp.f = 1.05;
        addRing(run, 'away', run.elapsedMs);
      }
    }
    if (run.sparks.length) {
      var left = [];
      for (i = 0; i < run.sparks.length; i++) if (!run.sparks[i].dead) left.push(run.sparks[i]);
      run.sparks = left;
    }
    if (run.over) return;

    var guard = 0;
    while (run.live && run.elapsedMs >= run.spawnAt && guard++ < 4) {
      var burst = run.elapsedMs >= cfgNum(cfg, 'spawn.burstAfterSec', 25) * 1000 &&
        ctx.rng.chance(cfgNum(cfg, 'spawn.burstChance', 0.25));
      var chance = cfgNum(cfg, 'spawn.outChance', 0.34);
      spawn(state, cfg, !ctx.rng.chance(chance), ctx.rng);
      if (burst) spawn(state, cfg, !ctx.rng.chance(chance), ctx.rng);
      scheduleNext(state, cfg, ctx.rng);
    }
  }

  /** Состояние не хранит прошедшего: заход не копится, пока игра закрыта. */
  function offline(state, sec, ctx) {
    return { events: [] };
  }

  /** Начать заход (рекорд остаётся). */
  function begin(state, cfg, now) {
    var run = state.run;
    run.live = true;
    run.over = false;
    run.score = 0;
    run.lives = cfgNum(cfg, 'lives.start', 3);
    run.combo = 0;
    run.reflected = 0;
    run.perfects = 0;
    run.missed = 0;
    run.wrong = 0;
    run.empty = 0;
    run.elapsedMs = 0;
    run.sparks = [];
    run.rings = [];
    run.cooldownMs = 0;
    run.hurtMs = 0;
    run.level = 1;
    run.nextId = (run.nextId || 1) + 100;
    run.spawnAt = cfgNum(cfg, 'spawn.firstMs', 900);
    run.lastAt = now || 0;
    run.endedWhy = '';
    run.cooldownUntil = 0;
    run.gapJitter = 0.5;
    run.maxCombo = run.comboBest || 0;
    return run;
  }

  function finish(state, cfg, now, why) {
    var run = state.run;
    if (!run.live) return false;
    run.live = false;
    run.over = true;
    run.endedWhy = why || 'lives';
    run.lastAt = now || 0;
    if (run.score > (run.best || 0)) run.best = run.score;
    if (run.combo > (run.comboBest || 0)) run.comboBest = run.combo;
    return true;
  }

  /**
   * Тап по кольцу: отражает самую глубокую встречную искру в полосе.
   * {result: 'perfect' | 'ok' | 'trap' | 'empty' | 'idle' | 'off', points, spark}
   * trap — тап по улетающей искре (минус очко и перегрев), empty — тап в пустоте (перегрев),
   * idle — рядом только уже отражённые искры: ничего не происходит.
   */
  function tap(state, cfg, now) {
    var run = state.run;
    if (!run || !run.live || run.over) return { result: 'off', points: 0 };
    if (now) run.lastAt = now;
    if ((run.cooldownUntil || 0) > run.elapsedMs) return { result: 'off', points: 0 };
    var best = null;
    var bestF = 2;
    var i;
    for (i = 0; i < run.sparks.length; i++) {
      var sp = run.sparks[i];
      if (!sp.up || sp.dead || sp.hit || !inZone(sp, cfg)) continue;
      if (sp.f < bestF) {
        bestF = sp.f;
        best = sp;
      }
    }
    if (best) {
      var acc = accuracy(best, cfg);
      var perfect = acc >= 1 - cfgNum(cfg, 'spark.perfectPad', 0.45);
      var points = perfect ? cfgNum(cfg, 'score.perfect', 2) : cfgNum(cfg, 'score.reflect', 1);
      best.hit = perfect ? 2 : 1;
      run.score += points;
      run.reflected++;
      run.combo++;
      if (perfect) run.perfects++;
      if (run.combo > run.comboBest) run.comboBest = run.combo;
      return { result: perfect ? 'perfect' : 'ok', points: points, spark: best };
    }
    // Рядом только уже отражённые — не наказываем за второй тап по той же искре.
    var busy = false;
    var trap = null;
    for (i = 0; i < run.sparks.length; i++) {
      var o = run.sparks[i];
      if (o.dead || !inZone(o, cfg)) continue;
      if (!o.up && !o.hit) trap = o;
      else busy = true;
    }
    if (trap) {
      run.combo = 0;
      run.wrong++;
      run.score = Math.max(0, run.score - cfgNum(cfg, 'score.trap', 1));
      run.cooldownUntil = run.elapsedMs + cfgNum(cfg, 'tap.trapCooldownMs', 500);
      run.cooldownMs = cfgNum(cfg, 'tap.trapCooldownMs', 500);
      run.hurtMs = 300;
      addRing(run, 'trap', run.elapsedMs);
      return { result: 'trap', wrong: true, points: -cfgNum(cfg, 'score.trap', 1), spark: trap };
    }
    if (busy) return { result: 'idle', points: 0 };
    run.combo = 0;
    run.empty++;
    run.cooldownUntil = run.elapsedMs + cfgNum(cfg, 'tap.cooldownMs', 380);
    run.cooldownMs = cfgNum(cfg, 'tap.cooldownMs', 380);
    addRing(run, 'empty', run.elapsedMs);
    return { result: 'empty', points: 0 };
  }

  /** Бот проверок: бьёт tap три раза в секунду — так он и играет. */
  function click(state, cfg, mult) { return tap(state, cfg, 0); }

  function migrate(state, fromVer) {
    return state;
  }

  function validate(state) {
    var run = state.run;
    if (!run || typeof run !== 'object') return 'нет захода';
    if (typeof run.score !== 'number' || run.score < 0 || run.score % 1 !== 0) return 'очки не целые: ' + run.score;
    if (typeof run.best !== 'number' || run.best < 0 || run.best % 1 !== 0) return 'рекорд не целый: ' + run.best;
    if (!Array.isArray(run.sparks)) return 'нет списка искр';
    if (!Array.isArray(run.rings)) return 'нет списка колец';
    if (typeof run.lives !== 'number' || run.lives < 0) return 'жизней меньше нуля';
    return null;
  }

  function summary(state, cfg) {
    var run = state.run || {};
    var best = run.best || 0;
    return { line: best ? 'Рекорд ' + best : 'Захода ещё не было' };
  }

  return {
    init: init, tick: tick, offline: offline, migrate: migrate, validate: validate, summary: summary,
    begin: begin, finish: finish, tap: tap, click: click,
    ramp: ramp, travel: travel, gap: gap, inZone: inZone, accuracy: accuracy, spawn: spawn, scheduleNext: scheduleNext,
    TAU: TAU
  };
});
