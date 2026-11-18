// The workspace of the tests: the hub's modules/games with this game copied in as the phone has it.
const fs = require('fs');
const path = require('path');
const H = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));
const DIR = path.resolve(__dirname, '..');
const ID = require(path.join(DIR, 'store.json')).id;

function setup() {
  const env = H.workspace({ fixture: false });
  process.on('exit', () => env.close());
  fs.cpSync(DIR, path.join(env.root, 'modules', 'games', ID), {
    recursive: true,
    filter: (src) => !/^[\\/]?(tests|_data|\.git)([\\/]|$)/.test(path.relative(DIR, src))
  });
  return Object.assign({ env, ID }, H.gameOf(env, ID));
}

module.exports = { setup, test: H.test, done: H.done, ID, DIR };
