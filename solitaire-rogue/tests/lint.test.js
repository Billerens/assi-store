// The code checks of this game, the same rules as Assi's scripts/games/lint-shared.js applies to
// the hub: node tests/lint.test.js
//   1. node --check of every .js; inline <script>s of the pages compiled.
//   2. The shared subset (Core.lint): sim.js and the files it requires — not strict (no class,
//      async/await, f(...args), for (let/const …)); checks.js runs in Rhino — strict ES5.
//   3. The owner's rules: no emoji, no shadows, one CSS declaration a line, no network addresses
//      (Core.offlineScan), the icon is a 24×24 outline.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { test, done, HUB } = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));
const Core = require(path.join(HUB, 'engine', 'core.js'));

const DIR = path.resolve(__dirname, '..');
const SKIP = ['tests', '_data', 'node_modules', '.git'];

function walk(dir, out) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.indexOf(d.name) >= 0 && dir === DIR) continue;
    const f = path.join(dir, d.name);
    if (d.isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}

const files = walk(DIR, []);
const rel = (f) => path.relative(DIR, f).replace(/\\/g, '/');
const read = (f) => fs.readFileSync(f, 'utf8');

test('node --check и встроенные скрипты', () => {
  const problems = [];
  const all = files.concat(fs.readdirSync(__dirname).map((n) => path.join(__dirname, n))).filter((f) => f.endsWith('.js'));
  for (const f of all) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (error) {
      problems.push(rel(f) + ': ' + String(error.stderr || error.message).split('\n').slice(0, 4).join(' '));
    }
  }
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(read(f)))) {
      try {
        new vm.Script(m[1], { filename: f });
      } catch (error) {
        problems.push(rel(f) + ': встроенный скрипт: ' + error.message);
      }
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
});

test('общее подмножество: sim и его файлы, checks.js строго', () => {
  const problems = [];
  // Shared: sim.js and every .js outside ui/ (logic the sim requires), except checks.js.
  const shared = files.filter((f) => f.endsWith('.js') && !/(^|[\\/])ui[\\/]/.test(rel(f)) && path.basename(f) !== 'checks.js');
  for (const f of shared) for (const p of Core.lint(read(f), false)) problems.push(rel(f) + ':' + p.line + ': ' + p.rule);
  const checks = path.join(DIR, 'checks.js');
  if (fs.existsSync(checks)) for (const p of Core.lint(read(checks), true)) problems.push('checks.js:' + p.line + ': ' + p.rule);
  if (problems.length) throw new Error(problems.join('\n'));
});

test('правила владельца: эмодзи, тени, CSS, адреса в сети, значок', () => {
  const problems = [];
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const texts = files.filter((f) => /\.(js|html|css|json|md|svg)$/.test(f));
  for (const f of texts) {
    read(f).split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) problems.push(rel(f) + ':' + (i + 1) + ': эмодзи');
      if (/\b(box-shadow|text-shadow|drop-shadow)\b/.test(line) && !/\bnone\b/.test(line) && /\.(css|html)$/.test(f)) problems.push(rel(f) + ':' + (i + 1) + ': тень');
      if (/shadowBlur|shadowColor/.test(line) && /\.js$/.test(f)) problems.push(rel(f) + ':' + (i + 1) + ': тень на canvas');
    });
  }
  for (const f of texts.filter((x) => /\.(css|html)$/.test(x))) {
    const text = read(f);
    const blocks = f.endsWith('.css') ? [text] : (text.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []);
    for (const css of blocks) {
      css.split('\n').forEach((line) => {
        const body = line.replace(/\/\*.*?\*\//g, '');
        if (/;\s*[a-z-]+\s*:/.test(body) || /\{\s*[a-z-]+\s*:[^}]*;?\s*\}/.test(body)) problems.push(rel(f) + ': CSS: несколько объявлений в строке: ' + line.trim().slice(0, 80));
      });
    }
  }
  const hits = Core.offlineScan(texts.filter((f) => /\.(html?|js|css)$/.test(f)).map((f) => ({ path: rel(f), text: read(f) })));
  for (const h of hits) problems.push(h.path + ':' + h.line + ': адрес в сети ' + h.url);
  const icon = path.join(DIR, 'icon.svg');
  if (!fs.existsSync(icon)) problems.push('нет icon.svg');
  else {
    const svg = read(icon);
    if (!/viewBox="0 0 24 24"/.test(svg)) problems.push('icon.svg: не 24×24');
    if (!/fill="none"/.test(svg) || /fill="(?!none)[^"]*"/.test(svg)) problems.push('icon.svg: заливка');
    if (!/stroke="currentColor"/.test(svg)) problems.push('icon.svg: нет stroke="currentColor"');
  }
  if (problems.length) throw new Error(problems.join('\n'));
});

test('json читаются, словарь плоский', () => {
  const problems = [];
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    try {
      JSON.parse(read(f));
    } catch (error) {
      problems.push(rel(f) + ': ' + error.message);
    }
  }
  const dict = path.join(DIR, 'i18n-en.json');
  if (fs.existsSync(dict)) {
    const d = JSON.parse(read(dict));
    for (const k in d) if (typeof d[k] !== 'string' || !/[А-Яа-яЁё]/.test(k)) problems.push('i18n-en.json: ' + k);
  } else problems.push('нет i18n-en.json');
  if (problems.length) throw new Error(problems.join('\n'));
});

done('lint ' + path.basename(DIR));
