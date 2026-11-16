'use strict';
const fs = require('fs');
const path = require('path');
const harness = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));
const root = path.resolve(__dirname, '..');
function load() {
  const env = harness.workspace({ fixture: false });
  const target = path.join(env.root, 'modules', 'games', 'asteroid-colony');
  fs.cpSync(root, target, { recursive: true, filter: p => !/[\\/]tests(?:[\\/]|$)/.test(p) });
  const game = JSON.parse(fs.readFileSync(path.join(root, 'game.json'), 'utf8'));
  const own = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
  const Core = env.require('modules/games/engine/core.js');
  const Big = env.require('modules/games/engine/big.js');
  const Rng = env.require('modules/games/engine/rng.js');
  const sim = env.require('modules/games/asteroid-colony/sim.js');
  const bot = env.require('modules/games/asteroid-colony/bot.js');
  const cfg = Core.config(Core.schema(own, game), {}, null);
  const now = Date.UTC(2026, 10, 14, 8);
  function ctx(at = now, offline = false, conf = cfg, seed = 19) {
    return { now: at, config: conf, rng: Rng.make(seed), mult: 1, links: {}, stock: {}, offline };
  }
  function fresh() { return Core.newState(game, sim, ctx()); }
  return { env, game, cfg, Core, Big, Rng, sim, bot, now, ctx, fresh };
}
module.exports = { load, test: harness.test, done: harness.done };
