// The balance of the spec («Как проверить»): the bot (world.js botRun: it circles away from the
// nearest enemies and picks cards greedily by weights) plays whole runs at 60 Hz without drawing,
// 1000 runs a point by default (WS_N=200 for a quicker pass), in parallel child processes.
//   empty workshop: 5–15 % wins, the median death of those runs 2:00–3:30;
//   half: 40–55 %; everything at max, storm 0: 90 %+; max, storm 15: 10–20 %;
//   levels: 22–28 a run on average with half the workshop (the runs that reach 5:00 get ~31);
//   no item is mandatory: of the runs alive at 2:30, the builds that go on to win have no item
//   more often than the builds that lose by more than 35 points (the spec's «not in >40 % of
//   the wins» cannot hold for 12 slots of 26 items: every build takes most of the weapons, so the
//   test asks whether winning needs the item instead). Storm 15 has few wins: printed, not judged.
// node tests/balance.test.js
'use strict';
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

if (process.env.WS_WORKER) {
  const L = require('./load.js');
  const job = JSON.parse(process.env.WS_WORKER);
  const cfg = L.config(job.over);
  const ws = L.workshop(cfg, job.ws);
  const out = [];
  for (let seed = job.from; seed < job.to; seed++) {
    // The build at the middle of the run (2:30), of the runs still alive then.
    let mid = null;
    const at = 150 * 60;
    const r = L.World.botRun(cfg, { seed: seed, hero: 'wanderer', mode: 'normal', storm: job.storm, ws: ws }, {
      skill: 1, maxSec: 400, every: at, on: function (w, i) {
        if (i === at) mid = w.s.wp.map((x) => x.id).concat(Object.keys(w.s.ps).filter((k) => w.s.ps[k] > 0));
      }
    });
    out.push({ won: r.won, T: r.T, level: r.level, items: r.items, mid: mid, check: r.check, peak: r.peak, kills: r.kills });
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const assert = require('assert');
const L = require('./load.js');
const { test, done } = L.H;
const N = Math.max(20, Number(process.env.WS_N) || 1000);
// WS_OVER='{"key": value}' plays the same points with changed settings (a tuning aid).
const OVER = process.env.WS_OVER ? JSON.parse(process.env.WS_OVER) : {};
// An item is «mandatory» when the builds that go on to win have it this much more often than those that lose.
const MANDATORY = 0.35;
const CPUS = Math.max(1, Math.min(os.cpus().length - 1, 23));

function chunked(point) {
  const parts = Math.max(1, Math.round(CPUS / 4));
  const size = Math.ceil(N / parts);
  const jobs = [];
  for (let from = 0; from < N; from += size) jobs.push({ ws: point.ws, storm: point.storm, over: OVER, from: 100000 + from, to: 100000 + Math.min(N, from + size) });
  return jobs;
}

function work(job) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { WS_WORKER: JSON.stringify(job) }) });
    let text = '';
    let err = '';
    child.stdout.on('data', (d) => { text += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      if (code) reject(new Error('worker ' + code + ': ' + err.slice(0, 500)));
      else resolve(JSON.parse(text));
    });
  });
}

const POINTS = [
  { id: 'empty', ws: 'empty', storm: 0, min: 0.05, max: 0.15 },
  { id: 'half', ws: 'half', storm: 0, min: 0.40, max: 0.55 },
  { id: 'max', ws: 'max', storm: 0, min: 0.90, max: 1 },
  { id: 'max15', ws: 'max', storm: 15, min: 0.10, max: 0.20 }
];

const results = {};

async function main() {
  const t0 = Date.now();
  const all = [];
  POINTS.forEach((p) => chunked(p).forEach((job) => all.push({ p: p, job: job })));
  // At most CPUS workers at a time.
  let next = 0;
  async function lane() {
    while (next < all.length) {
      const item = all[next++];
      const runs = await work(item.job);
      results[item.p.id] = (results[item.p.id] || []).concat(runs);
    }
  }
  const lanes = [];
  for (let i = 0; i < CPUS; i++) lanes.push(lane());
  await Promise.all(lanes);
  const cfg = L.config(OVER);
  const clock = L.Sim.clock;

  POINTS.forEach((p) => {
    test('доля побед: ' + p.id + ' — ' + Math.round(p.min * 100) + '–' + Math.round(p.max * 100) + ' %', () => {
      const runs = results[p.id];
      const wins = runs.filter((r) => r.won).length / runs.length;
      const deaths = runs.filter((r) => !r.won).map((r) => r.T).sort((a, b) => a - b);
      const lv = runs.reduce((a, r) => a + r.level, 0) / runs.length;
      console.log('  ' + p.id + ': ' + runs.length + ' забегов, побед ' + (wins * 100).toFixed(1) + ' %, медиана гибели ' + clock(deaths[Math.floor(deaths.length / 2)] || 0) + ', средний уровень ' + lv.toFixed(1));
      assert.ok(wins >= p.min && wins <= p.max, 'побед ' + (wins * 100).toFixed(1) + ' %');
    });
  });

  test('первые забеги: медиана гибели 2:00–3:30', () => {
    const deaths = results.empty.filter((r) => !r.won).map((r) => r.T).sort((a, b) => a - b);
    const med = deaths[Math.floor(deaths.length / 2)];
    assert.ok(med >= 120 && med <= 210, 'медиана ' + clock(med));
  });

  test('уровни: 22–28 за забег у бота (половина мастерской, все забеги)', () => {
    const all = results.half.reduce((a, r) => a + r.level, 0) / results.half.length;
    const lv = results.half.filter((r) => r.won).map((r) => r.level).sort((a, b) => a - b);
    const med = lv[Math.floor(lv.length / 2)];
    console.log('  уровень: в среднем ' + all.toFixed(1) + '; у дошедших до 5:00 медиана ' + med + ', от ' + lv[0] + ' до ' + lv[lv.length - 1]);
    assert.ok(all >= 22 && all <= 28, 'в среднем ' + all);
  });

  test('нет обязательного предмета (половина мастерской; шторм 15 — для сведения)', () => {
    const bad = [];
    ['half', 'max15'].forEach((id) => {
      // The builds at 2:30 of the runs alive then: those that went on to win against those that did not.
      const alive = results[id].filter((r) => r.mid);
      const wins = alive.filter((r) => r.won);
      const lost = alive.filter((r) => !r.won);
      const share = (list, item, key) => list.filter((r) => r[key].indexOf(item) >= 0).length / Math.max(1, list.length);
      const items = {};
      alive.forEach((r) => r.mid.forEach((it) => { items[it] = true; }));
      const top = [];
      Object.keys(items).filter((it) => it !== 'spark').forEach((it) => {
        const d = share(wins, it, 'mid') - share(lost, it, 'mid');
        top.push([it, d]);
        if (d > MANDATORY && id === 'half') bad.push(id + ': ' + it + ' +' + Math.round(d * 100) + ' п.');
      });
      top.sort((a, b) => b[1] - a[1]);
      console.log('  ' + id + ' (живы к 2:30: ' + alive.length + ', из них побед ' + wins.length + '): чаще у победителей — ' +
        top.slice(0, 4).map((x) => x[0] + ' +' + Math.round(x[1] * 100) + ' п. (к концу в ' + Math.round(share(wins, x[0], 'items') * 100) + ' % побед)').join(', '));
    });
    assert.deepStrictEqual(bad, []);
  });

  test('ни одного NaN и счётчики в пределах во всех забегах', () => {
    const bad = [];
    const peak = { e: 0, p: 0, g: 0 };
    Object.keys(results).forEach((id) => results[id].forEach((r) => {
      if (r.check) bad.push(id + ': ' + r.check);
      peak.e = Math.max(peak.e, r.peak.e);
      peak.p = Math.max(peak.p, r.peak.p);
      peak.g = Math.max(peak.g, r.peak.g);
    }));
    console.log('  пики: врагов ' + peak.e + '/' + cfg['caps.enemies'] + ', снарядов ' + peak.p + '/' + cfg['caps.projectiles'] + ', кристаллов ' + peak.g + '/' + cfg['caps.gems']);
    assert.deepStrictEqual(bad.slice(0, 5), []);
    assert.ok(peak.e <= cfg['caps.enemies'] && peak.p <= cfg['caps.projectiles'] && peak.g <= cfg['caps.gems']);
  });

  console.log('  ' + POINTS.length * N + ' забегов за ' + Math.round((Date.now() - t0) / 1000) + ' с на ' + CPUS + ' процессах');
  done('balance wave-survival');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
