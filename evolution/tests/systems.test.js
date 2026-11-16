'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { H, GAME, open, ctx, fresh, relative, validTree } = require('./env');
const { x } = open();
const { sim, cfg, Big, Core, Rng } = x;
const NOW = 1000000;
const laws = JSON.parse(fs.readFileSync(path.join(GAME, 'content/laws.json'), 'utf8'));
const constants = JSON.parse(fs.readFileSync(path.join(GAME, 'content/constants.json'), 'utf8'));
const events = JSON.parse(fs.readFileSync(path.join(GAME, 'content/events.json'), 'utf8'));

function atStage(stage, constant) {
  const state = fresh(x, 23);
  if (constant) state.run.constant = constant;
  sim.enterStage(state, ctx(x, NOW, Rng.make(23)), stage);
  return state;
}
function equalBig(a, b, tolerance) { assert.ok(relative(x, a, b) <= (tolerance || 1e-9), Big.str(a) + ' != ' + Big.str(b)); }
function applyEvent(state, id, choice) {
  assert.ok(sim.triggerEvent(state, ctx(x, NOW, Rng.make(45)), id), 'trigger ' + id);
  assert.ok(sim.resolveEvent(state, ctx(x, NOW, Rng.make(45)), choice || 'accept'), 'resolve ' + id);
}
function configuredIncome(stage, constant) {
  const state = atStage(stage, constant);
  state.run.producers = state.run.producers.map(() => 1);
  if (stage === 5) {
    state.run.resource = Big.of('1e12');
    const index = state.run.hexes.findIndex((h, i) => sim.canColonize(state, cfg, i));
    if (index >= 0) sim.colonize(state, cfg, index);
  }
  if (stage === 8) state.run.worlds = 10;
  return sim.income(state, cfg);
}

H.test('every nature law is purchasable and one-time laws reject repeated purchases', () => {
  assert.strictEqual(laws.length, 16);
  for (const law of laws) {
    const state = atStage(4);
    state.layers.universe.currency = Big.of('1e6');
    const price = sim.lawCost(state, cfg, law.id);
    const currency = Big.of(state.layers.universe.currency);
    assert.ok(sim.buyLaw(state, cfg, law.id), law.id);
    assert.strictEqual(state.meta.laws[law.id], 1);
    equalBig(Big.sub(currency, state.layers.universe.currency), price);
    if (law.repeatable) {
      equalBig(sim.lawCost(state, cfg, law.id), Big.mul(price, 2));
      assert.ok(sim.buyLaw(state, cfg, law.id), law.id + ' level two');
      assert.strictEqual(state.meta.laws[law.id], 2);
    } else {
      const snapshot = JSON.stringify(state);
      assert.strictEqual(!!sim.buyLaw(state, cfg, law.id), false);
      assert.strictEqual(JSON.stringify(state), snapshot);
    }
  }
});

H.test('stage laws multiply output and offline law grows efficiency from half to full', () => {
  for (let stage = 1; stage <= 8; stage++) {
    const state = atStage(stage);
    state.run.producers = state.run.producers.map(() => 1);
    if (stage === 5) {
      state.run.resource = Big.of('1e10');
      sim.colonize(state, cfg, state.run.hexes.findIndex((h, i) => sim.canColonize(state, cfg, i)));
    }
    if (stage === 8) state.run.worlds = 10;
    const before = sim.income(state, cfg);
    state.meta.laws['stage' + stage] = 1;
    equalBig(sim.income(state, cfg), Big.mul(before, 2));
  }
  const half = atStage(1);
  half.run.producers = [1, 0, 0, 0];
  const full = Core.clone(half);
  full.meta.laws.offline = 5;
  const initial = Big.of(half.run.resource);
  sim.offline(half, 100, ctx(x, NOW + 100000, Rng.make(1), { offline: true }));
  sim.offline(full, 100, ctx(x, NOW + 100000, Rng.make(1), { offline: true }));
  equalBig(Big.sub(full.run.resource, initial), Big.mul(Big.sub(half.run.resource, initial), 2));
});

H.test('all four automation laws act without advancing the stage', () => {
  const broth = atStage(1);
  broth.meta.laws['auto-broth'] = 1;
  sim.tick(broth, 60, ctx(x, NOW + 60000, Rng.make(1)));
  assert.ok(sim.canAdvance(broth, cfg));
  assert.strictEqual(broth.run.stage, 1);
  const cell = atStage(2);
  cell.meta.laws['auto-cell'] = 1;
  cell.run.resource = Big.mul(sim.capacity(cell, cfg), 0.9);
  sim.tick(cell, 1, ctx(x, NOW + 1000, Rng.make(1)));
  assert.ok(cell.run.levels.mitosis + cell.run.levels.capacity > 0);
  assert.strictEqual(cell.run.stage, 2);
  const multi = atStage(3);
  multi.meta.laws['auto-mutation'] = 1;
  sim.setPriority(multi, ['shell', 'flagellum']);
  multi.run.pendingMutations = [['flagellum', 'fin', 'shell']];
  sim.tick(multi, 1, ctx(x, NOW + 1000, Rng.make(1), { offline: true }));
  assert.ok(multi.run.mutations.shell);
  assert.strictEqual(multi.run.pendingMutations.length, 0);
  assert.strictEqual(multi.run.stage, 3);
  const land = atStage(5);
  land.meta.laws['auto-land'] = 1;
  land.run.resource = Big.of('1e60');
  const owned = land.run.hexes.filter((h) => h.owned).length;
  sim.tick(land, 1, ctx(x, NOW + 1000, Rng.make(1), { offline: true }));
  assert.ok(land.run.hexes.filter((h) => h.owned).length > owned);
  assert.strictEqual(land.run.stage, 5);
});

H.test('four cards and radiation expand mutation offers; four universes expands the prestige offer', () => {
  for (const kind of ['law', 'radiation']) {
    const state = atStage(3, kind === 'radiation' ? 'radiation' : 'balanced');
    if (kind === 'law') state.meta.laws['four-cards'] = 1;
    sim.tick(state, 60, ctx(x, NOW + 60000, Rng.make(41)));
    assert.strictEqual(state.run.pendingMutations[0].length, 4, kind);
  }
  const state = atStage(4);
  state.meta.laws['four-universes'] = 1;
  state.run.maxima = ['1e6', '1e9', '1e10', '1', '1', '1', '1', '1'];
  assert.ok(Core.prestige(sim, x.game, state, 'universe', ctx(x, NOW, Rng.make(2))).ok);
  assert.strictEqual(state.run.universeChoices.length, 4);
  assert.strictEqual(new Set(state.run.universeChoices).size, 4);
});

H.test('prestige pays complexity squared and keeps laws, sparks, atlas, collection and one remembered gene', () => {
  const state = atStage(4);
  state.run.maxima = ['1e6', '1e9', '1e10', '1', '1', '1', '1', '1'];
  state.run.resource = Big.of(1);
  state.run.mutations = { shell: 1, flagellum: 3 };
  state.meta.collection = { shell: 1, flagellum: 3 };
  state.meta.laws = { memory: 1, stage1: 2 };
  assert.ok(sim.setMemory(state, 'shell'));
  state.layers.universe.currency = Big.of(13);
  equalBig(sim.complexity(state), 25);
  equalBig(sim.prestigeGain(state, 'universe', cfg), 6);
  const result = Core.prestige(sim, x.game, state, 'universe', ctx(x, NOW, Rng.make(60)));
  assert.ok(result.ok);
  equalBig(state.layers.universe.currency, 19);
  assert.strictEqual(state.run.stage, 1);
  assert.strictEqual(state.meta.laws.stage1, 2);
  assert.ok(state.meta.collection.shell && state.meta.collection.flagellum);
  assert.ok(state.run.mutations.shell);
  assert.ok(!state.run.mutations.flagellum);
  assert.ok(state.meta.universes >= 1);
  assert.strictEqual(state.run.universeChoices.length, 3);
  const chosen = state.run.universeChoices[0];
  assert.ok(sim.chooseUniverse(state, ctx(x, NOW), chosen));
  assert.strictEqual(state.run.constant, chosen);
  assert.strictEqual(state.run.universeChoices.length, 0);
  assert.ok(state.meta.atlas.length > 0);
});

H.test('all physical constants retain both their advantage and their drawback', () => {
  for (const constant of constants) {
    const state = atStage(1);
    state.run.universeChoices = [constant.id];
    assert.ok(sim.chooseUniverse(state, ctx(x, NOW), constant.id));
    assert.strictEqual(state.run.constant, constant.id);
  }
  equalBig(configuredIncome(8, 'gravity'), Big.mul(configuredIncome(8, 'balanced'), 2));
  equalBig(configuredIncome(5, 'gravity'), Big.mul(configuredIncome(5, 'balanced'), 0.7));
  equalBig(configuredIncome(7, 'light'), Big.mul(configuredIncome(7, 'balanced'), 0.8));
  const normalSpace = atStage(8);
  const lightSpace = atStage(8, 'light');
  sim.launch(normalSpace, ctx(x, NOW), 0);
  sim.launch(lightSpace, ctx(x, NOW), 0);
  equalBig(lightSpace.run.colonies[0].endsAt - NOW, (normalSpace.run.colonies[0].endsAt - NOW) * 0.5);
  equalBig(configuredIncome(4, 'ocean'), Big.mul(configuredIncome(4, 'balanced'), 3));
  assert.strictEqual(atStage(5, 'ocean').run.hexes.filter((h) => h.water).length, 12);
  equalBig(configuredIncome(2, 'radiation'), Big.mul(configuredIncome(2, 'balanced'), 0.7));
  equalBig(configuredIncome(2, 'cold'), Big.mul(configuredIncome(2, 'balanced'), 0.7));
  assert.strictEqual(sim.capBonusHours(atStage(1, 'cold')), 6);
  equalBig(configuredIncome(1, 'broth'), Big.mul(configuredIncome(1, 'balanced'), 5));
  equalBig(configuredIncome(3, 'broth'), Big.mul(configuredIncome(3, 'balanced'), 0.8));
  equalBig(configuredIncome(1, 'slow'), Big.mul(configuredIncome(1, 'balanced'), 0.5));
  const slow = atStage(4, 'slow');
  slow.run.maxima = ['1e6', '1e9', '1e10', '1', '1', '1', '1', '1'];
  slow.run.resource = Big.of(1);
  equalBig(sim.prestigeGain(slow, 'universe', cfg), 12);
  equalBig(sim.cost(atStage(1, 'chemistry'), cfg, 0), Big.mul(sim.cost(atStage(1), cfg, 0), 2));
  equalBig(configuredIncome(5, 'suns'), Big.mul(configuredIncome(5, 'balanced'), 2));
  const soft = atStage(4, 'moonless');
  soft.run.ocean = [Big.of(1000), Big.of(300), Big.of(90)];
  const hard = Core.clone(soft);
  hard.run.constant = 'balanced';
  assert.ok(Big.gt(sim.diversity(soft, cfg), sim.diversity(hard, cfg)));
  assert.strictEqual(!!sim.triggerEvent(soft, ctx(x, NOW), 'tide'), false);
  assert.strictEqual(atStage(5, 'compact').run.hexes.length, 25);
  equalBig(configuredIncome(5, 'compact'), Big.mul(configuredIncome(5, 'balanced'), 0.8));
  assert.strictEqual(atStage(8, 'ancient').run.worlds, 5);
});

H.test('all fifteen events resolve every offered choice into valid state', () => {
  assert.strictEqual(events.length, 15);
  for (const event of events) for (const choice of event.choices) {
    const state = atStage(event.stages[0]);
    state.run.producers = state.run.producers.map(() => 1);
    state.run.resource = Big.of('1e12');
    applyEvent(state, event.id, choice.id);
    validTree(state);
    assert.strictEqual(Core.validate(state, x.game), null, event.id + '/' + choice.id);
  }
});

H.test('event effects: lightning, meteor, ice, migration, wanderer, comet, plague, signal and fossil', () => {
  const broth = atStage(1);
  broth.run.producers = [1, 0, 0, 0];
  const initial = sim.income(broth, cfg);
  applyEvent(broth, 'lightning');
  const balance = Big.of(broth.run.resource);
  sim.tick(broth, 1, ctx(x, NOW + 1000, Rng.make(1)));
  equalBig(Big.sub(broth.run.resource, balance), Big.mul(initial, 5));
  const meteor = atStage(1);
  meteor.run.producers = [1, 0, 0, 0];
  const meteorBefore = sim.income(meteor, cfg);
  applyEvent(meteor, 'meteor', 'survive');
  equalBig(sim.income(meteor, cfg), Big.mul(meteorBefore, 2));
  const land = atStage(5);
  applyEvent(land, 'ice');
  const openHex = land.run.hexes.findIndex((h, i) => !h.owned && sim.canColonize(land, cfg, i));
  equalBig(sim.colonizeCost(land, cfg, openHex), 0);
  const count = land.run.hexes.filter((h) => h.owned).length;
  applyEvent(land, 'migration');
  assert.strictEqual(land.run.hexes.filter((h) => h.owned).length, count + 1);
  const civ = atStage(7);
  const cost = sim.discoveryCost(civ, cfg, 0);
  applyEvent(civ, 'wanderer');
  civ.run.resource = Big.of(10000);
  assert.ok(sim.discover(civ, cfg, 0));
  equalBig(Big.sub(10000, civ.run.resource), Big.mul(cost, 0.5));
  const tribe = atStage(6);
  const calm = Core.clone(tribe);
  applyEvent(tribe, 'comet');
  sim.tick(tribe, 1, ctx(x, NOW + 1000, Rng.make(1)));
  sim.tick(calm, 1, ctx(x, NOW + 1000, Rng.make(1)));
  equalBig(tribe.run.resource, Big.mul(calm.run.resource, 3));
  const people = tribe.run.people;
  applyEvent(tribe, 'plague', 'quarantine');
  equalBig(tribe.run.people, people * 0.8);
  const space = atStage(8);
  space.run.resource = Big.of('1e6');
  sim.launch(space, ctx(x, NOW), 2);
  const end = space.run.colonies[0].endsAt;
  applyEvent(space, 'signal');
  equalBig(space.run.colonies[0].endsAt, Math.max(NOW, end - 30 * 60000));
  const sparks = Big.of(tribe.layers.universe.currency);
  applyEvent(tribe, 'fossil');
  equalBig(tribe.layers.universe.currency, Big.add(sparks, 1));
  assert.ok(tribe.meta.atlas.length > 0);
});

H.test('Passenger capsule grants twenty minutes and a choice; Steps leap grants a generation or ten minutes', () => {
  const broth = atStage(1);
  broth.run.producers = [1, 0, 0, 0];
  const balance = Big.of(broth.run.resource);
  const income = sim.income(broth, cfg);
  const chest = sim.chest(broth, Rng.make(6), cfg);
  equalBig(Big.sub(broth.run.resource, balance), Big.mul(income, 1200));
  assert.ok(chest.items.length >= 2);
  assert.strictEqual(broth.run.pendingMutations.length, 1);
  const afterChest = Big.of(broth.run.resource);
  assert.ok(sim.leap(broth, ctx(x, NOW)));
  equalBig(Big.sub(broth.run.resource, afterChest), Big.mul(income, 600));
  const multi = atStage(3);
  const generation = multi.run.generation;
  assert.ok(sim.leap(multi, ctx(x, NOW)));
  assert.strictEqual(multi.run.generation, generation + 1);
  assert.strictEqual(multi.run.pendingMutations.length, 1);
});

H.done('evolution: systems');

