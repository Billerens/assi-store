'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');
const x = open(), S = x.sim, O = S.outpost, NOW = Date.UTC(2026, 10, 16, 9);
const U = require('../upgrade-progress.js');
const SUPPORTED = ['sharp', 'purse', 'hand', 'twin', 'temper', 'runePower', 'hunter', 'hourglass', 'cry', 'banner', 'caravan', 'hammer', 'stall'];
function fresh() { const rng=x.Rng.make(57), state=x.Core.newState(x.game,S,ctxOf(x,NOW,rng));S.ensure(state);return {state,rng}; }
const MECHANIC = ['twin', 'hourglass', 'caravan', 'hammer'];
const span = (id) => U.span(id, x.cfg), each = () => U.bigEach(x.cfg);
// What the milestones multiply an upgrade by at level n, by the game's own settings (milestone.*).
function milestone(id, n) {
  const c = x.cfg, mech = MECHANIC.includes(id);
  const all = Math.floor(n / span(id)), big = Math.floor(all / each());
  return Math.pow(c[mech ? 'milestone.mechMult' : 'milestone.mult'], all - big) * Math.pow(c[mech ? 'milestone.mechBigMult' : 'milestone.bigMult'], big);
}
function close(a,b,message) { assert.ok(Math.abs(a-b)<1e-10*Math.max(1,Math.abs(b)),message||`${a} != ${b}`); }

test('рубеж — каждый раз, когда цена выросла в milestone.price раз: у всех улучшений примерно одинаково часто', () => {
  const c = x.cfg;
  for (const id of SUPPORTED) {
    const g = c['up.' + id + '.growth'], s = span(id);
    const byPrice = Math.max(2, Math.round(Math.log(c['milestone.price']) / Math.log(g)));
    assert.strictEqual(s, Math.min(c['milestone.maxSpan'], byPrice), id);
    // The price grows about milestone.price times from one milestone to the next, or less: never more than 25 levels.
    assert.ok(s <= 25, id);
    if (s > 2 && s < c['milestone.maxSpan']) assert.ok(Math.abs(s * Math.log(g) - Math.log(c['milestone.price'])) <= Math.log(g) / 2 + 1e-9, id);
  }
  assert.ok(span('banner') < span('temper') && span('temper') < span('sharp'), 'дорогое улучшение — чаще');
  assert.strictEqual(span('sharp'), 25, 'Острота — как прежде, раз в 25 уровней');
  // Without a price that grows the step is the old 25 levels.
  assert.strictEqual(U.span('sharp', Object.assign({}, c, { 'up.sharp.growth': 1 })), 25);
});

test('рубеж ×1.4, каждый bigEach-й — крупный ×1.8; у механических ×1.1 и ×1.2', () => {
  const {state}=fresh(), s = span('sharp'), e = each();
  const M = x.cfg['milestone.mult'], BM = x.cfg['milestone.bigMult'], MM = x.cfg['milestone.mechMult'], MB = x.cfg['milestone.mechBigMult'];
  assert.strictEqual(M, 1.4);assert.strictEqual(BM, 1.8);
  for (let k = 1; k <= 2 * e; k++) {
    const at = k * s, big = k % e === 0;
    const a=S.upgradeProgress(state,x.cfg,'sharp',at-1), b=S.upgradeProgress(state,x.cfg,'sharp',at);
    assert.strictEqual(a.nextAt,at);assert.strictEqual(a.nextBig,big);assert.strictEqual(a.nextMult,big?BM:M);
    close(b.milestone/a.milestone,big?BM:M);
    assert.ok(b.factor>a.factor*1.35);
  }
  close(S.upgradeProgress(state,x.cfg,'sharp',s-1).factor,1+0.04*(s-1)/(s-1+100));
  close(S.upgradeProgress(state,x.cfg,'sharp',s).factor,(1+0.04*s/(s+100))*M);
  const t = span('twin') * e;
  close(S.upgradeProgress(state,x.cfg,'twin',t).factor,(1+0.04*t/(t+100))*Math.pow(MM,e-1)*MB);
  assert.strictEqual(S.upgradeProgress(state,x.cfg,'sharp',s*e).nextAt,s*e+s);
  // A milestone is felt: the damage of Острота grows by a third at once.
  const dmg=(n)=>1+x.cfg['up.sharp.step']*S.upgradeEffective(state,x.cfg,'sharp',n);
  assert.ok(dmg(s)/dmg(s-1)>1.25);
  // The settings are the game's: a multiplier of 1 switches the small milestones off.
  const kept=x.cfg['milestone.mult'];x.cfg['milestone.mult']=1;
  assert.strictEqual(S.upgradeProgress(state,x.cfg,'sharp',s).milestone,1);x.cfg['milestone.mult']=kept;
});

test('особые свойства: на каждом крупном рубеже, два по очереди, без конца, складываются по видам', () => {
  const {state}=fresh();
  for (const id of SUPPORTED) {
    const b1 = span(id) * each();
    const p=S.upgradeProgress(state,x.cfg,id,b1-1);
    assert.strictEqual(p.perks.length,2,id);assert.deepStrictEqual(p.perks.map(q=>q.at),[b1,2*b1]);
    assert.ok(p.perks.every(q=>!q.on));assert.strictEqual(p.nextPerk.at,b1);assert.strictEqual(p.nextPerk.kind,U.PERKS[id][0][0]);
    for (const q of p.perks) assert.strictEqual(q.value,x.cfg['perk.'+id+'.'+(q.index?'b':'a')],id+' — из настроек');
    const one=S.upgradeProgress(state,x.cfg,id,b1);
    assert.ok(one.perks[0].on && !one.perks[1].on);assert.strictEqual(one.nextPerk.at,2*b1);assert.strictEqual(one.nextPerk.kind,U.PERKS[id][1][0]);
    // Endless: the tenth big milestone is like the first two, by turns.
    const far=S.upgradeProgress(state,x.cfg,id,10*b1);
    assert.deepStrictEqual(far.perks.map(q=>q.count),[5,5],id);assert.strictEqual(far.nextPerk.at,11*b1);assert.strictEqual(far.nextPerk.index,0);
  }
  const none=U.perkTotals({},x.cfg);
  assert.strictEqual(none.dmg,1);assert.strictEqual(none.critChance,0);assert.strictEqual(none.bossTime,0);
  const a=(id)=>x.cfg['perk.'+id+'.a'], b=(id)=>x.cfg['perk.'+id+'.b'];
  const twice={},four={};SUPPORTED.forEach(id=>{twice[id]=2*span(id)*each();four[id]=4*span(id)*each();});
  const sum=U.perkTotals(twice,x.cfg);
  close(sum.critChance,a('sharp')+a('hand'));
  close(sum.bossTime,a('runePower')+a('hourglass'));
  close(sum.dmg,b('temper')*b('runePower')*a('cry')*b('banner'));
  close(sum.bossDmg,b('sharp')*a('temper')*b('hourglass'));
  const again=U.perkTotals(four,x.cfg);
  close(again.critChance,2*(a('sharp')+a('hand')));
  // A perk that comes again adds what it gave once more: ×1.5 twice is ×2, not ×2.25.
  close(again.bossDmg,(1+2*(b('sharp')-1))*(1+2*(a('temper')-1))*(1+2*(b('hourglass')-1)));
  // A purchase across a milestone names what it opened.
  const s=span('sharp'),e=each();
  const M=x.cfg['milestone.mult'],BM=x.cfg['milestone.bigMult'];
  assert.deepStrictEqual(U.crossed('sharp',s*e-1,s*e,x.cfg).map(c=>[c.at,c.mult,c.perk&&c.perk.kind]),[[s*e,BM,'critChance']]);
  assert.deepStrictEqual(U.crossed('sharp',s-1,2*s,x.cfg).map(c=>[c.at,c.mult]),[[s,M],[2*s,e===2?BM:M]]);
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
    const totals=U.perkTotals({[id]:Number.MAX_VALUE},x.cfg);
    for (const k of U.KINDS) assert.ok(Number.isFinite(totals[k]),id+' '+k);
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
  for(const id of ['steel','melt','runeMason','night','bellows','apprentice']) {
    const before=S.upMax(state,x.cfg,id);state.run.up[id]=1000;
    const p=S.upgradeProgress(state,x.cfg,id);
    assert.strictEqual(p.supported,false);assert.strictEqual(p.factor,1);assert.strictEqual(p.effective,1000);assert.strictEqual(p.nextAt,null);
    assert.strictEqual(S.upMax(state,x.cfg,id),before);
  }
  // The levels of «Шире наковальня», «Глаз мастера» and «Лавка кузнеца» past their old caps do other things now.
  state.run.up.wide=1000;state.run.up.eye=1000;state.run.up.stall=1000;
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
  const {state}=fresh();const n=60;
  for(const id of SUPPORTED)state.run.up[id]=n;
  const eff=id=>S.upgradeEffective(state,x.cfg,id), T=U.perkTotals(state.run.up,x.cfg);
  // Level 60 has passed the first big milestone of the dear upgrades: their perks are part of the same numbers.
  assert.ok(T.dmg>1 && T.bossTime>0,'свойства уже открыты');
  close(S.critMult(state,x.cfg),(x.cfg['crit.mult']+eff('hand')*x.cfg['up.hand.step'])*T.critMult);
  close(S.bossTimer(state,x.cfg),x.cfg['boss.timer']+eff('hourglass')*x.cfg['up.hourglass.step']+T.bossTime);
  close(S.runePower(state,x.cfg),1+eff('runePower')*x.cfg['up.runePower.step']);
  close(S.eventSpeed(state,x.cfg),(1+eff('caravan')*x.cfg['up.caravan.step'])*T.events);
  close(S.saleMult(state,x.cfg),(1+eff('stall')*x.cfg['up.stall.step'])*T.sale);
  close(S.goldMult(state,x.cfg,1),(1+eff('purse')*x.cfg['up.purse.step'])*T.gold);
  close(x.Big.toNumber(S.dmgMult(state,x.cfg,0)),(1+eff('sharp')*x.cfg['up.sharp.step'])*T.dmg);
  close(S.critChance(state,x.cfg),Math.min(x.cfg['crit.maxChance'],x.cfg['crit.chance']+T.critChance));
  close(S.forgeSpeed(state,x.cfg),T.forgeSpeed);
  const extra=eff('hammer')*x.cfg['up.hammer.step']*T.tap,base=x.cfg['forge.tapSec'],interval=S.forgeInterval(state,x.cfg,NOW);
  close(S.tapSeconds(state,x.cfg,NOW),base*(1+extra)/(1+base*extra/interval));
});

test('рубеж двойной поковки изменяет шанс дополнительного клинка, а не время горна', () => {
  const t=span('twin'), above=x.cfg['up.twin.step']*t*1.05;
  for (const [level, blades] of [[t-1,1],[t,2]]) {
    const {state}=fresh();state.run.up.twin=level;state.run.forgeT=0;state.run.grid.fill(0);
    const rng={chance:p=>p>above,next:()=>0.5};
    assert.ok(S.tap(state,x.cfg,rng,NOW));
    assert.strictEqual(state.run.stats.forged,blades,'уровень '+level+': рубеж ×'+x.cfg['milestone.mechMult']+' поднимает шанс выше '+above);
    assert.strictEqual(state.run.forgeT,S.forgeInterval(state,x.cfg,NOW));
  }
});

done('upgrade progress');
