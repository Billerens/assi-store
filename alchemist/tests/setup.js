// A workspace of the harness of «Игротека» with «Алхимик» installed as the store installs it
// (modules/games/alchemist without tests, README.md, store.json and _data).
'use strict';
const fs = require('fs');
const path = require('path');
const H = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));

const GAME = path.resolve(__dirname, '..');
const SKIP = /^(tests|_data|README\.md|store\.json)$/;

function install(env) {
  const to = path.join(env.root, 'modules', 'games', 'alchemist');
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(GAME).forEach((name) => {
    if (SKIP.test(name)) return;
    fs.cpSync(path.join(GAME, name), path.join(to, name), { recursive: true });
  });
}

/** {env, x: {Core, Big, Rng, Fmt, sim, game, cfg}, graph: graph.js of the workspace}. */
function make(o) {
  const env = H.workspace(Object.assign({ fixture: false }, o || {}));
  install(env);
  const x = H.gameOf(env, 'alchemist');
  return { env, x, graph: () => env.require('modules/games/alchemist/graph.js') };
}

function ctxOf(x, now, rng, extra) {
  return Object.assign({ now, config: x.cfg, rng: rng || x.Rng.make(1), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 }, extra || {});
}

module.exports = { H, make, ctxOf, GAME };
