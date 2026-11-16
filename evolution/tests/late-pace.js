'use strict';
const { open, ctx, fresh } = require('./env');
const { x } = open();
const { sim, cfg, Rng } = x;
const rng = Rng.make(12345);
const state = fresh(x, 12345);
let now = 1000000;
sim.enterStage(state, ctx(x, now, rng), 6);
state.run.legacy = 3;
for (let stage = 6; stage <= 8; stage++) {
  const limit = stage === 8 ? 30 * 86400 : 24 * 3600;
  const dt = stage === 8 ? 30 : 1;
  let elapsed = 0;
  for (; elapsed < limit && !sim.canAdvance(state, cfg); elapsed += dt) {
    sim.botPlay(state, ctx(x, now, rng));
    now += dt * 1000;
    sim.tick(state, dt, ctx(x, now, rng));
  }
  console.log(JSON.stringify({ stage, seconds: elapsed, hours: elapsed / 3600, days: elapsed / 86400, ready: sim.canAdvance(state, cfg), resource: x.Big.str(state.run.resource), epoch: state.run.epoch, worlds: state.run.worlds, people: state.run.people, producers: state.run.producers, sparkGain: x.Big.str(sim.prestigeGain(state, 'universe', cfg)) }));
  if (!sim.canAdvance(state, cfg)) break;
  sim.advance(state, ctx(x, now, rng));
}
const offState = fresh(x, 71);
let offNow = 1000000;
sim.enterStage(offState, ctx(x, offNow, Rng.make(71)), 8);
offState.run.legacy = 3;
let sessions = 0;
for (; sessions < 60 && !sim.canAdvance(offState, cfg); sessions++) {
  for (let second = 0; second < 25 * 60 && !sim.canAdvance(offState, cfg); second += 30) {
    sim.botPlay(offState, ctx(x, offNow, Rng.make(71)));
    offNow += 30000;
    sim.tick(offState, 30, ctx(x, offNow, Rng.make(71)));
  }
  if (sim.canAdvance(offState, cfg)) break;
  const gap = sessions % 2 === 0 ? 9 * 3600 : 14 * 3600 + 10 * 60;
  offState.lastTick = offNow;
  const plan = x.Core.plan(offNow, offNow + gap * 1000, cfg, sim.capBonusHours(offState));
  x.Core.runOffline(sim, offState, x.game, plan, null, (segment) => ctx(x, segment.to, Rng.make(71)), cfg);
  offNow += gap * 1000;
}
console.log(JSON.stringify({ scenario: 'space-two-25-minute-sessions-per-day', sessions: sessions + 1, days: (offNow - 1000000) / 86400000, worlds: offState.run.worlds, ready: sim.canAdvance(offState, cfg) }));
