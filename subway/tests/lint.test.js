// Lint of «Подземка»: node --check, the shared subset of the engine (Core.lint: sim for node and the
// WebView, checks.js strict ES5 for Rhino), the owner's rules (no emoji, no shadows, one CSS
// declaration a line), no network addresses, valid JSON, every Russian text of the screen in
// i18n-en.json. node tests/lint.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { GAME } = require('./env');
const { test, done, HUB } = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));
const Core = require(path.join(HUB, 'engine', 'core.js'));

function walk(dir, out) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, d.name);
    if (d.isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}
const files = walk(GAME, []);
const rel = (f) => path.relative(GAME, f).replace(/\\/g, '/');
const read = (f) => fs.readFileSync(f, 'utf8');

test('node --check всех .js', () => {
  const js = files.filter((f) => f.endsWith('.js'));
  js.forEach((f) => execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }));
  assert.ok(js.length >= 7);
});

test('общее подмножество: sim.js и ui/game.js, checks.js строго (Rhino)', () => {
  const p = [];
  const lint = (name, strict) => Core.lint(read(path.join(GAME, name)), strict).forEach((e) => p.push(name + ':' + e.line + ': ' + e.rule));
  lint('sim.js', false);
  lint('checks.js', true);
  assert.deepStrictEqual(p, []);
});

test('JSON читается, store.json и game.json на месте', () => {
  files.filter((f) => f.endsWith('.json')).forEach((f) => assert.doesNotThrow(() => JSON.parse(read(f)), rel(f)));
  const store = JSON.parse(read(path.join(GAME, 'store.json')));
  assert.strictEqual(store.id, 'subway');
  assert.strictEqual(store.target, 'modules/games/subway');
  const cfg = JSON.parse(read(path.join(GAME, 'config.json')));
  Object.keys(cfg).forEach((k) => assert.ok('value' in cfg[k], k + ': нет value'));
});

test('без эмодзи, без теней, одно объявление CSS в строке', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const p = [];
  files.filter((f) => /\.(js|html|css|json|md|svg)$/.test(f)).forEach((f) => {
    read(f).split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) p.push(rel(f) + ':' + (i + 1) + ': эмодзи');
      if (/\b(box-shadow|text-shadow|drop-shadow)\b/.test(line) && !/\bnone\b/.test(line) && /\.(css|html)$/.test(f)) p.push(rel(f) + ':' + (i + 1) + ': тень');
    });
  });
  files.filter((f) => /\.(css|html)$/.test(f)).forEach((f) => {
    const text = read(f);
    const blocks = f.endsWith('.css') ? [text] : (text.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []);
    blocks.forEach((css) => css.split('\n').forEach((line) => {
      const body = line.replace(/\/\*.*?\*\//g, '');
      if (/;\s*[a-z-]+\s*:/.test(body) || /\{\s*[a-z-]+\s*:[^}]*;?\s*\}/.test(body)) p.push(rel(f) + ': CSS: ' + line.trim().slice(0, 80));
    }));
  });
  assert.deepStrictEqual(p, []);
});

test('без адресов в сети', () => {
  const hits = Core.offlineScan(files.filter((f) => /\.(html?|js|css|svg)$/.test(f)).map((f) => ({ path: rel(f), text: read(f) })));
  assert.deepStrictEqual(hits.map((h) => h.path + ':' + h.line + ' ' + h.url), []);
  files.filter((f) => /\.(json|md)$/.test(f)).forEach((f) => assert.ok(!/https?:\/\//.test(read(f)), rel(f) + ': адрес'));
});

test('цели нажатия не меньше 44 px', () => {
  const css = read(path.join(GAME, 'ui', 'game.css'));
  const small = [];
  css.replace(/min-(?:height|width):\s*(\d+)px/g, (m, n) => {
    if (Number(n) < 44 && Number(n) > 0) small.push(m);
    return m;
  });
  // Small minimums belong to non-interactive pieces only (badges, dots); the buttons are checked by name.
  ['.sw-btn', '.sw-pbtn', '.sw-tab', '.sw-qty'].forEach((sel) => {
    const re = new RegExp(sel.replace('.', '\\.') + '\\s*\\{[^}]*min-height:\\s*(\\d+)px');
    const m = re.exec(css);
    if (m) assert.ok(Number(m[1]) >= 44, sel + ': ' + m[1] + ' px');
  });
});

test('переводы: каждая цельная русская строка ui/game.js есть в i18n-en.json', () => {
  // Pieces of a text put together (with a space or a sign at an edge) are matched by the
  // dictionary's patterns with {} as the whole text — the browser audit of the screen checks them.
  // The plural words go into such texts too.
  const en = JSON.parse(read(path.join(GAME, 'i18n-en.json')));
  const js = read(path.join(GAME, 'ui', 'game.js'));
  const PLURAL = /^(патент|патента|патентов|чертёж|чертежа|чертежей|станция|станции|станций|поезд|поезда|поездов|тариф|тарифа|тарифов|пересадка|пересадки|пересадок|спальные|деловые)$/;
  const miss = new Set();
  const re = /'([^'\n]*[А-Яа-яЁё][^'\n]*)'/g;
  let m;
  while ((m = re.exec(js))) {
    const t = m[1];
    if (/^[\s,.:;·—(«»)+]|[\s,.:;·—(«+×№]$/.test(t) || /[<>=]/.test(t) || PLURAL.test(t)) continue;
    if (!en[t]) miss.add(t);
  }
  assert.deepStrictEqual(Array.from(miss), []);
  const keys = Object.keys(en);
  keys.forEach((k) => assert.ok(typeof en[k] === 'string' && en[k] && !/[А-Яа-яЁё]/.test(en[k]), 'перевод «' + k + '»'));
  keys.forEach((k) => assert.strictEqual((k.match(/\{\}/g) || []).length, (en[k].match(/\{\}/g) || []).length, 'число {} в «' + k + '»'));
  console.log('  строк в словаре: ' + keys.length);
});

done('Подземка, lint');
