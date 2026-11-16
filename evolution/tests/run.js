'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
let failures = 0;
for (const name of fs.readdirSync(__dirname).filter((file) => /\.test\.js$/.test(file)).sort()) {
  const result = spawnSync(process.execPath, [path.join(__dirname, name)], { stdio: 'inherit' });
  if (result.error || result.status !== 0) failures++;
}
process.exitCode = failures ? 1 : 0;
