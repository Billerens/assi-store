// The code rules of «Игротека» over this game's files, as scripts/games/lint-shared.js checks the
// hub's own: node --check of every .js; the shared subset (Core.lint) for sim.js and the strict
// ES5 for checks.js (it runs in Rhino); no emoji, no shadows, one CSS declaration a line; no
// network addresses (Core.offlineScan); JSON files parse.  node tests/lint.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { H, GAME } = require('./env');

const Core = require(path.join(H.HUB, 'engine', 'core.js'));

function walk(dir, out) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, d.name);
    if (d.isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}

const all = walk(GAME, []);
const shipped = all.filter((f) => !/[\\/]tests[\\/]/.test(path.relative(GAME, f)) && !/^tests[\\/]/.test(path.relative(GAME, f)));
const rel = (f) => path.relative(GAME, f).replace(/\\/g, '/');
const problems = [];

H.test('синтаксис .js и .json', () => {
  for (const f of all.filter((x) => x.endsWith('.js'))) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (error) {
      problems.push(rel(f) + ': node --check: ' + String(error.stderr || error.message).split('\n').slice(0, 5).join(' '));
    }
  }
  for (const f of all.filter((x) => x.endsWith('.json'))) {
    try {
      JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (error) {
      problems.push(rel(f) + ': JSON: ' + error.message);
    }
  }
  if (problems.length) throw new Error(problems.splice(0).join('\n'));
});

H.test('общее подмножество: sim.js и checks.js', () => {
  const sims = shipped.filter((f) => /(^|[\\/])sim\.js$/.test(rel(f)) || /^content[\\/].*\.js$/.test(rel(f)));
  const rhino = shipped.filter((f) => /(^|[\\/])checks\.js$/.test(rel(f)));
  for (const f of sims) for (const p of Core.lint(fs.readFileSync(f, 'utf8'), false)) problems.push(rel(f) + ':' + p.line + ': ' + p.rule);
  for (const f of rhino) for (const p of Core.lint(fs.readFileSync(f, 'utf8'), true)) problems.push(rel(f) + ':' + p.line + ': ' + p.rule);
  // The sim must not take randomness from Math.random (offline and checks would not repeat).
  for (const f of sims) {
    const code = Core.strip(fs.readFileSync(f, 'utf8')).code;
    if (/Math\.random/.test(code)) problems.push(rel(f) + ': Math.random в логике');
  }
  if (problems.length) throw new Error(problems.splice(0).join('\n'));
});

H.test('правила владельца: эмодзи, тени, CSS, сеть', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const texts = all.filter((f) => /\.(js|html|css|json|md|svg)$/.test(f));
  for (const f of texts) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) problems.push(rel(f) + ':' + (i + 1) + ': эмодзи');
      if (shipped.includes(f) && /\b(box-shadow|text-shadow|drop-shadow)\b/.test(line) && !/\bnone\b/.test(line) && /\.(css|html|js)$/.test(f)) problems.push(rel(f) + ':' + (i + 1) + ': тень');
    });
  }
  for (const f of texts.filter((x) => /\.(css|html)$/.test(x))) {
    const text = fs.readFileSync(f, 'utf8');
    const blocks = f.endsWith('.css') ? [text] : (text.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []);
    for (const css of blocks) {
      css.split('\n').forEach((line) => {
        const body = line.replace(/\/\*.*?\*\//g, '');
        if (/;\s*[a-z-]+\s*:/.test(body) || /\{\s*[a-z-]+\s*:[^}]*;?\s*\}/.test(body)) problems.push(rel(f) + ': CSS: несколько объявлений в строке: ' + line.trim().slice(0, 80));
      });
    }
  }
  const hits = Core.offlineScan(shipped.filter((f) => /\.(html?|js|css|json|md|svg)$/.test(f)).map((f) => ({ path: rel(f), text: fs.readFileSync(f, 'utf8') })));
  for (const h of hits) problems.push(h.path + ':' + h.line + ': адрес в сети ' + h.url);
  if (problems.length) throw new Error(problems.splice(0).join('\n'));
});

H.done(path.basename(GAME) + ': lint');
