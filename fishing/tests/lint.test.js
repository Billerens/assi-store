// The code rules of «Игротека» over this game's files, as scripts/games/lint-shared.js checks the
// hub: node --check of every .js; the shared subset for sim.js, strict ES5 for checks.js (Rhino);
// no emoji, no shadows, one CSS declaration a line; no network addresses. node tests/lint.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { H, GAME, test, done } = require('./env');
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
const shipped = all.filter((f) => !/[\\/](tests|_data)[\\/]/.test(path.relative(GAME, f)) && !/^(tests|_data)[\\/]/.test(path.relative(GAME, f)));
const rel = (f) => path.relative(GAME, f).replace(/\\/g, '/');

test('node --check каждого .js', () => {
  const bad = [];
  for (const f of all.filter((x) => x.endsWith('.js'))) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (error) {
      bad.push(rel(f) + ': ' + String(error.stderr || error.message).split('\n').slice(0, 4).join(' '));
    }
  }
  if (bad.length) throw new Error(bad.join('\n'));
});

test('подмножество: sim.js общее, checks.js строгое (Rhino)', () => {
  const bad = [];
  const lint = (f, strict) => Core.lint(fs.readFileSync(f, 'utf8'), strict).forEach((p) => bad.push(rel(f) + ':' + p.line + ': ' + p.rule));
  lint(path.join(GAME, 'sim.js'), false);
  if (fs.existsSync(path.join(GAME, 'checks.js'))) lint(path.join(GAME, 'checks.js'), true);
  if (bad.length) throw new Error(bad.join('\n'));
});

test('без эмодзи, без теней, одно объявление CSS в строке', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const bad = [];
  for (const f of all.filter((x) => /\.(js|html|css|json|md|svg)$/.test(x))) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) bad.push(rel(f) + ':' + (i + 1) + ': эмодзи');
      if (/\b(box-shadow|text-shadow|drop-shadow|shadowBlur)\b/.test(line) && !/\bnone\b/.test(line) && /\.(css|html|js)$/.test(f) && shipped.indexOf(f) >= 0) bad.push(rel(f) + ':' + (i + 1) + ': тень');
    });
  }
  for (const f of shipped.filter((x) => /\.(css|html)$/.test(x))) {
    const text = fs.readFileSync(f, 'utf8');
    const blocks = f.endsWith('.css') ? [text] : (text.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []);
    blocks.forEach((css) => css.split('\n').forEach((line) => {
      const body = line.replace(/\/\*.*?\*\//g, '');
      if (/;\s*[a-z-]+\s*:/.test(body) || /\{\s*[a-z-]+\s*:[^}]*;?\s*\}/.test(body)) bad.push(rel(f) + ': CSS: ' + line.trim().slice(0, 80));
    }));
  }
  if (bad.length) throw new Error(bad.join('\n'));
});

test('без адресов в сети', () => {
  const hits = Core.offlineScan(shipped.filter((f) => /\.(html?|js|css)$/.test(f)).map((f) => ({ path: rel(f), text: fs.readFileSync(f, 'utf8') })));
  if (hits.length) throw new Error(hits.map((h) => h.path + ':' + h.line + ' ' + h.url).join('\n'));
});

test('json читается, i18n-en.json плоский', () => {
  for (const f of shipped.filter((x) => x.endsWith('.json'))) JSON.parse(fs.readFileSync(f, 'utf8'));
  const en = path.join(GAME, 'i18n-en.json');
  if (fs.existsSync(en)) {
    const d = JSON.parse(fs.readFileSync(en, 'utf8'));
    for (const k in d) if (typeof d[k] !== 'string') throw new Error('i18n-en.json: не строка у ' + k);
  }
});

done('lint');
