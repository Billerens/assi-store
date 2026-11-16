// The rules of «Пасьянс-рогалик» in node: matching, the chain and gold, the deck, candles at the
// end of a deal, relics, seals, curses, hosts, undo, the shop, the result, a save round trip.
// node tests/sim.test.js
'use strict';
const assert = require('assert');
const E = require('./env.js');
const { sim, cfg, Core, Rng, game } = E.setup();

let nextId = 1000;
const card = (r, s, open, extra) => Object.assign({ i: nextId++, r, s: s || 0, u: open ? 1 : 0 }, extra || {});

/** A run in play whose deal has exactly these columns, deck (last card is drawn first) and pile top. */
function fixed(cols, deck, top, o) {
  o = o || {};
  const state = Core.newState(game, sim, { now: 0, config: cfg, rng: Rng.make(1) });
  sim.newRun(state, cfg, { seed: 11, deck: 'normal', night: 0 });
  const run = state.run;
  run.relics = (o.relics || []).slice();
  const d = run.deal;
  d.m = sim.mods(run, cfg, o.hosts || [], null);
  d.hosts = o.hosts || [];
  d.cols = cols;
  d.deck = deck;
  d.pile = [top];
  d.undos = o.undos || 0;
  d.chain = 0;
  d.kings = 0;
  d.glance = false;
  d.pocket = [];
  if (o.candles !== undefined) run.candles = o.candles;
  return state;
}

E.test('по значению: на единицу старше или младше, масть не важна; король и туз не соседи', () => {
  const m = sim.mods({ deck: 'normal', relics: [], night: 0 }, cfg, [], null);
  assert.ok(sim.match(card(7, 0), card(8, 3), m).ok);
  assert.ok(sim.match(card(7, 0), card(6, 1), m).ok);
  assert.ok(!sim.match(card(7, 0), card(9, 0), m).ok);
  assert.ok(!sim.match(card(13, 0), card(1, 0), m).ok);
  const moon = sim.mods({ deck: 'normal', relics: ['moon'], night: 0 }, cfg, [], null);
  assert.ok(sim.match(card(13, 0), card(1, 0), moon).ok, 'Лунный круг');
  const lunar = sim.mods({ deck: 'lunar', relics: [], night: 0 }, cfg, [], null);
  assert.ok(sim.match(card(1, 0), card(13, 2), lunar).ok, 'Лунная колода');
  assert.ok(sim.match(card(5, 0), card(0, -1, true, { j: 1 }), m).ok, 'джокер подходит ко всему');
});

E.test('ход: карта уходит в стопку, цепочка растёт, золото 1 + цепочка/3, под ней открывается следующая', () => {
  const under = card(9, 1, false);
  const s = fixed([[under, card(8, 0, true)], [card(7, 2, true)]], [card(2, 0)], card(6, 0, true));
  let r = sim.play(s, cfg, 1);
  assert.ok(r.ok);
  assert.strictEqual(s.run.deal.chain, 1);
  assert.strictEqual(r.gold, cfg['gold.perCard']);
  r = sim.play(s, cfg, 0);
  assert.ok(r.ok);
  assert.strictEqual(s.run.deal.chain, 2);
  assert.strictEqual(under.u, 1, 'закрытая карта под сыгранной открылась');
  r = sim.play(s, cfg, 0);
  assert.strictEqual(s.run.deal.chain, 3);
  assert.strictEqual(r.gold, cfg['gold.perCard'] + Math.floor(3 / cfg['gold.chainStep']));
  assert.ok(!sim.play(s, cfg, 0).ok, 'пустой столбец');
});

E.test('не подходит — отказ без изменений; колода обрывает цепочку', () => {
  const s = fixed([[card(3, 0, true)], [card(7, 0, true)]], [card(10, 0), card(5, 0)], card(6, 0, true));
  const before = JSON.stringify(s.run);
  const no = sim.play(s, cfg, 0);
  assert.ok(!no.ok && no.why);
  assert.strictEqual(JSON.stringify(s.run), before);
  sim.play(s, cfg, 1);
  assert.strictEqual(s.run.deal.chain, 1);
  const r = sim.draw(s, cfg);
  assert.ok(r.ok && r.drew);
  assert.strictEqual(s.run.deal.chain, 0);
  assert.strictEqual(sim.topOf(s.run.deal).r, 5);
});

E.test('Длинный фитиль: первый раз за расклад колода не обрывает цепочку', () => {
  const s = fixed([[card(7, 0, true)], [card(12, 0, true)]], [card(10, 0), card(2, 0), card(3, 0)], card(6, 0, true), { relics: ['wick'] });
  sim.play(s, cfg, 0);
  sim.draw(s, cfg);
  assert.strictEqual(s.run.deal.chain, 1);
  sim.draw(s, cfg);
  assert.strictEqual(s.run.deal.chain, 0);
});

E.test('конец расклада: каждая оставшаяся карта гасит свечу; пустой стол даёт свечу и золото за колоду', () => {
  const s = fixed([[card(2, 0, true)], [card(11, 0, true)]], [], card(6, 0, true), { candles: 10 });
  const r = sim.giveUp(s, cfg);
  assert.ok(r.ok);
  assert.strictEqual(s.run.candles, 10 - 2 * cfg['candles.leftover']);
  assert.strictEqual(s.run.phase, 'shop');
  const c = fixed([[card(7, 0, true)]], [card(2, 0), card(3, 0)], card(6, 0, true), { candles: 10 });
  const goldBefore = c.run.gold;
  const p = sim.play(c, cfg, 0);
  assert.ok(p.clear, 'пустой стол');
  assert.strictEqual(c.run.candles, 10 + cfg['candles.clear']);
  assert.ok(c.run.gold - goldBefore >= p.gold + 2 * cfg['gold.deckLeft'], 'золото за остаток колоды');
});

E.test('свечи кончились — забег проигран, воск за сделанное', () => {
  const s = fixed([[card(2, 0, true)], [card(11, 0, true)], [card(4, 0, true)]], [], card(9, 0, true), { candles: 2 });
  sim.giveUp(s, cfg);
  assert.strictEqual(s.run.phase, 'over');
  const r = sim.settle(s, cfg, 1);
  assert.ok(r.ok);
  assert.strictEqual(s.run.result.won, false);
  assert.ok(sim.waxOf(s.meta) >= 0);
  assert.ok(!sim.settle(s, cfg, 1).ok, 'воск платится один раз');
});

E.test('отмена: возвращает стол, стопку, золото; отмен ограничено', () => {
  const s = fixed([[card(7, 0, true)], [card(8, 0, true)]], [card(2, 0)], card(6, 0, true), { undos: 1 });
  const before = JSON.stringify({ cols: s.run.deal.cols, pile: s.run.deal.pile, gold: s.run.gold });
  sim.play(s, cfg, 0);
  assert.ok(sim.undo(s, cfg).ok);
  assert.strictEqual(JSON.stringify({ cols: s.run.deal.cols, pile: s.run.deal.pile, gold: s.run.gold }), before);
  sim.play(s, cfg, 0);
  assert.ok(!sim.undo(s, cfg).ok, 'вторая отмена — нет');
});

E.test('проклятия: камень не играется, колючка гасит свечу, замок ждёт цепочку', () => {
  const stone = card(0, -1, true, { c: 'stone' });
  const s = fixed([[stone], [card(7, 0, true, { c: 'thorn' })], [card(8, 0, true, { c: 'lock' })]], [card(1, 0)], card(6, 0, true), { candles: 10 });
  assert.ok(!sim.play(s, cfg, 0).ok, 'камень');
  assert.ok(!sim.play(s, cfg, 2).ok || cfg['curse.lock.chain'] <= 1, 'замок до цепочки');
  const r = sim.play(s, cfg, 1);
  assert.ok(r.ok && r.thorn, 'колючка');
  assert.strictEqual(s.run.candles, 9);
});

E.test('печати: золотая даёт золото, восковая — свечу', () => {
  const s = fixed([[card(7, 0, true, { se: 'gold' })], [card(8, 0, true, { se: 'wax' })], [card(12, 0, true)]], [card(1, 0)], card(6, 0, true), { candles: 5 });
  const r = sim.play(s, cfg, 0);
  assert.strictEqual(r.gold, cfg['gold.perCard'] + cfg['seal.gold']);
  const w = sim.play(s, cfg, 1);
  assert.ok(w.wax);
  assert.strictEqual(s.run.candles, 6);
});

E.test('хозяева: Сторож тузов не пускает туза до королей; Зеркальщица чередует направление', () => {
  const g = fixed([[card(1, 0, true)], [card(5, 0, true)]], [card(9, 0)], card(2, 0, true), { hosts: ['guard'] });
  assert.ok(!sim.play(g, cfg, 0).ok);
  const m = fixed([[card(8, 0, true)], [card(9, 0, true)], [card(7, 0, true)]], [card(1, 0)], card(7, 1, true), { hosts: ['mirror'] });
  assert.ok(sim.play(m, cfg, 0).ok, 'вверх');
  assert.ok(!sim.play(m, cfg, 1).ok, 'вверх ещё раз — нет');
  assert.ok(sim.play(m, cfg, 2).ok, 'вниз');
});

E.test('реликвии: Тузы куда угодно, Двойной шаг, Ровный счёт', () => {
  const a = sim.mods({ deck: 'normal', relics: ['aces'], night: 0 }, cfg, [], null);
  assert.ok(sim.match(card(1, 0), card(9, 0), a).ok);
  const d2 = sim.mods({ deck: 'normal', relics: ['double'], night: 0 }, cfg, [], null);
  assert.strictEqual(sim.match(card(5, 0), card(7, 0), d2).ok, 2, 'шаг через одну, цепочка не растёт');
  const p = sim.mods({ deck: 'normal', relics: ['parity'], night: 0 }, cfg, [], null);
  assert.ok(sim.match(card(4, 0), card(10, 0), p).ok);
  assert.ok(!sim.match(card(4, 0), card(9, 0), p).ok);
});

E.test('лавка: покупка за золото, повторно нельзя, без золота нельзя', () => {
  const s = fixed([[card(2, 0, true)]], [], card(9, 0, true), { candles: 10 });
  sim.giveUp(s, cfg);
  assert.strictEqual(s.run.phase, 'shop');
  s.run.gold = 0;
  assert.ok(!sim.buyRelic(s, cfg, 0).ok);
  s.run.gold = 500;
  const r = sim.buyRelic(s, cfg, 0);
  assert.ok(r.ok);
  assert.ok(s.run.relics.indexOf(r.relic) >= 0);
  assert.ok(!sim.buyRelic(s, cfg, 0).ok);
  const c = s.run.candles;
  assert.ok(sim.buyCandle(s, cfg).ok);
  assert.strictEqual(s.run.candles, c + 1);
  assert.ok(sim.nextDeal(s, cfg).ok);
  assert.strictEqual(s.run.phase, 'play');
});

E.test('мастерская: цена растёт, предел соблюдается, воск списывается', () => {
  const st = Core.newState(game, sim, { now: 0, config: cfg, rng: Rng.make(1) });
  st.meta.wax = 100000;
  const max = cfg['ws.wick.max'];
  for (let i = 0; i < max; i++) {
    const before = sim.waxOf(st.meta);
    const cost = sim.upgradeCost(st, cfg, 'wick');
    assert.ok(sim.buyUpgrade(st, cfg, 'wick').ok);
    assert.strictEqual(before - sim.waxOf(st.meta), cost);
  }
  assert.ok(!sim.buyUpgrade(st, cfg, 'wick').ok);
});

E.test('целый забег ботом, сохранение туда и обратно, нигде нет NaN', () => {
  const bot = require('../bot.js');
  for (let seed = 1; seed <= 6; seed++) {
    const st = Core.newState(game, sim, { now: 0, config: cfg, rng: Rng.make(seed) });
    const r = bot.playRun(st, sim, cfg, { smart: seed % 2 === 0, seed });
    assert.ok(r.deals >= 1);
    const json = JSON.stringify(st);
    assert.ok(json.indexOf('NaN') < 0 && json.indexOf('null,"gold"') < 0);
    assert.strictEqual(sim.validate(st), null);
    assert.strictEqual(Core.validate(st, game), null);
    const back = Core.pick([{ json, seq: 1, source: 'test' }], game, sim);
    assert.ok(back.state);
  }
});

E.test('расклад дня: одно зерно — один стол', () => {
  const a = Core.newState(game, sim, { now: 0, config: cfg, rng: Rng.make(1) });
  const b = Core.newState(game, sim, { now: 0, config: cfg, rng: Rng.make(2) });
  sim.newRun(a, cfg, { mode: 'daily', day: '2026-11-14' });
  sim.newRun(b, cfg, { mode: 'daily', day: '2026-11-14' });
  assert.strictEqual(JSON.stringify(a.run.deal.cols), JSON.stringify(b.run.deal.cols));
  assert.strictEqual(a.run.dailyRule.title, b.run.dailyRule.title);
});

E.done('sim ' + E.ID);
