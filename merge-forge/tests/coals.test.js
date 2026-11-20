// Coals for every run: whole above the record, coals.repeatShare below it; the «выгодно» mark; a save
// of this version that predates a new field still loads.  node tests/coals.test.js
'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open();
const S = x.sim, cfg = x.cfg, B = x.Big, Core = x.Core;
const NOW = Date.UTC(2026, 10, 20, 15);
function fresh(seed) {
  const rng = x.Rng.make(seed || 31);
  const state = Core.newState(x.game, S, ctxOf(x, NOW, rng));
  S.ensure(state);
  return { state, rng };
}
// The owner's forge on 2026-11-20: record 106, 63 coals, 59 of them in the tree.
function veteran() {
  const f = fresh();
  const l = f.state.layers.forge;
  l.currency = '4e0';
  Object.assign(l.state, { paid: S.coalsFor(cfg, 106), total: 63, spent: 59, record: 106 });
  return f;
}

test('за волны выше рекорда — целиком, за пройденные — половина', () => {
  assert.strictEqual(cfg['coals.repeatShare'], 0.5);
  assert.strictEqual(S.coalsPay(cfg, 0, 0), 0);
  assert.strictEqual(S.coalsPay(cfg, 4, 0), 4, 'первая перековка — целиком');
  assert.strictEqual(S.coalsPay(cfg, 4, 4), 2, 'тот же рекорд — половина');
  assert.strictEqual(S.coalsPay(cfg, 51, 4), 49, '47 сверху и 2 за пройденное');
  assert.strictEqual(S.coalsPay(cfg, 37, 63), 18, 'забег до 92-й при рекорде 106');
  assert.strictEqual(S.coalsPay(Object.assign({}, cfg, { 'coals.repeatShare': 0 }), 37, 63), 0, 'доля 0 — прежнее правило');
  assert.strictEqual(S.coalsPay(Object.assign({}, cfg, { 'coals.repeatShare': 0 }), 51, 4), 47);
});

test('перековка ниже рекорда приносит угли, рекорд и оплаченное не трогает', () => {
  const { state, rng } = veteran();
  state.run.maxWave = 92;
  assert.strictEqual(B.toNumber(S.prestigeGain(state, 'forge', cfg)), 18);
  const r = Core.prestige(S, x.game, state, 'forge', ctxOf(x, NOW, rng));
  assert.ok(r.ok);
  const l = state.layers.forge;
  assert.strictEqual(B.toNumber(B.of(l.currency)), 22);
  assert.strictEqual(l.state.total, 81);
  assert.strictEqual(l.state.paid, S.coalsFor(cfg, 106));
  assert.strictEqual(l.state.record, 106);
  assert.strictEqual(S.coalsAll(state), 81);
  assert.ok(Math.abs(S.coalBonus(state, cfg) - (1 + 0.1 * 81)) < 1e-9, 'уголь +10 %');
});

test('«выгодно»: первая перековка — сразу, дальше — когда углей прибавится на половину', () => {
  const first = fresh().state;
  first.run.maxWave = 60;
  const a = Core.prestigeInfo(S, x.game, first, 'forge', cfg);
  assert.ok(a.can && a.hint);
  const { state } = veteran();
  state.run.maxWave = 62;
  let info = Core.prestigeInfo(S, x.game, state, 'forge', cfg);
  assert.ok(info.can, 'перековка возможна');
  assert.strictEqual(info.hint, false, 'пара углей у 60-й волны — не повод');
  state.run.maxWave = 106;
  info = Core.prestigeInfo(S, x.game, state, 'forge', cfg);
  assert.strictEqual(B.toNumber(info.gain), 31);
  assert.strictEqual(info.hint, false, 'на самом рекорде — меньше половины');
  state.run.maxWave = 115;
  info = Core.prestigeInfo(S, x.game, state, 'forge', cfg);
  assert.ok(B.toNumber(info.gain) >= 32 && info.hint, 'рекорд 115: ' + B.str(info.gain));
  assert.strictEqual(S.prestigeHint(state, 'star', cfg, info), null, 'звёздный металл — как у движка');
});

test('сохранение этой же версии без поля, появившегося позже, читается, а не откатывается', () => {
  const { state } = fresh(7);
  state.run.maxWave = 70;
  state.layers.forge.state.total = 11;
  delete state.run.outpost.dragon.eaten;
  const older = fresh(8).state;
  older.run.maxWave = 61;
  const picked = Core.pick([{ json: JSON.stringify(state), seq: 2638 }, { json: JSON.stringify(older), seq: 1543 }], x.game, S);
  assert.ok(picked.state, JSON.stringify(picked.broken));
  assert.deepStrictEqual(picked.broken, []);
  assert.strictEqual(picked.state.run.maxWave, 70);
  assert.strictEqual(picked.state.run.outpost.dragon.eaten, 0);
  // A value that is really wrong is still caught.
  const bad = fresh(9).state;
  bad.run.outpost.dragon.eaten = -1;
  assert.strictEqual(S.validate(bad), 'кормление повреждено');
});

done('coals');
