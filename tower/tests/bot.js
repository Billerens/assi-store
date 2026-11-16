'use strict';
const assert = require('assert');
const { ctx } = require('./env');

const T0 = Date.UTC(2026, 10, 14, 6, 0, 0);
// The capped upgrades at their limit and the endless ones (health, strength, defense, gold) at
// their mastery threshold: the reference "fully built" workshop the balance targets are set for.
const MAX_LEVELS = { health: 10, strength: 5, defense: 5, agility: 5, will: 3, gold: 5, doors: 2, memory: 2 };
const POINTS = [
  { id: 'empty', title: 'Пустая мастерская', height: 1, levels: {} },
  { id: 'mid', title: 'Середина мастерской', height: 1, levels: { health: 5, strength: 2, defense: 2, agility: 2, will: 1, gold: 2, doors: 1, memory: 1 } },
  { id: 'max', title: 'Мастерская на пороге мастерства', height: 1, levels: MAX_LEVELS },
  { id: 'height12', title: 'Порог мастерства, высота 12', height: 12, levels: MAX_LEVELS }
];

// Human decision delays, applied to every action rather than to completed runs.
// A 2–4-turn duel therefore takes 10–20 seconds before floor/reward choices.
const DELAYS = { play: 5, door: 3, reward: 4, event: 4, buy: 3, next: 2, continue: 3, descend: 3, start: 3, workshop: 3 };

function delay(action) { return DELAYS[action.type] || 3; }

function fresh(x, seed, point) {
  const state = x.Core.newState(x.game, x.sim, ctx(x, T0, x.Rng.make(seed)));
  if (point) {
    Object.assign(state.meta.tower.workshop, point.levels);
    state.meta.tower.heights = Math.max(state.meta.tower.heights, point.height);
  }
  return state;
}

function run(x, seed, point, options) {
  options = options || {};
  const state = options.state || fresh(x, seed, point);
  let now = options.now || T0;
  let sec = 0;
  let actions = 0;
  let battleActions = 0;
  let currentBattleTurns = 0;
  let battleCount = 0;
  let combatTurns = 0;
  const battleKinds = { normal: { battles: 0, turns: 0 }, elite: { battles: 0, turns: 0 }, boss: { battles: 0, turns: 0 } };
  let firstShopBuySec = null;
  const flightTimes = [];
  const checkpoints = {};
  let lastFlightSec = 0;
  let maxFloor = 0;
  const context = () => ctx(x, now, x.Rng.make(seed), options.context);
  const start = x.sim.act(state, { type: 'start', classId: options.classId || 'guardian', height: point ? point.height : 1, seed }, context());
  assert.ok(start && start.ok, 'start seed=' + seed + ': ' + JSON.stringify(start));
  sec += DELAYS.start;
  now += DELAYS.start * 1000;
  const initialShards = x.Big.toNumber(state.meta.tower.shards);
  for (; actions < (options.maxActions || 1500); actions++) {
    const r = state.run;
    maxFloor = Math.max(maxFloor, r.floor);
    if (r.phase === 'ended' || r.phase === 'home') break;
    if (r.phase === 'fork' && !checkpoints[r.floor]) {
      checkpoints[r.floor] = sec;
      flightTimes.push(sec - lastFlightSec);
      lastFlightSec = sec;
      if (r.floor >= (options.stopFloor || 30)) {
        const end = x.sim.act(state, { type: 'descend' }, context());
        assert.ok(end && end.ok, 'descend seed=' + seed);
        sec += DELAYS.descend;
        now += DELAYS.descend * 1000;
        break;
      }
    }
    const action = x.sim.botAction(state, x.cfg);
    assert.ok(action && action.type, 'bot action missing: ' + JSON.stringify({ seed, floor: r.floor, phase: r.phase }));
    const beforeCombat = r.phase === 'combat';
    const battleKind = beforeCombat ? r.enemy.boss ? 'boss' : r.enemy.elite ? 'elite' : 'normal' : null;
    if (beforeCombat && action.type === 'play') {
      battleActions++;
      currentBattleTurns++;
    }
    const result = x.sim.act(state, action, context());
    assert.ok(result && result.ok, 'bot action rejected: ' + JSON.stringify({ seed, action, floor: r.floor, phase: r.phase, result }));
    const spent = delay(action);
    sec += spent;
    now += spent * 1000;
    x.sim.tick(state, spent, context());
    if (action.type === 'buy' && firstShopBuySec === null) firstShopBuySec = sec;
    if (beforeCombat && state.run.phase !== 'combat') {
      battleCount++;
      combatTurns += currentBattleTurns;
      battleKinds[battleKind].battles++;
      battleKinds[battleKind].turns += currentBattleTurns;
      currentBattleTurns = 0;
    }
    if (options.validateEveryAction) {
      assert.strictEqual(x.Core.validate(state, x.game), null);
      assert.strictEqual(x.sim.validate(state), null);
    }
  }
  assert.ok(actions < (options.maxActions || 1500), 'bot stuck: seed=' + seed + ', floor=' + state.run.floor + ', phase=' + state.run.phase);
  assert.strictEqual(x.Core.validate(state, x.game), null);
  assert.strictEqual(x.sim.validate(state), null);
  return { state, now, sec, actions, battleActions, battleCount, combatTurns, battleKinds, flightTimes, checkpoints, maxFloor, firstShopBuySec,
    shards: x.Big.toNumber(state.meta.tower.shards) - initialShards, basement: !!checkpoints[10], spire: !!checkpoints[30] };
}

function sample(x, point, count, seedStart) {
  let basement = 0;
  let spire = 0;
  let battles = 0;
  let turns = 0;
  let totalFloor = 0;
  let totalShards = 0;
  let completedSec = 0;
  const battleKinds = { normal: { battles: 0, turns: 0 }, elite: { battles: 0, turns: 0 }, boss: { battles: 0, turns: 0 } };
  const flights = [[], [], []];
  const endedFloors = [];
  for (let i = 0; i < count; i++) {
    const result = run(x, (seedStart || 1) + i, point);
    basement += Number(result.basement);
    spire += Number(result.spire);
    battles += result.battleCount;
    turns += result.combatTurns;
    for (const kind of Object.keys(battleKinds)) {
      battleKinds[kind].battles += result.battleKinds[kind].battles;
      battleKinds[kind].turns += result.battleKinds[kind].turns;
    }
    totalFloor += result.maxFloor;
    totalShards += result.shards;
    endedFloors.push(result.maxFloor);
    if (result.spire) completedSec += result.checkpoints[30];
    result.flightTimes.forEach((v, n) => flights[n].push(v));
  }
  endedFloors.sort((a, b) => a - b);
  for (const kind of Object.keys(battleKinds)) battleKinds[kind].meanTurns = battleKinds[kind].battles ? battleKinds[kind].turns / battleKinds[kind].battles : null;
  return {
    id: point.id, runs: count, height: point.height, workshop: point.levels, basement, spire,
    basementPct: basement / count * 100, spirePct: spire / count * 100,
    meanCombatTurns: turns / battles, battles, turns, battleKinds,
    flightMeanSec: flights.map((a) => a.length ? a.reduce((s, n) => s + n, 0) / a.length : null),
    meanFullRunSec: spire ? completedSec / spire : null,
    meanFloor: totalFloor / count, medianFloor: endedFloors[Math.floor(count / 2)], meanShards: totalShards / count,
    delaysSec: DELAYS
  };
}

module.exports = { T0, MAX_LEVELS, POINTS, DELAYS, delay, fresh, run, sample };
