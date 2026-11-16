// A reproducible economy bot: every 0.5 s buys Resonance first, then tiers top down.
'use strict';
const { open, ctx } = require('./env');
function progression(stopAt, maxHours, onMilestone) {
  const x = open();
  const { sim, cfg, N, Core, game, Rng } = x;
  const start = Date.UTC(2026, 10, 14, 6);
  const state = Core.newState(game, sim, ctx(x, start));
  const rng = Rng.make(1929);
  const out = { firstCompressionSec: null, firstFoldSec: null, firstCollapseSec: null, compressions: 0, folds: 0 };
  for (let elapsed = 0; elapsed < maxHours * 3600; elapsed += 0.5) {
    const now = start + (elapsed + 0.5) * 1000;
    sim.buyAll(state, cfg);
    sim.tick(state, 0.5, ctx(x, now, { rng }));
    if (N.gte(sim.rawGain(state, 'collapse', cfg), 1)) {
      out.firstCollapseSec = elapsed + 0.5;
      if (stopAt === 'collapse') break;
    }
    if (N.gte(sim.rawGain(state, 'fold', cfg), 1)) {
      if (out.firstFoldSec === null) out.firstFoldSec = elapsed + 0.5;
      if (stopAt === 'fold') break;
      if (N.gte(sim.rawGain(state, 'fold', cfg), N.max(1, N.mul(sim.currency(state, 'fold'), 2)))) {
        sim.reset(state, 'fold', ctx(x, now, { rng })); out.folds++;
        if (onMilestone) onMilestone({ event: 'fold', elapsed: elapsed + 0.5, currency: N.str(sim.currency(state, 'fold')) });
        continue;
      }
    }
    if (N.gte(sim.rawGain(state, 'compression', cfg), N.max(1, N.mul(sim.currency(state, 'compression'), 2)))) {
      if (out.firstCompressionSec === null) out.firstCompressionSec = elapsed + 0.5;
      sim.reset(state, 'compression', ctx(x, now, { rng })); out.compressions++;
    }
  }
  out.state = state;
  return out;
}
module.exports = { progression };
if (require.main === module) {
  const result = progression(process.argv[2] || 'fold', Number(process.argv[3] || 5), console.log);
  delete result.state;
  console.log(JSON.stringify(result));
}
