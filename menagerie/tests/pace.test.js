'use strict';
const assert = require('assert');
const { H, open, ctx } = require('./env');
const { x } = open();
const { sim, Core, Big, Rng, cfg, game } = x;
const START = Date.UTC(2026, 10, 2, 5);

function quality(beast) { return beast.genes.reduce((a, b) => a + b, 0); }

// The player opens the game twice daily for 25 minutes. No currency, experience,
// free chests or steps energy is injected; every reward comes from game actions.
function run(days, seed) {
  const rng = Rng.make(seed);
  let now = START;
  const s = Core.newState(game, sim, ctx(x, now, rng));
  const result = { seed, firstBuySec: null, firstFightSec: null, firstEggSec: null, firstExpeditionTrip: null, trips: [], fights: 0, wins: 0, births: 0, retirements: 0 };
  const bought = id => Number(s.run.upgrades[id] || 0);
  const plan = [ ['feed', 1], ['nest', 1], ['aviary', 1], ['training', 1], ['nest', 2], ['banners', 1], ['catcher', 1], ['training', 2], ['aviary', 2], ['bedding', 1], ['vet', 1], ['incubator', 1] ];

  function actions(trip) {
    const c = ctx(x, now, rng);
    if (s.run.event) {
      if (s.run.event.id === 'guest') {
        for (let tap = 0; tap < 3 && s.run.event; tap++) sim.eventAction(s, 'tame', null, c);
      } else if (s.run.event.id === 'circus' && s.run.beasts.length > 4 && !bought('training')) {
        const sale = s.run.beasts.slice().sort((a, b) => (a.level < 5 ? -1000 : 0) + quality(a) - ((b.level < 5 ? -1000 : 0) + quality(b)))[0];
        sim.eventAction(s, 'sell', sale.id, c);
      } else sim.eventAction(s, 'dismiss', null, c);
    }
    for (const [id, level] of plan) {
      if (bought(id) >= level) continue;
      if (sim.buy(s, id, cfg)) { if (result.firstBuySec === null) result.firstBuySec = (now - START) / 1000; }
      break;
    }
    // Keep three breeders/fighters; replace weak or exhausted animals when
    // nursery space is needed, releasing the others into the sanctuary.
    const sorted = s.run.beasts.slice().sort((a, b) => quality(b) - quality(a));
    const breeders = sorted.filter(b => b.level >= 5 && b.eggs < cfg['breed.maxEggs']);
    const protectedIds = breeders.slice(0, 4).map(b => b.id);
    const young = sorted.filter(b => b.level < 5).slice(0, 2).map(b => b.id);
    const crowded = s.run.beasts.length + s.run.eggs.length >= sim.capacity(s, cfg) - 1;
    const redundant = s.run.beasts.length > 6;
    if (s.run.beasts.length > 3 && (crowded || redundant)) {
      const candidate = sorted.slice().reverse().find(b => !protectedIds.includes(b.id) && (!young.includes(b.id) || crowded));
      if (candidate && sim.retire(s, candidate.id, c).ok) result.retirements++;
    }
    if (bought('catcher')) sim.catchWild(s, c);
    const parents = s.run.beasts.filter(b => b.level >= 5 && b.eggs < cfg['breed.maxEggs'] && b.restUntil <= now).sort((a, b) => quality(b) - quality(a));
    for (let index = 0; index + 1 < parents.length; index += 2) {
      const before = s.run.eggs.length;
      if (sim.breed(s, parents[index].id, parents[index + 1].id, c).ok) {
        result.births += s.run.eggs.length - before;
        if (result.firstEggSec === null) result.firstEggSec = (now - START) / 1000;
      }
    }
    const ready = s.run.beasts.filter(b => b.readyAt <= now && !b.sick);
    ready.sort((a, b) => (a.level < 5 ? 1000 : 0) + quality(a) - ((b.level < 5 ? 1000 : 0) + quality(b)));
    const team = ready.reverse().slice(0, 3).map(b => b.id);
    if (team.length === 3) {
      sim.setTeam(s, team, cfg);
      const fight = sim.fight(s, c, false);
      if (fight.ok) {
        result.fights++;
        if (fight.battle && fight.battle.win) result.wins++;
        if (result.firstFightSec === null) result.firstFightSec = (now - START) / 1000;
      }
    }
    if (result.firstExpeditionTrip === null && s.run.beasts.length >= 3) {
      const founders = s.run.beasts.slice().sort((a, b) => quality(b) - quality(a)).slice(0, 3).map(b => b.id);
      sim.selectFounders(s, founders);
      const extras = s.run.beasts.filter(b => !founders.includes(b.id));
      const canRetireForTrip = Number(s.meta.genePool) + extras.reduce((sum, b) => sum + sim.retirementGain(b, s, cfg), 0);
      if (canRetireForTrip >= cfg['expedition.threshold']) {
        for (const beast of extras) if (sim.retire(s, beast.id, c).ok) result.retirements++;
      }
      const pool = s.meta.genePool;
      if (Core.prestige(sim, game, s, 'expedition', c).ok) {
        result.firstExpeditionTrip = trip;
        result.expeditionPool = pool;
        result.expeditionDays = (now - START) / 86400000;
      }
    }
  }

  for (let day = 0; day < days; day++) {
    for (let tripInDay = 0; tripInDay < 2; tripInDay++) {
      const trip = day * 2 + tripInDay + 1;
      for (let sec = 0; sec < 1500; sec += 5) {
        actions(trip);
        now += 5000;
        sim.tick(s, 5, ctx(x, now, rng));
      }
      result.trips.push({ trip, coins: Big.str(Big.of(s.run.coins)), pool: Number(s.meta.genePool), league: s.run.league, step: s.run.step, maxGeneration: Math.max(...s.run.beasts.map(b => b.generation), ...s.run.eggs.map(e => e.beast.generation)), beasts: s.run.beasts.length, eggs: s.run.eggs.length, upgrades: Object.assign({}, s.run.upgrades) });
      assert.strictEqual(Core.validate(s, game), null);
      assert.strictEqual(sim.validate(s), null);
      const gap = tripInDay === 0 ? 9 * 3600000 : 15 * 3600000 - 50 * 60000;
      const plan = Core.plan(now, now + gap, cfg, 0);
      Core.runOffline(sim, s, game, plan, null, seg => ctx(x, seg.to, rng), cfg);
      now += gap; s.lastTick = now;
    }
  }
  result.final = { pool: Number(s.meta.genePool), continent: s.meta.continent, league: s.run.league, step: s.run.step };
  return result;
}

if (require.main === module) H.test('темп: две поездки по 25 минут в день, экспедиция за неделю на четырёх семенах', () => {
  for (const seed of [12345, 1, 777, 42]) {
    const result = run(7, seed);
    console.log('  Темп ' + JSON.stringify({ seed, firstBuySec: result.firstBuySec, firstFightSec: result.firstFightSec, firstEggSec: result.firstEggSec, firstExpeditionTrip: result.firstExpeditionTrip, days: result.expeditionDays, pool: result.expeditionPool, fights: result.fights, wins: result.wins, eggs: result.births, retirements: result.retirements }));
    assert.ok(result.firstBuySec <= 10 && result.firstBuySec !== null);
    assert.ok(result.firstFightSec <= 300 && result.firstFightSec !== null);
    assert.ok(result.firstEggSec <= 300 && result.firstEggSec !== null);
    assert.ok(result.firstExpeditionTrip !== null && result.firstExpeditionTrip <= 14, 'seed ' + seed + ': нет экспедиции за 14 поездок, генофонд ' + result.final.pool.toFixed(2));
  }
});

if (require.main === module) H.done('menagerie: темп');
module.exports = { run };
