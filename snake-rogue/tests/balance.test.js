// The balance of «Змейка-рогалик» measured by the bot of the spec: it goes to the nearest fruit by
// breadth-first search around its body, the stones and the hedgehogs, and reacts 150 ms late
// (sim.botPlay, skill 'simple'). Prints the win rate at four points of the workshop, the time of a
// glade, the scales of the first run and the minutes of play to the first win (= the first molt).
// Default samples keep the file around a minute; FULL=1 plays the spec's 2000 runs a point.
// node tests/balance.test.js      FULL=1 node tests/balance.test.js
'use strict';
const assert = require('assert');
const E = require('./env.js');

const { Core, game, sim, cfg, Rng, Big } = E.setup();
const FULL = !!process.env.FULL;
const N = FULL ? 2000 : Number(process.env.N) || 60;
const MID = { long: 3, skin: 1, nose: 1, sack: 3, reroll: 2, quiet: 1 };
const MAX = { long: 5, skin: 2, nose: 2, sack: 5, reroll: 3, quiet: 2 };
const POINTS = [
  { name: 'пустая мастерская', shop: {}, molt: 0, target: 0.10 },
  { name: 'середина', shop: MID, molt: 0, target: 0.45 },
  { name: 'максимум, линька 0', shop: MAX, molt: 0, target: 0.80 },
  { name: 'максимум, линька 10', shop: MAX, molt: 10, target: 0.15 }
];

function newState(seed) { return Core.newState(game, sim, { now: 0, config: cfg, rng: Rng.make(seed) }); }

function point(p, n, skill) {
  let wins = 0;
  let glades = 0;
  let gladeSec = [];
  let timeouts = 0;
  let scales = [];
  for (let i = 0; i < n; i++) {
    const st = newState(i + 1);
    st.meta.shop = Object.assign({}, p.shop);
    if (p.molt) st.layers.molt.currency = String(p.molt);
    const r = sim.botRun(st, cfg, { seed: 1000 + i, molt: p.molt, skill: skill || 'simple' });
    assert.ok(JSON.stringify(st).indexOf('NaN') < 0, 'NaN в забеге ' + i);
    assert.strictEqual(Core.validate(st, game), null);
    if (r.won) wins++;
    if (r.timeout) timeouts++;
    glades += r.glades;
    gladeSec = gladeSec.concat(r.gladeSec);
    scales.push(r.scales);
  }
  scales.sort((a, b) => a - b);
  return {
    win: wins / n, glades: glades / n, timeouts, gladeAvg: gladeSec.reduce((a, b) => a + b, 0) / Math.max(1, gladeSec.length),
    scalesAvg: scales.reduce((a, b) => a + b, 0) / n, scalesMid: scales[Math.floor(n / 2)]
  };
}

const pct = (x) => (x * 100).toFixed(1) + ' %';
const results = [];

E.test('доли побед по точкам мастерской (бот спеки, реакция 150 мс)', () => {
  console.log('  забегов на точку: ' + N + (FULL ? ' (FULL)' : ' (FULL=1 — 2000)'));
  POINTS.forEach((p) => {
    const t0 = Date.now();
    const r = point(p, N);
    results.push(r);
    console.log('  ' + p.name + ': побед ' + pct(r.win) + ' (цель ' + pct(p.target) + '), полян за забег ' + r.glades.toFixed(2) +
      ', поляна ' + r.gladeAvg.toFixed(1) + ' с, чешуек за забег ' + r.scalesAvg.toFixed(0) + ' (медиана ' + r.scalesMid + '), зависаний ' + r.timeouts +
      ' · ' + ((Date.now() - t0) / N).toFixed(0) + ' мс/забег');
  });
  // the workshop helps, the molts make it harder
  assert.ok(results[0].win < results[1].win && results[1].win <= results[2].win + 0.05, 'мастерская должна помогать');
  assert.ok(results[3].win < results[2].win, 'линька 10 должна быть труднее');
  results.forEach((r) => assert.ok(r.timeouts <= Math.max(1, N * 0.02), 'зависаний ' + r.timeouts));
});

E.test('средняя поляна 25–35 с', () => {
  results.forEach((r, i) => assert.ok(r.gladeAvg >= 25 && r.gladeAvg <= 35, POINTS[i].name + ': поляна ' + r.gladeAvg.toFixed(1) + ' с'));
});

E.test('опытный бот (видит врагов, проверяет простор) — для сравнения', () => {
  const n = Math.max(20, Math.round(N / 3));
  const r = point(POINTS[0], n, 'smart');
  console.log('  пустая мастерская, опытный бот: побед ' + pct(r.win) + ', полян ' + r.glades.toFixed(2) + ', поляна ' + r.gladeAvg.toFixed(1) + ' с (' + n + ' забегов)');
});

/** A player's way from the first run: buys the cheapest upgrade it can, takes every molt it opens. */
function career(seed, maxMin) {
  const st = newState(seed);
  const ctx = { now: 0, config: cfg, rng: Rng.make(seed), mult: 1, offline: false };
  let sec = 0;
  let firstWin = null;
  let firstMolt = null;
  let firstRun = null;
  let runs = 0;
  let albumHour = 0;
  let copperAt = null;
  while (sec < maxMin * 60) {
    for (;;) {
      const m = sim.meta(st);
      let best = null;
      sim.UPGRADES.forEach((id) => {
        const lvl = m.shop[id] || 0;
        if (lvl >= sim.upgradeMax(cfg, id)) return;
        const c = sim.upgradeCost(cfg, id, lvl);
        if (c <= sim.scales(st) && (!best || c < best.c)) best = { id, c };
      });
      if (!best) break;
      sim.buyUpgrade(st, cfg, best.id);
    }
    const r = sim.botRun(st, cfg, { seed: seed * 1000 + runs, molt: sim.moltTop(st), skill: 'simple' });
    runs++;
    sec += r.sec;
    if (firstRun === null) firstRun = r.scales;
    if (r.won && firstWin === null) firstWin = sec;
    if (copperAt === null && sim.meta(st).unlocked.copper) copperAt = sec;
    if (sec <= 3600) albumHour = Object.keys(sim.meta(st).album.abilities).length;
    if (Big.gt(sim.prestigeGain(st, sim.LAYER, cfg), 0)) {
      const p = Core.prestige(sim, game, st, sim.LAYER, ctx);
      if (p.ok && firstMolt === null) firstMolt = sec;
    }
    sim.toHub(st);
  }
  return { firstWin, firstMolt, firstRun, runs, albumHour, copperAt, molt: sim.moltTop(st) };
}

E.test('темп: чешуйки первого забега, минуты до первой победы и линьки', () => {
  const players = FULL ? 40 : 12;
  const list = [];
  for (let i = 0; i < players; i++) list.push(career(i + 1, 180));
  const med = (xs) => { const v = xs.filter((x) => x !== null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const min = (s) => (s === null ? 'нет' : (s / 60).toFixed(0) + ' мин');
  const first = list.map((x) => x.firstRun);
  console.log('  игроков ' + players + ', по 3 часа игры каждый');
  console.log('  чешуек за первый забег: медиана ' + med(first) + ', среднее ' + (first.reduce((a, b) => a + b, 0) / players).toFixed(0) + ' (цель 20–30)');
  console.log('  первая победа: медиана ' + min(med(list.map((x) => x.firstWin))) + ' (цель — в первый час); победили за 3 часа: ' + list.filter((x) => x.firstWin !== null).length + ' из ' + players);
  console.log('  первая линька (престиж): медиана ' + min(med(list.map((x) => x.firstMolt))));
  console.log('  Медянка открыта: медиана ' + min(med(list.map((x) => x.copperAt))));
  console.log('  способностей в альбоме за первый час: медиана ' + med(list.map((x) => x.albumHour)) + ' (цель 15+)');
  console.log('  линька через 3 часа: медиана ' + med(list.map((x) => x.molt)) + ', забегов за 3 часа: медиана ' + med(list.map((x) => x.runs)));
  assert.ok(list.every((x) => x.runs > 0));
});

E.done('balance ' + E.ID);
