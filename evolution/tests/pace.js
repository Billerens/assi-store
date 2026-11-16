'use strict';
const { open, ctx, fresh } = require('./env');
const { x } = open();
const { sim, cfg, Rng } = x;
const state = fresh(x, 12345);
const rng = Rng.make(12345);
const durations = [];
let firstBuy = null;
let stageStart = 0;
let second = 0;
for (; state.run.stage <= 5 && second < 14400; second++) {
  const context = ctx(x, 1000000 + second * 1000, rng);
  const bought = sim.botPlay(state, context);
  if (bought && firstBuy === null) firstBuy = second;
  sim.tick(state, 1, ctx(x, context.now + 1000, rng));
  if (sim.canAdvance(state, cfg)) {
    const duration = second + 1 - stageStart;
    durations.push(duration);
    console.log('stage ' + state.run.stage + ': ' + duration + 's (' + (duration / 60).toFixed(2) + 'min)');
    stageStart = second + 1;
    sim.advance(state, ctx(x, context.now + 1000, rng));
  }
}
console.log(JSON.stringify({ firstBuy, durations, seconds: second, hours: second / 3600, currentStage: state.run.stage, sparks: x.Big.str(sim.prestigeGain(state, 'universe', cfg)) }));
