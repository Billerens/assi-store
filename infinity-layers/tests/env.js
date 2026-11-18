'use strict';
const fs = require('fs');
const path = require('path');
const H = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));
const GAME = path.resolve(__dirname, '..');
const ID = 'infinity-layers';
let shared = null;
function open() {
  if (shared) return shared;
  const env = H.workspace({ fixture: false });
  const target = path.join(env.root, 'modules', 'games', ID);
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(GAME)) {
    if (['tests', 'README.md', 'store.json', '_data'].includes(name)) continue;
    fs.cpSync(path.join(GAME, name), path.join(target, name), { recursive: true });
  }
  process.on('exit', () => env.close());
  const x = H.gameOf(env, ID);
  x.env = env;
  x.N = env.require('modules/games/' + ID + '/numbers.js');
  x.kit = env.require('modules/games/engine/checks-kit.js');
  shared = x;
  return x;
}
function ctx(x, now, extra) {
  return Object.assign({ now, config: x.cfg, rng: x.Rng.make(1977), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 }, extra || {});
}
module.exports = { H, GAME, ID, open, ctx, test: H.test, done: H.done };
