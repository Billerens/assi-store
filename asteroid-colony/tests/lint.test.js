// The code rules of «Игротека» over this game's folder (the same rules as
// Assi/scripts/games/lint-shared.js applies to the hub): node --check of every .js, the shared
// subset for sim.js (Core.lint) and strict ES5 for checks.js (it runs in Rhino), no Math.random
// in the logic, no emoji, no shadows, one CSS declaration a line, no network addresses.
// node tests/lint.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const GAME = path.resolve(__dirname, '..');
const HARNESS = path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js');
const { test, done, HUB } = require(HARNESS);
const Core = require(path.join(HUB, 'engine', 'core.js'));

function walk(dir, out) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name !== 'node_modules' && d.name !== '.git') walk(f, out);
    } else out.push(f);
  }
  return out;
}

const files = walk(GAME, []);
const rel = (f) => path.relative(GAME, f).replace(/\\/g, '/');
const shipped = files.filter((f) => !/^(tests|_data)\//.test(rel(f)) && !/^(README\.md|store\.json)$/.test(rel(f)));

test('node --check каждого .js', () => {
  const bad = [];
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (error) {
      bad.push(rel(f) + ': ' + String(error.stderr || error.message).split('\n').slice(0, 4).join(' '));
    }
  }
  if (bad.length) throw new Error(bad.join('\n'));
});

test('общее подмножество: sim.js (как у игр), checks.js и другие файлы движка (строго, Rhino)', () => {
  const bad = [];
  for (const p of Core.lint(fs.readFileSync(path.join(GAME, 'sim.js'), 'utf8'), false)) bad.push('sim.js:' + p.line + ': ' + p.rule);
  // Every .js at the top of the folder except sim.js runs in the engine (checks.js and what it requires).
  for (const name of fs.readdirSync(GAME).filter((n) => n.endsWith('.js') && n !== 'sim.js')) {
    for (const p of Core.lint(fs.readFileSync(path.join(GAME, name), 'utf8'), true)) bad.push(name + ':' + p.line + ': ' + p.rule);
  }
  const code = Core.strip(fs.readFileSync(path.join(GAME, 'sim.js'), 'utf8')).code;
  code.split('\n').forEach((line, i) => {
    if (/Math\.random/.test(line)) bad.push('sim.js:' + (i + 1) + ': Math.random в логике');
    if (/\bDate\.now\b|new Date\b/.test(line)) bad.push('sim.js:' + (i + 1) + ': часы в логике (берите ctx.now)');
  });
  if (bad.length) throw new Error(bad.join('\n'));
});

test('без эмодзи, без теней, одно объявление CSS в строке', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const bad = [];
  for (const f of files.filter((x) => /\.(js|html|css|json|md|svg)$/.test(x))) {
    const text = fs.readFileSync(f, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) bad.push(rel(f) + ':' + (i + 1) + ': эмодзи');
      if (/\b(box-shadow|text-shadow|drop-shadow)\b/.test(line) && !/\bnone\b/.test(line) && /\.(css|html|js)$/.test(f) && !/^tests\//.test(rel(f))) bad.push(rel(f) + ':' + (i + 1) + ': тень');
    });
    const blocks = [];
    if (f.endsWith('.css')) blocks.push(text);
    else if (f.endsWith('.html')) {
      const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
      let m;
      while ((m = re.exec(text))) blocks.push(m[1]);
    }
    for (const css of blocks) {
      css.split('\n').forEach((line) => {
        const body = line.replace(/\/\*.*?\*\//g, '');
        if (/;\s*[a-z-]+\s*:/.test(body) || /\{\s*[a-z-]+\s*:[^}]*;?\s*\}/.test(body)) bad.push(rel(f) + ': CSS: несколько объявлений в строке: ' + line.trim().slice(0, 80));
      });
    }
  }
  if (bad.length) throw new Error(bad.join('\n'));
});

test('без адресов в сети', () => {
  const hits = Core.offlineScan(files.filter((f) => /\.(html?|js|css|json|md|svg)$/.test(f) && !/tests\//.test(rel(f)))
    .map((f) => ({ path: rel(f), text: fs.readFileSync(f, 'utf8') })));
  if (hits.length) throw new Error(hits.map((h) => h.path + ':' + h.line + ' ' + h.url).join('\n'));
});

test('раскладка игры: обязательные файлы на месте', () => {
  const need = ['game.json', 'config.json', 'sim.js', 'checks.js', 'icon.svg', 'ui/index.html', 'ui/game.js', 'ui/game.css'];
  const missing = need.filter((n) => !fs.existsSync(path.join(GAME, n)));
  if (missing.length) throw new Error('нет: ' + missing.join(', '));
  const store = JSON.parse(fs.readFileSync(path.join(GAME, 'store.json'), 'utf8'));
  const game = JSON.parse(fs.readFileSync(path.join(GAME, 'game.json'), 'utf8'));
  if (store.id !== game.id || store.target !== 'modules/games/' + game.id || store.kind !== 'game') throw new Error('store.json не сходится с game.json');
  if (!Core.validId(game.id)) throw new Error('недопустимый id ' + game.id);
  JSON.parse(fs.readFileSync(path.join(GAME, 'config.json'), 'utf8'));
  for (const f of shipped.filter((x) => x.endsWith('.json'))) JSON.parse(fs.readFileSync(f, 'utf8'));
  const icon = fs.readFileSync(path.join(GAME, 'icon.svg'), 'utf8');
  if (!/viewBox="0 0 24 24"/.test(icon) || /fill="(?!none)/.test(icon)) throw new Error('icon.svg: нужен контур 24×24 без заливок');
});

done('lint ' + path.basename(GAME));
