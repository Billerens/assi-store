// Loads «Выживание в волнах» in node from the store folder: the game's files require the engine
// as '../engine/…' (as they do inside modules/games/ on the phone), so those requests go to the
// engine of the Assi repository. Not a test itself; the *.test.js files use it.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const H = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));

const GAME = path.resolve(__dirname, '..');
const ENGINE = path.join(H.HUB, 'engine');

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (parent && parent.filename && parent.filename.indexOf(GAME) === 0 && request.indexOf('../engine/') === 0) {
    request = path.join(ENGINE, request.slice('../engine/'.length));
  }
  return resolve.call(this, request, parent, isMain, options);
};

const Big = require(path.join(ENGINE, 'big.js'));
const Rng = require(path.join(ENGINE, 'rng.js'));
const Core = require(path.join(ENGINE, 'core.js'));
const World = require(path.join(GAME, 'world.js'));
const Sim = require(path.join(GAME, 'sim.js'));

function readJson(name) { return JSON.parse(fs.readFileSync(path.join(GAME, name), 'utf8')); }

function game() {
  const g = readJson('game.json');
  g.id = 'wave-survival';
  return g;
}

/** The values the game runs with on the phone: the engine's settings and config.json over them. */
function config(over) {
  const cfg = Core.config(Core.schema(readJson('config.json'), game()), {}, null);
  for (const k in over || {}) cfg[k] = over[k];
  return cfg;
}

/** Workshop levels: 'empty', 'half', 'max' or an object. */
function workshop(cfg, level) {
  const ws = {};
  Sim.WORKSHOP.forEach((id) => {
    const max = cfg['ws.' + id + '.max'];
    ws[id] = level === 'max' ? max : level === 'half' ? Math.floor(max / 2) : level && typeof level === 'object' ? level[id] || 0 : 0;
  });
  return ws;
}

module.exports = { H, GAME, ENGINE, Big, Rng, Core, World, Sim, readJson, game, config, workshop };
