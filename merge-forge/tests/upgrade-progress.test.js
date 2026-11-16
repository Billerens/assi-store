'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');
const x = open(), S = x.sim, O = S.outpost, NOW = Date.UTC(2026, 10, 16, 9);
const SUPPORTED = ['sharp', 'purse', 'hand', 'twin', 'temper', 'runePower', 'hunter', 'hourglass', 'cry', 'banner', 'caravan', 'hammer', 'stall'];
function fresh() { const rng=x.Rng.make(57), state=x.Core.newState(x.game,S,ctxOf(x,NOW,rng));S.ensure(state);return {state,rng}; }
function close(a,b,message) { assert.ok(Math.abs(a-b)<1e-10*Math.max(1,Math.abs(b)),message||`${a} != ${b}`); }

test('пороги 10/50/100 и следующие столетия повторяются без геометрии', () => {
  const {state}=fresh();
  for (const [before,at,tier] of [[9,10,10],[49,50,50],[99,100,100],[190,200,100]]) {
    const a=S.upgradeProgress(state,x.cfg,'sharp',before), b=S.upgradeProgress(state,x.cfg,'sharp',at);
    assert.strictEqual(a.nextAt,at);assert.strictEqual(a.nextTier,tier);assert.ok(a.nextMilestoneJump>0);
    const previous=S.upgradeProgress(state,x.cfg,'sharp',at-1);
    close(a.nextMilestoneJump,b.milestoneBonus-previous.milestoneBonus);
    assert.ok(b.factor>previous.factor);assert.ok(b.effective>at);
  }
  close(S.upgradeProgress(state,x.cfg,'sharp',10).factor,1+0.04*10/110+0.5*0.02/0.52);
  close(S.upgradeProgress(state,x.cfg,'sharp',50).factor,1+0.04*50/150+0.5*0.125/0.625);
  close(S.upgradeProgress(state,x.cfg,'sharp',100).factor,1.2075);
  assert.strictEqual(S.upgradeProgress(state,x.cfg,'sharp',100).nextAt,110);
  assert.ok(S.upgradeProgress(state,x.cfg,'sharp',1000).factor<1.5);
});

test('медленный прирост есть между вехами, суммарное усиление ограничено', () => {
  const {state}=fresh();
  for (const id of SUPPORTED) {
    let previous=0;
    for (const n of [0,1,2,9,10,11,49,50,99,100,101,190,200,1000,10000,1e12,1e300,Number.MAX_VALUE]) {
      const p=S.upgradeProgress(state,x.cfg,id,n);
      assert.strictEqual(p.supported,true);assert.ok(Number.isFinite(p.factor));assert.ok(p.factor>=1&&p.factor<=1.54);
      assert.ok(Number.isFinite(p.effective));assert.ok(p.effective>=previous);previous=p.effective;
      close(p.nextEffective,S.upgradeEffective(state,x.cfg,id,n+1));
    }
    assert.ok(S.upgradeProgress(state,x.cfg,id,12).factor>S.upgradeProgress(state,x.cfg,id,11).factor);
  }
});

test('вклад мягких улучшений остаётся логарифмическим до общего бонуса', () => {
  const {state}=fresh();
  for(const id of ['caravan','hammer','stall']) {
    const knee=x.cfg['up.'+id+'.soft'],p=S.upgradeProgress(state,x.cfg,id,100);
    close(p.effective/p.factor,knee*(1+Math.log(100/knee)));
    assert.ok(p.effective<100);
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
  const prior=O.heroPower(state,x.cfg,'bran');state.run.up.sharp=100;state.run.up.banner=100;
  assert.strictEqual(x.Big.str(O.heroPower(state,x.cfg,'bran')),x.Big.str(prior),'глобальный бонус не удваивается внутри оружия');
});

test('реальные скалярные эффекты используют эффективный вклад вместо номера покупки', () => {
  const {state}=fresh();const n=50;
  for(const id of SUPPORTED)state.run.up[id]=n;
  const eff=id=>S.upgradeEffective(state,x.cfg,id);
  close(S.critMult(state,x.cfg),x.cfg['crit.mult']+eff('hand')*x.cfg['up.hand.step']);
  close(S.bossTimer(state,x.cfg),x.cfg['boss.timer']+eff('hourglass')*x.cfg['up.hourglass.step']);
  close(S.runePower(state,x.cfg),1+eff('runePower')*x.cfg['up.runePower.step']);
  close(S.eventSpeed(state,x.cfg),1+eff('caravan')*x.cfg['up.caravan.step']);
  close(S.saleMult(state,x.cfg),1+eff('stall')*x.cfg['up.stall.step']);
  close(S.goldMult(state,x.cfg,1),1+eff('purse')*x.cfg['up.purse.step']);
  close(x.Big.toNumber(S.dmgMult(state,x.cfg,0)),1+eff('sharp')*x.cfg['up.sharp.step']);
  const extra=eff('hammer')*x.cfg['up.hammer.step'],base=x.cfg['forge.tapSec'],interval=S.forgeInterval(state,x.cfg,NOW);
  close(S.tapSeconds(state,x.cfg,NOW),base*(1+extra)/(1+base*extra/interval));
});

test('веха двойной поковки изменяет шанс дополнительного клинка, а не время горна', () => {
  const {state}=fresh();state.run.up.twin=10;state.run.forgeT=0;state.run.grid.fill(0);
  const rng={chance:p=>p>0.303,next:()=>0.5};
  assert.ok(S.tap(state,x.cfg,rng,NOW));
  assert.strictEqual(state.run.stats.forged,2,'шанс поднялся с30% выше30.3%');
  assert.strictEqual(state.run.forgeT,S.forgeInterval(state,x.cfg,NOW));
});

done('upgrade progress');
