// The Assi harness for this game's node tests: a temporary workspace with the hub of the factory
// (modules/games, lib/) and this game installed into it the way install.ps1 does it (the folder
// without store.json, README.md, tests, _data at store.json "target"; _data at data/<"data">).
//   const T = require('./env.js');
//   const x = T.open();      // {env, kit, check, id, dir, Core, Big, Rng, Fmt, sim, game, cfg}
//   T.test('…', () => { … }); T.done('name');
'use strict';
const fs = require('fs');
const path = require('path');

const HARNESS = path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js');
if (!fs.existsSync(HARNESS)) throw new Error('Не найден harness.js Assi (scripts/games/harness.js)');
const H = require(HARNESS);

const GAME_DIR = path.resolve(__dirname, '..');
const STORE = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'store.json'), 'utf8'));
const SKIP = ['store.json', 'README.md', 'tests', '_data'];

function install(env) {
  const to = path.join(env.root, STORE.target);
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(GAME_DIR)) {
    if (SKIP.includes(name)) continue;
    fs.cpSync(path.join(GAME_DIR, name), path.join(to, name), { recursive: true });
  }
  const data = path.join(GAME_DIR, '_data');
  if (STORE.data && fs.existsSync(data)) fs.cpSync(data, path.join(env.root, 'data', STORE.data), { recursive: true });
}

let opened = null;

/** The workspace with the game installed (one per test file). */
function open() {
  if (opened) return opened;
  const env = H.workspace({ fixture: false });
  install(env);
  process.on('exit', () => env.close());
  const x = H.gameOf(env, STORE.id);
  opened = Object.assign({
    env, id: STORE.id, dir: GAME_DIR,
    kit: env.require('modules/games/engine/checks-kit.js'),
    check: env.require('lib/check.js')
  }, x);
  return opened;
}

/** A ctx as the engine gives it to the sim. */
function ctxOf(x, o) {
  o = o || {};
  return Object.assign({ now: Date.UTC(2026, 10, 14, 8, 0, 0), config: x.cfg, rng: x.Rng.make(o.seed || 1), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 }, o);
}

module.exports = { H, open, install, ctxOf, STORE, GAME_DIR, test: H.test, done: H.done };
