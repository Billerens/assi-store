// node tests/pace.test.js — the pace of «Темп» over a week of metro trips. A factory bot that
// lays out belts cannot be written for the kit (checks.js: pace: false), so this is an economy
// model on the real numbers: research prices (sim.researchCost), the plot and its ore cells
// (sim.buyResearch → the real «Межевание»), speeds and prices (sim.speeds, sim.priceMul), the
// offline share and the engine's cap (Core.plan), the threshold and the credits (Core.prestige).
// What the model adds — and says so — is the player:
//   * a line is a chain per ore cell; its income is drill rate × value of the ore in the product
//     (price / ore per item, by the planet's recipes) — the reference lines in factory.test.js
//     check that the real factory pays exactly this;
//   * the player places about BUILD buildings a trip (a 25 minute trip in the metro; belts
//     do not count), learns one depth of recipes a trip, and turns cells to deeper products;
//   * orders add ORDERS of the online income (3 cards × 2,5 × 5 minutes of one product).
'use strict';
const T = require('./env.js');
const x = T.open();
const { sim, Core, Big, Rng, game } = x;

const BUILD = 30;
const ORDERS = 0.5;
const TRIP_MIN = 25;
const HOUR = 3600000;
const MIN = 60000;

/** Ore per one item of `id` on planet p (raw resources count 1). */
function orePer(p, id, seen) {
  const r = (p.recipes || []).find((q) => q.out === id);
  if (!r) return 1;
  seen = seen || {};
  if (seen[id]) return Infinity;
  seen[id] = true;
  let n = 0;
  for (const k in r.in) n += orePer(p, k, Object.assign({}, seen)) * r.in[k];
  return n / r.n;
}

/** Crafters (fractional) to make `rate` items/s of id, by kind: {furnace, assembler}. */
function crafters(p, id, rate, cfg, out) {
  const r = (p.recipes || []).find((q) => q.out === id);
  if (!r) return out;
  const speed = r.at === 'furnace' ? cfg['furnace.speed'] : cfg['assembler.speed'];
  out[r.at] = (out[r.at] || 0) + rate / r.n * r.sec / speed;
  for (const k in r.in) crafters(p, k, rate / r.n * r.in[k], cfg, out);
  return out;
}

function depth(p, id) {
  const r = (p.recipes || []).find((q) => q.out === id);
  if (!r) return 0;
  let d = 0;
  for (const k in r.in) d = Math.max(d, depth(p, k));
  return d + 1;
}

/** The tiers of a planet: the best product of each depth (the goal last). */
function tiers(p, cfg, items) {
  const byDepth = {};
  for (const r of p.recipes) {
    if (r.out === p.goal) continue;
    const d = depth(p, r.out);
    const ore = orePer(p, r.out);
    const vpo = items[r.out].price * r.n / (ore * r.n);
    if (!byDepth[d] || vpo > byDepth[d].vpo) byDepth[d] = { id: r.out, depth: d, vpo, lock: r.lock };
  }
  const list = Object.keys(byDepth).sort((a, b) => a - b).map((d) => byDepth[d]);
  list.push({ id: p.goal, depth: depth(p, p.goal), vpo: items[p.goal].price / orePer(p, p.goal), lock: 'top', goal: true });
  for (const t of list) {
    const c = crafters(p, t.id, cfg['drill.rate'] / orePer(p, t.id), cfg, {});
    const crafts = (c.furnace || 0) + (c.assembler || 0);
    // Whole buildings: a chain rounds up; sorters, splitters and a port share — 1,3 on top.
    t.per = 1 + crafts * 1.3 + 0.3;
    t.cost = cfg['cost.drill'] + (c.furnace || 0) * 1.3 * cfg['cost.furnace'] + (c.assembler || 0) * 1.3 * cfg['cost.assembler'] +
      0.3 * cfg['cost.port'] + t.per * 4 * cfg['cost.belt'] + 0.2 * cfg['cost.sorter'];
  }
  return list;
}

function simulate(cfg, o) {
  o = o || {};
  const rng = Rng.make(2026);
  let now = Date.UTC(2026, 10, 2, 7, 0, 0);
  const ctx = () => T.ctxOf(x, { now, config: cfg, rng });
  const state = Core.newState(game, sim, ctx());
  const items = sim.data().items;
  let planet = null;
  let T0 = null;
  let cells = [];
  let budget = 0;
  let trip = 0;
  let ptrip = 0;
  const log = [];
  const marks = {};
  function mark(name) {
    if (marks[name]) return;
    marks[name] = { trip, day: Math.floor((trip - 1) / 2) + 1 };
    log.push('поездка ' + trip + ' (день ' + marks[name].day + '): ' + name);
  }
  function setPlanet() {
    planet = sim.planetDef(state, state.run.planet);
    T0 = tiers(planet, cfg, items);
    cells = [];
  }
  setPlanet();
  const lv = (id) => sim.level(state.run, id);
  function oreCells() { return planet.docks ? 6 * planet.docks + 4 * lv('land') : state.run.ore.length; }
  function speedMul(tier) {
    const s = sim.speeds(state, cfg);
    let m = Math.min(s.drill / cfg['drill.rate'], s.furnace / cfg['furnace.speed']);
    if (tier > 0) m = Math.min(m, s.assembler / cfg['assembler.speed']);
    return m;
  }
  function income() {
    let sum = 0;
    for (const c of cells) {
      const t = T0[c];
      sum += cfg['drill.rate'] * speedMul(c) * t.vpo * sim.priceMul(state.run, cfg);
    }
    return sum;
  }
  const money = () => Big.toNumber(state.run.money);
  function pay(n) {
    if (money() < n) return false;
    state.run.money = Big.str(Big.sub(state.run.money, n));
    return true;
  }
  function earn(n) {
    state.run.money = Big.str(Big.add(state.run.money, n));
    state.run.earned = Big.str(Big.add(state.run.earned, n));
  }
  function research(id) {
    if (!sim.canResearch(state, id, cfg)) return false;
    sim.buyResearch(state, id, cfg, rng, now);
    return true;
  }
  function available(k) {
    const t = T0[k];
    if (t.lock && !lv(t.lock)) return false;
    // One depth of recipes a trip on the first planet; on the next ones the player knows them.
    const learned = prestiges.length ? ptrip + 1 : ptrip - 1;
    if (t.goal) return learned >= 3;
    return k <= learned;
  }
  function decide() {
    // Research first: what pays, then the conveniences the spec places in «Час» and «День».
    if (cells.length >= 8) research('deep');
    if (marks['провод и шестерни']) research('counters');
    if (cells.length >= 6) research('idle');
    if (money() > 4 * Big.toNumber(sim.researchCost(state, 'night', cfg))) research('night');
    if (cells.length >= oreCells()) research('land');
    if (ptrip >= 2 && money() > 2 * Big.toNumber(sim.researchCost(state, 'top', cfg))) research('top');
    if (ptrip >= 2) research('advanced');
    if (lv('top')) research('blueprints');
    let guard = 0;
    while (guard++ < 40) {
      const ids = ['drills', 'furnaces', 'assembly', 'trade'];
      let best = null;
      for (const id of ids) {
        const cost = Big.toNumber(sim.researchCost(state, id, cfg));
        if (cost > 0.4 * money()) continue;
        if (!best || cost < best.cost) best = { id, cost };
      }
      if (!best || !research(best.id)) break;
    }
    // Then buildings: new cells at the best tier, then deeper products on old cells.
    let top = 0;
    for (let k = 0; k < T0.length; k++) if (available(k)) top = k;
    guard = 0;
    while (guard++ < 200 && cells.length < oreCells() && budget >= T0[top].per) {
      let k = top;
      while (k > 0 && money() < T0[k].cost) k--;
      if (!pay(T0[k].cost)) break;
      budget -= T0[k].per;
      cells.push(k);
    }
    guard = 0;
    while (guard++ < 200) {
      let i = cells.findIndex((c) => c < top);
      if (i < 0) break;
      const from = cells[i];
      const need = T0[top].per - T0[from].per * 0.5;
      if (budget < need || !pay(T0[top].cost - T0[from].cost * 0.5)) break;
      budget -= need;
      cells[i] = top;
    }
    if (cells.some((c) => c >= 1)) mark('провод и шестерни');
    if (cells.some((c) => c >= 2)) mark('схемы и моторы');
    if (lv('land')) mark('вторая полоса участка');
    if (lv('top')) mark('исследование главного изделия');
    if (lv('blueprints')) mark('чертежи');
    if (cells.filter((c) => T0[c].goal).length >= 6) {
      state.run.goalSold = Math.max(state.run.goalSold, 1);
      mark('первые дроны');
    }
  }
  const prestiges = [];
  const gaps = [9 * HOUR, 15 * HOUR - 2 * TRIP_MIN * MIN];
  const days = o.days || 14;
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < 2; k++) {
      trip++;
      ptrip++;
      budget += BUILD;
      for (let m = 0; m < TRIP_MIN; m++) {
        decide();
        earn(income() * 60 * (1 + ORDERS) * (1 + 0 * m));
        now += MIN;
        const info = Core.prestigeInfo(sim, game, state, 'planet', cfg);
        if (info.can && info.hint) {
          const r = Core.prestige(sim, game, state, 'planet', ctx());
          if (r.ok) {
            prestiges.push({ trip, day: d + 1, gain: Big.toNumber(r.gain), planet: state.run.planet });
            log.push('поездка ' + trip + ' (день ' + (d + 1) + '): новая планета → ' + state.run.planet + ', кредитов ' + Big.toNumber(r.gain));
            setPlanet();
            ptrip = 1;
            budget = BUILD;
          }
        }
      }
      if (trip === 1) log.push('конец первой поездки: доход ' + income().toFixed(1) + '/с, клеток ' + cells.length);
      const p = Core.plan(now, now + gaps[k], cfg, 0);
      const share = lv('night') ? cfg['offline.shareNight'] : cfg['offline.share'];
      earn(income() * share * (p.to - p.from) / 1000 * p.efficiency);
      now += gaps[k];
      if (o.verbose) log.push('  после поездки ' + trip + ': доход ' + income().toFixed(1) + '/с, заработано ' + Big.str(state.run.earned) + ', клеток ' + cells.length + '/' + oreCells() + ' ' + JSON.stringify(cells.reduce((a, c) => { a[c] = (a[c] || 0) + 1; return a; }, {})));
    }
  }
  return { prestiges, marks, log, income: income(), state };
}

T.test('темп: неделя до первой новой планеты (модель экономики на числах игры)', () => {
  const cfg = Object.assign({}, x.cfg);
  if (process.env.MIN_EARNED) cfg['planet.minEarned'] = process.env.MIN_EARNED;
  const r = simulate(cfg, { verbose: !!process.env.VERBOSE });
  console.log('  ' + r.log.join('\n  '));
  const first = r.prestiges[0];
  if (!first) throw new Error('за две недели ни одной новой планеты');
  if (first.day < 4 || first.day > 8) throw new Error('первая новая планета на день ' + first.day + ', а в «Темпе» — неделя');
  if (!r.marks['провод и шестерни'] || r.marks['провод и шестерни'].trip > 3) throw new Error('провод и шестерни поздно');
  if (!r.marks['схемы и моторы'] || r.marks['схемы и моторы'].day > 2) throw new Error('схемы и моторы позже второго дня');
  if (r.prestiges.length < 2) throw new Error('за две недели одна планета');
});

T.done('pace');
