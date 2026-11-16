// node tests/offline.test.js — «Словоплёт» away from the screen: the formula of sim.offline against
// the same hours second by second (the tax, the Mill, the hint charges, the fire tower), the cap of
// 12 hours, the clock turned back, and the saved game of fixtures/v1.json read back and played on.
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./env.js');
const x = T.open();
const { Core, Big, Rng, sim, game, cfg } = x;
const Lex = x.env.require('modules/games/word-weaver/lexicon.js');
const Bot = x.env.require('modules/games/word-weaver/bot.js');
const lex = Lex.parse(x.env.files.read('data/games/word-weaver/assets/dict.txt'));

const HOUR = 3600000;
const NOW = Date.UTC(2026, 10, 14, 7, 0, 0);
const ctxOf = (now, o) => Object.assign({ now, config: cfg, rng: Rng.make(1), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 }, o || {});

/** sim without offline: the engine then runs tick second by second (offline: true in ctx). */
const steps = {};
Object.keys(sim).forEach((k) => { if (k !== 'offline') steps[k] = sim[k]; });

function compare(state, hours) {
  const a = Core.clone(state);
  const b = Core.clone(state);
  const p = Core.plan(state.lastTick, state.lastTick + hours * HOUR, cfg, 0);
  const ra = Core.runOffline(sim, a, game, p, null, (seg) => ctxOf(seg.to), cfg);
  Core.runOffline(steps, b, game, p, null, (seg) => ctxOf(seg.to), cfg);
  const va = Big.toNumber(Big.of(a.run.bricks));
  const vb = Big.toNumber(Big.of(b.run.bricks));
  return { a, b, ra, diff: Math.abs(va - vb) / Math.max(1, Math.abs(va), Math.abs(vb)), va, vb };
}

T.test('kit.offlineAgree: формула и посекундный счёт сходятся', () => {
  const play = Bot.make(lex, { every: 10 }).play;
  const r = x.kit.offlineAgree(game, sim, cfg, 300, play);
  console.log('  12 ч без игры после 5 мин: формула ' + r.formula + ', по секундам ' + r.steps + ', расхождение ' + (r.diff * 100).toFixed(4) + ' %');
  if (!(r.diff <= 0.01)) throw new Error('расхождение ' + r.diff);
  if (Big.isZero(Big.of(r.formula))) throw new Error('за 12 часов ничего не набежало');
});

T.test('Мельница, Фонарщик, Глашатай, Каланча: так же, как по секундам', () => {
  const state = Core.newState(game, sim, ctxOf(NOW));
  Object.assign(state.run.b, { izba: 6, stone: 0, mill: 1, lamp: 3, herald: 2, tower: 2, market: 3 });
  state.run.hints.lamp = 0;
  state.run.hints.herald = 0;
  sim.tick(state, 1, ctxOf(NOW));
  state.lastTick = NOW;
  const c = compare(state, 10);
  console.log('  10 ч с Мельницей: формула ' + c.va.toFixed(1) + ', по секундам ' + c.vb.toFixed(1) + ' (' + (c.diff * 100).toFixed(4) + ' %)');
  if (c.diff > 0.001) throw new Error('кирпичи расходятся');
  ['lamp', 'herald'].forEach((k) => {
    if (c.a.run.hints[k] !== c.b.run.hints[k]) throw new Error(k + ': ' + c.a.run.hints[k] + ' и ' + c.b.run.hints[k]);
    if (c.a.run.hints[k] !== sim.lvl(state, k)) throw new Error(k + ' не набрал зарядов');
  });
  if (!c.a.run.towerReady || !c.b.run.towerReady) throw new Error('Каланча не готова');
  const tax = sim.taxPerSec(state, cfg) * 10 * 3600;
  if (Math.abs(c.va - Big.toNumber(Big.of(state.run.bricks)) - tax) > 1e-6 * tax) throw new Error('с Мельницей налог не весь');
  if (!c.ra.events || !c.ra.events.length) console.log('  (отчёт без строк)');
});

T.test('без Мельницы — половина налога; потолок 12 часов', () => {
  const state = Core.newState(game, sim, ctxOf(NOW));
  state.run.b.izba = 6;
  state.lastTick = NOW;
  const twelve = compare(state, 12);
  const thirty = compare(state, 30);
  const want = Big.toNumber(Big.of(state.run.bricks)) + sim.taxPerSec(state, cfg) * 12 * 3600 * cfg['offline.share'];
  if (Math.abs(twelve.va - want) > 1e-6) throw new Error('12 ч: ' + twelve.va + ' вместо ' + want);
  if (Math.abs(thirty.va - twelve.va) > 1e-6) throw new Error('30 ч дали больше 12: ' + thirty.va);
});

T.test('часы назад: ничего не начисляется', () => {
  const state = Core.newState(game, sim, ctxOf(NOW));
  state.run.b.izba = 6;
  state.lastTick = NOW;
  const p = Core.plan(NOW, NOW - 2 * HOUR, cfg, 0);
  if (!p.clockBack || p.creditedMs !== 0) throw new Error('план ' + JSON.stringify(p));
  const before = Big.str(Big.of(state.run.bricks));
  Core.runOffline(sim, state, game, p, null, (seg) => ctxOf(seg.to), cfg);
  if (Big.str(Big.of(state.run.bricks)) !== before) throw new Error('начислено');
});

T.test('fixtures/v1.json: читается, цел, играется дальше', () => {
  const json = fs.readFileSync(path.join(T.GAME_DIR, 'fixtures', 'v1.json'), 'utf8');
  const picked = Core.pick([{ json, seq: 1, source: 'fixture' }], game, sim);
  if (!picked.state) throw new Error('не читается: ' + JSON.stringify(picked.broken));
  const state = picked.state;
  const err = Core.validate(state, game) || sim.validate(state);
  if (err) throw new Error(err);
  const set = sim.current(state);
  if (!set || !set.found.length) throw new Error('нет начатого набора');
  if (!state.meta.pending.length) throw new Error('нет слова в очереди «Нет в словаре?»');
  console.log('  сохранение: ' + state.card + '; кварталы ' + state.run.quarters.join(', '));
  const p = Core.plan(state.lastTick, state.lastTick + 8 * HOUR, cfg, 0);
  Core.runOffline(sim, state, game, p, null, (seg) => ctxOf(seg.to), cfg);
  const k = sim.setWords(state, cfg, lex, set).common.filter((w) => set.found.indexOf(w) < 0)[0];
  const r = sim.submit(state, cfg, lex, k, p.to, 1);
  if (!r.ok) throw new Error('слово «' + k + '» не принято: ' + r.why);
  const again = JSON.parse(JSON.stringify(state));
  if (Core.validate(again, game) || sim.validate(again)) throw new Error('после игры сохранение испорчено');
  if (/NaN|Infinity/.test(JSON.stringify(again).replace(/"[^"]*"/g, '""'))) throw new Error('NaN в сохранении');
});

T.done('offline');
