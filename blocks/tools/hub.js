// For node scripts outside the phone: `require('../engine/…')` of the game's shared files points
// at the hub of Assi (scripts run from the store folder, where there is no engine/ beside it).
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const HUB = path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'app/src/main/assets/factory/modules/games');
if (!fs.existsSync(path.join(HUB, 'engine', 'core.js'))) throw new Error('Не найден движок Игротеки (Assi/app/src/main/assets/factory/modules/games)');

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  const m = /^\.\.\/engine\/(.+)$/.exec(request);
  if (m && parent && parent.filename && path.dirname(parent.filename) === path.resolve(__dirname, '..')) return path.join(HUB, 'engine', m[1]);
  return resolve.call(this, request, parent, isMain, options);
};

module.exports = { HUB, GAME: path.resolve(__dirname, '..') };
