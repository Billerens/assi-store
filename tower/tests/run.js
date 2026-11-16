'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

let failed = false;
for (const name of ['lint.test.js', 'rules.test.js', 'mechanics.test.js', 'standard.test.js', 'balance.test.js']) {
  const child = spawnSync(process.execPath, [path.join(__dirname, name)], { stdio: 'inherit', env: process.env });
  if (child.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
