// The skills (strength and cooldown upgrades, «Авто»), the relics of 0.6.0, their sets, the star's coals.
// node tests/skills.test.js
'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open();
const S = x.sim, cfg = x.cfg, B = x.Big, A = S.artifacts;
const NOW = Date.UTC(2026, 10, 21, 12);
function fresh(seed) {
  const rng = x.Rng.make(seed || 61);
  const state = x.Core.newState(x.game, S, ctxOf(x, NOW, rng));
  S.ensure(state);
  state.run.maxWave = 120;
  state.run.wave = 41;
  return { state, rng };
}
const close = (a, b, m) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), m || a + ' != ' + b);
function own(state, id, level) { state.meta.artifacts.items[id] = { level: level || 8, enabled: true, cooldown: 0 }; }
function atGate(state) { state.run.walkT = 0; state.run.hp = '1e300'; state.run.hpMax = '1e300'; if (!state.run.encounter) S.newEncounter(state, cfg); }
const sureRng = { chance: (p) => p > 0, next: () => 0.5, int: () => 0, range: (a) => a, pick: (l) => l[0], weighted: (l) => l[0] };

test('приёмы открываются по волнам, откат — только после самого приёма', () => {
  const { state } = fresh();
  state.run.maxWave = cfg['up.midas.fromWave'] - 1;
  assert.strictEqual(S.upUnlocked(state, cfg, 'midas'), false);
  state.run.maxWave = cfg['up.midas.fromWave'];
  assert.strictEqual(S.upUnlocked(state, cfg, 'midas'), true);
  assert.strictEqual(S.upUnlocked(state, cfg, 'midasCd'), false, 'откат без приёма');
  state.run.up.midas = 1;
  assert.strictEqual(S.upUnlocked(state, cfg, 'midasCd'), true);
  assert.strictEqual(S.upUnlocked(state, cfg, 'cryCd'), false);
  state.run.up.cry = 1;
  assert.strictEqual(S.upUnlocked(state, cfg, 'cryCd'), true);
});

test('откат: базовый делится на 1 + шаг × уровень, без последнего уровня; артефакты сокращают ещё', () => {
  const { state } = fresh();
  for (const id of S.SKILL_IDS) {
    const d = S.SKILLS[id];
    state.run.up[d.cd] = 0;
    close(S.skillCooldown(state, cfg, id), cfg[d.cooldown]);
    state.run.up[d.cd] = 30;
    close(S.skillCooldown(state, cfg, id), Math.max(cfg['skill.minCooldownSec'], cfg[d.cooldown] / (1 + 30 * cfg['up.' + d.cd + '.step'])));
    assert.ok(S.upMax(state, cfg, d.cd) >= 10000, 'без потолка');
  }
  own(state, 'masterHourglass', 20);
  const m = A.modifiers(state, cfg).skillCooldown;
  assert.ok(m > 0);
  close(S.skillCooldown(state, cfg, 'midas'), Math.max(cfg['skill.minCooldownSec'], cfg['skill.midas.cooldownSec'] / (1 + 30 * cfg['up.midasCd.step']) / (1 + m)));
});

test('приём: без уровня — нет; после применения — ждёт отката; действует свою длительность', () => {
  const { state } = fresh();
  assert.strictEqual(S.useSkill(state, cfg, 'fury', NOW), false);
  state.run.up.fury = 3;
  assert.strictEqual(S.useSkill(state, cfg, 'fury', NOW), true);
  assert.ok(S.skillOn(state, 'fury', NOW + 1000));
  assert.ok(!S.skillOn(state, 'fury', NOW + S.skillDuration(state, cfg, 'fury') * 1000 + 1));
  assert.strictEqual(S.useSkill(state, cfg, 'fury', NOW + 1000), false, 'откат');
  assert.strictEqual(S.useSkill(state, cfg, 'fury', NOW + S.skillCooldown(state, cfg, 'fury') * 1000), true);
  // The cry is a skill too, with its old fields.
  state.run.up.cry = 2;
  assert.ok(S.cry(state, cfg, NOW));
  assert.ok(S.cryOn(state, NOW + 1000));
  assert.ok(state.run.cryReadyAt > NOW);
});

test('Золотое касание: каждый залп приносит долю награды за врага', () => {
  const { state } = fresh();
  state.run.up.midas = 10;
  state.run.grid.fill(0);
  state.run.grid[0] = 6;
  atGate(state);
  const share = S.midasShare(state, cfg);
  close(share, cfg['up.midas.step'] * S.upgradeEffective(state, cfg, 'midas'));
  assert.ok(S.useSkill(state, cfg, 'midas', NOW));
  const gold = B.of(state.run.gold);
  const reward = S.foeReward(state, cfg);
  S.tick(state, cfg['combat.hitSec'], Object.assign(ctxOf(x, NOW + 100, sureRng), { rng: sureRng }));
  const got = B.toNumber(B.sub(B.of(state.run.gold), gold));
  assert.ok(state.run.lastMidas, 'залп был');
  close(B.toNumber(B.of(state.run.lastMidas.gold)), B.toNumber(B.mul(reward, share)));
  assert.ok(got >= B.toNumber(B.of(state.run.lastMidas.gold)) * 0.999);
  // Without the skill on: no gold of the touch.
  const { state: plain } = fresh();
  plain.run.up.midas = 10;
  plain.run.grid.fill(0);
  plain.run.grid[0] = 6;
  atGate(plain);
  S.tick(plain, cfg['combat.hitSec'], Object.assign(ctxOf(x, NOW + 100, sureRng), { rng: sureRng }));
  assert.ok(!plain.run.lastMidas);
});

test('Мощный удар: секунды урона кузни разом, только когда враг у ворот', () => {
  const { state } = fresh();
  state.run.up.strike = 5;
  state.run.grid.fill(0);
  state.run.grid[0] = 8;
  state.run.walkT = 3;
  assert.strictEqual(S.useSkill(state, cfg, 'strike', NOW), false, 'враг ещё идёт');
  atGate(state);
  assert.ok(S.useSkill(state, cfg, 'strike', NOW));
  const pending = state.run.encounter.pending.find((p) => p.id === 'strike');
  assert.ok(pending);
  const sec = S.strikeSeconds(state, cfg);
  close(sec, cfg['skill.strike.sec'] * (1 + cfg['up.strike.step'] * S.upgradeEffective(state, cfg, 'strike')));
  const raw = B.toNumber(B.div(S.dps(state, cfg, NOW), S.dmgMult(state, cfg, NOW))) * sec;
  close(B.toNumber(B.of(pending.damage)), raw);
});

test('Ярость кузни: шанс крита выше, сила крита больше, пока действует', () => {
  const { state } = fresh();
  state.run.up.fury = 5;
  const before = S.criticalStats(state, cfg, { now: NOW });
  assert.ok(S.useSkill(state, cfg, 'fury', NOW));
  const during = S.criticalStats(state, cfg, { now: NOW + 1000 });
  assert.ok(during.chance > before.chance || during.multiplier > before.multiplier * S.furyBonus(state, cfg).mult * 0.999);
  assert.ok(during.multiplier >= before.multiplier * S.furyBonus(state, cfg).mult - 1e-9);
  const after = S.criticalStats(state, cfg, { now: NOW + 1000 + S.skillDuration(state, cfg, 'fury') * 1000 });
  close(after.multiplier, before.multiplier);
});

test('«Авто» применяет готовые приёмы, когда враг у ворот, и никогда офлайн', () => {
  const { state } = fresh();
  state.run.up.cry = 1; state.run.up.midas = 1; state.run.up.strike = 1; state.run.up.fury = 1;
  state.run.grid.fill(0); state.run.grid[0] = 5;
  atGate(state);
  S.setAutoSkills(state, true);
  S.tick(state, 0.1, Object.assign(ctxOf(x, NOW, sureRng, { offline: true }), { rng: sureRng }));
  assert.ok(!S.skillOn(state, 'midas', NOW + 50), 'офлайн — нет');
  S.tick(state, 0.1, Object.assign(ctxOf(x, NOW, sureRng), { rng: sureRng }));
  for (const id of ['cry', 'midas', 'fury']) assert.ok(S.skillOn(state, id, NOW + 50), id);
  assert.ok(S.skillTimes(state, 'strike').readyAt > NOW, 'удар применён');
  S.setAutoSkills(state, false);
  assert.strictEqual(state.meta.autoSkills, false);
});

test('артефакты: враги слабее, боссам больше урона и золота, редкие чаще', () => {
  const { state } = fresh();
  state.run.wave = 41; state.run.farm = false;
  S.spawn(state, cfg);
  const plain = B.toNumber(B.of(state.run.hpMax));
  own(state, 'titanScale', 30);
  S.spawn(state, cfg);
  const thin = A.modifiers(state, cfg).enemyHp;
  assert.ok(thin > 0 && thin < A.LIMITS.enemyHp);
  // Health is a whole number: the ratio holds to the rounding.
  assert.ok(Math.abs(B.toNumber(B.of(state.run.hpMax)) / plain - (1 - thin)) < 1e-4);
  own(state, 'giantFang', 8); own(state, 'treasureKey', 8); own(state, 'luckyCup', 8);
  const mods = A.modifiers(state, cfg);
  assert.ok(mods.bossDamage > 0 && mods.bossGold > 0 && mods.rareChance > 0);
});

test('Сапоги-скороходы: после обычного врага — перескок волны с её наградой, на босса — никогда', () => {
  const { state, rng } = fresh();
  own(state, 'swiftBoots', 1000);
  state.meta.artifacts.items.swiftBoots.level = 1000;
  let skipped = 0, intoBoss = 0;
  for (let w = 21; w < 120; w++) {
    state.run.wave = w; state.run.farm = false; state.run.walkT = 0;
    S.spawn(state, cfg);
    const before = state.run.wave;
    S.kill(state, Object.assign(ctxOf(x, NOW, rng), { config: cfg }));
    if (state.run.wave === before + 2) { skipped++; if (S.isBoss(cfg, before + 1)) intoBoss++; }
  }
  assert.ok(skipped > 0, 'перескоки были');
  assert.strictEqual(intoBoss, 0, 'босса не пропускает');
});

test('артефакты ручного удара: удар по врагу, следующий залп — крит, откаты приёмов короче', () => {
  const { state } = fresh();
  state.run.up.midas = 1;
  atGate(state);
  S.useSkill(state, cfg, 'midas', NOW);
  const ready = S.skillTimes(state, 'midas').readyAt;
  // Through a tap with every relic waking.
  own(state, 'heavyHammer', 20); own(state, 'preciseSpark', 20); own(state, 'goldenNail', 20);
  state.run.tapBudget = 5;
  const always = { chance: () => true, next: () => 0, int: () => 0, range: (a) => a, pick: (l) => l[0] };
  assert.ok(S.tap(state, cfg, always, NOW + 10));
  assert.ok(state.run.encounter.pending.some((p) => p.id === 'heavyHammer'), 'удар молота');
  assert.strictEqual(state.run.nextCrit, true);
  assert.ok(S.skillTimes(state, 'midas').readyAt < ready, 'откат короче');
});

test('наборы: бонус — только когда все артефакты набора куплены и включены', () => {
  const { state } = fresh();
  const set = A.SETS.find((s) => s.id === 'bossHunter');
  set.items.forEach((id) => own(state, id, 1));
  const full = A.modifiers(state, cfg).bossSeconds;
  S.setArtifactEnabled(state, set.items[0], false);
  const part = A.modifiers(state, cfg).bossSeconds;
  assert.ok(full > part, 'набор даёт сверх');
  const model = A.model(state, cfg).sets.find((s) => s.id === 'bossHunter');
  assert.strictEqual(model.complete, false);
  S.setArtifactEnabled(state, set.items[0], true);
  assert.strictEqual(A.model(state, cfg).sets.find((s) => s.id === 'bossHunter').complete, true);
});

test('звёздный металл: каждый слиток умножает угли за перековку', () => {
  const { state } = fresh();
  state.run.maxWave = 100;
  const plain = S.coalsGain(state, cfg, 100);
  state.layers.star.currency = '1e0';
  assert.strictEqual(S.starCoals(state, cfg), cfg['star.coalMult']);
  assert.strictEqual(S.coalsGain(state, cfg, 100), Math.floor(plain * cfg['star.coalMult']));
  state.layers.star.currency = '2e0';
  assert.strictEqual(S.coalsGain(state, cfg, 100), Math.floor(plain * cfg['star.coalMult'] * cfg['star.coalMult']));
});

done('skills');
