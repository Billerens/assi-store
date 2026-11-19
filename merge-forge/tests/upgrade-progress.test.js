'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');
const x = open(), S = x.sim, O = S.outpost, NOW = Date.UTC(2026, 10, 16, 9);
const SUPPORTED = ['sharp', 'purse', 'hand', 'twin', 'temper', 'runePower', 'hunter', 'hourglass', 'cry', 'banner', 'caravan', 'hammer', 'stall'];
function fresh() { const rng=x.Rng.make(57), state=x.Core.newState(x.game,S,ctxOf(x,NOW,rng));S.ensure(state);return {state,rng}; }
const MECHANIC = ['twin', 'hourglass', 'caravan', 'hammer'];
// What the milestones multiply an upgrade by at level n, by the game's own settings (milestone.*).
function milestone(id, n) {
  const c = x.cfg, mech = MECHANIC.includes(id);
  const all = Math.floor(n / c['milestone.every']), big = Math.floor(n / c['milestone.bigEvery']);
  return Math.pow(c[mech ? 'milestone.mechMult' : 'milestone.mult'], all - big) * Math.pow(c[mech ? 'milestone.mechBigMult' : 'milestone.bigMult'], big);
}
function close(a,b,message) { assert.ok(Math.abs(a-b)<1e-10*Math.max(1,Math.abs(b)),message||`${a} != ${b}`); }

test('рубежи каждые 25 уровней: ×1.5, на сотых ×2; у механических ×1.2 и ×1.4', () => {
  const {state}=fresh();
  assert.strictEqual(x.cfg['milestone.every'], 25);assert.strictEqual(x.cfg['milestone.mult'], 1.5);assert.strictEqual(x.cfg['milestone.bigMult'], 2);
  for (const [before,at,big] of [[24,25,false],[49,50,false],[99,100,true],[190,200,true]]) {
    const a=S.upgradeProgress(state,x.cfg,'sharp',before), b=S.upgradeProgress(state,x.cfg,'sharp',at);
    assert.strictEqual(a.nextAt,at);assert.strictEqual(a.nextBig,big);assert.strictEqual(a.nextMult,big?2:1.5);
    close(b.milestone/a.milestone,big?2:1.5);
    assert.ok(b.factor>a.factor*1.4);assert.ok(b.effective>at);
  }
  close(S.upgradeProgress(state,x.cfg,'sharp',24).factor,1+0.04*24/124);
  close(S.upgradeProgress(state,x.cfg,'sharp',25).factor,(1+0.04*25/125)*1.5);
  close(S.upgradeProgress(state,x.cfg,'sharp',50).factor,(1+0.04*50/150)*2.25);
  close(S.upgradeProgress(state,x.cfg,'sharp',100).factor,(1+0.04*100/200)*1.5*1.5*1.5*2);
  close(S.upgradeProgress(state,x.cfg,'twin',100).factor,(1+0.04*100/200)*1.2*1.2*1.2*1.4);
  assert.strictEqual(S.upgradeProgress(state,x.cfg,'sharp',100).nextAt,125);
  // A milestone is felt: the damage of Острота grows by a third at 25, doubles by 50 against the levels alone.
  const dmg=(n)=>1+x.cfg['up.sharp.step']*S.upgradeEffective(state,x.cfg,'sharp',n);
  assert.ok(dmg(25)/dmg(24)>1.3);assert.ok(dmg(50)/(1+x.cfg['up.sharp.step']*50)>1.9);
  // The settings are the game's: a multiplier of 1 switches the milestones off.
  const kept=x.cfg['milestone.mult'];x.cfg['milestone.mult']=1;
  assert.strictEqual(S.upgradeProgress(state,x.cfg,'sharp',50).milestone,1);x.cfg['milestone.mult']=kept;
});

test('особые свойства открываются на 50-м и 100-м уровнях и складываются по видам', () => {
  const {state}=fresh();
  const U=require('../upgrade-progress.js');
  for (const id of SUPPORTED) {
    const p=S.upgradeProgress(state,x.cfg,id,49);
    assert.strictEqual(p.perks.length,2,id);assert.deepStrictEqual(p.perks.map(q=>q.at),[50,100]);
    assert.ok(p.perks.every(q=>!q.on));assert.strictEqual(p.nextPerk.at,50);
    assert.ok(S.upgradeProgress(state,x.cfg,id,50).perks[0].on);assert.strictEqual(S.upgradeProgress(state,x.cfg,id,100).nextPerk,null);
    for (const q of p.perks) assert.strictEqual(q.value,x.cfg['perk.'+id+'.'+q.at],id+' '+q.at+' — из настроек');
  }
  const none=U.perkTotals({},x.cfg);
  assert.strictEqual(none.dmg,1);assert.strictEqual(none.critChance,0);assert.strictEqual(none.bossTime,0);
  const all={};SUPPORTED.forEach(id=>all[id]=100);
  const sum=U.perkTotals(all,x.cfg);
  close(sum.critChance,x.cfg['perk.sharp.50']+x.cfg['perk.hand.50']);
  close(sum.bossTime,x.cfg['perk.runePower.50']+x.cfg['perk.hourglass.50']);
  close(sum.dmg,x.cfg['perk.temper.100']*x.cfg['perk.runePower.100']*x.cfg['perk.cry.50']*x.cfg['perk.banner.100']);
  close(sum.bossDmg,x.cfg['perk.sharp.100']*x.cfg['perk.temper.50']*x.cfg['perk.hourglass.100']);
  // A purchase across a milestone names what it opened.
  assert.deepStrictEqual(U.crossed('sharp',49,50,x.cfg).map(c=>[c.at,c.mult,c.perk&&c.perk.kind]),[[50,1.5,'critChance']]);
  assert.deepStrictEqual(U.crossed('sharp',90,130,x.cfg).map(c=>[c.at,c.mult]),[[100,2],[125,1.5]]);
  assert.deepStrictEqual(U.crossed('steel',0,100,x.cfg),[]);
});

test('рубежи растут без границ, но числа остаются конечными', () => {
  const {state}=fresh();
  for (const id of SUPPORTED) {
    let previous=0;
    for (const n of [0,1,2,24,25,26,49,50,99,100,101,190,200,1000,10000,1e12,1e300,Number.MAX_VALUE]) {
      const p=S.upgradeProgress(state,x.cfg,id,n);
      assert.strictEqual(p.supported,true);assert.ok(Number.isFinite(p.factor));assert.ok(p.factor>=1);
      assert.ok(Number.isFinite(p.effective));assert.ok(p.effective>=previous);previous=p.effective;
      close(p.nextEffective,S.upgradeEffective(state,x.cfg,id,n+1));
    }
    assert.ok(S.upgradeProgress(state,x.cfg,id,12).factor>S.upgradeProgress(state,x.cfg,id,11).factor);
    close(S.upgradeProgress(state,x.cfg,id,100).milestone,milestone(id,100));
  }
});

test('вклад мягких улучшений остаётся логарифмическим до общего бонуса', () => {
  const {state}=fresh();
  for(const id of ['caravan','hammer','stall']) {
    const knee=x.cfg['up.'+id+'.soft'],p=S.upgradeProgress(state,x.cfg,id,100);
    close(p.effective/p.factor,knee*(1+Math.log(100/knee)));
    assert.ok(p.effective/p.factor<100);
  }
});

test('просмотр и повторная загрузка не меняют уровни, валюты и стоимость', () => {
  const {state}=fresh();state.run.up.sharp=49;state.run.gold='1e10';
  const before=JSON.stringify(state),cost=S.upCost(state,x.cfg,'sharp');
  for(let i=0;i<5;i++)S.upgradeProgress(state,x.cfg,'sharp');
  assert.strictEqual(JSON.stringify(state),before);
  const reloaded=JSON.parse(before);assert.deepStrictEqual(S.upgradeProgress(reloaded,x.cfg,'sharp'),S.upgradeProgress(state,x.cfg,'sharp'));
  assert.strictEqual(x.Big.str(S.upCost(reloaded,x.cfg,'sharp')),x.Big.str(cost));
  assert.ok(S.buyUp(state,x.cfg,'sharp'));assert.strictEqual(state.run.up.sharp,50);
  assert.strictEqual(x.Big.str(state.run.gold),x.Big.str(x.Big.sub(reloaded.run.gold,cost)));
  const after=JSON.stringify(state);S.upgradeProgress(state,x.cfg,'sharp');assert.strictEqual(JSON.stringify(state),after);
  assert.strictEqual(state.ver,3);
});

test('пределы, слоты и экспоненциальные уровни клинка не усилены вехами', () => {
  const {state}=fresh();state.run.maxWave=100;
  for(const id of ['steel','melt','wide','runeMason','eye','night','remelt','bellows','apprentice']) {
    const before=S.upMax(state,x.cfg,id);state.run.up[id]=1000;
    const p=S.upgradeProgress(state,x.cfg,id);
    assert.strictEqual(p.supported,false);assert.strictEqual(p.factor,1);assert.strictEqual(p.effective,1000);assert.strictEqual(p.nextAt,null);
    assert.strictEqual(S.upMax(state,x.cfg,id),before);
  }
  assert.strictEqual(S.openCells(state,x.cfg).length,35);assert.ok(S.socketCount(state,x.cfg)<=7);
  assert.strictEqual(S.critChance(state,x.cfg),x.cfg['crit.maxChance']);assert.strictEqual(S.offlineShare(state,x.cfg),1);assert.strictEqual(S.sellShare(state,x.cfg),1);
  assert.strictEqual(S.forgeInterval(state,x.cfg,NOW),x.cfg['forge.minInterval']);assert.strictEqual(S.apprenticeInterval(state,x.cfg),x.cfg['apprentice.minInterval']);
  assert.strictEqual(S.forgeLevel(state,x.cfg),x.cfg['forge.maxLevel']);
});

test('герой получает ту же усиленную закалку и средний крит, что клинок на поле', () => {
  const {state}=fresh();state.run.maxWave=100;state.run.grid.fill(0);state.run.grid[0]=20;
  state.run.up.temper=100;state.run.up.hand=50;state.run.up.eye=3;
  const expected=x.Big.mul(S.cellPower(state,x.cfg,0),1+S.critChance(state,x.cfg)*(S.critMult(state,x.cfg)-1));
  assert.ok(O.recruit(state,x.cfg,'bran').ok);assert.ok(O.equip(state,x.cfg,0,'bran',S.openCells(state,x.cfg)).ok);
  close(x.Big.toNumber(x.Big.div(O.heroPower(state,x.cfg,'bran'),expected)),1);
  const prior=O.heroPower(state,x.cfg,'bran');state.run.up.sharp=49;state.run.up.banner=100;
  assert.strictEqual(x.Big.str(O.heroPower(state,x.cfg,'bran')),x.Big.str(prior),'глобальный бонус не удваивается внутри оружия');
});

test('реальные скалярные эффекты используют эффективный вклад вместо номера покупки', () => {
  const {state}=fresh();const n=50;
  for(const id of SUPPORTED)state.run.up[id]=n;
  const eff=id=>S.upgradeEffective(state,x.cfg,id), perk=(id,at)=>x.cfg['perk.'+id+'.'+at];
  // Level 50 also opens the first perk of each: they are part of the same numbers.
  close(S.critMult(state,x.cfg),x.cfg['crit.mult']+eff('hand')*x.cfg['up.hand.step']);
  close(S.bossTimer(state,x.cfg),x.cfg['boss.timer']+eff('hourglass')*x.cfg['up.hourglass.step']+perk('runePower',50)+perk('hourglass',50));
  close(S.runePower(state,x.cfg),1+eff('runePower')*x.cfg['up.runePower.step']);
  close(S.eventSpeed(state,x.cfg),(1+eff('caravan')*x.cfg['up.caravan.step'])*perk('caravan',50));
  close(S.saleMult(state,x.cfg),(1+eff('stall')*x.cfg['up.stall.step'])*perk('stall',50));
  close(S.goldMult(state,x.cfg,1),(1+eff('purse')*x.cfg['up.purse.step'])*perk('hunter',50)*perk('banner',50));
  close(x.Big.toNumber(S.dmgMult(state,x.cfg,0)),(1+eff('sharp')*x.cfg['up.sharp.step'])*perk('cry',50));
  close(S.critChance(state,x.cfg),Math.min(x.cfg['crit.maxChance'],x.cfg['crit.chance']+perk('sharp',50)+perk('hand',50)));
  close(S.forgeSpeed(state,x.cfg),perk('twin',50));
  const extra=eff('hammer')*x.cfg['up.hammer.step']*perk('hammer',50),base=x.cfg['forge.tapSec'],interval=S.forgeInterval(state,x.cfg,NOW);
  close(S.tapSeconds(state,x.cfg,NOW),base*(1+extra)/(1+base*extra/interval));
});

test('рубеж двойной поковки изменяет шанс дополнительного клинка, а не время горна', () => {
  const {state}=fresh();state.run.up.twin=25;state.run.forgeT=0;state.run.grid.fill(0);
  const rng={chance:p=>p>0.8,next:()=>0.5};
  assert.ok(S.tap(state,x.cfg,rng,NOW));
  assert.strictEqual(state.run.stats.forged,2,'шанс поднялся с 75% выше 80%');
  assert.strictEqual(state.run.forgeT,S.forgeInterval(state,x.cfg,NOW));
});

done('upgrade progress');
