'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const names = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.js')).sort();
let failed = 0;
for (const name of names) {
  const r = spawnSync(process.execPath, [path.join(__dirname, name)], { encoding: 'utf8' });
  process.stdout.write((r.stdout || '') + (r.stderr || ''));
  if (r.status !== 0) failed++;
}
console.log('Файлы проверок: ' + (names.length - failed) + '/' + names.length);
process.exitCode = failed ? 1 : 0;
