'use strict';
const assert = require('assert');
const { load, test, done } = require('./support');
const x = load();
process.on('exit', () => x.env.close());
const { game, sim, cfg, bot, Core, Big, Rng } = x;

test('первый и следующий прыжки в заданных окнах на штатном конфиге', () => {
  const first = bot.colony(game, sim, cfg, 120, { seed: 7, stopAtEngine: true });
  assert.ok(first.firstBuySec <= 10);
  assert.ok(first.tier3Min !== null && first.tier3Min <= 5);
  assert.ok(first.tier8Min !== null && first.tier8Min <= 30);
  assert.ok(first.engineMin >= 90 && first.engineMin <= 120, 'первый двигатель: '+first.engineMin);
  const gain = sim.prestigeGain(first.state, 'jump', cfg);
  assert.ok(Core.prestige(sim,game,first.state,'jump',bot.ctxOf(cfg,Rng.make(7),first.now)).ok);
  sim.playMeta(first.state,cfg);
  const second = bot.colony(game,sim,cfg,60,{state:first.state,now:first.now,seed:7,stopAtEngine:true});
  assert.ok(second.engineMin !== null && second.engineMin >= 40 && second.engineMin <= 60,'второй двигатель: '+second.engineMin);
  assert.strictEqual(sim.validate(second.state),null);
  console.log('  баланс:',JSON.stringify({ firstBuySec:first.firstBuySec,firstSmelterMin:first.firstSmelterMin,firstExpeditionMin:first.firstExpeditionMin,tier3Min:first.tier3Min,tier8Min:first.tier8Min,firstEngineMin:first.engineMin,firstJumpDM:Big.str(gain),secondEngineMin:second.engineMin,oreRates:first.ore }));
});

test('три дня по две поездки: прогресс сохраняется, прыжок достигается за 3–6 поездок', () => {
  const result=bot.trips(game,sim,cfg,{});
  assert.ok(result.firstBuySec<=10);
  assert.ok(result.jumps.length>0,'прыжков нет');
  assert.ok(result.jumps[0].trip>=3 && result.jumps[0].trip<=6,'поездка '+result.jumps[0].trip);
  assert.strictEqual(sim.validate(result.state),null);
  console.log('  поездки:',JSON.stringify(result.jumps));
});

done('balance asteroid-colony');

