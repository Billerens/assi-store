// The economy of «Рыбалка» with numbers: the catch rate of every species, the income ladder of
// the waters, the first purchase and the first season, the 12-hour absence, closing mid-fight.
// node tests/economy.test.js  (prints the tables)
'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open();
const { sim, cfg, Core, Big, Rng, game } = x;
const k = sim.content();
const TACKLE = ['rod', 'reel', 'line', 'hook', 'float'];
const pct = (v) => Math.round(v * 100) + ' %';

function fresh(now, rng) {
  return Core.newState(game, sim, ctxOf(x, now, rng || Rng.make(1)));
}

function geared(level, water, now) {
  const s = fresh(now);
  TACKLE.forEach((u) => { s.run.up[u] = level; });
  s.run.waters = k.waters.map((w) => w.id).slice(0, k.order[water] + 1);
  s.run.water = water;
  return s;
}

test('вываживание: 60–90 % на стартовых снастях водоёма, легенды — от 25 % на снастях 10', () => {
  const rows = [];
  const bad = [];
  k.src.species.forEach((sp) => {
    const level = sp.rarity === 'legend' ? 10 : k.water[sp.water].gear;
    const s = geared(level, sp.water, Date.UTC(2026, 10, 3, 8));
    const d = sim.zoneDistance(s, cfg, sim.ZONES.indexOf(sp.zone));
    const rng = Rng.make(42);
    const n = 200;
    let ok = 0;
    const lost = {};
    for (let i = 0; i < n; i++) {
      const w = Math.max(sp.avg * cfg['weight.min'], Math.min(sp.max, sp.avg * (0.6 + 0.8 * rng.next())));
      const out = sim.simulateFight(s, cfg, sp.id, w, d, rng);
      if (out === 'landed' || out === 'sold') ok++;
      else lost[out] = (lost[out] || 0) + 1;
    }
    const rate = ok / n;
    rows.push(sp.water.padEnd(6) + ' ' + sp.id.padEnd(13) + ' ' + sp.rarity.padEnd(7) + ' снасти ' + String(level).padStart(2) + '  ' + pct(rate).padStart(5) + '  ' + JSON.stringify(lost));
    if (sp.rarity === 'legend' ? rate < 0.25 : rate < 0.6 || rate > 0.9) bad.push(sp.id + ' ' + pct(rate));
  });
  console.log('  доля пойманных ботом «до 80, до 50» (200 боёв на вид):\n    ' + rows.join('\n    '));
  assert.deepStrictEqual(bad, []);
});

test('доход в минуту по водоёмам: каждый следующий в 2–4 раза больше', () => {
  const DAYS = [3, 9];
  const table = [];
  k.waters.forEach((w) => {
    let coins = 0;
    let fish = 0;
    let mins = 0;
    for (let slot = 0; slot < 24; slot++) {
      const rng = Rng.make(100 + slot);
      let now = new Date(2026, 10, DAYS[slot % 2], (slot >> 1) * 2, 30, 0).getTime();
      const s = geared(w.gear, w.id, now);
      if (w.needs) s.run.up[w.needs] = 1;
      s.run.bait = { bloodworm: 1e6, livebait: 1e6, gold: 0 };
      s.layers.season = s.layers.season || {};
      s.layers.season.count = 5;
      // A mature journal: records near the top, so stars are honest.
      k.src.species.forEach((sp) => { s.meta.journal[sp.kind || sp.id] = { n: 10, best: sp.max * 0.85, first: 1 }; });
      for (let sec = 0; sec < 30 * 60; sec++) {
        const c = s.run.cast;
        if (c.phase === 'caught') {
          const p = s.run.pending;
          if (p && !p.snag) {
            coins += p.p;
            fish++;
          }
          sim.keep(s, cfg, 'sack');
          s.run.sack = [];
        }
        if (s.run.cast.phase === 'idle') {
          const best = sim.bestCast(s, cfg, now);
          if (!sim.setBait(s, best.use)) sim.setBait(s, 'worm');
          sim.throwAt(s, cfg, now, rng, best.d / sim.maxRange(s, cfg), true);
        }
        for (let t = 0; t < 4; t++) sim.tick(s, 0.25, ctxOf(x, now + (t + 1) * 250, rng));
        s.run.aq = [];
        now += 1000;
      }
      mins += 30;
    }
    table.push({ id: w.id, perMin: coins / mins, fish: fish / mins });
  });
  const lines = table.map((r, i) => r.id.padEnd(6) + ' ' + r.perMin.toFixed(1).padStart(8) + ' мон./мин' + (i ? '  ×' + (r.perMin / table[i - 1].perMin).toFixed(2) : '       ') + '  рыб/мин ' + r.fish.toFixed(2));
  console.log('  доход на стартовых снастях водоёма (24 раза по 30 минут: каждые 2 часа двух разных суток):\n    ' + lines.join('\n    '));
  for (let i = 1; i < table.length; i++) {
    const ratio = table[i].perMin / table[i - 1].perMin;
    assert.ok(ratio >= 2 && ratio <= 4, table[i].id + ' ×' + ratio.toFixed(2));
  }
});

test('темп: первая покупка до 10 с, первый сезон за неделю (две поездки по 25 минут в день)', () => {
  const r = x.kit.bot(game, sim, cfg, { play: (st, ctx) => sim.play(st, ctx), days: 7, hz: 4 });
  console.log('  первая покупка: ' + r.firstBuySec + ' с; поездок ' + r.trips + '; новые сезоны: ' + JSON.stringify(r.prestiges));
  assert.ok(r.firstBuySec !== null && r.firstBuySec <= 10);
  assert.ok(r.prestiges.length > 0);
  assert.ok(r.prestiges[0].trip >= 6 && r.prestiges[0].trip <= 14, 'первый сезон в поездке ' + r.prestiges[0].trip);
});

test('офлайн 12 часов: формула и шаги расходятся меньше чем на 1 %, и это ровно доход аквариума', () => {
  const now = Date.UTC(2026, 10, 3, 20);
  const s = fresh(now);
  s.run.up.aquarium = 10;
  s.run.up.filter = 3;
  s.run.up.light = 2;
  s.run.up.cat = 3;
  s.run.up.keepnet = 1;
  s.run.aq = [{ sp: 'karas', w: 0.9, s: 3, p: 40, r: 'c' }, { sp: 'zkaras', w: 1.6, s: 2, p: 120, r: 'r' }, { sp: 'lin', w: 2.1, s: 3, p: 70, r: 'c' }];
  s.lastTick = now;
  const rate = sim.aqRate(s, cfg);
  const p = Core.plan(now, now + 12 * 3600000, cfg, 0);
  const a = Core.clone(s);
  const b = Core.clone(s);
  const steps = {};
  for (const key in sim) if (key !== 'offline') steps[key] = sim[key];
  const mk = (seg) => ctxOf(x, seg.to, Rng.make(1));
  const ra = Core.runOffline(sim, a, game, p, null, mk, cfg);
  Core.runOffline(steps, b, game, p, null, mk, cfg);
  const va = Big.toNumber(a.run.coins);
  const vb = Big.toNumber(b.run.coins);
  const diff = Math.abs(va - vb) / Math.max(va, vb);
  const cat = a.run.away.catP;
  const expected = Big.toNumber(s.run.coins) + rate * p.creditedMs / 60000 * p.efficiency + cat;
  console.log('  12 ч: формула ' + va.toFixed(2) + ', шаги ' + vb.toFixed(2) + ', расхождение ' + (diff * 100).toFixed(3) + ' %; аквариум ' + rate.toFixed(2) + '/мин, кот поймал ' + a.run.away.cat + ' на ' + cat);
  assert.ok(ra.formula !== false);
  assert.ok(diff < 0.01, 'расхождение ' + diff);
  assert.ok(Math.abs(va - expected) / expected < 0.01, 'формула ' + va + ' / ожидалось ' + expected);
  assert.strictEqual(a.run.away.cat, Math.floor(cfg['cat.perHour'] * 3 * p.creditedMs / 3600000 + 1e-9), 'кот: 2 рыбы в час за уровень');
});

test('закрыть игру посреди вываживания: рыба сошла, наживка не списана второй раз, сводка честная', () => {
  const now = Date.UTC(2026, 10, 3, 6);
  const rng = Rng.make(3);
  const s = fresh(now, rng);
  s.run.bait.livebait = 4;
  sim.setBait(s, 'livebait');
  sim.throwAt(s, cfg, now, rng, 0.5, true);
  assert.strictEqual(s.run.bait.livebait, 3, 'живец списан при забросе');
  let t = now;
  for (let i = 0; i < 2000 && s.run.cast.phase !== 'fight'; i++) {
    sim.tick(s, 0.05, ctxOf(x, t, rng));
    t += 50;
  }
  assert.strictEqual(s.run.cast.phase, 'fight');
  const saved = Core.pick([{ json: JSON.stringify(s), seq: 1, source: 'test' }], game, sim).state;
  // The app was killed: the next start goes through offline for the gap.
  Core.runOffline(sim, saved, game, Core.plan(t, t + 45000, cfg, 0), null, (seg) => ctxOf(x, seg.to, Rng.make(1)), cfg);
  assert.strictEqual(saved.run.cast.phase, 'idle');
  assert.strictEqual(saved.run.cast.msg, 'gone');
  assert.strictEqual(saved.run.pending, null);
  assert.strictEqual(saved.run.bait.livebait, 3, 'не списан второй раз');
  assert.deepStrictEqual(sim.awayLines(saved, cfg).slice(0, 1), ['Рыба сошла с крючка, пока игра была закрыта — наживка не списана ещё раз']);
  // A short gap (under the engine's gapSec) keeps ticking: then a new cast charges once more, as it should.
  sim.throwAt(saved, cfg, t + 50000, rng, 0.5, true);
  assert.strictEqual(saved.run.bait.livebait, 2);
  assert.strictEqual(sim.validate(saved), null);
});

done('economy');
