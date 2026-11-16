// The test workspace of the game: the Assi harness (scripts/games/harness.js) with this game
// installed at its store.json target, as install.ps1 puts it on the phone (everything but
// store.json, README.md, tests/ and _data/; _data/ goes to data/<store.json data>).
'use strict';
const fs = require('fs');
const path = require('path');

function harnessPath() {
  return path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js');
}

const H = require(harnessPath());
const GAME = path.resolve(__dirname, '..');
const store = JSON.parse(fs.readFileSync(path.join(GAME, 'store.json'), 'utf8'));
const SKIP = ['store.json', 'README.md', 'tests', '_data'];

function install(env) {
  const target = path.join(env.root, store.target);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(GAME)) {
    if (SKIP.includes(name)) continue;
    fs.cpSync(path.join(GAME, name), path.join(target, name), { recursive: true });
  }
  if (store.data && fs.existsSync(path.join(GAME, '_data'))) {
    fs.cpSync(path.join(GAME, '_data'), path.join(env.root, 'data', store.data), { recursive: true });
  }
}

/** A workspace with the game: {env, x: {Core, Big, Rng, Fmt, sim, game, cfg}, kit, id}. Closed at exit. */
function open() {
  const env = H.workspace({ fixture: false });
  process.on('exit', () => env.close());
  install(env);
  const x = H.gameOf(env, store.id);
  return { env, x, kit: env.require('modules/games/engine/checks-kit.js'), id: store.id };
}

/** A context as the engine builds it. */
function ctx(x, now, rng, extra) {
  const c = { now, config: x.cfg, rng: rng || x.Rng.make(1), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
  for (const k in extra || {}) c[k] = extra[k];
  return c;
}

module.exports = { H, GAME, store, open, ctx, install };
