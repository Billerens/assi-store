'use strict';
const assert = require('assert');
const { H, open, ctx, fresh, relative, validTree } = require('./env');
const { x } = open();
const { sim, cfg, Core, Big, Rng } = x;
const NOW = 1000000;
function prepared(stage, constant) {
  const state = fresh(x, stage + 200);
  if (constant) state.run.constant = constant;
  sim.enterStage(state, ctx(x, NOW, Rng.make(stage + 200)), stage);
  sim.botPlay(state, ctx(x, NOW, Rng.make(stage + 200)));
  if (stage === 2) state.run.resource = Big.mul(sim.capacity(state, cfg), 0.25);
  if (stage === 8) {
    state.run.worlds = 2;
    state.run.resource = Big.of(100);
    sim.launch(state, ctx(x, NOW), 0);
  }
  state.lastTick = NOW;
  return state;
}

H.test('eight-hour engine offline grows each active stage without transitioning, with <= 3 pending choices', () => {
  const errors = [];
  for (let stage = 1; stage <= 8; stage++) {
    const initial = prepared(stage);
    const formula = Core.clone(initial);
    const stepped = Core.clone(initial);
    const stepSim = Object.assign({}, sim);
    delete stepSim.offline;
    const plan = Core.plan(NOW, NOW + 8 * 3600000, cfg, sim.capBonusHours(initial));
    const context = (segment) => ctx(x, segment.to, Rng.make(stage));
    const report = Core.runOffline(sim, formula, x.game, plan, null, context, cfg);
    Core.runOffline(stepSim, stepped, x.game, plan, null, context, cfg);
    assert.strictEqual(formula.run.stage, stage);
    assert.ok(Big.gt(formula.run.resource, initial.run.resource), 'no growth stage ' + stage);
    assert.ok(formula.run.pendingMutations.length <= 3);
    assert.strictEqual(formula.run.worlds, stepped.run.worlds);
    assert.strictEqual(formula.run.generation, stepped.run.generation);
    assert.deepStrictEqual(formula.run.pendingMutations, stepped.run.pendingMutations);
    const error = relative(x, formula.run.resource, stepped.run.resource);
    assert.ok(error <= (stage === 2 ? 0.001 : 0.01), 'stage ' + stage + ' offline error ' + error);
    assert.ok(report.events.some((line) => /Ресурс/.test(line)), 'offline report missing before/after');
    validTree(formula);
    assert.strictEqual(Core.validate(formula, x.game), null);
    assert.strictEqual(sim.validate(formula), null);
    errors.push(error);
  }
  console.log('  8 stages, 8 hours: maximum formula/30-second error ' + (Math.max(...errors) * 100).toFixed(8) + '%');
});

H.test('offline has a twelve-hour cap, cold universe eighteen hours, and cold income x1.5', () => {
  const regular = prepared(1);
  const cold = Core.clone(regular);
  cold.run.constant = 'cold';
  const regularPlan = Core.plan(NOW, NOW + 48 * 3600000, cfg, sim.capBonusHours(regular));
  const coldPlan = Core.plan(NOW, NOW + 48 * 3600000, cfg, sim.capBonusHours(cold));
  assert.strictEqual(regularPlan.creditedMs, 12 * 3600000);
  assert.strictEqual(coldPlan.creditedMs, 18 * 3600000);
  const before = Big.of(regular.run.resource);
  sim.offline(regular, 60, ctx(x, NOW + 60000, Rng.make(1), { offline: true }));
  sim.offline(cold, 60, ctx(x, NOW + 60000, Rng.make(1), { offline: true }));
  assert.ok(relative(x, Big.sub(cold.run.resource, before), Big.mul(Big.sub(regular.run.resource, before), 1.5)) < 1e-9);
});

H.test('colony deadlines use real time even at half offline income and birth order is preserved', () => {
  const state = prepared(8);
  state.run.colonies = [];
  state.run.worlds = 0;
  state.run.resource = Big.of(1000);
  assert.ok(sim.launch(state, ctx(x, NOW), 0));
  const deadline = state.run.colonies[0].endsAt;
  const oneSecondBefore = Core.clone(state);
  sim.offline(oneSecondBefore, (deadline - NOW) / 1000 - 1, ctx(x, deadline - 1000, Rng.make(2), { offline: true }));
  assert.strictEqual(oneSecondBefore.run.worlds, 0);
  sim.tick(oneSecondBefore, 1, ctx(x, deadline, Rng.make(2), { offline: true }));
  assert.strictEqual(oneSecondBefore.run.worlds, 1);
  assert.strictEqual(oneSecondBefore.run.colonies[0].done, true);
  const once = Big.of(oneSecondBefore.run.resource);
  sim.tick(oneSecondBefore, 1, ctx(x, deadline + 1000, Rng.make(2), { offline: true }));
  assert.strictEqual(oneSecondBefore.run.worlds, 1);
  assert.ok(Big.gt(oneSecondBefore.run.resource, once));
});

H.test('late-stage large currencies survive purchases, offline progress and JSON round-trips without NaN', () => {
  for (const stage of [1, 3, 4, 5, 6, 7, 8]) {
    const state = prepared(stage);
    state.run.resource = Big.of('9.5e250');
    if ([1, 3, 7].includes(stage)) state.run.producers = state.run.producers.map(() => 200);
    if (stage === 3) state.run.mutations['nerve-net'] = 150;
    if (stage === 4) state.run.ocean = ['1e200', '2e199', '4e198'];
    if (stage === 6) state.run.tools = Big.of('1e100');
    sim.botPlay(state, ctx(x, NOW, Rng.make(60)));
    sim.offline(state, 120, ctx(x, NOW + 120000, Rng.make(60), { offline: true }));
    validTree(state);
    assert.strictEqual(Core.validate(state, x.game), null);
    const restored = Core.pick([{ json: JSON.stringify(state), seq: state.seq, source: 'test' }], x.game, sim);
    assert.ok(restored.state, 'roundtrip stage ' + stage + ': ' + JSON.stringify(restored.broken));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(restored.state.run)), JSON.parse(JSON.stringify(state.run)));
  }
});

H.test('links inbox uses bettable Sparks and applies passenger capsules exactly once', () => {
  const state = prepared(3);
  state.layers.universe.currency = Big.of(10);
  const chest = { id: 'trip-capsule-test', at: NOW, from: 'passenger', op: 'chest' };
  const entries = [chest, { id: 'bet-win-test', at: NOW + 1, from: 'bet', op: 'add', currency: 'sparks', amount: 20 }];
  const first = Core.applyInbox(state, x.game, sim, entries, ctx(x, NOW, Rng.make(7)));
  assert.strictEqual(first.applied.length, 2);
  assert.ok(Big.eq(state.layers.universe.currency, 30));
  assert.strictEqual(state.run.pendingMutations.length, 1);
  const snapshot = JSON.stringify(state);
  const duplicate = Core.applyInbox(state, x.game, sim, entries, ctx(x, NOW, Rng.make(7)));
  assert.strictEqual(duplicate.applied.length, 0);
  assert.strictEqual(JSON.stringify(state), snapshot);
  assert.strictEqual(x.game.links.bet.currency, 'sparks');
  assert.ok(x.game.currencies.find((c) => c.id === 'sparks').bettable);
  assert.deepStrictEqual(x.game.links.steps.spend.map((s) => s.id), ['double-offline', 'leap']);
});

H.done('evolution: offline and engine integration');
