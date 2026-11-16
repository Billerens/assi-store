// node tests/lint.test.js — the rules of scripts/games/lint-shared.js of Assi over this game's files:
//  1. node --check of every .js; inline <script>s compile;
//  2. the shared subset (Core.lint): sims and every file the sim requires — not strict;
//     checks.js (Rhino) — strict ES5;
//  3. the owner's rules: no emoji, no shadows, one CSS declaration a line, no network addresses
//     in the installed .html/.js/.css (Core.offlineScan; tests/ and tools/ are not installed or
//     not loaded by the game, but they are scanned too except tools/sources.json).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const T = require('./env.js');

const Core = require(path.join(T.H.HUB, 'engine', 'core.js'));
const ROOT = T.GAME_DIR;
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

function walk(dir, out) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name === 'node_modules' || d.name === '.cache' || d.name === '_data') continue;
    const f = path.join(dir, d.name);
    if (d.isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}
const files = walk(ROOT, []);

// The files of the shared subset: the root .js files and lib/ — everything that is neither the
// screen (ui/), nor node only (tests/, tools/), nor checks.js (Rhino, strict below).
const SHARED = files.filter((f) => /\.js$/.test(f) && !/^(ui|tests|tools)\//.test(rel(f)) && rel(f) !== 'checks.js');
const RHINO = files.filter((f) => rel(f) === 'checks.js');

T.test('node --check и встроенные скрипты', () => {
  const problems = [];
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (error) {
      problems.push(rel(f) + ': ' + String(error.stderr || error.message).split('\n').slice(0, 4).join(' '));
    }
  }
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    const text = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(text))) {
      try {
        new vm.Script(m[1], { filename: f });
      } catch (error) {
        problems.push(rel(f) + ': встроенный скрипт: ' + error.message);
      }
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
});

T.test('общее подмножество: sim и его файлы, checks.js строго', () => {
  const problems = [];
  for (const f of SHARED) for (const p of Core.lint(fs.readFileSync(f, 'utf8'), false)) problems.push(rel(f) + ':' + p.line + ': ' + p.rule);
  for (const f of RHINO) for (const p of Core.lint(fs.readFileSync(f, 'utf8'), true)) problems.push(rel(f) + ':' + p.line + ': ' + p.rule);
  if (problems.length) throw new Error(problems.join('\n'));
  if (!SHARED.some((f) => rel(f) === 'sim.js')) throw new Error('нет sim.js');
});

T.test('правила владельца: эмодзи, тени, CSS, сеть', () => {
  const problems = [];
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const texts = files.filter((f) => /\.(js|html|css|json|md|svg)$/.test(f));
  for (const f of texts) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) problems.push(rel(f) + ':' + (i + 1) + ': эмодзи');
      if (/\b(box-shadow|text-shadow|drop-shadow)\b/.test(line) && !/\bnone\b/.test(line) && /\.(css|html)$/.test(f)) problems.push(rel(f) + ':' + (i + 1) + ': тень');
    });
  }
  for (const f of texts.filter((x) => /\.(css|html)$/.test(x))) {
    const text = fs.readFileSync(f, 'utf8');
    const blocks = f.endsWith('.css') ? [text] : (text.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []);
    for (const css of blocks) {
      css.split('\n').forEach((line) => {
        const body = line.replace(/\/\*.*?\*\//g, '');
        if (/;\s*[a-z-]+\s*:/.test(body) || /\{\s*[a-z-]+\s*:[^}]*;?\s*\}/.test(body)) problems.push(rel(f) + ': CSS: несколько объявлений в строке: ' + line.trim().slice(0, 80));
      });
    }
  }
  const code = files.filter((f) => /\.(html?|js|mjs|css)$/i.test(f)).map((f) => ({ path: rel(f), text: fs.readFileSync(f, 'utf8') }));
  for (const h of Core.offlineScan(code)) problems.push(h.path + ':' + h.line + ': адрес в сети ' + h.url);
  if (problems.length) throw new Error(problems.join('\n'));
});

T.done('lint ' + T.STORE.id);
