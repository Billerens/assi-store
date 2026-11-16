'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { H, open, ctx, GAME } = require('./env');
const { x } = open();
const { sim, Core, Big, Rng, cfg, game } = x;
const NOW = Date.UTC(2026, 10, 2, 5);
const catalogue = JSON.parse(fs.readFileSync(path.join(GAME, 'content/catalog.json'), 'utf8'));

function fresh(seed = 1) {
  const context = ctx(x, NOW, Rng.make(seed));
  return { s: Core.newState(game, sim, context), c: context };
}
function average(beast) { return beast.genes.reduce((a, b) => a + b, 0) / 4; }
function valid(s) {
  assert.strictEqual(Core.validate(s, game), null);
  assert.strictEqual(sim.validate(s), null);
}
function lay(s, c) {
  const result = sim.breed(s, s.run.beasts[0].id, s.run.beasts[1].id, c);
  assert.ok(result.ok, result.reason);
  return s.run.eggs[0];
}

H.test('полный каталог: 14 видов, 70 частей, 12 цветов, 78 пар, 20 улучшений, 6 лиг', () => {
  assert.strictEqual(catalogue.species.length, 14);
  assert.strictEqual(catalogue.parts.length * catalogue.species.length, 70);
  assert.strictEqual(catalogue.palette.length, 12);
  assert.strictEqual(catalogue.palette.length * (catalogue.palette.length + 1) / 2, 78);
  assert.strictEqual(catalogue.upgrades.length, 20);
  assert.strictEqual(new Set(catalogue.upgrades.map(u => u.id)).size, 20);
  assert.strictEqual(catalogue.leagues.length, 6);
  assert.strictEqual(catalogue.events.length, 5);
  assert.ok(catalogue.traits.length >= 8);
  assert.strictEqual(game.saveVersion, 1);
});

H.test('новая игра: четыре взрослых зверя и первая покупка в 0 секунд', () => {
  const { s } = fresh();
  assert.strictEqual(s.run.beasts.length, 4);
  assert.ok(s.run.beasts.every(b => b.level >= 5 && b.genes.length === 4 && b.parts.length === 5 && b.colors.length === 2));
  assert.ok(sim.buy(s, 'feed', cfg));
  assert.ok(Big.eq(s.run.coins, 0));
  assert.ok(!sim.buy(s, 'feed', cfg));
  valid(s);
});

H.test('все 20 улучшений покупаются; цены растут, пределы вольера и гнёзд соблюдены', () => {
  const { s } = fresh();
  s.run.coins = '1e100';
  for (const item of catalogue.upgrades) {
    const price = sim.cost(s, item.id, cfg);
    assert.ok(Big.gt(price, 0), item.id);
    assert.ok(sim.buy(s, item.id, cfg), item.id);
    assert.strictEqual(s.run.upgrades[item.id], 1, item.id);
    if (cfg['upgrade.' + item.id + '.max'] > 1) {
      assert.ok(Big.gt(sim.cost(s, item.id, cfg), price), item.id);
    } else assert.ok(!sim.buy(s, item.id, cfg), item.id + ' куплено дважды');
  }
  for (let i = 0; i < 30; i++) { sim.buy(s, 'aviary', cfg); sim.buy(s, 'nest', cfg); }
  assert.strictEqual(sim.capacity(s, cfg), 60);
  assert.strictEqual(sim.nests(s, cfg), 8);
  assert.ok(!sim.buy(s, 'missing', cfg));
  valid(s);
});

H.test('разведение проверяет возраст, разных родителей, лимит кладок и отдых', () => {
  const { s, c } = fresh();
  const a = s.run.beasts[0], b = s.run.beasts[1];
  assert.ok(!sim.breed(s, a.id, a.id, c).ok);
  assert.ok(!sim.breed(s, a.id, 'missing', c).ok);
  a.level = 4;
  assert.ok(!sim.breed(s, a.id, b.id, c).ok);
  a.level = 5;
  a.eggs = 6;
  assert.ok(!sim.breed(s, a.id, b.id, c).ok);
  a.eggs = 0;
  a.restUntil = c.now + 1000;
  assert.ok(!sim.breed(s, a.id, b.id, c).ok);
  a.restUntil = 0;
  const egg = lay(s, c);
  assert.strictEqual(egg.beast.generation, Math.max(a.generation, b.generation) + 1);
  assert.strictEqual(a.eggs, 1);
  assert.strictEqual(b.eggs, 1);
  assert.strictEqual(a.restUntil - c.now, 2 * 3600000);
  assert.ok(!sim.breed(s, a.id, b.id, c).ok);
  const expected = Math.min(4 * 3600, 1800 * Math.pow(1.25, egg.beast.generation / 5));
  assert.ok(Math.abs(egg.duration - expected) < 0.001);
});

H.test('каждая часть наследует по аллелю родителя; сильнее проявляется доминантный', () => {
  const { s, c } = fresh(12);
  const a = s.run.beasts[0], b = s.run.beasts[1];
  for (let i = 0; i < 5; i++) {
    a.parts[i] = { a: 0, b: 1, visible: 0 };
    b.parts[i] = { a: 2, b: 3, visible: 2 };
  }
  a.colors = [0, 1]; b.colors = [2, 3];
  for (let n = 0; n < 500; n++) {
    const child = sim.offspring(s, a, b, c, false);
    for (let p = 0; p < 5; p++) {
      const part = child.parts[p];
      assert.ok([0, 1].includes(part.a));
      assert.ok([2, 3].includes(part.b));
      const da = cfg['dominance.' + part.a + '.' + p];
      const db = cfg['dominance.' + part.b + '.' + p];
      assert.ok(part.visible === (da > db ? part.a : db > da ? part.b : part.visible));
      assert.ok([part.a, part.b].includes(part.visible));
    }
    assert.ok(a.colors.includes(child.colors[0]));
    assert.ok(b.colors.includes(child.colors[1]));
  }
});

H.test('наследование черты: 50% у одного родителя, 90% у обоих', () => {
  const outcomes = [];
  for (const both of [false, true]) {
    const { s, c } = fresh(91);
    c.config = Object.assign({}, cfg, { 'trait.newChance': 0 });
    const a = s.run.beasts[0], b = s.run.beasts[1];
    a.traits = ['tireless']; b.traits = both ? ['tireless'] : [];
    let inherited = 0;
    for (let n = 0; n < 5000; n++) inherited += sim.offspring(s, a, b, c, false).traits.includes('tireless') ? 1 : 0;
    const rate = inherited / 5000;
    assert.ok(Math.abs(rate - (both ? 0.9 : 0.5)) < 0.025, 'доля ' + rate);
    outcomes.push(rate);
  }
  console.log('  Наследование черт: ' + outcomes.map(v => (v * 100).toFixed(2) + '%').join(', '));
});

H.test('селекция двух лучших: +2..4 качества за раннее поколение, позднее предел cap', () => {
  let growth = 0, plateau = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { s, c } = fresh(seed);
    let parents = s.run.beasts.slice(0, 2);
    for (const parent of parents) parent.genes = [25, 25, 25, 25];
    for (let generation = 0; generation < 30; generation++) {
      const before = parents.reduce((v, b) => v + average(b), 0) / 2;
      const candidates = [];
      for (let n = 0; n < 10; n++) candidates.push(sim.offspring(s, parents[0], parents[1], c, false));
      candidates.sort((a, b) => average(b) - average(a));
      parents = candidates.slice(0, 2);
      const after = parents.reduce((v, b) => v + average(b), 0) / 2;
      if (generation < 5) growth += after - before;
      if (generation === 29) plateau += after;
      assert.ok(candidates.every(b => b.genes.every(v => v >= 0 && v <= sim.cap(s, cfg))));
    }
  }
  growth /= 40 * 5; plateau /= 40;
  console.log('  Селекция: +' + growth.toFixed(3) + ' за поколение, плато ' + plateau.toFixed(3) + '/60');
  assert.ok(growth >= 2 && growth <= 4, 'ранний прирост ' + growth);
  assert.ok(plateau >= 56 && plateau <= 60, 'плато ' + plateau);
});

H.test('генофонд: cap 60/80/100/101 и наследие +0,1 за каждые 10', () => {
  const { s } = fresh();
  for (const [pool, cap] of [[0, 60], [200, 80], [400, 100], [425, 101]]) {
    s.meta.genePool = pool;
    assert.strictEqual(sim.cap(s, cfg), cap);
    assert.ok(Math.abs(sim.legacy(s, cfg) - Math.floor(pool / 10) * 0.1) < 1e-9);
  }
});

H.test('заповедник начисляет формулу один раз; смотритель даёт +10%', () => {
  for (const keeper of [0, 1]) {
    const { s, c } = fresh();
    const beast = s.run.beasts[0];
    beast.genes = [40, 40, 40, 40]; beast.generation = 5;
    s.run.upgrades.keeper = keeper;
    const before = Number(s.meta.genePool);
    const expected = (Math.pow(40 / 10, 1.5) + 5 / 5) * (1 + keeper * 0.1);
    assert.ok(sim.retire(s, beast.id, c).ok);
    assert.ok(Math.abs(Number(s.meta.genePool) - before - expected) < 1e-9);
    assert.ok(!s.run.beasts.some(b => b.id === beast.id));
    assert.ok(!sim.retire(s, beast.id, c).ok);
    assert.ok(Math.abs(Number(s.meta.genePool) - before - expected) < 1e-9);
    valid(s);
  }
});

H.test('инкубация офлайн 50%, с инкубатором 100%; содержимое яйца точно сохранено', () => {
  for (const incubator of [0, 1]) {
    const { s, c } = fresh(77);
    s.run.upgrades.incubator = incubator;
    const egg = lay(s, c), predetermined = Core.clone(egg.beast);
    const remaining = egg.remaining;
    sim.offline(s, 600, ctx(x, c.now + 600000, Rng.make(999), { offline: true }));
    assert.ok(Math.abs(egg.remaining - (remaining - 600 * (incubator ? 1 : 0.5))) < 1e-9);
    sim.offline(s, 4 * 3600, ctx(x, c.now + 4 * 3600000, Rng.make(1000), { offline: true }));
    const born = s.run.beasts.find(b => b.id === predetermined.id);
    assert.ok(born);
    for (const field of ['genes', 'parts', 'colors', 'traits', 'parents']) assert.deepStrictEqual(born[field], predetermined[field], field);
    valid(s);
  }
});

H.test('офлайн за 12 часов: формула и секундные шаги совпадают, монет нет', () => {
  for (const incubator of [0, 1]) {
    const { s, c } = fresh(42);
    s.run.upgrades.training = 1; s.run.upgrades.incubator = incubator;
    lay(s, c);
    const formula = Core.clone(s), stepped = Core.clone(s);
    sim.offline(formula, 43200, ctx(x, NOW + 43200000, Rng.make(7), { offline: true }));
    for (let sec = 1; sec <= 43200; sec++) sim.tick(stepped, 1, ctx(x, NOW + sec * 1000, Rng.make(7), { offline: true }));
    assert.ok(Big.eq(formula.run.coins, s.run.coins));
    assert.ok(Big.eq(stepped.run.coins, s.run.coins));
    assert.strictEqual(formula.run.beasts.length, stepped.run.beasts.length);
    let maxDiff = 0;
    for (const a of formula.run.beasts) {
      const b = stepped.run.beasts.find(v => v.id === a.id);
      assert.ok(b); assert.strictEqual(a.level, b.level);
      const relative = Math.abs(a.xp - b.xp) / Math.max(1, a.xp, b.xp);
      maxDiff = Math.max(maxDiff, relative);
      assert.ok(relative <= 0.01, 'опыт ' + a.id + ': ' + a.xp + ' / ' + b.xp);
      assert.deepStrictEqual(a.genes, b.genes);
      assert.strictEqual(a.fights, b.fights);
    }
    console.log('  Офлайн 12 ч, инкубатор ' + incubator + ': расхождение опыта ' + (maxDiff * 100).toFixed(6) + '%');
    valid(formula); valid(stepped);
  }
});

H.test('учебный бой детерминирован и не меняет монеты, опыт, выносливость', () => {
  const { s, c } = fresh(55);
  s.run.upgrades.arena = 1;
  s.run.beasts[0].sick = true;
  sim.setTeam(s, s.run.beasts.slice(0, 3).map(b => b.id), cfg);
  const before = JSON.stringify(s.run.beasts), coins = Big.str(Big.of(s.run.coins));
  const a = Core.clone(s), b = Core.clone(s);
  const ra = sim.fight(a, ctx(x, c.now, Rng.make(8)), true);
  const rb = sim.fight(b, ctx(x, c.now, Rng.make(8)), true);
  assert.ok(ra.ok, ra.reason); assert.ok(rb.ok, rb.reason);
  assert.strictEqual(JSON.stringify(ra.battle), JSON.stringify(rb.battle));
  assert.strictEqual(JSON.stringify(a.run.beasts), before);
  assert.strictEqual(Big.str(Big.of(a.run.coins)), coins);
});

H.test('два одинаковых сценария и сохранение дают тождественные данные', () => {
  function scenario() {
    const { s, c } = fresh(12345);
    sim.buy(s, 'feed', cfg); lay(s, c);
    sim.setTeam(s, s.run.beasts.slice(0, 3).map(b => b.id), cfg);
    sim.fight(s, c, false);
    c.now += 1200000; sim.tick(s, 1200, c);
    sim.fight(s, c, false);
    c.now += 43200000; c.offline = true; sim.offline(s, 43200, c);
    valid(s);
    return s;
  }
  const a = scenario(), b = scenario();
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  const picked = Core.pick([{ json: JSON.stringify(a), seq: 1, source: 'test' }], game, sim);
  assert.ok(picked.state, JSON.stringify(picked.broken));
  assert.deepStrictEqual(picked.state.run, JSON.parse(JSON.stringify(a.run)));
  valid(picked.state);
});

H.test('связки: ставка только монетами, сундук ровно один раз, нет дохода пассажира', () => {
  const { s, c } = fresh(21);
  assert.strictEqual(game.links.passenger.income, false);
  assert.strictEqual(game.links.bet.currency, 'coins');
  assert.deepStrictEqual(game.links.steps.spend.map(v => [v.id, v.cost]), [['walk', 1], ['rest', 1]]);
  const entries = [{ id: 'ticket-1', op: 'chest', from: 'passenger', at: NOW }];
  const before = Big.str(Big.of(s.run.coins));
  assert.ok(Core.applyInbox(s, game, sim, entries, c).changed);
  const saved = JSON.stringify(s);
  assert.ok(!Core.applyInbox(s, game, sim, entries, c).changed);
  assert.strictEqual(JSON.stringify(s), saved);
  assert.strictEqual(Big.str(Big.of(s.run.coins)), before);
  assert.ok(s.run.eggs.length === 1);
});

H.test('полный вольер не переполняется яйцом и ловчий ограничен сутками', () => {
  const { s, c } = fresh(14);
  s.run.upgrades.catcher = 1;
  assert.ok(sim.catchWild(s, c).ok);
  assert.ok(!sim.catchWild(s, c).ok);
  c.now += 86400000;
  assert.ok(sim.catchWild(s, c).ok);
  while (s.run.beasts.length < sim.capacity(s, cfg)) s.run.beasts.push(sim.newWild(s, c, false));
  assert.ok(!sim.breed(s, s.run.beasts[0].id, s.run.beasts[1].id, c).ok);
  assert.ok(!sim.catchWild(s, c).ok);
  assert.ok(s.run.beasts.length + s.run.eggs.length <= sim.capacity(s, cfg));
});

H.test('прогноз доступен по книге; вероятности частей нормированы, родословная хранит родителей', () => {
  const { s, c } = fresh(17);
  const a = s.run.beasts[0], b = s.run.beasts[1];
  assert.strictEqual(sim.forecast(s, a, b, cfg), null);
  s.run.upgrades.book = 1;
  const forecast = sim.forecast(s, a, b, cfg);
  assert.strictEqual(forecast.ranges.length, 4);
  for (const range of forecast.ranges) assert.ok(range[0] >= 0 && range[0] <= range[1] && range[1] <= sim.cap(s, cfg));
  for (const chances of forecast.parts) assert.ok(Math.abs(Object.values(chances).reduce((sum, n) => sum + n, 0) - 1) < 1e-9);
  s.run.upgrades.selection = 100;
  assert.strictEqual(sim.sigma(s, cfg), 3);
  const egg = lay(s, c);
  sim.offline(s, 4 * 3600, ctx(x, NOW + 14400000, Rng.make(7), { offline: true }));
  const ancestry = sim.ancestry(s, egg.beast.id, 4);
  assert.strictEqual(ancestry.parents.length, 2);
  assert.deepStrictEqual(ancestry.parents.map(p => p.beast.id), [a.id, b.id]);
  sim.retire(s, a.id, c);
  assert.strictEqual(sim.ancestry(s, egg.beast.id, 4).parents[0].beast.id, a.id);
});

H.test('турнир: награды по формуле, 20 минут отдыха, 3 победы поднимают ступень', () => {
  const { s, c } = fresh(51);
  c.config = Object.assign({}, cfg, { 'fight.enemyGeneBase': 1, 'fight.enemySpread': 0, 'fight.enemyGeneStep': 0 });
  const initial = Big.of(s.run.coins);
  const first = sim.fight(s, c, false);
  assert.ok(first.ok && first.battle.win);
  assert.ok(Big.eq(first.battle.coins, 10));
  assert.ok(Big.eq(s.run.coins, Big.add(initial, 10)));
  for (const beast of s.run.beasts.slice(0, 3)) {
    assert.strictEqual(beast.xp, 30);
    assert.strictEqual(beast.readyAt - c.now, 1200000);
    assert.strictEqual(beast.fights, 1);
  }
  assert.ok(!sim.fight(s, c, false).ok);
  for (let index = 0; index < 2; index++) {
    c.now += 1200000;
    assert.ok(sim.fight(s, c, false).battle.win);
  }
  assert.strictEqual(s.run.step, 1);
  assert.strictEqual(s.run.streak, 0);
  assert.strictEqual(JSON.stringify(sim.replay(s, c.config)), JSON.stringify(s.run.lastBattle.result));
});

H.test('обязательная отставка после 40 боёв, тренер 50, долгожитель 60', () => {
  for (const [coach, traits, maximum] of [[0, [], 40], [1, [], 50], [0, ['longlife'], 60]]) {
    const { s, c } = fresh(61);
    const beast = s.run.beasts[0];
    s.run.upgrades.coach = coach; beast.traits = traits; beast.fights = maximum - 1;
    assert.strictEqual(sim.retirementLimit(beast, s, cfg), maximum);
    sim.setTeam(s, [beast.id], cfg);
    assert.ok(sim.fight(s, c, false).ok);
    assert.ok(!s.run.beasts.some(b => b.id === beast.id));
    assert.ok(s.meta.genePool > 0);
    assert.ok(s.meta.retired.includes(beast.id));
  }
});

H.test('события: гость за три касания, цирк платит втрое, сильный помёт гарантирует прорыв', () => {
  const { s, c } = fresh(71);
  sim.triggerEvent(s, c, 'guest');
  const guest = s.run.event.beast.id;
  for (let tap = 0; tap < 2; tap++) {
    assert.ok(sim.eventAction(s, 'tame', null, c).ok);
    assert.ok(!s.run.beasts.some(b => b.id === guest));
  }
  assert.ok(sim.eventAction(s, 'tame', null, c).ok);
  assert.ok(s.run.beasts.some(b => b.id === guest));
  assert.strictEqual(s.run.event, null);
  sim.triggerEvent(s, c, 'circus');
  const before = Big.of(s.run.coins), value = average(s.run.beasts.find(b => b.id === guest));
  assert.ok(sim.eventAction(s, 'sell', guest, c).ok);
  assert.ok(Big.eq(s.run.coins, Big.add(before, value * 3)));
  assert.strictEqual(s.meta.genePool, 0);
  sim.triggerEvent(s, c, 'strong');
  assert.ok(lay(s, c).beast.breakthrough);
  assert.strictEqual(s.run.strongNext, false);
});

H.test('события: ярмарка удваивает монеты, хворь пропускает бой, ветеринар лечит', () => {
  const { s, c } = fresh(81);
  c.config = Object.assign({}, cfg, { 'fight.enemyGeneBase': 1, 'fight.enemySpread': 0 });
  sim.triggerEvent(s, c, 'fair');
  assert.strictEqual(s.run.fairUntil - c.now, 1800000);
  assert.ok(Big.eq(sim.fight(s, c, false).battle.coins, 20));
  c.now += 1200000;
  sim.triggerEvent(s, c, 'illness');
  const sickId = s.run.event.beastId;
  sim.setTeam(s, [sickId], cfg);
  assert.ok(!sim.fight(s, c, false).ok);
  assert.strictEqual(s.run.beasts.find(b => b.id === sickId).sick, false);
  s.run.coins = '1e10'; assert.ok(sim.buy(s, 'vet', cfg));
  sim.triggerEvent(s, c, 'illness');
  assert.ok(s.run.beasts.every(b => !b.sick));
});

H.test('шаги: +30 опыта всей выбранной команде, снятие отдыха у одного', () => {
  const { s, c } = fresh(91);
  sim.setTeam(s, s.run.beasts.slice(0, 3).map(b => b.id), cfg);
  assert.ok(sim.walk(s, c).ok);
  assert.deepStrictEqual(s.run.beasts.map(b => b.xp), [30, 30, 30, 0]);
  lay(s, c);
  const a = s.run.beasts[0], b = s.run.beasts[1];
  assert.ok(sim.rest(s, a.id, c).ok);
  assert.strictEqual(a.restUntil, c.now);
  assert.ok(b.restUntil > c.now);
  assert.ok(!sim.rest(s, a.id, c).ok);
});

H.test('заполненный вольер удерживает готовое дикое яйцо до освобождения места', () => {
  const { s, c } = fresh(101);
  while (s.run.beasts.length < sim.capacity(s, cfg)) s.run.beasts.push(sim.newWild(s, c, false));
  sim.chest(s, c.rng, cfg);
  const child = s.run.eggs[0].beast;
  sim.offline(s, 43200, ctx(x, NOW + 43200000, Rng.make(7), { offline: true }));
  assert.strictEqual(s.run.beasts.length, 8);
  assert.strictEqual(s.run.eggs.length, 1);
  assert.strictEqual(s.run.eggs[0].remaining, 0);
  assert.ok(sim.retire(s, s.run.beasts[0].id, c).ok);
  sim.tick(s, 1, ctx(x, NOW + 43201000, Rng.make(7)));
  assert.strictEqual(s.run.beasts.length, 8);
  assert.ok(s.run.beasts.some(b => b.id === child.id));
  assert.strictEqual(s.run.eggs.length, 0);
  valid(s);
});

H.test('повреждённые сохранения: пропавшие числа, чужой аллель и неверная лига отвергаются', () => {
  const mutations = [
    s => { delete s.run.beasts[0].level; },
    s => { s.run.beasts[0].parts[0].a = null; },
    s => { s.run.beasts[0].colors[0] = null; },
    s => { s.run.beasts[0].parts[0].a = 14; },
    s => { s.run.beasts[0].traits = ['unknown']; },
    s => { s.run.league = 6; },
    s => { s.run.beasts[0].genes[0] = NaN; }
  ];
  for (const mutate of mutations) {
    const { s } = fresh(); mutate(s);
    assert.notStrictEqual(sim.validate(s), null, mutate.toString());
  }
});

H.test('неиспользованный запасной не получает опыт, расход боёв или выносливости', () => {
  const { s, c } = fresh(111);
  s.run.upgrades.bench = 1;
  c.config = Object.assign({}, cfg, { 'fight.enemyGeneBase': 1, 'fight.enemySpread': 0 });
  for (const beast of s.run.beasts.slice(0, 3)) beast.genes = [60, 60, 60, 60];
  const reserve = s.run.beasts[3]; reserve.fights = 39;
  sim.setTeam(s, s.run.beasts.map(b => b.id), cfg);
  const saved = JSON.stringify(reserve);
  const result = sim.fight(s, c, false);
  assert.ok(result.ok && result.battle.win);
  assert.strictEqual(JSON.stringify(s.run.beasts.find(b => b.id === reserve.id)), saved);
  assert.ok(!s.meta.retired.includes(reserve.id));
});

H.test('прогноз при высоком наследии обрезает обе границы по cap', () => {
  const { s } = fresh(121);
  s.run.upgrades.book = 1; s.run.upgrades.selection = 6; s.meta.genePool = 1000;
  const ceiling = sim.cap(s, cfg);
  const a = s.run.beasts[0], b = s.run.beasts[1];
  a.genes = [ceiling, ceiling, ceiling, ceiling]; b.genes = a.genes.slice();
  const forecast = sim.forecast(s, a, b, cfg);
  for (const range of forecast.ranges) assert.ok(range[0] <= range[1] && range[0] >= 0 && range[1] <= ceiling, JSON.stringify(range));
});

H.done('menagerie: правила и экономика');
