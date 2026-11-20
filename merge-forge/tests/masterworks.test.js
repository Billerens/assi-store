// «Коллекция шедевров»: drops from bosses, the stand, levels and salvage for coals, the forge of
// masterworks, what the stand gives, and what outlives the resets.  node tests/masterworks.test.js
'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open();
const S = x.sim, cfg = x.cfg, B = x.Big, M = S.masterworks, Core = x.Core;
const NOW = Date.UTC(2026, 10, 21, 18);
function fresh(seed) {
  const rng = x.Rng.make(seed || 71);
  const state = Core.newState(x.game, S, ctxOf(x, NOW, rng));
  S.ensure(state);
  state.layers.forge.currency = '1e6';
  return { state, rng };
}
const close = (a, b, m) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), m || a + ' != ' + b);
function give(state, slot, rarity, stats, level) {
  const m = state.meta.masterworks;
  m.serial++;
  const id = 'mw' + m.serial;
  m.items[id] = { id, slot, rarity: rarity || 'good', level: level || 1, stats: stats || [M.POOLS[slot][0]], wave: 10, flavor: null, invested: 0 };
  return id;
}

test('шедевры падают только с боссов, по шансу, с эффектами своего слота; одинаково при повторе', () => {
  const { state } = fresh();
  let tries = 0;
  // Past the room of the inventory the pieces are taken apart: they count as drops all the same.
  for (let serial = 1; serial <= 2000; serial++) { M.onBossKill(state, cfg, serial, 30, NOW); tries++; }
  const rate = state.meta.masterworks.drops / tries;
  assert.ok(Math.abs(rate - M.dropChance(state, cfg)) < 0.02, 'частота ' + rate);
  for (const id in state.meta.masterworks.items) {
    const it = state.meta.masterworks.items[id];
    assert.strictEqual(it.stats[0], M.POOLS[it.slot][0], 'главный эффект слота');
    assert.strictEqual(it.stats.length, 1 + M.RARITY_BY[it.rarity].extra);
    assert.strictEqual(new Set(it.stats).size, it.stats.length, 'без повторов');
    assert.ok(it.stats.every((k) => M.POOLS[it.slot].indexOf(k) >= 0));
  }
  // The same boss gives the same piece.
  const a = fresh(1).state, b = fresh(2).state;
  const ra = M.onBossKill(a, cfg, 77, 40, NOW), rb = M.onBossKill(b, cfg, 77, 40, NOW);
  assert.deepStrictEqual(ra.added.map((id) => a.meta.masterworks.items[id].slot), rb.added.map((id) => b.meta.masterworks.items[id].slot));
});

test('победа над боссом в игре кладёт шедевр в коллекцию; на фарме — нет', () => {
  const { state, rng } = fresh();
  const sure = Object.assign({}, cfg, { 'mw.drop.base': 1, 'mw.drop.max': 1 });
  state.run.wave = 10; state.run.maxWave = 10; state.run.farm = false;
  S.spawn(state, sure);
  S.kill(state, Object.assign(ctxOf(x, NOW, rng), { config: sure }));
  assert.ok(state.run.lastMasterwork && state.run.lastMasterwork.ids.length >= 1, 'шедевр с босса');
  const before = Object.keys(state.meta.masterworks.items).length;
  state.run.wave = 9; state.run.farm = true;
  S.spawn(state, sure);
  S.kill(state, Object.assign(ctxOf(x, NOW, rng), { config: sure }));
  assert.strictEqual(Object.keys(state.meta.masterworks.items).length, before, 'фарм — без шедевров');
});

test('стенд: по одному в слоте, колец два; работает только выставленное', () => {
  const { state } = fresh();
  const sword = give(state, 'sword'), sword2 = give(state, 'sword', 'rare'), r1 = give(state, 'ring'), r2 = give(state, 'ring'), r3 = give(state, 'ring');
  assert.strictEqual(M.modifiers(state, cfg).damage, 0, 'в инвентаре — не работает');
  M.equip(state, sword);
  close(M.modifiers(state, cfg).damage, M.statValue(state, cfg, state.meta.masterworks.items[sword], 0));
  M.equip(state, sword2);
  assert.strictEqual(state.meta.masterworks.stand.sword, sword2, 'второй меч заменил первый');
  assert.strictEqual(M.placeOf(state, sword), '');
  assert.strictEqual(M.equip(state, r1).place, 'ring1');
  assert.strictEqual(M.equip(state, r2).place, 'ring2');
  M.equip(state, r3, 'ring2');
  assert.strictEqual(state.meta.masterworks.stand.ring2, r3);
  assert.strictEqual(M.placeOf(state, r2), '');
  assert.strictEqual(M.validate(state), null);
  M.unequip(state, sword2);
  assert.strictEqual(state.meta.masterworks.stand.sword, '');
});

test('уровень шедевра и узлы кузницы — за угли, без последнего уровня; разбор возвращает угли', () => {
  const { state } = fresh();
  const id = give(state, 'chest', 'legend');
  M.equip(state, id);
  const v1 = M.modifiers(state, cfg).gold;
  const price = M.levelCost(state, cfg, id);
  const coals = B.toNumber(B.of(state.layers.forge.currency));
  assert.ok(M.levelUp(state, cfg, id).ok);
  close(B.toNumber(B.of(state.layers.forge.currency)), coals - B.toNumber(price));
  assert.ok(M.modifiers(state, cfg).gold > v1);
  close(state.meta.masterworks.items[id].invested, B.toNumber(price));
  // The coal bonus stays: what is spent counts with what is at hand.
  const all = S.coalsAll(state);
  assert.ok(M.buyNode(state, cfg, 'chest').ok);
  close(S.coalsAll(state), all);
  assert.ok(M.modifiers(state, cfg).gold > v1 * 1.05);
  for (let i = 0; i < 30; i++) M.buyNode(state, cfg, 'chance');
  assert.ok(M.dropChance(state, cfg) <= cfg['mw.drop.max'] + 1e-12);
  const back = M.salvageValue(state, id);
  assert.strictEqual(back, M.RARITY_BY.legend.salvage + Math.floor(B.toNumber(price) / 2));
  const before = B.toNumber(B.of(state.layers.forge.currency));
  assert.ok(M.salvage(state, cfg, id).ok);
  close(B.toNumber(B.of(state.layers.forge.currency)), before + back);
  assert.strictEqual(state.meta.masterworks.stand.chest, '');
  state.layers.forge.currency = '0e0';
  assert.strictEqual(M.levelUp(state, cfg, give(state, 'ring')).ok, false, 'без углей — нет');
});

test('полный инвентарь: новый шедевр сразу разбирается на угли', () => {
  const { state } = fresh();
  state.meta.masterworks.up.chance = 1000;
  for (let i = 0; i < M.capacity(state, cfg); i++) give(state, 'boots');
  const before = B.toNumber(B.of(state.layers.forge.currency));
  let got = null;
  for (let serial = 1; serial < 50 && !(got && got.salvaged); serial++) got = M.onBossKill(state, cfg, serial, 30, NOW);
  assert.ok(got.salvaged > 0 && got.added.length === 0);
  assert.ok(B.toNumber(B.of(state.layers.forge.currency)) > before);
});

test('стенд меняет игру: урон, золото, время босса, угли за перековку, приёмы', () => {
  const { state } = fresh();
  const dmg = B.toNumber(S.dmgMult(state, cfg, 0)), gold = S.goldMult(state, cfg, 1), timer = S.bossTimer(state, cfg);
  M.equip(state, give(state, 'sword', 'myth', ['damage']));
  M.equip(state, give(state, 'chest', 'myth', ['gold']));
  M.equip(state, give(state, 'shield', 'myth', ['bossTime']));
  const mods = M.modifiers(state, cfg);
  close(B.toNumber(S.dmgMult(state, cfg, 0)), dmg * (1 + mods.damage));
  close(S.goldMult(state, cfg, 1), gold * (1 + mods.gold));
  close(S.bossTimer(state, cfg), timer + mods.bossTime);
  state.run.maxWave = 100;
  const coals = S.coalsGain(state, cfg, 100);
  M.equip(state, give(state, 'ring', 'myth', ['coals']));
  const extra = M.modifiers(state, cfg).coals;
  assert.ok(extra > 0);
  assert.strictEqual(S.coalsGain(state, cfg, 100), Math.floor(S.coalsPay(cfg, S.coalsFor(cfg, 100), state.layers.forge.state.paid) * (1 + extra) + 1e-9));
  assert.ok(S.coalsGain(state, cfg, 100) > coals);
  // Effects with a ceiling stay under it however many pieces.
  for (let i = 0; i < 8; i++) M.equip(state, give(state, 'legs', 'myth', ['waveSkip'], 500));
  assert.ok(M.modifiers(state, cfg).waveSkip < M.STATS.waveSkip.cap);
});

test('коллекция переживает перековку и звёздный металл; старое сохранение без неё читается', () => {
  const { state, rng } = fresh();
  const id = give(state, 'helmet', 'rare');
  M.equip(state, id);
  state.meta.masterworks.up.capacity = 3;
  state.run.maxWave = 120;
  assert.ok(Core.prestige(S, x.game, state, 'forge', ctxOf(x, NOW, rng)).ok);
  assert.strictEqual(state.meta.masterworks.stand.helmet, id);
  assert.strictEqual(state.meta.masterworks.up.capacity, 3);
  const old = fresh(5).state;
  delete old.meta.masterworks;
  const picked = Core.pick([{ json: JSON.stringify(old), seq: 3 }], x.game, S);
  assert.ok(picked.state, JSON.stringify(picked.broken));
  assert.ok(picked.state.meta.masterworks && picked.state.meta.masterworks.items);
  // A damaged one is caught.
  const bad = fresh(6).state;
  bad.meta.masterworks.stand.sword = 'nope';
  assert.ok(S.validate(bad));
});

test('история от модели: имя, легенда, девиз и значок; без модели — временное имя и повтор позже', () => {
  const { state } = fresh();
  const id = give(state, 'ring');
  assert.deepStrictEqual(M.waiting(state), [id]);
  M.setFlavor(state, id, S.procedural('masterworks', x.Rng.make(3)));
  assert.ok(state.meta.masterworks.items[id].stub, 'ждёт настоящую историю');
  assert.deepStrictEqual(M.waiting(state), [id]);
  M.setFlavor(state, id, { slot: 'ring', title: 'Кольцо Засахаренной Вишни', text: 'Пахнет вареньем и смелостью', lore: 'Его потерял кондитер, а нашёл босс. '.repeat(3), motto: 'Сладко, но крепко', svg: '<svg/>' });
  assert.strictEqual(state.meta.masterworks.items[id].flavor.title, 'Кольцо Засахаренной Вишни');
  assert.deepStrictEqual(M.waiting(state), []);
  assert.strictEqual(S.validateStock('masterworks', { slot: 'cape', title: 'x' }), 'нет такого слота');
  assert.strictEqual(S.validateStock('masterworks', { slot: 'ring', title: 'Кольцо' }), null);
});

test('бот сам выставляет лучший шедевр в пустое место', () => {
  const { state } = fresh();
  const a = give(state, 'boots', 'good'), b = give(state, 'boots', 'legend');
  M.autoEquip(state);
  assert.strictEqual(state.meta.masterworks.stand.boots, b);
  assert.notStrictEqual(state.meta.masterworks.stand.boots, a);
});

done('masterworks');
