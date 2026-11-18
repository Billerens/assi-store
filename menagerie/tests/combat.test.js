'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');
const { test, done, engine } = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));
const Rng = engine('rng.js');
const Core = engine('core.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'combat.js'), 'utf8');
const moduleScope = { exports: {}, require: name => {
  assert.equal(name, '../engine/rng.js');
  return Rng;
} };
new Function('exports', 'require', source)(moduleScope.exports, moduleScope.require);
const Combat = moduleScope.exports;
function creature(id, species, genes) {
  const parts = [2, 2, 2, 2, 0].map(visible => ({ a: visible, b: visible, visible }));
  if (species !== undefined && species !== null) {
    const ability = Combat.SPECIES[species];
    parts[ability.part] = { a: species, b: species, visible: species };
  }
  return { id, name: id, level: 5, genes: genes || [40, 40, 40, 40], parts, traits: [] };
}
function fight(a, b, seed, cfg, options) { return Combat.fight(a, b, seed === undefined ? 100 : seed, cfg || {}, options || {}); }
function json(x) { return JSON.parse(JSON.stringify(x)); }

test('shared combat passes strict ES5 subset and offline scan', () => {
  assert.deepEqual(Core.lint(source, true), []);
  assert.deepEqual(Core.offlineScan([{ path: 'combat.js', text: source }]), []);
});
test('quality, HP, damage formulas and descending agility are exact', () => {
  const a = creature('a', null, [40, 41, 40, 0]);
  const b = creature('b', null, [40, 40, 40, 0]);
  assert.deepEqual(json(Combat.stats(a)), { force: 50, agility: 51.25, stamina: 50, sense: 0, hp: 180 });
  const result = fight([a], [b]);
  assert.equal(result.log[0].actor, 'a');
  assert.equal(result.log[0].damage, 25);
  assert.equal(result.log[0].hp, 155);
  assert.equal(result.win, true);
});
test('only strong visible parts grant abilities, at most one per part', () => {
  const wrong = creature('wrong');
  assert.deepEqual(json(Combat.abilities(wrong)), []);
  Combat.SPECIES.forEach(species => {
    const beast = creature('part', species.id);
    assert.deepEqual(json(Combat.abilities(beast)), [species.ability]);
    beast.parts[species.part].visible = wrong.parts[species.part].visible;
    assert.deepEqual(json(Combat.abilities(beast)), []);
  });
});
test('immutable inputs and exact repeatability including replay log', () => {
  const team = [creature('a', 0), creature('b', 2), creature('c', 6), creature('d', 4)];
  const enemies = [creature('e', 1), creature('f', 3), creature('g', 5), creature('h', 7)];
  const before = JSON.stringify([team, enemies]);
  const first = fight(team, enemies, 123456789);
  assert.equal(JSON.stringify(first), JSON.stringify(fight(team, enemies, 123456789)));
  assert.equal(JSON.stringify([team, enemies]), before);
  assert.ok(first.log.length > 10);
  assert.ok(first.log.every(event => Number.isFinite(event.damage) && Number.isFinite(event.hp)));
});
test('browser UMD and Rhino-style exports give byte-identical seeded replays', () => {
  const browser = {};
  vm.runInNewContext('Math.imul = undefined;', browser);
  vm.runInNewContext(fs.readFileSync(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'app/src/main/assets/factory/modules/games/engine/rng.js'), 'utf8'), browser);
  vm.runInNewContext(source, browser);
  const a = [creature('a', 8), creature('b', 9), creature('c', 10)];
  const b = [creature('d', 11), creature('e', 12), creature('f', 13)];
  for (let seed = 0; seed < 100; seed++) {
    assert.equal(JSON.stringify(browser.Combat.fight(a, b, seed)), JSON.stringify(fight(a, b, seed)));
  }
});
test('charge doubles force before defense and armor reduces incoming damage', () => {
  const a = creature('a', 0, [40, 41, 40, 0]);
  const b = creature('b', 5, [40, 40, 40, 0]);
  const result = fight([a], [b]);
  assert.equal(result.log[0].kind, 'charge');
  assert.equal(result.log[0].damage, 60);
  assert.equal(result.log.filter(event => event.actor === 'a' && event.damage > 0)[1].damage, 20);
});
test('thorns returns 20% damage and stubborn survives one otherwise lethal hit', () => {
  const a = creature('a', null, [40, 41, 40, 0]);
  const b = creature('b', 2, [40, 40, 40, 0]);
  const result = fight([a], [b]);
  assert.equal(result.log[1].kind, 'thorns');
  assert.equal(result.log[1].damage, 5);
  b.traits = ['stubborn'];
  const lethal = fight([creature('strong', null, [500, 300, 300, 0])], [b]);
  assert.equal(lethal.log[0].hp, 1);
  assert.equal(lethal.log.filter(event => event.kind === 'stubborn').length, 1);
  assert.equal(lethal.enemyRemaining, 0);
});
test('hearing counters a dodge, flight wins first action, tactician wins equal agility', () => {
  const a = creature('a', null, [40, 41, 40, 0]);
  const b = creature('b', 1, [40, 40, 40, 0]);
  b.traits = ['trickster'];
  const result = fight([a], [b], 1, { 'combat.tricksterDodge': 1 });
  assert.equal(result.log[0].kind, 'dodge');
  assert.equal(result.log[1].kind, 'counter');
  assert.equal(fight([a], [creature('flyer', 6, [40, 1, 40, 0])]).log[0].actor, 'flyer');
  a.genes[1] = 40;
  assert.equal(fight([a], [b], 1, {}, { tactician: true }).log[0].actor, 'a');
});
test('replacement reserve enters after knockout and solo victory is supported', () => {
  const strong = creature('strong', null, [500, 500, 500, 0]);
  const weak = [0, 1, 2, 3].map(n => creature('weak-' + n, null, [1, 1, 1, 0]));
  const result = fight([strong], weak);
  assert.ok(result.log.some(event => event.kind === 'enter' && event.target === 'weak-3'));
  assert.equal(result.win, true);
  assert.equal(result.enemyRemaining, 0);
  assert.deepEqual(json(result.survivors), ['strong']);
});
test('statuses, shields and new continent abilities emit replay events', () => {
  [4, 7, 8, 9, 10].forEach(species => {
    const expected = { 4: 'trip', 7: 'blind', 8: 'frost', 9: 'sand', 10: 'shield' }[species];
    const a = creature('a', species, [40, 41, 40, 0]);
    const result = fight([a], [creature('b', null, [40, 40, 40, 0])], 1, { 'combat.tripChance': 1 });
    assert.ok(result.log.some(event => event.kind === expected), expected);
  });
});
test('10,000 equal-stat seeded team fights per ability, paired side reversals', () => {
  const count = 10000;
  const reports = [];
  const rates = [];
  for (const species of Combat.SPECIES) {
    let victories = 0;
    let draws = 0;
    for (let sample = 0; sample < count / 2; sample++) {
      const rng = Rng.make(8539 + sample * 104729);
      const team = [];
      const enemy = [];
      const slot = sample % 3;
      for (let i = 0; i < 3; i++) {
        const genes = [rng.int(20, 60), rng.int(20, 60), rng.int(20, 60), rng.int(20, 60)];
        const baseline = rng.int(14);
        team.push(creature('p' + i, i === slot ? species.id : baseline, genes));
        enemy.push(creature('e' + i, baseline, genes));
      }
      const seed = rng.int(2147483647);
      const result = fight(team, enemy, seed, {}, { log: false });
      const reverse = fight(enemy, team, seed, {}, { log: false });
      victories += result.win ? 1 : 0;
      victories += !reverse.win && !reverse.draw ? 1 : 0;
      draws += Number(result.draw) + Number(reverse.draw);
    }
    const rate = (victories + draws / 2) / count;
    reports.push(species.ability + '=' + (rate * 100).toFixed(2) + '%');
    rates.push({ ability: species.ability, rate });
  }
  console.log('  Equal-stat 3v3 ability balance (140,000 fights): ' + reports.join(', '));
  rates.forEach(entry => assert.ok(entry.rate <= 0.6, entry.ability + ': ' + entry.rate));
});

done('menagerie combat');




