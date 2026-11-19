// Rare monsters and bosses with modifiers, the worlds of content/monsters.json and their pictures.
// node tests/monsters.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { open, ctxOf, test, done, GAME } = require('./env');

const x = open();
const S = x.sim, cfg = x.cfg, Big = x.Big;
const NOW = Date.UTC(2026, 10, 19, 12);
function fresh(seed) {
  const state = x.Core.newState(x.game, S, ctxOf(x, NOW, x.Rng.make(seed || 77)));
  S.ensure(state);
  return state;
}
const content = JSON.parse(fs.readFileSync(path.join(GAME, 'content', 'monsters.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(GAME, 'i18n-en.json'), 'utf8'));
const has = (folder, id) => fs.existsSync(path.join(GAME, 'art', folder, id + '.webp'));

test('выбор модификатора следует из встречи и волны, без случайных чисел игры', () => {
  const state = fresh();
  const a = [], b = [];
  for (let serial = 1; serial <= 400; serial++) a.push(S.pickMod(state, cfg, false, serial, 30));
  for (let serial = 1; serial <= 400; serial++) b.push(S.pickMod(state, cfg, false, serial, 30));
  assert.deepStrictEqual(a, b);
  const rare = a.filter(Boolean).length / a.length;
  assert.ok(rare > cfg['mod.chance'] * 0.4 && rare < cfg['mod.chance'] * 2, 'доля редких ' + rare);
  assert.ok(a.filter(Boolean).every((id) => S.MODS[id]), 'только из набора обычных');
  // До своей волны — никого.
  for (let serial = 1; serial <= 200; serial++) assert.strictEqual(S.pickMod(state, cfg, false, serial, cfg['mod.fromWave'] - 1), '');
});

test('босс с mod.bossFromWave всегда со своим модификатором, раньше — без', () => {
  const state = fresh();
  for (let serial = 1; serial <= 60; serial++) {
    const id = S.pickMod(state, cfg, true, serial, cfg['mod.bossFromWave']);
    assert.ok(S.BOSS_MODS[id], 'босс: ' + id);
    assert.strictEqual(S.pickMod(state, cfg, true, serial, cfg['mod.bossFromWave'] - 10), '');
  }
});

test('модификатор меняет здоровье, подход, таймер босса и награду', () => {
  const state = fresh();
  const r = state.run;
  r.wave = 31;
  r.maxWave = 31;
  // Найти встречу, на которую выпадет гигант.
  let serial = 1;
  while (S.pickMod(state, cfg, false, serial, 31) !== 'giant' && serial < 5000) serial++;
  r.encounterSerial = serial - 1;
  S.spawn(state, cfg);
  assert.strictEqual(r.encounter.mod, 'giant');
  const giant = S.modOf(cfg, 'giant', false);
  assert.strictEqual(Big.str(r.hpMax), Big.str(Big.max(Big.of(1), Big.ceil(Big.mul(S.hpOf(cfg, 31), giant.hp)))));
  assert.ok(Math.abs(r.walkT - cfg['wave.walkSec'] * giant.walk) < 1e-9);
  assert.strictEqual(S.encounterView(state, cfg).size, giant.size);
  const gold = Big.of(r.gold);
  const ctx = ctxOf(x, NOW, x.Rng.make(1));
  S.kill(state, ctx);
  const plain = Big.mul(S.goldOf(cfg, 31), S.goldMult(state, cfg, 31));
  const got = Big.sub(Big.of(r.gold), gold);
  assert.ok(Math.abs(Big.toNumber(Big.div(got, plain)) - giant.gold) < 1e-6, 'золото ×' + giant.gold);
  assert.strictEqual(r.lastMod.id, 'giant');
});

test('кладоносец оставляет клинки, пылающий раскаляет горн, морозный его остужает', () => {
  const state = fresh();
  const r = state.run;
  r.wave = 31;
  const ctx = ctxOf(x, NOW, x.Rng.make(2));
  S.newEncounter(state, cfg);
  r.encounter.mod = 'treasure';
  const pending = r.pending.length;
  S.kill(state, ctx);
  assert.strictEqual(r.pending.length - pending, S.modOf(cfg, 'treasure', false).blades);
  r.heat = 0;
  r.encounter.mod = 'burning';
  S.kill(state, ctx);
  assert.strictEqual(r.heat, 1);
  // Морозный на подходе забирает половину жара.
  let serial = 1;
  while (S.pickMod(state, cfg, false, serial, r.wave) !== 'frosty' && serial < 20000) serial++;
  r.encounterSerial = serial - 1;
  r.heat = 0.8;
  S.spawn(state, cfg);
  assert.strictEqual(r.encounter.mod, 'frosty');
  assert.ok(Math.abs(r.heat - Math.max(S.heatFloor(state, cfg), 0.8 * S.modOf(cfg, 'frosty', false).cool)) < 1e-9);
});

test('боссы: таймер и здоровье по модификатору', () => {
  const state = fresh();
  const r = state.run;
  r.wave = cfg['mod.bossFromWave'];
  r.maxWave = r.wave;
  r.farm = false;
  S.spawn(state, cfg);
  const m = S.modOf(cfg, r.encounter.mod, true);
  assert.ok(S.BOSS_MODS[r.encounter.mod]);
  assert.ok(Math.abs(r.bossT - S.bossTimer(state, cfg) * m.timer) < 1e-9);
});

test('миры: 10 по 5 врагов, у каждого картинка, имя босса и перевод; у каждого мира фон', () => {
  assert.strictEqual(content.worlds.length, 10);
  const arts = new Set();
  for (const w of content.worlds) {
    assert.strictEqual(w.kinds.length, 5, w.id);
    assert.ok(has('bg', w.bg), 'фон ' + w.bg);
    assert.ok(en[w.title], 'перевод мира ' + w.title);
    for (const b of w.bosses) assert.ok(b >= 0 && b < w.kinds.length);
    for (const k of w.kinds) {
      assert.ok(has('monster', k.art), 'рисунок ' + k.art);
      assert.ok(!arts.has(k.art), 'повтор ' + k.art);
      arts.add(k.art);
      for (const key of ['title', 'boss', 'text']) assert.ok(en[k[key]], 'перевод: ' + k[key]);
      assert.ok(content.forms[k.g] !== undefined && content.forms[k.bg] !== undefined, k.title + ': род');
      assert.ok(k.text.length <= 70);
    }
  }
  assert.strictEqual(arts.size, 50);
  // Каждый модификатор симуляции назван в контенте, и наоборот.
  assert.deepStrictEqual(Object.keys(content.mods).sort(), Object.keys(S.MODS).concat(Object.keys(S.BOSS_MODS)).sort());
});

test('арт: каждая картинка улучшений, героев, питомцев, драконов и артефактов на месте и не тяжелее 120 КБ', () => {
  for (const u of S.UP) assert.ok(has('up', u.id), 'улучшение ' + u.id);
  for (const id of ['bran', 'veya', 'eira', 'corvin']) assert.ok(has('hero', id));
  for (const id of ['salamander', 'fox', 'raven', 'turtle']) assert.ok(has('pet', id));
  for (const id of ['egg', 'young', 'ash', 'frost', 'storm']) assert.ok(has('dragon', id));
  for (const a of S.artifacts.CATALOG) assert.ok(has('artifact', a.id), 'артефакт ' + a.id);
  let total = 0;
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const f = path.join(dir, d.name);
    if (d.isDirectory()) return walk(f);
    const size = fs.statSync(f).size;
    total += size;
    assert.ok(size <= 120 * 1024, f + ': ' + size);
  });
  walk(path.join(GAME, 'art'));
  assert.ok(total < 4 * 1024 * 1024, 'весь арт ' + total);
});

test('список картинок в ui/art.js совпадает с папкой art', () => {
  const src = fs.readFileSync(path.join(GAME, 'ui', 'art.js'), 'utf8');
  const m = /const RASTER = (\{[\s\S]*?\n  \});/.exec(src);
  assert.ok(m, 'нет RASTER');
  const listed = Function('return ' + m[1])();
  const onDisk = {};
  for (const d of fs.readdirSync(path.join(GAME, 'art'))) onDisk[d] = fs.readdirSync(path.join(GAME, 'art', d)).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort();
  assert.deepStrictEqual(listed, onDisk);
});

done('monsters');
