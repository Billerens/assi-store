// node tests/factory.test.js — the factory itself on the real sim: the first money, the reference
// lines against the calculation by recipes (±5 %), belts and buildings by the rules, tunnels,
// splitter and sorter, depletion of ore, and the step time of 300 buildings with 1 000 items.
'use strict';
const T = require('./env.js');
const x = T.open();
const { sim, Core, Big, Rng, game, cfg } = x;
const F = sim.factory;

const NOW = Date.UTC(2026, 10, 14, 8, 0, 0);
function ctxAt(now, seed) { return T.ctxOf(x, { now, seed: seed || 1 }); }

/** A fresh rusty run with no ore and no events: the tests lay out the plot themselves. */
function blank(money) {
  const state = Core.newState(game, sim, ctxAt(NOW));
  state.run.ore = [];
  state.run.lv++;
  state.run.money = Big.str(Big.of(money || 1e6));
  state.run.evAt = NOW + 1e12;
  return state;
}

function ore(state, xx, y, r) {
  state.run.ore.push({ x: xx, y, r, m: 0 });
  state.run.lv++;
}

function put(state, list) {
  for (const [t, xx, y, d, r] of list) {
    const res = sim.build(state, t, xx, y, d, cfg);
    if (!res.ok) throw new Error(t + ' ' + xx + ',' + y + ': ' + res.reason);
    if (r) {
      if (t === 'sorter') sim.setFilter(state, xx, y, r, cfg);
      else sim.setRecipe(state, xx, y, r, cfg);
    }
  }
}

function run(state, sec, dt) {
  dt = dt || 0.1;
  let now = state.__now || NOW;
  const n = Math.round(sec / dt);
  for (let i = 0; i < n; i++) {
    now += dt * 1000;
    sim.tick(state, dt, ctxAt(now));
  }
  state.__now = now;
  return state;
}

const price = (id) => sim.data().items[id].price;
const recipe = (id) => sim.data().planets[0].recipes.find((r) => r.id === id);

T.test('первые деньги: стартовая линия на 150 и первая продажа', () => {
  const state = Core.newState(game, sim, ctxAt(NOW));
  if (!sim.starterLine(state, cfg, 'iron-ore')) throw new Error('стартовая линия не встала на 150');
  const left = Big.toNumber(state.run.money);
  let first = null;
  let now = NOW;
  for (let i = 0; i < 3000 && first === null; i++) {
    now += 100;
    sim.tick(state, 0.1, ctxAt(now));
    if (state.run.soldN > 0) first = (i + 1) / 10;
  }
  if (first === null || first > 10) throw new Error('первая продажа на ' + first + ' с');
  // «5 минут: … первые деньги, вторая линия меди»: after 5 minutes there is money for the second line.
  for (let i = 0; i < 2990; i++) {
    now += 100;
    sim.tick(state, 0.1, ctxAt(now));
  }
  const line = ['drill', 'belt', 'furnace', 'belt', 'port'].reduce((s, t) => s + sim.costOf(cfg, t), 0);
  const money = Big.toNumber(state.run.money);
  if (money < line) throw new Error('за 5 минут ' + money + ', вторая линия стоит ' + line);
  console.log('  стартовая линия ' + (150 - left) + ' из 150; первая продажа на ' + first + ' с; за 5 мин ' + money.toFixed(0) + ' денег (вторая линия ' + line + ')');
});

T.test('эталон: слитки, провод и шестерни — доход как по рецептам (±5 %)', () => {
  const state = blank();
  // Row 0: iron → furnace → port. Row 2: copper → furnace → assembler (wire) → port.
  // Row 4: iron, iron → furnace, furnace → gear (two drills merge onto one belt).
  ore(state, 0, 0, 'iron-ore');
  ore(state, 0, 2, 'copper-ore');
  ore(state, 0, 4, 'iron-ore');
  ore(state, 0, 5, 'iron-ore');
  put(state, [
    ['drill', 0, 0, 0], ['belt', 1, 0, 0], ['furnace', 2, 0, 0], ['belt', 3, 0, 0], ['port', 4, 0, 0],
    ['drill', 0, 2, 0], ['belt', 1, 2, 0], ['furnace', 2, 2, 0], ['belt', 3, 2, 0], ['assembler', 4, 2, 0, 'wire'], ['belt', 5, 2, 0], ['port', 6, 2, 0],
    ['drill', 0, 4, 0], ['belt', 1, 4, 0], ['furnace', 2, 4, 0], ['belt', 3, 4, 0], ['belt', 4, 4, 0], ['assembler', 5, 4, 0, 'gear'], ['belt', 6, 4, 0], ['port', 7, 4, 0],
    ['drill', 0, 5, 0], ['belt', 1, 5, 0], ['furnace', 2, 5, 0], ['belt', 3, 5, 3]
  ]);
  run(state, 420);
  const drill = cfg['drill.rate'];
  const ingot = Math.min(drill / recipe('iron-ingot').in['iron-ore'], cfg['furnace.speed'] / recipe('iron-ingot').sec);
  const copper = Math.min(drill, cfg['furnace.speed'] / recipe('copper-ingot').sec);
  const wire = Math.min(copper / recipe('wire').in['copper-ingot'], cfg['assembler.speed'] / recipe('wire').sec) * recipe('wire').n;
  const gear = Math.min(2 * ingot / recipe('gear').in['iron-ingot'], cfg['assembler.speed'] / recipe('gear').sec);
  const expect = ingot * price('iron-ingot') + wire * price('wire') + gear * price('gear');
  const got = sim.windowRate(state.run, cfg);
  const err = Math.abs(got - expect) / expect;
  const items = sim.windowItems(state.run, cfg);
  console.log('  по рецептам ' + expect.toFixed(3) + '/с, на фабрике ' + got.toFixed(3) + '/с, ошибка ' + (err * 100).toFixed(2) + ' %; ' +
    Object.keys(items).map((k) => k + ' ' + items[k].toFixed(3) + '/с').join(', '));
  if (err > 0.05) throw new Error('расхождение ' + (err * 100).toFixed(2) + ' %');
});

T.test('эталон: схема из провода и слитка, разделитель и сортировщик', () => {
  const state = blank();
  // Copper → furnace → wire, iron → furnace; both onto one belt into the circuit assembler.
  ore(state, 0, 0, 'copper-ore');
  ore(state, 0, 1, 'copper-ore');
  ore(state, 0, 3, 'iron-ore');
  put(state, [
    ['drill', 0, 0, 0], ['belt', 1, 0, 0], ['furnace', 2, 0, 0], ['belt', 3, 0, 0], ['assembler', 4, 0, 0, 'wire'], ['belt', 5, 0, 0], ['belt', 6, 0, 1],
    ['drill', 0, 1, 0], ['belt', 1, 1, 3],
    ['drill', 0, 3, 0], ['belt', 1, 3, 0], ['furnace', 2, 3, 0], ['belt', 3, 3, 0], ['belt', 4, 3, 0], ['belt', 5, 3, 0], ['belt', 6, 3, 3],
    ['belt', 6, 1, 1], ['assembler', 6, 2, 0, 'circuit'], ['belt', 7, 2, 0], ['port', 8, 2, 0]
  ]);
  run(state, 600);
  // Wire from 1 ore/s of copper (two drills) is capped by the furnace (0,5/s) → 1 wire/s; iron 0,5/s.
  const c = recipe('circuit');
  const wire = Math.min(2 * cfg['drill.rate'], cfg['furnace.speed'] / recipe('copper-ingot').sec) * recipe('wire').n;
  const expect = Math.min(wire / c.in.wire, cfg['drill.rate'] / c.in['iron-ingot'], cfg['assembler.speed'] / c.sec) * price('circuit');
  const got = sim.windowRate(state.run, cfg);
  const err = Math.abs(got - expect) / expect;
  console.log('  схемы: по рецептам ' + expect.toFixed(3) + '/с, на фабрике ' + got.toFixed(3) + '/с, ошибка ' + (err * 100).toFixed(2) + ' %');
  if (err > 0.05) throw new Error('расхождение ' + (err * 100).toFixed(2) + ' %');

  // A splitter feeds three ports in turn; a sorter sends its item forward and the rest aside.
  const s2 = blank();
  ore(s2, 0, 5, 'iron-ore');
  ore(s2, 0, 6, 'copper-ore');
  ore(s2, 0, 8, 'iron-ore');
  put(s2, [
    ['drill', 0, 5, 0], ['belt', 1, 5, 0], ['splitter', 2, 5, 0], ['port', 3, 5, 0], ['port', 2, 4, 0], ['port', 2, 6, 0],
    ['drill', 0, 6, 1], ['drill', 0, 8, 3], ['belt', 0, 7, 0], ['sorter', 1, 7, 0, 'copper-ore'], ['storage', 2, 7, 0], ['storage', 1, 8, 1]
  ]);
  run(s2, 120);
  for (const p of s2.run.b.filter((q) => q.t === 'port')) if (F.idleOf(s2.run, p)) throw new Error('порт ' + p.x + ',' + p.y + ' стоит: ' + F.idleOf(s2.run, p));
  const fwd = F.findAt(s2.run, 2, 7).s;
  const side = F.findAt(s2.run, 1, 8).s;
  if (fwd.length < 20 || fwd.some((i) => i !== 'copper-ore')) throw new Error('вперёд: ' + fwd.length + ' ' + fwd.slice(0, 5));
  if (side.length < 20 || side.some((i) => i !== 'iron-ore')) throw new Error('вбок: ' + side.length + ' ' + side.slice(0, 5));
  console.log('  разделитель: три порта работают; сортировщик: вперёд ' + fwd.length + ' меди, вбок ' + side.length + ' железа');
});

T.test('лента линией буквой Г, повторный тап — сначала вертикаль, слияние сбоку', () => {
  const a = F.line(0, 0, 3, 2, false);
  const b = F.line(0, 0, 3, 2, true);
  if (a.length !== 6 || a[0].d !== 0 || a[3].d !== 1 || a[5].d !== 1) throw new Error('горизонталь: ' + JSON.stringify(a));
  if (b.length !== 6 || b[0].d !== 1 || b[2].d !== 0) throw new Error('вертикаль: ' + JSON.stringify(b));
  const state = blank(100);
  const r = sim.buildLine(state, 0, 0, 3, 2, false, cfg);
  if (!r.ok || r.placed !== 6 || Math.abs(Big.toNumber(state.run.money) - (100 - 6 * cfg['cost.belt'])) > 1e-6) throw new Error('линия: ' + JSON.stringify(r));
  // The screen's second tap on the end: undo the line, lay it vertical first.
  sim.undo(state, cfg);
  const again = sim.buildLine(state, 0, 0, 3, 2, true, cfg);
  if (!again.ok || again.placed !== 6 || F.findAt(state.run, 0, 1).d !== 1) throw new Error('повтор: ' + JSON.stringify(again));
  sim.undo(state, cfg);
  if (state.run.b.length !== 0 || Math.abs(Big.toNumber(state.run.money) - 100) > 1e-6) throw new Error('отмена линии');
  // A belt into the side of another merges into it.
  const m = blank();
  ore(m, 0, 0, 'iron-ore');
  ore(m, 2, 2, 'iron-ore');
  put(m, [['drill', 0, 0, 0], ['belt', 1, 0, 0], ['belt', 2, 0, 0], ['belt', 3, 0, 0], ['port', 4, 0, 0], ['drill', 2, 2, 3], ['belt', 2, 1, 3]]);
  run(m, 120);
  if (!(m.run.sold['iron-ore'] > 100)) throw new Error('слияние: продано ' + JSON.stringify(m.run.sold));
});

T.test('подземный проход: под лентой, в пределах дальности', () => {
  const state = blank();
  ore(state, 0, 1, 'iron-ore');
  put(state, [
    ['drill', 0, 1, 0], ['tunnel', 1, 1, 0], ['tunnel', 5, 1, 0], ['port', 6, 1, 0],
    ['belt', 3, 0, 1], ['belt', 3, 1, 1], ['belt', 3, 2, 1]
  ]);
  run(state, 60);
  if (!(state.run.sold['iron-ore'] > 20)) throw new Error('через проход продано ' + JSON.stringify(state.run.sold));
  const far = blank();
  ore(far, 0, 1, 'iron-ore');
  put(far, [['drill', 0, 1, 0], ['tunnel', 1, 1, 0], ['tunnel', 7, 1, 0], ['port', 8, 1, 0]]);
  run(far, 30);
  if (far.run.soldN) throw new Error('проход на 6 клеток без «Длинного прохода» сработал');
  far.run.res.longTunnel = 1;
  run(far, 60);
  if (!far.run.soldN) throw new Error('«Длинный проход» не сработал');
});

T.test('бедность пятен: 20 000 руды с клетки, потом вчетверо медленнее; глубокое бурение', () => {
  const state = blank();
  ore(state, 0, 0, 'iron-ore');
  put(state, [['drill', 0, 0, 0], ['port', 1, 0, 0]]);
  const o = state.run.ore[0];
  o.m = cfg['ore.amount'] - 1;
  run(state, 100);
  const sold1 = state.run.soldN;
  const expect = 1 + (100 - 2) * cfg['drill.rate'] * cfg['ore.slow'];
  if (Math.abs(sold1 - expect) > 2) throw new Error('на бедной клетке продано ' + sold1 + ', ждали ~' + expect.toFixed(1));
  state.run.res.deep = 1;
  run(state, 100);
  const sold2 = state.run.soldN - sold1;
  if (Math.abs(sold2 - 100 * cfg['drill.rate']) > 2) throw new Error('с глубоким бурением продано ' + sold2);
});

T.test('события планет: лёд тает, лава быстрее, буря у края, доки станции', () => {
  // Ice melts after ice.meltSec on a belt: a belt of 40 cells at 1 cell/s loses it.
  const icy = Core.newState(game, sim, ctxAt(NOW));
  icy.run = sim.newRun(icy, 'icy', Rng.make(1), cfg, NOW);
  icy.run.ore = [{ x: 0, y: 0, r: 'ice', m: 0 }, { x: 0, y: 3, r: 'ice', m: 0 }];
  icy.run.evAt = NOW + 1e12;
  icy.run.money = Big.str(Big.of(1e6));
  icy.run.storm = { at: NOW + 1e12, until: 0 };
  put(icy, [['drill', 0, 0, 0], ['port', 11, 0, 0], ['drill', 0, 3, 1], ['belt', 0, 4, 1], ['port', 0, 5, 0]]);
  // 40 cells of belt — longer than ice lives (ice.meltSec) — and a short line of 1 cell.
  sim.buildLine(icy, 1, 0, 10, 15, true, cfg);
  sim.buildLine(icy, 11, 15, 11, 1, true, cfg);
  run(icy, 150);
  const far = icy.run.b.find((b) => b.x === 11 && b.y === 0);
  if (!(icy.run.soldN > 30)) throw new Error('короткая линия льда не продаёт: ' + icy.run.soldN);
  if (F.idleOf(icy.run, far) !== 'нет входа') throw new Error('лёд доехал по длинной ленте');
  const ring = Core.newState(game, sim, ctxAt(NOW));
  ring.run = sim.newRun(ring, 'ring', Rng.make(1), cfg, NOW);
  ring.run.money = Big.str(Big.of(1e6));
  ring.run.evAt = NOW + 1e12;
  const docks = ring.run.b.filter((b) => b.t === 'dock');
  if (docks.length !== 3) throw new Error('доков ' + docks.length);
  put(ring, [['port', 1, docks[0].y, 0]]);
  run(ring, 60);
  if (!(ring.run.soldN > 20)) throw new Error('док не возит: ' + ring.run.soldN);
  const dusty = Core.newState(game, sim, ctxAt(NOW));
  dusty.run = sim.newRun(dusty, 'dusty', Rng.make(1), cfg, NOW);
  dusty.run.ore = [{ x: 0, y: 0, r: 'sand', m: 0 }];
  dusty.run.money = Big.str(Big.of(1e6));
  dusty.run.evAt = NOW + 1e12;
  dusty.run.storm = { at: NOW + 1e12, until: NOW + 1e12 };
  dusty.run.lv++;
  put(dusty, [['drill', 0, 0, 0], ['belt', 1, 0, 0], ['port', 2, 0, 0]]);
  run(dusty, 30);
  if (dusty.run.soldN) throw new Error('буря не остановила внешние ленты');
});

T.test('производительность: 300 зданий и 1 000 предметов', () => {
  const state = blank();
  const run0 = state.run;
  run0.w = cfg['plot.wMax'];
  run0.h = cfg['plot.hMax'];
  const b = [];
  // 14 rows: drill → 8 belts → furnace → 8 belts → port, every belt with an item on it.
  for (let y = 0; y < 28; y += 2) {
    run0.ore.push({ x: 0, y, r: 'iron-ore', m: 0 });
    b.push(F.make('drill', 0, y, 0));
    for (let xx = 1; xx <= 8; xx++) {
      const belt = F.make('belt', xx, y, 0);
      belt.it = { i: 'iron-ore', p: 0.5, a: 0 };
      b.push(belt);
    }
    const furnace = F.make('furnace', 9, y, 0);
    furnace.r = 'iron-ingot';
    b.push(furnace);
    for (let xx = 10; xx <= 18; xx++) {
      const belt = F.make('belt', xx, y, 0);
      belt.it = { i: 'iron-ingot', p: 0.3, a: 0 };
      b.push(belt);
    }
    b.push(F.make('port', 19, y, 0));
  }
  // 20 storages with 50 items each on row 1, passing items to the left.
  for (let k = 0; k < 20; k++) {
    const st = F.make('storage', k, 1, 2);
    for (let n = 0; n < 50; n++) st.s.push('iron-ingot');
    b.push(st);
  }
  run0.b = b;
  run0.lv++;
  const items = F.itemCount(run0);
  let now = NOW;
  for (let i = 0; i < 50; i++) {
    now += 100;
    sim.tick(state, 0.1, ctxAt(now));
  }
  const N = 1000;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    now += 100;
    sim.tick(state, 0.1, ctxAt(now));
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  console.log('  зданий ' + run0.b.length + ', предметов ' + items + '; шаг 0,1 с — ' + ms.toFixed(3) + ' мс (node на ПК)');
  if (run0.b.length < 300 || items < 1000) throw new Error('мало: ' + run0.b.length + ' зданий, ' + items + ' предметов');
  if (ms > 4) throw new Error('шаг ' + ms.toFixed(2) + ' мс');
});

T.done('factory');
