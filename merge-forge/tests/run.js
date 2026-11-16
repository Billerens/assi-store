// Every test of this game: node tests/run.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const files = fs.readdirSync(__dirname).filter((n) => /\.test\.(?:js|cjs)$/.test(n)).sort();
let failed = 0;
for (const name of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, name)], { encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '')).replace(/\s+$/, '');
  process.stdout.write((out || name + ': нет вывода') + '\n');
  if (r.status !== 0) failed++;
}
console.log(failed ? '\nНе прошло файлов: ' + failed + ' из ' + files.length : '\nВсё прошло: ' + files.length + ' файлов');
process.exitCode = failed ? 1 : 0;
