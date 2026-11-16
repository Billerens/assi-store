// The economy of «Алхимик» in the harness: the engine's standard checks (checks.js as module_check
// runs them), the pace of the spec with the game's bot, a week of play with both prestige layers,
// offline by the formula against steps, no NaN, the events and the links.
//   node tests/economy.test.js
'use strict';
const assert = require('assert');
const { H, make, ctxOf } = require('./setup');
const { test, done } = H;

const w = make();
process.on('exit', () => w.env.close());
const { x, env } = w;
const { Core, Big, Rng, sim, cfg, game } = x;
const kit = env.require('modules/games/engine/checks-kit.js');
const HOUR = 3600000;
const MIN = 60000;

test('стандартные проверки движка и свои (checks.js), кроме экрана без телефона', () => {
  const out = env.require('lib/check.js').run('games/alchemist');
  const bad = out.results.filter((r) => !r.ok && !/экран/.test(r.name) && !r.skipped);
  assert.deepStrictEqual(bad.map((r) => r.name + ': ' + r.error), []);
  console.log('  проверок: ' + out.results.length + ', прошло ' + out.results.filter((r) => r.ok).length + ' (экран — только на телефоне)');
});

test('темп движка: первая покупка ≤ 10 с, первый камень в поездках 3–6', () => {
  const r = kit.bot(game, sim, cfg, { play: (state, ctx, s) => s.bot(state, ctx) });
  console.log('  первая покупка на ' + r.firstBuySec + ' с; камни: ' + r.prestiges.map((p) => 'поездка ' + p.trip + ' +' + Number(p.gain)).join(', '));
  assert.ok(r.firstBuySec !== null && r.firstBuySec <= 10);
  assert.ok(r.prestiges.length && r.prestiges[0].trip >= 3 && r.prestiges[0].trip <= 6, JSON.stringify(r.prestiges));
});

test('темп спеки: 5 минут — 10–14 открытий, час — 40–50 элементов, рост без стены дольше 30 минут', () => {
  const rng = Rng.make(5);
  let now = Date.UTC(2026, 10, 2, 5);
  const st = Core.newState(game, sim, ctxOf(x, now, rng));
  let lastBuy = 0;
  let wall = 0;
  const marks = {};
  for (let s = 1; s <= 3 * 3600; s++) {
    const b = sim.bot(st, ctxOf(x, now, rng));
    sim.tick(st, 1, ctxOf(x, now + 1000, rng));
    now += 1000;
    if (b) {
      wall = Math.max(wall, s - lastBuy);
      lastBuy = s;
    }
    if (s === 300 || s === 3600 || s === 3 * 3600) marks[s] = { book: st.meta.bookN, fire: 1 + (st.run.lv.fire || 0), cubes: st.run.cubes.length, rate: sim.incomeRate(st, cfg) };
    if (s % 600 === 0) {
      assert.strictEqual(Core.validate(st, game), null);
      assert.strictEqual(sim.validate(st), null);
    }
  }
  console.log('  5 мин: открытий ' + (marks[300].book - 4) + ', Горн ур. ' + marks[300].fire + '; час: элементов ' + marks[3600].book + ', кубов ' + marks[3600].cubes +
    '; 3 часа: элементов ' + marks[10800].book + '; самый долгий перерыв между покупками ' + wall + ' с');
  assert.ok(marks[300].book - 4 >= 10 && marks[300].book - 4 <= 14, 'открытий за 5 минут: ' + (marks[300].book - 4));
  assert.ok(marks[3600].book >= 40 && marks[3600].book <= 50, 'элементов за час: ' + marks[3600].book);
  assert.ok(marks[3600].cubes >= 1, 'первый куб за час');
  assert.ok(wall < 30 * 60, 'стена: ' + wall + ' с без покупок');
});

function week(days, layers) {
  const rng = Rng.make(12345);
  let now = Date.UTC(2026, 10, 2, 5);
  const state = Core.newState(game, sim, ctxOf(x, now, rng));
  const gaps = [9 * HOUR, 15 * HOUR - 50 * MIN];
  const log = [];
  const at = {};
  let trip = 0;
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < 2; k++) {
      trip++;
      for (let s = 0; s < 25 * 60; s++) {
        sim.bot(state, ctxOf(x, now, rng));
        sim.tick(state, 1, ctxOf(x, now + 1000, rng));
        now += 1000;
        if (s % 30 !== 29) continue;
        layers.forEach((id) => {
          const info = Core.prestigeInfo(sim, game, state, id, cfg);
          if (!info.can || !info.hint) return;
          const r = Core.prestige(sim, game, state, id, ctxOf(x, now, rng));
          if (r.ok) log.push({ trip, id, gain: Big.toNumber(r.gain), book: state.meta.bookN });
        });
      }
      ['ether', 'triple', 'void', 'great'].forEach((u) => { if (state.meta.unlocks[u] && !at[u]) at[u] = trip; });
      state.lastTick = now;
      const p = Core.plan(now, now + gaps[k], cfg, sim.capBonusHours(state));
      now = p.to;
      Core.runOffline(sim, state, game, p, null, (seg) => ctxOf(x, seg.to, rng), cfg);
      state.lastTick = now;
      assert.strictEqual(Core.validate(state, game), null, 'поездка ' + trip);
      assert.strictEqual(sim.validate(state), null, 'поездка ' + trip);
    }
  }
  return { state, log, at, trips: trip };
}

test('неделя (14 поездок): 5–6 камней в сумме 30+, Эфир за неделю', () => {
  const r = week(7, ['stone', 'tincture']);
  const stones = r.log.filter((l) => l.id === 'stone');
  const total = stones.reduce((s, l) => s + l.gain, 0);
  console.log('  камни: ' + stones.map((l) => 'п' + l.trip + ' +' + l.gain).join(', ') + ' = ' + total + '; Эфир в поездке ' + (r.at.ether || 'нет') +
    ', тройное ' + (r.at.triple || 'нет') + ', Пустота ' + (r.at.void || 'нет') + '; Книга ' + r.state.meta.bookN);
  assert.ok(stones.length >= 4 && stones.length <= 8, 'престижей ' + stones.length);
  assert.ok(total >= 30, 'камней ' + total);
  assert.ok(r.at.ether && r.at.ether <= 14, 'Эфир');
  assert.ok(r.state.meta.book['эфир'] && r.state.run.store['эфир'] !== undefined, 'Эфир в Книге и на складе');
});

/**
 * A tree the model has grown: every free pair of hand-made elements up to tier 3 has an element
 * of its own (hundreds of cheap new finds near the start, the worst case for the pace).
 */
function grownGraph(maxTier, limit) {
  sim.setGraph({ elements: [], recipes: [] });
  const t = sim.tree();
  const low = t.list.filter((e) => e.src === 'base' && e.tier <= maxTier).map((e) => e.key).sort();
  const g = { elements: [], recipes: [], none: [] };
  for (let i = 0; i < low.length && g.elements.length < limit; i++) {
    for (let j = i; j < low.length && g.elements.length < limit; j++) {
      const k = [low[i], low[j]].sort().join('+');
      if (t.recipes[k] || t.none[k]) continue;
      const key = 'выросшее ' + g.elements.length;
      g.elements.push({ key, name: key, tier: Math.max(t.els[low[i]].tier, t.els[low[j]].tier) + 1, cat: t.catList[0], glyph: t.glyphList[0], colors: [0, 0], desc: 'x', src: 'model', at: 1 });
      g.recipes.push({ k, r: key, at: 1, by: 'stock' });
    }
  }
  return g;
}

test('выросшее дерево (400 элементов модели): первый камень не в первой поездке, неделя по спеке', () => {
  const before = sim.graph();
  try {
    sim.setGraph(grownGraph(3, 400));
    const r = kit.bot(game, sim, cfg, { play: (state, ctx, s) => s.bot(state, ctx) });
    const w = week(7, ['stone', 'tincture']);
    const stones = w.log.filter((l) => l.id === 'stone');
    const total = stones.reduce((s, l) => s + l.gain, 0);
    console.log('  первый камень в поездке ' + (r.prestiges.length ? r.prestiges[0].trip : '-') + '; неделя: камни ' + stones.map((l) => 'п' + l.trip + ' +' + l.gain).join(', ') +
      ' = ' + total + ', Эфир в поездке ' + (w.at.ether || 'нет') + ', Книга ' + w.state.meta.bookN);
    assert.ok(r.prestiges.length && r.prestiges[0].trip >= 2 && r.prestiges[0].trip <= 6, JSON.stringify(r.prestiges));
    assert.ok(stones.length >= 4 && stones.length <= 8, 'престижей ' + stones.length);
    assert.ok(total >= 30, 'камней ' + total);
    assert.ok(w.at.ether && w.at.ether <= 14, 'Эфир');
  } finally {
    sim.setGraph(before);
  }
});

test('офлайн 12 ч: формула и шаги совпадают и после часа игры', () => {
  [600, 3600, 3 * 3600].forEach((setup) => {
    const r = kit.offlineAgree(game, sim, cfg, setup, (state, ctx, s) => s.bot(state, ctx));
    assert.ok(r.diff <= 0.01, setup + ' с: ' + JSON.stringify(r));
  });
  // Cubes work offline at half speed, with the athanor at full; the store stops at its cap.
  const ctx = ctxOf(x, Date.UTC(2026, 10, 2, 8), Rng.make(3));
  const a = Core.newState(game, sim, ctx);
  a.meta.book['пар'] = 1;
  a.meta.bookN++;
  a.meta.opened['вода+огонь'] = 1;
  a.run.lv.water = 9;
  a.run.lv.shelves = 3;
  a.run.lv.fire = 9;
  a.run.cubes.push({ k: 'вода+огонь', p: 0, fire: 0 });
  const b = Core.clone(a);
  b.run.lv.athanor = 1;
  const off = ctxOf(x, ctx.now + 600000, Rng.make(1), { offline: true });
  for (let i = 0; i < 60; i++) {
    off.now += 10000;
    sim.tick(a, 10, off);
    sim.tick(b, 10, off);
  }
  assert.ok(b.run.cubeMade > a.run.cubeMade * 1.6, 'Атанор: ' + a.run.cubeMade + ' против ' + b.run.cubeMade);
  assert.ok(a.run.store['земля'] <= sim.capOf(a, cfg) + 1e-9, 'склад не выше предела');
  const rep = sim.offline(Core.clone(a), 3600, ctxOf(x, ctx.now + 4200000, Rng.make(1)));
  assert.ok(rep.events.some((e) => /Кубы/.test(e)), JSON.stringify(rep.events));
});

test('события раз в 4–8 минут игры и только при игроке', () => {
  const rng = Rng.make(8);
  let now = Date.UTC(2026, 10, 2, 8);
  const st = Core.newState(game, sim, ctxOf(x, now, rng));
  for (let i = 0; i < 20; i++) { const k = sim.tree().list[4 + i].key; st.meta.book[k] = 1; st.meta.bookN++; }
  st.run.cubes.push({ k: null, p: 0, fire: 0 });
  const seen = {};
  let n = 0;
  for (let s = 0; s < 4 * 3600; s++) {
    sim.tick(st, 1, ctxOf(x, now, rng));
    now += 1000;
    if (st.run.eventNo !== n) {
      n = st.run.eventNo;
      seen[st.run.event.id] = (seen[st.run.event.id] || 0) + 1;
    }
    if (st.run.event && st.run.event.id === 'fire' && st.run.event.until === 0) for (let f = 0; f < 3; f++) sim.tapFire(st, st.run.event.cube);
  }
  console.log('  событий за 4 часа: ' + n + ' ' + JSON.stringify(seen));
  assert.ok(n >= 4 * 60 / 8 - 1 && n <= 4 * 60 / 4 + 1, 'событий ' + n);
  const before = st.run.eventNo;
  sim.offline(st, 4 * 3600, ctxOf(x, now + 4 * HOUR, rng));
  assert.strictEqual(st.run.eventNo, before, 'офлайн без событий');
});

test('кубы, заказы, продажа, улучшения, трансмутация, лупа, свиток, Вдохновение', () => {
  const ctx = ctxOf(x, Date.UTC(2026, 10, 2, 8), Rng.make(3));
  const st = Core.newState(game, sim, ctx);
  const t = sim.tree();
  t.list.filter((e) => e.src === 'base' && e.tier <= 2).forEach((e) => { if (!st.meta.book[e.key]) { st.meta.book[e.key] = 1; st.meta.bookN++; } });
  st.run.ess = '1e7';
  assert.ok(sim.buy(st, cfg, 'cubes'));
  assert.ok(!sim.setCube(st, 0, 'камень+огонь'), 'на неоткрытый рецепт нельзя');
  st.meta.opened['камень+огонь'] = 1;
  assert.ok(sim.setCube(st, 0, 'камень+огонь'));
  st.run.store['камень'] = 10;
  st.run.store['огонь'] = 10;
  sim.tick(st, 60, ctx);
  assert.ok(st.run.store['металл'] >= 9, 'куб сделал металл: ' + st.run.store['металл']);
  // Orders: three cards from the opened, three times the value.
  assert.strictEqual(st.run.orders.filter((o) => o.k).length, 3);
  const ok = st.run.orders[0].k;
  st.run.store[ok] = 25;
  const ess = Big.of(st.run.ess);
  const reward = sim.deliver(st, cfg, 0, 1, ctx.now);
  assert.ok(Math.abs(reward - 3 * 20 * sim.value(st, cfg, ok, ctx.now)) < 1e-6 * reward, reward);
  assert.ok(Big.gt(st.run.ess, ess));
  assert.strictEqual(st.run.orders[0].k, null);
  assert.strictEqual(st.run.orders[0].at, ctx.now + 15 * MIN);
  // Selling with the shop.
  sim.buy(st, cfg, 'shop');
  st.run.store['пар'] = 10;
  const got = sim.sell(st, cfg, 'пар', 10, 1, ctx.now);
  assert.ok(Math.abs(Big.toNumber(got) - 10 * 2.2 * (1 + 0.01 * st.meta.bookN) * 1.08) < 1e-6);
  // Transmutation from the first stone.
  st.run.store['пар'] = 10;
  assert.ok(!sim.transmute(st, cfg, 'пар', 'лава').ok);
  st.meta.unlocks.transmute = true;
  assert.ok(sim.transmute(st, cfg, 'пар', 'лава').ok);
  // The loupe and the scroll.
  assert.ok(sim.buy(st, cfg, 'loupe'));
  assert.strictEqual(sim.useLoupe(st, ['вода', 'огонь'], ctx.now).state, 'recipe');
  assert.ok(!sim.useLoupe(st, ['вода', 'огонь'], ctx.now).ok, 'заряд один');
  sim.tick(st, 1, ctxOf(x, ctx.now + 16 * MIN, Rng.make(1)));
  assert.strictEqual(st.run.loupe.n, 1, 'заряд за 15 минут');
  assert.ok(sim.buy(st, cfg, 'scroll'));
  const h = sim.useHint(st, cfg, ctx.now);
  assert.ok(h.ok && h.ins.every((k) => st.meta.book[k]), JSON.stringify(h));
  assert.strictEqual(st.meta.hints, 1);
  st.run.insightUntil = ctx.now + 10 * MIN;
  assert.ok(Object.keys(sim.highlights(st, ctx.now)).length > 0);
  // Upgrades all have a price and a text.
  sim.upgradeList(st, cfg).forEach((u) => assert.ok(u.title && typeof u.text === 'string', u.id));
  assert.strictEqual(sim.upgradeList(st, cfg).length, 21, 'улучшений без слоёв');
});

test('слои камней: 25 — Эфир с источником, 250 — Великое делание, тинктура ×2', () => {
  const ctx = ctxOf(x, Date.UTC(2026, 10, 2, 8), Rng.make(3));
  const st = Core.newState(game, sim, ctx);
  sim.tree().list.filter((e) => e.src === 'base').slice(0, 50).forEach((e) => { if (!st.meta.book[e.key]) { st.meta.book[e.key] = 1; st.meta.bookN++; } });
  st.run.earned = '6.4e7';
  let r = Core.prestige(sim, game, st, 'stone', ctx);
  assert.strictEqual(Big.toNumber(r.gain), 25);
  assert.ok(st.meta.unlocks.ether && st.meta.book['эфир'] && st.run.store['эфир'] === cfg['start.amount']);
  assert.ok(sim.upgradeList(st, cfg).some((u) => u.id === 'ether'), 'источник Эфира');
  assert.ok(st.meta.unlocks.athanor, 'Атанор навсегда с 10');
  st.run.earned = '1e10';
  r = Core.prestige(sim, game, st, 'stone', ctx);
  assert.strictEqual(sim.stones(st), 341);
  assert.ok(st.meta.unlocks.triple && st.meta.unlocks.void && st.meta.unlocks.great);
  assert.ok(st.meta.book['пустота']);
  const income = sim.incomeRate(st, cfg);
  r = Core.prestige(sim, game, st, 'tincture', ctx);
  assert.ok(r.ok);
  assert.strictEqual(sim.tinctures(st), 1, 'floor(log2(341/125)) = 1');
  assert.strictEqual(sim.stones(st), 0, 'камни ушли в тинктуру');
  assert.ok(st.meta.unlocks.ether && st.meta.unlocks.great, 'слои остались');
  assert.ok(Math.abs(sim.power(st, cfg) - 2) < 1e-9, 'тинктура ×2');
  assert.ok(income > 0);
});

test('сохранение: туда и обратно, сводка, уведомления, предел офлайна от песочных часов', () => {
  const ctx = ctxOf(x, Date.UTC(2026, 10, 2, 8), Rng.make(3));
  const st = Core.newState(game, sim, ctx);
  for (let s = 0; s < 900; s++) {
    sim.bot(st, ctxOf(x, ctx.now + s * 1000, ctx.rng));
    sim.tick(st, 1, ctxOf(x, ctx.now + s * 1000 + 1000, ctx.rng));
  }
  const picked = Core.pick([{ json: JSON.stringify(st), seq: 1, source: 'test' }], game, sim);
  assert.ok(picked.state, JSON.stringify(picked.broken));
  assert.ok(/Книга \d+/.test(Core.card(sim, st, cfg)));
  st.run.lv.clerk = 0;
  const ev = sim.next(st, ctx.now + 900000, cfg);
  assert.ok(ev.every((e) => e.at >= ctx.now + 900000 && e.text), JSON.stringify(ev));
  st.run.ess = '1e9';
  sim.buy(st, cfg, 'glass');
  assert.strictEqual(sim.capBonusHours(st), cfg['glass.hours']);
  assert.strictEqual(sim.procedural('pairs', Rng.make(1)), null, 'без модели рецептов не придумывает');
});

done('Алхимик: экономика');
