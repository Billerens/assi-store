'use strict';
const { open, ctx, fresh } = require('./env');
const { x } = open();
const { sim, cfg, Big, Rng } = x;
const state = fresh(x, 12345);
const rng = Rng.make(12345);
sim.enterStage(state, ctx(x, 1000000, rng), 3);
state.run.legacy = 1.9;
let firstGoal = null;
for (let second = 0; second < 3600; second++) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const rate = sim.income(state, cfg);
    let selected = -1;
    let best = Big.of('1e300');
    for (let index = 0; index < 5; index++) {
      state.run.producers[index]++;
      const extra = Big.sub(sim.income(state, cfg), rate);
      state.run.producers[index]--;
      const roi = Big.div(sim.cost(state, cfg, index), Big.max(extra, '1e-30'));
      if (Big.lt(roi, best)) { best = roi; selected = index; }
    }
    if (selected < 0 || Big.gt(best, cfg['bot.multiRoiSec']) || !sim.buy(state, cfg, selected)) break;
  }
  sim.tick(state, 1, ctx(x, 1000000 + (second + 1) * 1000, rng));
  if (firstGoal === null && sim.canAdvance(state, cfg)) firstGoal = second + 1;
}
console.log(JSON.stringify({ scenario: 'one-hour-without-mutations-or-event-rewards', resource: Big.str(state.run.resource), firstGoal, producers: state.run.producers, generation: state.run.generation, pending: state.run.pendingMutations.length, pace: cfg['stage3.pace'] }));
