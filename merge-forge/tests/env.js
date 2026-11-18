// The tests of one store game: a workspace of the Axiko harness with this game installed as
// modules/games/<id> (what install.ps1 copies: everything but store.json, README.md, tests, _data).
//   const { open, test, done } = require('./env');
//   const x = open();   // {env, Core, Big, Rng, Fmt, sim, game, cfg, kit, check}
'use strict';
const fs = require('fs');
const path = require('path');

const GAME = path.resolve(__dirname, '..');
const ID = JSON.parse(fs.readFileSync(path.join(GAME, 'store.json'), 'utf8')).id;
const HARNESS = path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js');
const H = require(HARNESS);
const SKIP = ['store.json', 'README.md', 'tests', '_data'];

function install(env) {
  const to = path.join(env.root, 'modules', 'games', ID);
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(GAME)) {
    if (SKIP.indexOf(name) >= 0) continue;
    fs.cpSync(path.join(GAME, name), path.join(to, name), { recursive: true });
  }
  if (fs.existsSync(path.join(GAME, '_data'))) fs.cpSync(path.join(GAME, '_data'), path.join(env.root, 'data', 'games', ID), { recursive: true });
}

let shared = null;

/** The game in a workspace (one per test file). */
function open() {
  if (shared) return shared;
  const env = H.workspace({ fixture: false });
  install(env);
  process.on('exit', () => env.close());
  const x = H.gameOf(env, ID);
  x.env = env;
  x.kit = env.require('modules/games/engine/checks-kit.js');
  x.check = env.require('lib/check.js');
  shared = x;
  return x;
}

/** A ctx as the engine gives it. */
function ctxOf(x, now, rng, extra) {
  const c = { now: now, config: x.cfg, rng: rng || x.Rng.make(1), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
  for (const k in extra || {}) c[k] = extra[k];
  return c;
}

module.exports = { H, ID, GAME, open, ctxOf, test: H.test, done: H.done };
