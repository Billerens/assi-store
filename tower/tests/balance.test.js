'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { H, GAME, open, ctx } = require('./env');
const Bot = require('./bot');

const w = open();
const x = w.x;
const count = Number(process.env.TOWER_RUNS || 2000);
const reportOnly = process.env.TOWER_REPORT_ONLY === '1';
const reports = {};

function near(actual, target, tolerance, name) {
  assert.ok(Math.abs(actual - target) <= tolerance,
    name + ': ' + actual.toFixed(2) + ' %, цель ' + target + ' ± ' + tolerance + ' п.п.');
}

for (const point of Bot.POINTS) {
  H.test(point.title + ': ' + count + ' забегов, победы, ходы и время', () => {
    const report = Bot.sample(x, point, count, 1);
    reports[point.id] = report;
    console.log('BALANCE ' + JSON.stringify(report));
    if (reportOnly) return;
    assert.ok(count >= 2000, 'для итогового баланса нужны 2000 забегов на точку');
    if (point.id === 'empty') {
      near(report.basementPct, 30, 5, 'Подвалы, пустая мастерская');
      near(report.spirePct, 2, 1.5, 'Шпиль, пустая мастерская');
    }
    if (point.id === 'mid') {
      near(report.basementPct, 80, 5, 'Подвалы, середина мастерской');
      near(report.spirePct, 25, 5, 'Шпиль, середина мастерской');
    }
    if (point.id === 'max') near(report.spirePct, 75, 5, 'Шпиль, максимум');
    if (point.id === 'height12') near(report.spirePct, 15, 5, 'Шпиль, высота 12');
    assert.ok(report.battleKinds.normal.meanTurns >= 2 && report.battleKinds.normal.meanTurns <= 4,
      'обычный бой ' + report.battleKinds.normal.meanTurns.toFixed(3) + ' хода, цель 2–4');
    for (let flight = 0; flight < report.flightMeanSec.length; flight++) {
      const value = report.flightMeanSec[flight];
      if (value !== null) assert.ok(value >= 120 && value <= 180,
        'пролёт ' + (flight + 1) + ': ' + value.toFixed(1) + ' с, цель 120–180');
    }
    if (report.meanFullRunSec !== null) assert.ok(report.meanFullRunSec >= 480 && report.meanFullRunSec <= 600,
      'полный подъём ' + report.meanFullRunSec.toFixed(1) + ' с, цель 480–600');
  });
}

H.test('первая покупка мастерской: реальные осколки первого забега', () => {
  const result = Bot.run(x, 1, Bot.POINTS[0]);
  const state = result.state;
  const before = x.Big.toNumber(state.meta.tower.shards);
  const bought = x.sim.act(state, { type: 'workshop', id: 'health' }, ctx(x, result.now));
  reports.firstRun = { seed: 1, sec: result.sec + Bot.DELAYS.workshop, floor: result.maxFloor,
    earnedShards: result.shards, cost: before - x.Big.toNumber(state.meta.tower.shards), ok: !!(bought && bought.ok) };
  console.log('FIRST_PURCHASE ' + JSON.stringify(reports.firstRun));
  assert.ok(result.shards > 0, 'гибель должна приносить прогресс');
  if (before >= 10) {
    assert.ok(bought && bought.ok, 'при 10 осколках доступна Закалка');
    assert.strictEqual(state.meta.tower.workshop.health, 1);
  } else {
    assert.ok(!bought.ok, 'нельзя покупать в долг');
    assert.strictEqual(state.meta.tower.workshop.health, 0);
  }
  const passenger = Bot.run(x, 1, Bot.POINTS[0], { context: { links: { passenger: { state: 'trip' } } } });
  assert.strictEqual(passenger.shards, result.shards * 2);
  reports.firstRun.passengerShards = passenger.shards;
  console.log('FIRST_RUN_PASSENGER ' + JSON.stringify({ sec: passenger.sec, floor: passenger.maxFloor, earnedShards: passenger.shards,
    canBuyHealth: passenger.shards >= 10 }));
});

H.test('прогресс с нуля: первая покупка, Подвалы и открытие следующей высоты', () => {
  const state = Bot.fresh(x, 12345);
  const priorities = ['health', 'strength', 'defense', 'agility', 'will', 'gold', 'doors', 'memory'];
  let now = Bot.T0;
  let seconds = 0;
  let firstBuySec = null;
  let firstBasementSec = null;
  let firstHeightSec = null;
  let firstPrestigeSec = null;
  let runs = 0;
  let purchases = 0;
  for (; runs < 200 && firstHeightSec === null; runs++) {
    const result = Bot.run(x, 12345 + runs, Bot.POINTS[0], { state, now });
    now = result.now;
    seconds += result.sec;
    if (result.basement && firstBasementSec === null) firstBasementSec = seconds - result.sec + result.checkpoints[10];
    if (state.meta.tower.heights >= 2) firstHeightSec = seconds;
    let bought = true;
    while (bought) {
      bought = false;
      for (const id of priorities) {
        const action = x.sim.act(state, { type: 'workshop', id }, ctx(x, now));
        if (action && action.ok) {
          bought = true;
          purchases++;
          seconds += Bot.DELAYS.workshop;
          now += Bot.DELAYS.workshop * 1000;
          if (firstBuySec === null) firstBuySec = seconds;
        }
      }
    }
  }
  if (firstHeightSec !== null) {
    const prestige = x.Core.prestige(x.sim, x.game, state, 'height', ctx(x, now));
    assert.ok(prestige.ok, 'движок отклонил открытую высоту');
    firstPrestigeSec = seconds + x.cfg['prestige.holdMs'] / 1000;
  }
  reports.progression = { runs, purchases, firstBuySec, firstBasementSec, firstHeightSec, firstPrestigeSec,
    firstHeightTrip25Min: firstHeightSec === null ? null : Math.ceil(firstHeightSec / 1500), workshop: state.meta.tower.workshop };
  console.log('PROGRESSION ' + JSON.stringify(reports.progression));
  assert.ok(firstBuySec !== null, 'нет первой покупки');
  assert.ok(firstBasementSec !== null && firstBasementSec <= 3600, 'Подвалы не пройдены за первый час');
  assert.ok(firstHeightSec !== null, 'за 200 забегов не открыта высота 2');
  assert.ok(state.meta.tower.classes.includes('archer'), 'Лучница не открыта');
  assert.ok(state.meta.tower.classes.includes('scholar'), 'Книжник не открыт');
  assert.ok(state.meta.tower.classes.includes('nameless'), 'Безымянный не открыт');
});

H.done('tower: баланс').then((result) => {
  fs.writeFileSync(path.join(GAME, 'tests', 'balance-report.json'), JSON.stringify({ count, reportOnly, result, reports }, null, 2) + '\n');
});
