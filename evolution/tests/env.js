'use strict';
const fs = require('fs');
const path = require('path');
const H = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));
const GAME = path.resolve(__dirname, '..');
const ID = 'evolution';

function open() {
  const env = H.workspace({ fixture: false });
  const target = path.join(env.root, 'modules', 'games', ID);
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(GAME)) {
    if (['tests', 'README.md', 'store.json', '_data'].includes(name)) continue;
    fs.cpSync(path.join(GAME, name), path.join(target, name), { recursive: true });
  }
  process.on('exit', () => env.close());
  return { env, x: H.gameOf(env, ID), kit: env.require('modules/games/engine/checks-kit.js') };
}

function ctx(x, now, rng, extra) {
  return Object.assign({ now, config: x.cfg, rng: rng || x.Rng.make(1), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 }, extra || {});
}

function fresh(x, seed) {
  const state = x.Core.newState(x.game, x.sim, ctx(x, 1000000, x.Rng.make(seed || 1)));
  // Baseline formula fixtures deliberately omit the plus/minus of a physical constant.
  state.run.universeChoices = [];
  state.run.constant = 'balanced';
  return state;
}

function relative(x, a, b) {
  const aa = x.Big.of(a);
  const bb = x.Big.of(b);
  if (x.Big.isZero(aa) && x.Big.isZero(bb)) return 0;
  return x.Big.toNumber(x.Big.div(x.Big.abs(x.Big.sub(aa, bb)), x.Big.max(x.Big.abs(aa), x.Big.abs(bb))));
}

function validTree(value, key) {
  const label = key || 'state';
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(label + ' is not finite');
  if (typeof value === 'string' && /^(?:NaN|[+-]?Infinity)$/.test(value)) throw new Error(label + ' is not finite');
  if (typeof value === 'function') throw new Error(label + ' stores a function');
  if (value && typeof value === 'object') for (const name of Object.keys(value)) validTree(value[name], label + '.' + name);
}

module.exports = { H, GAME, ID, open, ctx, fresh, relative, validTree };

