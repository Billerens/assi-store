// The rules of «Змейка-рогалик» in node: movement, the buffer of turns, blows, bites, the exit,
// every enemy and master, the generator of glades, a smoke run with every ability. node tests/rules.test.js
'use strict';
const assert = require('assert');
const E = require('./env.js');

const { Core, game, sim, cfg, Rng } = E.setup();
const W = cfg['grid.w'];
const H = cfg['grid.h'];
const at = (x, y) => y * W + x;

/** A run on an empty glade n with the snake laid on [[x, y], …] (head first) and settings C. */
function laid(cells, dir, o) {
  o = o || {};
  const C = Object.assign({}, cfg, { 'fruit.onField': 0 }, o.cfg || {});
  const state = Core.newState(game, sim, { now: 0, config: C, rng: Rng.make(1) });
  if (o.shop) state.meta.shop = o.shop;
  sim.newRun(state, C, { seed: o.seed || 7, snake: o.snake });
  const run = state.run;
  if (o.glade) {
    run.g = sim.makeGlade(run, C, o.glade);
  }
  const g = run.g;
  g.grid = '.'.repeat(W * H);
  Object.assign(g, { food: [], curioAt: [], beetles: [], mice: [], holes: [], vines: [], rival: null, hawkOn: false, rockOn: false, hawk: null, rocks: [], exit: at(W - 1, H - 1) });
  if (!o.keepBoss) { g.boss = ''; g.b = null; }
  run.body = cells.map(([x, y]) => at(x, y));
  run.pend = 0;
  run.dir = dir;
  run.count = 0;
  run.acc = 0;
  run.q = [];
  return { state, run, g, C, ctx: { now: 0, config: C, rng: Rng.make(2), mult: 1, offline: false } };
}

function step(s, k) {
  for (let i = 0; i < (k || 1); i++) sim.tick(s.state, sim.period(s.run, s.C) + 1e-6, s.ctx);
}

function line(x, y0, n) { return Array.from({ length: n }, (v, i) => [x, y0 + i]); }

E.test('движение: 5 клеток в секунду на старте, по одной за такт', () => {
  const s = laid(line(7, 12, 4), 0);
  for (let i = 0; i < 61; i++) sim.tick(s.state, 1 / 60, s.ctx);
  assert.strictEqual(s.run.steps, cfg['speed.start'], 'шагов за секунду');
  assert.strictEqual(s.run.body[0], at(7, 12 - cfg['speed.start']), 'голова ушла вверх');
  assert.strictEqual(sim.length(s.run), 4, 'длина не изменилась');
});

E.test('скорость растёт к концу забега до 9', () => {
  const s = laid(line(7, 12, 4), 0);
  assert.strictEqual(sim.speed(s.run, s.C), cfg['speed.start']);
  s.run.g.n = cfg['run.glades'] - 1;
  assert.strictEqual(sim.speed(s.run, s.C), cfg['speed.end']);
});

E.test('буфер: два поворота наперёд, третий и разворот на шею не принимаются', () => {
  const s = laid(line(7, 12, 4), 0);
  assert.ok(!sim.turn(s.state, s.C, 2), 'назад, в шею — нельзя');
  assert.ok(!sim.turn(s.state, s.C, 0), 'туда же, куда едет, — не поворот');
  assert.ok(sim.turn(s.state, s.C, 1));
  assert.ok(sim.turn(s.state, s.C, 0));
  assert.ok(!sim.turn(s.state, s.C, 3), 'третий не помещается');
  step(s, 2);
  assert.strictEqual(s.run.body[0], at(8, 11), 'вправо, потом вверх');
});

E.test('удар о стену: −3 звена, полсекунды стоянки, ждёт направления', () => {
  const s = laid(line(7, 0, 8), 0);
  step(s);
  assert.strictEqual(sim.length(s.run), 8 - cfg['hit.damage']);
  assert.ok(s.run.stun > 0 && s.run.wait);
  for (let i = 0; i < 60; i++) sim.tick(s.state, 1 / 60, s.ctx);
  assert.strictEqual(s.run.steps, 1, 'стоит, пока нет нового направления');
  assert.ok(sim.turn(s.state, s.C, 1), 'новое направление');
  for (let i = 0; i < 6; i++) sim.tick(s.state, 1 / 60, s.ctx);
  assert.strictEqual(s.run.body[0], at(8, 0), 'поехала вправо');
});

E.test('камень — как стена; классическая смерть — переключатель', () => {
  const s = laid(line(7, 10, 6), 0);
  s.g.grid = s.g.grid.substring(0, at(7, 9)) + '#' + s.g.grid.substring(at(7, 9) + 1);
  step(s);
  assert.strictEqual(sim.length(s.run), 6 - cfg['hit.damage']);
  const c = laid(line(7, 0, 8), 0, { cfg: { 'rules.classicDeath': true } });
  step(c);
  assert.strictEqual(c.run.phase, 'over');
  assert.strictEqual(c.run.result.reason, 'hit');
});

E.test('укус себя отрезает хвост; Гибкий позвонок и Стеклянная не теряют', () => {
  const loop = [[5, 5], [5, 6], [6, 6], [6, 5], [6, 4], [6, 3], [6, 2]];
  const s = laid(loop, 1);
  step(s);
  assert.strictEqual(s.run.bites, 1);
  assert.strictEqual(sim.length(s.run), 3);
  const sp = laid(loop, 1);
  sp.run.ab.spine = 1;
  step(sp);
  assert.strictEqual(sim.length(sp.run), 7, 'позвонок');
  const gl = laid(loop, 1, { snake: 'glass' });
  gl.state.meta.unlocked.glass = true;
  gl.run.snake = 'glass';
  step(gl);
  assert.strictEqual(sim.length(gl.run), 7, 'стеклянная');
  assert.strictEqual(gl.run.bites, 0);
});

E.test('длина меньше 3 — забег окончен, чешуйки начислены', () => {
  const s = laid(line(7, 0, 4), 0);
  s.run.score = 9;
  step(s);
  assert.strictEqual(s.run.phase, 'over');
  assert.strictEqual(s.run.result.reason, 'short');
  assert.strictEqual(sim.scales(s.state), Math.floor(9 / cfg['scales.perFruits']));
});

E.test('выход: цель съедена — выход на краю открыт, проход — следующая поляна с той же длиной', () => {
  const s = laid(line(7, 12, 5), 0);
  s.g.goal = 1;
  s.g.food.push({ c: at(7, 11), k: 'f' });
  step(s);
  assert.ok(s.g.exitOpen, 'выход открыт');
  const L = sim.length(s.run);
  s.g.exit = at(7, 9);
  step(s, 2);
  assert.strictEqual(s.run.g.n, 1, 'следующая поляна');
  assert.strictEqual(sim.length(s.run), L, 'длина та же');
  assert.strictEqual(s.run.glades, 1);
});

E.test('цель поляны 6 + 2n, препятствий 3 + 2n', () => {
  const s = laid(line(7, 12, 4), 0);
  for (let n = 0; n < 9; n++) {
    const g = sim.makeGlade(s.run, s.C, n);
    if (n % 3 !== 2) assert.strictEqual(g.goal, 6 + 2 * n, 'цель поляны ' + n);
  }
});

E.test('ёж колется (сильнее в каждом угодье); толстая кожа смягчает', () => {
  const s = laid(line(7, 12, 9), 0);
  s.g.grid = s.g.grid.substring(0, at(6, 11)) + 'h' + s.g.grid.substring(at(6, 11) + 1);
  step(s);
  assert.strictEqual(sim.length(s.run), 9 - cfg['hedgehog.damage']);
  const r = laid(line(7, 12, 12), 0, { glade: 6 });
  r.g.grid = r.g.grid.substring(0, at(6, 11)) + 'h' + r.g.grid.substring(at(6, 11) + 1);
  step(r);
  assert.strictEqual(sim.length(r.run), 12 - cfg['hedgehog.damage'] - 2 * cfg['hit.landExtra'], 'на Гряде — +2 угодья');
  const k = laid(line(7, 12, 9), 0, { shop: { skin: 1 } });
  k.g.grid = k.g.grid.substring(0, at(6, 11)) + 'h' + k.g.grid.substring(at(6, 11) + 1);
  step(k);
  assert.strictEqual(sim.length(k.run), 9 - cfg['hedgehog.damage'] + cfg['shop.skin.value']);
});

E.test('жук: съеден головой — +1; сам ест плоды', () => {
  const s = laid(line(7, 12, 4), 0);
  s.g.beetles.push({ c: at(7, 11), t: 0 });
  step(s);
  assert.strictEqual(sim.length(s.run), 4 + cfg['beetle.length']);
  const b = laid(line(7, 20, 4), 0, { cfg: { 'beetle.wander': 0 } });
  b.g.beetles.push({ c: at(2, 2), t: 0 });
  b.g.food.push({ c: at(3, 2), k: 'b' });
  sim.tick(b.state, cfg['beetle.stepSec'] + 0.01, b.ctx);
  assert.strictEqual(b.g.food.length, 0, 'жук съел плод');
});

E.test('мышь: +3 длины и зерно', () => {
  const s = laid(line(7, 12, 4), 0, { cfg: { 'mouse.stepSec': 100 } });
  s.g.mice.push({ c: at(7, 11), t: 0 });
  const seeds = s.run.seeds;
  step(s);
  assert.strictEqual(sim.length(s.run), 4 + cfg['mouse.length']);
  assert.strictEqual(s.run.seeds, seeds + cfg['mouse.seeds']);
});

E.test('ястреб: тень, потом удар — отрезаются только звенья в квадрате', () => {
  const s = laid(line(7, 12, 10), 0, { glade: 3 });
  s.g.hawkOn = true;
  s.g.hawk = { c: at(7, 12), t: 0.001 };
  s.run.stun = 5;
  const hits = s.run.hits;
  sim.tick(s.state, 0.01, s.ctx);
  assert.strictEqual(sim.length(s.run), 10 - 2, 'голова и одно звено в квадрате');
  assert.strictEqual(s.run.hits, hits + 1, 'голова под ударом — это удар');
  const b = laid(line(7, 12, 10), 0, { glade: 3 });
  b.g.hawkOn = true;
  b.g.hawk = { c: at(7, 18), t: 0.001 };
  b.run.stun = 5;
  sim.tick(b.state, 0.01, b.ctx);
  assert.strictEqual(sim.length(b.run), 10 - 3, 'три звена под тенью');
});

E.test('камнепад: отмеченная клетка становится камнем', () => {
  const s = laid(line(7, 20, 4), 0, { glade: 6 });
  s.g.rockOn = true;
  s.g.rockT = 100;
  s.g.rocks.push({ c: at(3, 3), t: cfg['rock.delay'] });
  s.run.stun = 10;
  for (let i = 0; i < 3; i++) sim.tick(s.state, cfg['rock.delay'] / 2 + 0.01, s.ctx);
  assert.strictEqual(s.g.grid.charAt(at(3, 3)), '#');
});

E.test('соперница: столкновение голов — обе теряют', () => {
  const s = laid(line(7, 12, 12), 0, { glade: 6 });
  s.g.rival = { body: line(7, 4, 8).reverse().map(([x, y]) => at(x, y)), pend: 0, dir: 2, acc: 0, stun: 5, dead: false };
  step(s);
  assert.strictEqual(cfg['rival.damage'], 3, 'спецификация: обе −3');
  assert.strictEqual(sim.length(s.run), 12 - 3);
  assert.strictEqual(s.g.rival.body.length, 8 - 3);
});

E.test('кротовые норы: вошёл в одну — вышел из другой', () => {
  const s = laid(line(7, 12, 4), 0);
  s.g.holes = [at(7, 11), at(2, 3)];
  s.g.holeT = 100;
  step(s);
  assert.strictEqual(s.run.body[0], at(2, 3));
});

E.test('лоза прирастает раз в 10 тактов, трясина замедляет вдвое', () => {
  const s = laid(line(7, 22, 4), 3);
  s.g.grid = s.g.grid.substring(0, at(2, 2)) + 'v' + s.g.grid.substring(at(2, 2) + 1);
  s.g.vines = [[at(2, 2)]];
  s.run.body = [at(12, 22), at(13, 22), at(14, 22)];
  step(s, cfg['vine.every']);
  assert.strictEqual(s.g.vines[0].length, 2);
  const b = laid(line(7, 12, 4), 0);
  const p = sim.period(b.run, b.C);
  b.g.grid = b.g.grid.substring(0, at(7, 12)) + '~' + b.g.grid.substring(at(7, 12) + 1);
  assert.strictEqual(sim.period(b.run, b.C), p * cfg['bog.slow']);
  b.run.ab.warm = 1;
  assert.strictEqual(sim.period(b.run, b.C), p, 'Тёплая кожа');
});

E.test('Луговой полоз: врезался трижды — погиб, выход открыт', () => {
  const s = laid(line(0, 1, 4), 0, { glade: 2, keepBoss: true, cfg: { 'boss.polozCareful': 1 } });
  s.run.body = [at(5, 20), at(5, 21), at(5, 22)];
  s.run.stun = 100;
  const b = s.g.b;
  b.body = [at(0, 0), at(1, 0), at(2, 0)];
  b.pend = 0;
  b.stun = 0;
  b.hits = b.need - 1;
  // up and left are the walls, right is its own neck, down a stone: it crashes
  s.g.grid = s.g.grid.substring(0, at(0, 1)) + '#' + s.g.grid.substring(at(0, 1) + 1);
  sim.tick(s.state, 1, s.ctx);
  assert.ok(b.dead, 'полоз погиб');
  assert.ok(s.g.exitOpen, 'выход открыт');
});

E.test('Болотная мать: цель 12 плодов; жуки выходят', () => {
  const s = laid(line(7, 22, 4), 0, { glade: 5, keepBoss: true });
  assert.strictEqual(sim.hud(s.run, s.C).goal, cfg['boss.motherGoal']);
  s.run.stun = 100;
  s.g.b.t = 0.01;
  s.g.grid = s.g.grid.substring(0, s.g.b.c) + 'm' + s.g.grid.substring(s.g.b.c + 1);
  sim.tick(s.state, 0.05, s.ctx);
  assert.ok(s.g.beetles.length >= 1, 'жук вышел');
});

E.test('Каменный змей: через 8 с внешнее кольцо закрыто', () => {
  const s = laid(line(7, 12, 4), 0, { glade: 8, keepBoss: true });
  s.g.b.base = s.g.grid;
  s.run.stun = 100;
  sim.tick(s.state, cfg['boss.stoneSec'] + 0.01, s.ctx);
  assert.strictEqual(s.g.grid.charAt(at(0, 0)), '#');
  assert.strictEqual(s.g.grid.charAt(at(7, 12)), '.');
  assert.strictEqual(s.g.b.ring, 1);
});

E.test('генератор: 300 полян — всё связано, старт свободен, выход на краю, без NaN', () => {
  const s = laid(line(7, 12, 4), 0);
  let stones = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 300; i++) {
    s.run.gs = i + 1;
    const n = i % 9;
    const g = sim.makeGlade(s.run, s.C, n);
    const free = [];
    const seen = new Set([g.start]);
    const list = [g.start];
    for (let j = 0; j < list.length; j++) {
      const c = list[j];
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => {
        const x = c % W + dx;
        const y = Math.floor(c / W) + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const q = y * W + x;
        if (seen.has(q) || '#hvm'.indexOf(g.grid[q]) >= 0) return;
        seen.add(q);
        list.push(q);
      });
    }
    for (let c = 0; c < W * H; c++) if ('#hvm'.indexOf(g.grid[c]) < 0) free.push(c);
    assert.strictEqual(list.length, free.length, 'закрытые карманы на поляне ' + n + ' (' + i + ')');
    const ex = g.exit % W;
    const ey = Math.floor(g.exit / W);
    assert.ok(ex === 0 || ey === 0 || ex === W - 1, 'выход не на краю');
    if (!g.layout) stones[n] += [...g.grid].filter((ch) => ch === '#').length;
  }
  console.log('  камней в среднем по полянам 1–9: ' + stones.map((v) => (v / 33).toFixed(1)).join(' '));
});

E.test('каждая из 30 способностей: забег бота 20 с без поломок', () => {
  const ids = require('../content/abilities.json').map((a) => a.id);
  assert.strictEqual(ids.length, 30);
  ids.forEach((id, k) => {
    const state = Core.newState(game, sim, { now: 0, config: cfg, rng: Rng.make(k + 1) });
    state.meta.shop = { long: 5 };
    sim.newRun(state, cfg, { seed: 300 + k });
    state.run.pick = { opts: [id], luck: false };
    state.run.phase = 'pick';
    assert.ok(sim.choose(state, cfg, 0).ok, id);
    assert.strictEqual(state.run.ab[id], 1, id);
    sim.botPlay(state, cfg, { maxSec: 20 });
    assert.strictEqual(Core.validate(state, game), null, id);
    assert.ok(JSON.stringify(state).indexOf('NaN') < 0 && JSON.stringify(state).indexOf('null,null') < 0, 'NaN: ' + id);
  });
});

E.test('запас: раскладка 25×15 проверяется, кирпичики в пределах', () => {
  const rng = Rng.make(9);
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(sim.validateStock('glades', sim.procedural('glades', rng)), null);
    assert.strictEqual(sim.validateStock('abilities', sim.procedural('abilities', rng)), null);
  }
  const closed = { land: 'meadow', rows: Array.from({ length: H }, (v, y) => (y === 5 ? '#'.repeat(W) : '.'.repeat(W))) };
  assert.ok(sim.validateStock('glades', closed), 'стена поперёк поляны отклонена');
  assert.ok(sim.validateStock('glades', { land: 'meadow', rows: ['...'] }), 'короткая раскладка отклонена');
  assert.ok(sim.validateStock('abilities', { title: 'X', bricks: [{ brick: 'fly', value: 1 }] }), 'чужой кирпичик');
  // a stock ability with bricks works in a run
  const state = Core.newState(game, sim, { now: 0, config: cfg, rng: Rng.make(1) });
  sim.newRun(state, cfg, { seed: 5, extra: [{ title: 'Жирок 5', text: '+5', bricks: [{ brick: 'length', value: 5 }] }] });
  const L = sim.length(state.run);
  const id = state.run.extra[0].id;
  state.run.pick = { opts: [id], luck: false };
  state.run.phase = 'pick';
  sim.choose(state, cfg, 0);
  assert.strictEqual(sim.length(state.run), L + 5);
});

E.test('мета: цена улучшения base·1.4^n, линька даёт +10 % чешуек', () => {
  assert.strictEqual(sim.upgradeCost(cfg, 'long', 0), 15);
  assert.strictEqual(sim.upgradeCost(cfg, 'long', 2), Math.round(15 * 1.4 * 1.4));
  const state = Core.newState(game, sim, { now: 0, config: cfg, rng: Rng.make(1) });
  state.meta.scales = 100;
  assert.ok(sim.buyUpgrade(state, cfg, 'long').ok);
  assert.strictEqual(sim.scales(state), 85);
  sim.newRun(state, cfg, { seed: 1 });
  state.run.score = 30;
  state.run.glades = 2;
  const base = sim.earned(state.run, cfg);
  state.run.molt = 3;
  assert.strictEqual(sim.earned(state.run, cfg), Math.floor(base * 1.3));
});

E.done('rules ' + E.ID);
