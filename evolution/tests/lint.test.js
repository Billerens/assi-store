'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { H, GAME } = require('./env');
const Core = require(path.join(H.HUB, 'engine', 'core.js'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const all = walk(GAME);
const rel = (file) => path.relative(GAME, file).replace(/\\/g, '/');
const shipped = all.filter((file) => !/^tests\//.test(rel(file)));

H.test('all JavaScript parses and all JSON parses', () => {
  const issues = [];
  for (const file of all) {
    try {
      if (/\.js$/.test(file)) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      if (/\.json$/.test(file)) JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      issues.push(rel(file) + ': ' + String(error.stderr || error.message));
    }
  }
  if (issues.length) throw new Error(issues.join('\n'));
  console.log('  syntax: ' + all.filter((f) => /\.js$/.test(f)).length + ' JS, ' + all.filter((f) => /\.json$/.test(f)).length + ' JSON');
});

H.test('shared and Rhino code obey the actual engine subset', () => {
  const issues = [];
  for (const name of ['sim.js', 'checks.js']) {
    const code = fs.readFileSync(path.join(GAME, name), 'utf8');
    for (const issue of Core.lint(code, name === 'checks.js')) issues.push(name + ':' + issue.line + ': ' + issue.rule);
    if (name === 'sim.js' && /Math\.random/.test(Core.strip(code).code)) issues.push('simulation uses Math.random');
  }
  if (issues.length) throw new Error(issues.join('\n'));
});

H.test('shipped files obey offline, typography and CSS rules', () => {
  const issues = [];
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const texts = shipped.filter((file) => /\.(js|html|css|json|md|svg)$/.test(file));
  for (const file of texts) {
    const source = fs.readFileSync(file, 'utf8');
    source.split('\n').forEach((line, index) => {
      if (emoji.test(line)) issues.push(rel(file) + ':' + (index + 1) + ': emoji');
      if (/\.(css|html|js)$/.test(file) && /\b(?:box-shadow|text-shadow|drop-shadow)\b/.test(line) && !/\bnone\b/.test(line)) issues.push(rel(file) + ':' + (index + 1) + ': shadow');
    });
    const blocks = /\.css$/.test(file) ? [source] : /\.html$/.test(file) ? source.match(/<style[^>]*>[\s\S]*?<\/style>/g) || [] : [];
    for (const block of blocks) for (const line of block.split('\n')) {
      const body = line.replace(/\/\*.*?\*\//g, '');
      if (/;\s*[a-z-]+\s*:/.test(body) || /\{\s*[a-z-]+\s*:[^}]*;?\s*\}/.test(body)) issues.push(rel(file) + ': several CSS declarations per line');
    }
  }
  for (const hit of Core.offlineScan(texts.map((file) => ({ path: rel(file), text: fs.readFileSync(file, 'utf8') })))) issues.push(hit.path + ':' + hit.line + ': network address');
  if (issues.length) throw new Error(issues.join('\n'));
});

H.done('evolution: lint');
