'use strict';
const fs = require('fs');
const path = require('path');
const harness = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));
const GAME = path.resolve(__dirname, '..');
function load() {
  const env = harness.workspace({fixture: false});
  fs.cpSync(GAME, path.join(env.root, 'modules/games/minesweeper-rogue'), {
    recursive: true,
    filter: (src) => !/[\\/](tests|node_modules|\.git)([\\/]|$)/.test(path.relative(GAME, src))
  });
  const x = harness.gameOf(env, 'minesweeper-rogue');
  x.env = env;
  x.ctx = (seed = 1, mult = 1) => ({now: 1794657600000, config: x.cfg, rng: x.Rng.make(seed), mult, links: {}, offline: false, stock: {}});
  x.fresh = (seed = 1) => x.Core.newState(x.game, x.sim, x.ctx(seed));
  return x;
}
module.exports = {load, harness, GAME};
