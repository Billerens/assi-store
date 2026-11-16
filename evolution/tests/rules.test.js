'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { H, GAME, open, ctx, fresh, relative, validTree } = require('./env');
const { x } = open();
const { sim, Big, Core, cfg, Rng } = x;
const NOW = 1000000;
const world = JSON.parse(fs.readFileSync(path.join(GAME, 'content/world.json'), 'utf8'));
const mutations = JSON.parse(fs.readFileSync(path.join(GAME, 'content/mutations.json'), 'utf8'));
const constants = JSON.parse(fs.readFileSync(path.join(GAME, 'content/constants.json'), 'utf8'));

function atStage(stage, constant) {
  const state = fresh(x, 17);
  if (constant) state.run.constant = constant;
  sim.enterStage(state, ctx(x, NOW, Rng.make(17)), stage);
  return state;
}
function approximately(actual, expected, tolerance) {
  assert.ok(relative(x, actual, expected) <= (tolerance || 1e-9), Big.str(actual) + ' differs from ' + Big.str(expected));
}
function step(state, seconds, extras) {
  sim.tick(state, seconds, ctx(x, NOW + seconds * 1000, Rng.make(77), Object.assign({ offline: true }, extras || {})));
}

H.test('complete original content: eight stages, thirty mutations, twelve constants, nine epochs', () => {
  assert.strictEqual(world.stages.length, 8);
  assert.strictEqual(mutations.length, 30);
  assert.strictEqual(new Set(mutations.map((m) => m.id)).size, 30);
  assert.strictEqual(constants.length, 12);
  assert.strictEqual(new Set(constants.map((c) => c.id)).size, 12);
  assert.strictEqual(world.biomes.length, 6);
  assert.strictEqual(world.epochs.filter((e) => !e.extra).length, 7);
  assert.strictEqual(world.epochs.filter((e) => e.extra).length, 2);
  for (const epoch of world.epochs) assert.strictEqual(epoch.discoveries.length, 4);
});

H.test('producer prices follow the specified geometric curve and spending is atomic', () => {
  const state = atStage(1);
  state.run.resource = Big.of('1e6');
  for (let index = 0; index < 4; index++) {
    const before = sim.cost(state, cfg, index);
    const resource = Big.of(state.run.resource);
    assert.ok(sim.buy(state, cfg, index));
    approximately(Big.sub(resource, state.run.resource), before, 0.002);
    approximately(sim.cost(state, cfg, index), Big.mul(before, 1.12));
  }
  state.run.resource = Big.of(0);
  const snapshot = JSON.stringify(state);
  assert.strictEqual(!!sim.buy(state, cfg, 3), false);
  assert.strictEqual(JSON.stringify(state), snapshot);
});

H.test('stage changes require an explicit action and carry logarithmic legacy', () => {
  const state = atStage(1);
  state.run.resource = Big.of('1e9');
  step(state, 10);
  assert.strictEqual(state.run.stage, 1);
  assert.ok(sim.canAdvance(state, cfg));
  assert.ok(sim.advance(state, ctx(x, NOW + 10000)));
  assert.strictEqual(state.run.stage, 2);
  approximately(state.run.legacy, 1.9);
  assert.ok(Big.gte(state.run.maxima[0], '1e9'));
  assert.ok(Big.lt(state.run.resource, '1e9'));
});

H.test('cell logistic growth is maximal at half capacity and exact offline agrees within 0.1%', () => {
  const middle = atStage(2);
  const capacity = sim.capacity(middle, cfg);
  middle.run.resource = Big.mul(capacity, 0.5);
  const low = Core.clone(middle);
  low.run.resource = Big.mul(capacity, 0.25);
  const high = Core.clone(middle);
  high.run.resource = Big.mul(capacity, 0.75);
  assert.ok(Big.gt(sim.income(middle, cfg), sim.income(low, cfg)));
  approximately(sim.income(low, cfg), sim.income(high, cfg));
  const exact = Core.clone(low);
  const steps = Core.clone(low);
  sim.offline(exact, 120, ctx(x, NOW + 120000, Rng.make(25), { offline: true }));
  for (let i = 1; i <= 1200; i++) sim.tick(steps, 0.1, ctx(x, NOW + i * 100, Rng.make(25), { offline: true }));
  const error = relative(x, exact.run.resource, steps.run.resource);
  assert.ok(error <= 0.001, 'logistic relative error ' + error);
  assert.ok(Big.lte(exact.run.resource, capacity));
  console.log('  logistic offline/0.1-second steps: ' + (error * 100).toFixed(8) + '%');
});

H.test('surplus ocean predators cost biomass but never increase diversity', () => {
  const state = atStage(4);
  state.run.ocean = [Big.of(1000), Big.of(200), Big.of(40)];
  state.run.resource = Big.of('1e12');
  const before = sim.diversity(state, cfg);
  const balance = Big.of(state.run.resource);
  assert.ok(sim.buy(state, cfg, 2));
  assert.ok(Big.lt(state.run.resource, balance));
  approximately(sim.diversity(state, cfg), before);
  assert.ok(Big.lte(state.run.ocean[2], Big.mul(state.run.ocean[1], 0.2)));
  state.run.mutations.shell = 1;
  const protectedBefore = sim.diversity(state, cfg);
  assert.ok(sim.buy(state, cfg, 2));
  approximately(sim.diversity(state, cfg), protectedBefore);
});

H.test('all mutations can be selected and remain valid, ordinary and rare choices raise income', () => {
  for (const mutation of mutations) {
    const state = atStage(3);
    state.run.producers = [1, 1, 1, 1, 1];
    state.run.pendingMutations = [[mutation.id]];
    const before = sim.income(state, cfg);
    assert.ok(sim.chooseMutation(state, ctx(x, NOW), mutation.id), mutation.id);
    assert.ok(state.run.mutations[mutation.id]);
    assert.strictEqual(state.run.pendingMutations.length, 0);
    assert.ok(state.meta.collection[mutation.id] >= 1, mutation.id + ' absent from collection');
    if (mutation.rarity !== 'special') assert.ok(Big.gt(sim.income(state, cfg), before), mutation.id + ' gives no benefit');
    validTree(state);
  }
});

H.test('offline mutation queue caps at three and never silently chooses a mutation', () => {
  const state = atStage(3);
  sim.offline(state, 8 * 3600, ctx(x, NOW + 8 * 3600000, Rng.make(50), { offline: true }));
  assert.strictEqual(state.run.pendingMutations.length, 3);
  assert.strictEqual(Object.keys(state.run.mutations).length, 0);
  assert.ok(state.run.generation >= 3);
  for (const choices of state.run.pendingMutations) {
    assert.strictEqual(choices.length, 3);
    assert.strictEqual(new Set(choices).size, choices.length);
  }
});

H.test('land map is radius three with 37 unique connected hexes and geometric costs', () => {
  const state = atStage(5);
  assert.strictEqual(state.run.hexes.length, 37);
  assert.strictEqual(new Set(state.run.hexes.map((h) => h.q + ',' + h.r)).size, 37);
  for (const h of state.run.hexes) assert.ok(Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r)) <= 3);
  state.run.resource = Big.of('1e60');
  for (let count = 0; count < 37; count++) {
    const eligible = state.run.hexes.findIndex((h, i) => !h.owned && sim.canColonize(state, cfg, i));
    if (eligible < 0) break;
    const before = sim.colonizeCost(state, cfg, eligible);
    assert.ok(sim.colonize(state, cfg, eligible));
    const next = state.run.hexes.findIndex((h, i) => !h.owned && sim.canColonize(state, cfg, i));
    if (next >= 0) approximately(sim.colonizeCost(state, cfg, next), Big.mul(before, 3));
  }
  assert.strictEqual(state.run.hexes.filter((h) => h.owned).length, 37);
  assert.ok(sim.canAdvance(state, cfg));
});

H.test('roles normalize and food grows population while tools improve knowledge', () => {
  const state = atStage(6);
  assert.ok(sim.setRoles(state, cfg, [3, 1, 1, 5]));
  approximately(state.run.roles.reduce((a, b) => a + b, 0), 1);
  const people = state.run.people;
  sim.offline(state, 600, ctx(x, NOW + 600000, Rng.make(6), { offline: true }));
  assert.ok(state.run.people > people);
  assert.ok(Big.gt(state.run.tools, 0));
  assert.ok(Big.gt(state.run.resource, 0));
  const before = sim.income(state, cfg);
  state.run.tools = Big.add(state.run.tools, 1000);
  assert.ok(Big.gt(sim.income(state, cfg), before));
  validTree(state);
});

H.test('every civilization epoch requires four discoveries; ancient stars require two extra epochs', () => {
  for (const constant of ['balanced', 'ancient']) {
    const state = atStage(7, constant);
    const epochs = constant === 'ancient' ? 9 : 7;
    for (let epoch = 0; epoch < epochs; epoch++) {
      for (let discovery = 0; discovery < 4; discovery++) {
        state.run.resource = Big.of('1e80');
        assert.ok(sim.discover(state, cfg, discovery), constant + ':' + epoch + ':' + discovery);
        if (discovery < 3) assert.strictEqual(state.run.epoch, epoch);
      }
    }
    assert.ok(sim.canAdvance(state, cfg));
    assert.ok(sim.advance(state, ctx(x, NOW)));
    assert.strictEqual(state.run.stage, 8);
    assert.strictEqual(state.run.worlds, constant === 'ancient' ? 5 : 0);
  }
});

H.test('all displayed planets launch with finite real-time timers and finish the universe at 50 worlds', () => {
  for (let index = 0; index < world.planets.length; index++) {
    const state = atStage(8);
    state.run.resource = Big.of('1e50');
    assert.ok(sim.launch(state, ctx(x, NOW), index), 'planet ' + index);
    const colony = state.run.colonies[0];
    assert.ok(Number.isFinite(colony.endsAt));
    assert.ok(colony.endsAt > NOW && colony.endsAt <= NOW + 8 * 3600000);
    const finish = colony.endsAt;
    sim.tick(state, (finish - NOW) / 1000, ctx(x, finish, Rng.make(8), { offline: true }));
    assert.ok(state.run.worlds >= 1, 'planet ' + index + ' not complete at real-time deadline');
  }
  const state = atStage(8);
  state.run.worlds = 49;
  state.run.resource = Big.of('1e50');
  assert.ok(sim.launch(state, ctx(x, NOW), 0));
  const finish = state.run.colonies.find((c) => !c.done).endsAt;
  sim.offline(state, (finish - NOW) / 1000, ctx(x, finish, Rng.make(80), { offline: true }));
  assert.ok(state.run.worlds >= 50);
  assert.ok(sim.canAdvance(state, cfg));
  assert.ok(sim.advance(state, ctx(x, finish)));
  assert.ok(state.run.finished);
  validTree(state);
});

H.test('invalid purchases cannot spend even balances above the old price sentinel', () => {
  for (const stage of [1, 2, 3, 4, 5, 6, 7, 8]) for (const index of [-1, 100, 0.5, NaN]) {
    const state = atStage(stage);
    state.run.resource = Big.of('1e400');
    const snapshot = JSON.stringify(state);
    assert.strictEqual(!!sim.buy(state, cfg, index), false, 'stage ' + stage + ' index ' + index);
    assert.strictEqual(JSON.stringify(state), snapshot, 'invalid purchase mutated state');
  }
});

H.test('water hexes have a real drawback while all 37 cells remain colonizable', () => {
  const normal = atStage(5);
  const index = normal.run.hexes.findIndex((h) => h.q === 0 && h.r === 0);
  normal.run.resource = Big.of('1e12');
  const water = Core.clone(normal);
  water.run.hexes[index].water = true;
  approximately(sim.colonizeCost(water, cfg, index), Big.mul(sim.colonizeCost(normal, cfg, index), 3));
  assert.ok(sim.colonize(normal, cfg, index));
  assert.ok(sim.colonize(water, cfg, index));
  approximately(sim.income(water, cfg), Big.mul(sim.income(normal, cfg), 0.5));
  const flooded = atStage(5, 'ocean');
  flooded.run.resource = Big.of('1e60');
  for (let count = 0; count < 37; count++) {
    const available = flooded.run.hexes.findIndex((h, i) => sim.canColonize(flooded, cfg, i));
    assert.ok(available >= 0);
    assert.ok(sim.colonize(flooded, cfg, available));
  }
  assert.strictEqual(flooded.run.hexes.filter((h) => h.owned && h.water).length, 12);
  assert.ok(sim.canAdvance(flooded, cfg));
});

H.test('neighbor biome pairs multiply both colonies by one and a half', () => {
  const state = atStage(5);
  state.run.resource = Big.of('1e12');
  const center = state.run.hexes.findIndex((h) => h.q === 0 && h.r === 0);
  const neighbor = state.run.hexes.findIndex((h) => h.q === 1 && h.r === 0);
  state.run.hexes[center].biome = 'forest';
  state.run.hexes[neighbor].biome = 'swamp';
  assert.ok(sim.colonize(state, cfg, center));
  assert.ok(sim.colonize(state, cfg, neighbor));
  const raw = Big.add(state.run.hexes[center].output, state.run.hexes[neighbor].output);
  approximately(sim.income(state, cfg), Big.mul(raw, 1.5));
});
H.test('first universe offers three unique constants and time starts only after a valid choice', () => {
  const state = Core.newState(x.game, sim, ctx(x, NOW, Rng.make(10)));
  assert.strictEqual(state.run.universeChoices.length, 3);
  assert.strictEqual(new Set(state.run.universeChoices).size, 3);
  for (const id of state.run.universeChoices) assert.ok(constants.some((c) => c.id === id));
  const before = JSON.stringify(state.run);
  sim.tick(state, 100, ctx(x, NOW + 100000, Rng.make(10)));
  assert.strictEqual(JSON.stringify(state.run), before);
  assert.strictEqual(!!sim.chooseUniverse(state, ctx(x, NOW), 'unlisted-constant'), false);
  const chosen = state.run.universeChoices[0];
  assert.ok(sim.chooseUniverse(state, ctx(x, NOW), chosen));
  assert.strictEqual(state.run.constant, chosen);
  assert.strictEqual(state.run.universeChoices.length, 0);
});

H.test('all twelve initial constants permit the first purchase without a softlock', () => {
  for (const constant of constants) {
    const state = Core.newState(x.game, sim, ctx(x, NOW, Rng.make(10)));
    state.run.universeChoices = [constant.id];
    assert.ok(sim.chooseUniverse(state, ctx(x, NOW), constant.id));
    let bought = 0;
    for (let second = 0; second <= 10 && !bought; second++) {
      bought += sim.botPlay(state, ctx(x, NOW + second * 1000, Rng.make(10)));
      sim.tick(state, 1, ctx(x, NOW + (second + 1) * 1000, Rng.make(10)));
    }
    assert.ok(bought > 0, constant.id + ' cannot buy the first producer');
  }
});
H.done('evolution: rules');



