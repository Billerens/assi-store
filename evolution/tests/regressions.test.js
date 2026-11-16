'use strict';
const assert = require('assert');
const { H, open, ctx, fresh, relative } = require('./env');
const { x } = open();
const { sim, cfg, Core, Big, Rng } = x;
const NOW = 1000000;
function stage(number) {
  const state = fresh(x, 81);
  sim.enterStage(state, ctx(x, NOW, Rng.make(81)), number);
  return state;
}

H.test('48 hours away credit twelve hours of generations, not all expired deadlines', () => {
  const state = stage(3);
  state.lastTick = NOW;
  const plan = Core.plan(NOW, NOW + 48 * 3600000, cfg, sim.capBonusHours(state));
  Core.runOffline(sim, state, x.game, plan, null, (segment) => ctx(x, segment.to, Rng.make(81)), cfg);
  assert.strictEqual(plan.creditedMs, 12 * 3600000);
  assert.strictEqual(state.run.generation, 12 * 3600 / cfg['mutation.generationSec']);
  assert.strictEqual(state.run.pendingMutations.length, 3);
  assert.strictEqual(state.run.stage, 3);
});

H.test('offline summary uses the model chronicle of the stage, built-in card otherwise', () => {
  const state = stage(2);
  const builtin = x.sim.data().chronicle.find((c) => c.stage === 2).text;
  let lines = sim.offline(state, 600, ctx(x, NOW + 600000, Rng.make(81), { offline: true })).events;
  assert.ok(lines.includes(builtin), 'built-in card missing');
  assert.ok(sim.registerStock(state, 'chronicle', { stage: 5, text: 'Летопись другого этапа.' }));
  assert.ok(sim.registerStock(state, 'chronicle', { stage: 2, text: 'Летопись модели о клетках.' }));
  assert.ok(!sim.registerStock(state, 'chronicle', { stage: 2.5, text: 'Дробный этап.' }));
  lines = sim.offline(state, 600, ctx(x, NOW + 1200000, Rng.make(81), { offline: true })).events;
  assert.ok(lines.includes('Летопись модели о клетках.'), JSON.stringify(lines));
  assert.ok(!lines.includes(builtin) && !lines.includes('Летопись другого этапа.'));
});

H.test('common mutations carry their own multipliers within x1.1-x1.3', () => {
  const commons = x.sim.data().mutations.filter((m) => m.rarity === 'common');
  assert.strictEqual(commons.length, 20);
  const values = commons.map((m) => cfg['mutation.' + m.id + '.mult']);
  for (const v of values) assert.ok(v >= 1.1 && v <= 1.3, String(v));
  assert.ok(new Set(values).size >= 3, 'multipliers are not spread');
});

H.test('selecting a rare mutation refreshes duplicate offers already queued', () => {
  const state = stage(3);
  state.run.pendingMutations = [['skeleton', 'flagellum', 'fin'], ['skeleton', 'gills', 'lungs']];
  assert.ok(sim.chooseMutation(state, ctx(x, NOW), 'skeleton'));
  assert.strictEqual(state.run.mutations.skeleton, 1);
  assert.strictEqual(state.run.pendingMutations.length, 1);
  assert.ok(!state.run.pendingMutations[0].includes('skeleton'));
  assert.strictEqual(new Set(state.run.pendingMutations[0]).size, state.run.pendingMutations[0].length);
  assert.strictEqual(sim.validate(state), null);
});

H.test('overflowing or otherwise invalid role weights leave the distribution unchanged', () => {
  const state = stage(6);
  const before = JSON.stringify(state.run.roles);
  for (const weights of [[1e308, 1e308, 1e308, 1e308], [0, 0, 0, 0], [-1, 1, 1, 1], [NaN, 1, 1, 1], [1, 2]]) {
    assert.strictEqual(sim.setRoles(state, cfg, weights), false);
    assert.strictEqual(JSON.stringify(state.run.roles), before);
  }
});

H.test('invalid mutation queues are rejected and cannot trap automation in a loop', () => {
  for (const offer of [[], ['unknown-mutation'], ['flagellum', 'flagellum']]) {
    const state = stage(3);
    state.meta.laws['auto-mutation'] = 1;
    state.run.pendingMutations = [offer];
    assert.ok(sim.validate(state), 'invalid offer accepted');
    sim.tick(state, 1, ctx(x, NOW + 1000, Rng.make(81), { offline: true }));
    assert.strictEqual(state.run.stage, 3);
  }
});

H.test('predator capacity depends on fed herbivores even when shell preserves dormant surplus', () => {
  const state = stage(4);
  state.run.mutations.shell = 1;
  state.run.ocean = ['1000', '1000', '1000'];
  assert.ok(relative(x, sim.oceanLimit(state, cfg, 2), 40) < 1e-12);
  const before = sim.diversity(state, cfg);
  state.run.ocean[1] = '1e100';
  state.run.ocean[2] = '1e100';
  assert.ok(relative(x, sim.diversity(state, cfg), before) < 1e-12);
});

H.test('double-generation gives two mutation offers from the Steps leap', () => {
  const state = stage(3);
  state.run.mutations['double-generation'] = 1;
  assert.ok(sim.leap(state, ctx(x, NOW)));
  assert.strictEqual(state.run.generation, 1);
  assert.strictEqual(state.run.pendingMutations.length, 2);
  assert.ok(state.run.pendingMutations.every((offer) => !offer.includes('double-generation')));
});

H.test('city purchase costs scale with the current civilization epoch', () => {
  const state = stage(7);
  for (let index = 0; index < 4; index++) {
    state.run.epoch = 0;
    const bronze = sim.cost(state, cfg, index);
    state.run.epoch = 1;
    const iron = sim.cost(state, cfg, index);
    assert.ok(relative(x, iron, Big.mul(bronze, cfg['civ.epochGrowth'])) < 1e-12);
  }
});

H.test('generated mutations reject object-map reserved identifiers and unsafe markup', () => {
  const valid = { id: 'new-cilia', title: 'Новые реснички', text: 'Помогают колонии двигаться.', rarity: 'common', effect: 'producer', producer: 0 };
  assert.strictEqual(sim.validateStock('mutations', valid), null);
  for (const id of ['constructor', 'prototype']) assert.ok(sim.validateStock('mutations', Object.assign({}, valid, { id })));
  assert.ok(sim.validateStock('mutations', Object.assign({}, valid, { text: '<script>text</script>' })));
  const state = stage(3);
  assert.ok(sim.registerStock(state, 'mutations', valid));
  assert.strictEqual(sim.registerStock(state, 'mutations', valid), false);
  state.run.pendingMutations = [[valid.id]];
  assert.ok(sim.chooseMutation(state, ctx(x, NOW), valid.id));
  assert.strictEqual(state.run.mutations[valid.id], 1);
});

H.test('notifications cover mutation, ready stage and future colony deadlines while paused worlds stay silent', () => {
  const multi = stage(3);
  const generation = sim.next(multi, NOW, cfg).find((entry) => entry.id === 'mutation');
  assert.ok(generation);
  assert.strictEqual(generation.at, multi.run.nextGeneration);
  multi.run.pendingMutations = [['flagellum', 'fin', 'gills']];
  const pending = sim.next(multi, NOW, cfg).find((entry) => entry.id === 'mutation');
  assert.strictEqual(pending.at, NOW + 1000);
  multi.meta.laws['auto-mutation'] = 1;
  assert.ok(!sim.next(multi, NOW, cfg).some((entry) => entry.id === 'mutation'));
  const broth = stage(1);
  broth.run.resource = cfg['stage1.goal'];
  assert.ok(sim.next(broth, NOW, cfg).some((entry) => entry.id === 'stage-ready' && entry.at > NOW));
  const space = stage(8);
  space.run.colonies = [{ id: 'near', endsAt: NOW - 1000, done: false }, { id: 'remote', endsAt: NOW + 600000, done: false }, { id: 'garden', endsAt: NOW - 10000, done: true }];
  const colonies = sim.next(space, NOW, cfg).filter((entry) => entry.id === 'colony');
  assert.strictEqual(colonies.length, 2);
  assert.deepStrictEqual(colonies.map((entry) => entry.at), [NOW + 1000, NOW + 600000]);
  const declared = x.game.notify.map((entry) => entry.id);
  for (const entry of sim.next(space, NOW, cfg)) assert.ok(declared.includes(entry.id));
  space.run.universeChoices = ['gravity'];
  assert.deepStrictEqual(sim.next(space, NOW, cfg), []);
  space.run.universeChoices = [];
  space.run.finished = true;
  assert.deepStrictEqual(sim.next(space, NOW, cfg), []);
});
H.done('evolution: regressions');

