'use strict';
const assert=require('node:assert/strict');
const {open,ctxOf,test,done}=require('./env');
const x=open(),S=x.sim,O=S.outpost,B=x.Big,NOW=Date.UTC(2026,10,16,14);
function near(a,b,msg){const den=B.max(1,B.max(B.abs(a),B.abs(b)));assert.ok(B.toNumber(B.div(B.abs(B.sub(a,b)),den))<1e-9,msg||B.str(a)+' != '+B.str(b));}
function world(wave=59,hero='bran'){
 const cfg={...x.cfg,'crit.chance':0,'crit.maxChance':0},rng=x.Rng.make(532),state=x.Core.newState(x.game,S,{...ctxOf(x,NOW,rng),config:cfg});S.ensure(state);
 const r=state.run;r.grid.fill(0);r.wave=wave;r.maxWave=80;r.farm=false;r.hp='1e8';r.hpMax='1e8';r.walkT=0;r.volleyT=1;r.bossT=0;r.forgeT=1e9;r.eventT=1e9;
 if(hero){assert.ok(O.recruit(state,cfg,hero).ok);r.grid[0]=3;assert.ok(O.equip(state,cfg,0,hero,S.openCells(state,cfg)).ok);}
 delete r.encounter;S.tick(state,0,{...ctxOf(x,NOW,rng),config:cfg});let now=NOW;
 return {state,cfg,rng,plain(){r.encounter.kind='plain';r.encounter.shield='0e0';r.encounter.regenLeft='0e0';},step(dt){now+=dt*1000;S.tick(state,dt,{...ctxOf(x,now,rng),config:cfg});}};
}
function talent(w,id,rank,choice){w.state.meta.outpost.heroes[id].xp=1000;assert.ok(O.chooseTalent(w.state,w.cfg,id,rank,choice).ok);}

test('метка Корвина даёт обычную награду с ограниченной прибавкой ровно один раз',()=>{
 const w=world(59,'corvin');w.plain();talent(w,'corvin',3,'bounty');const r=w.state.run;r.hp='1e0';
 const gold=r.gold,kills=r.stats.kills,base=B.mul(S.goldOf(w.cfg,r.wave),S.goldMult(w.state,w.cfg,r.wave));
 const cast=S.useAbility(w.state,w.cfg,'corvin',NOW);assert.ok(cast.ok);w.step(1);
 near(r.gold,B.add(gold,B.mul(base,1+cast.markGoldShare)));assert.equal(r.stats.kills,kills+1);assert.equal(r.wave,60);
 const paid=r.gold;w.step(.5);near(r.gold,paid);assert.equal(r.encounter.mark,0);
 const cap=world(59,'corvin');cap.plain();const initial=cap.state.run.gold,reward=B.mul(S.goldOf(cap.cfg,59),S.goldMult(cap.state,cap.cfg,59));cap.state.run.hp='1e0';
 assert.ok(S.useAbility(cap.state,cap.cfg,'corvin',NOW).ok);cap.state.run.encounter.pending[0].markGoldShare=9;cap.step(1);
 near(cap.state.run.gold,B.add(initial,B.mul(reward,1+cap.cfg['campaign.mark.maxShare'])));
});

test('талант бреши усиливает следующий залп, не залп с самим приёмом',()=>{
 const w=world();w.plain();talent(w,'bran',6,'opening');w.state.run.grid[1]=7;
 const base=B.add(S.fieldPower(w.state,w.cfg),O.passivePower(w.state,w.cfg));const cast=S.useAbility(w.state,w.cfg,'bran',NOW);assert.ok(cast.ok);
 w.step(1);near(w.state.run.lastHit,B.add(base,cast.damage));near(w.state.run.encounter.opening,cast.openingBonus);
 w.step(1);near(w.state.run.lastHit,B.mul(base,1+cast.openingBonus));near(w.state.run.encounter.opening,0);
 w.step(1);near(w.state.run.lastHit,base);
});

test('талант эха берёт долю героя, а не огромного DPS поля, и расходуется один раз',()=>{
 const w=world(59,'veya');w.plain();talent(w,'veya',6,'echo');w.state.run.grid[1]=12;
 const base=B.add(S.fieldPower(w.state,w.cfg),O.passivePower(w.state,w.cfg));const cast=S.useAbility(w.state,w.cfg,'veya',NOW);assert.ok(cast.ok);
 const echo=B.mul(cast.heroPower,cast.echoShare);assert.ok(B.lt(echo,B.mul(base,.01)));
 w.step(1);near(w.state.run.lastHit,B.add(base,cast.damage));near(w.state.run.encounter.echo,echo);
 w.step(1);near(w.state.run.lastHit,B.add(base,echo));near(w.state.run.encounter.echo,0);
 w.step(1);near(w.state.run.lastHit,base);
});

test('грозовое дыхание отдаёт отложенную часть один раз без рекурсивного эха',()=>{
 const w=world();w.plain();w.state.meta.outpost.dragon.absorbed='1e4';w.state.meta.outpost.dragon.fed=20;w.state.run.outpost.dragon.charge=100;
 assert.ok(O.selectForm(w.state,w.cfg,'storm').ok);const base=O.passivePower(w.state,w.cfg),cast=S.useAbility(w.state,w.cfg,'dragon',NOW);assert.ok(cast.ok&&B.gt(cast.echoDamage,0));
 w.step(1);near(w.state.run.lastHit,B.add(base,cast.damage));near(w.state.run.encounter.echo,cast.echoDamage);
 w.step(1);near(w.state.run.lastHit,B.add(base,cast.echoDamage));near(w.state.run.encounter.echo,0);
 w.step(1);near(w.state.run.lastHit,base);assert.equal(w.state.run.outpost.dragon.charge,0);
});

test('сильный холод дыхания истекает и не усиливает последующую обычную ледяную закалку',()=>{
 const w=world(60);w.plain();w.state.run.gold='1e8';O.temper(w.state,w.cfg,'bran','ice');w.state.run.bossT=100;
 w.state.meta.outpost.dragon.absorbed='1e4';w.state.meta.outpost.dragon.fed=20;w.state.run.outpost.dragon.charge=100;assert.ok(O.selectForm(w.state,w.cfg,'frost').ok);
 const cast=S.useAbility(w.state,w.cfg,'dragon',NOW);assert.ok(cast.ok);w.step(1);const before=w.state.run.bossT;
 w.step(cast.slowSec);near(w.state.run.bossT,before-cast.slowSec/(1+cast.slowStrength));near(w.state.run.encounter.iceT,0);near(w.state.run.encounter.iceStrength,0);
 const expired=w.state.run.bossT;w.step(1);near(w.state.run.bossT,expired-1/(1+w.cfg['encounter.ice.slow']));
});

test('черепаха защищает только одно заклинание и фиксируется в начале встречи',()=>{
 const w=world(59);assert.ok(O.choosePet(w.state,w.cfg,'turtle').ok);delete w.state.run.encounter;S.tick(w.state,0,{...ctxOf(x,NOW,w.rng),config:w.cfg});
 const e=w.state.run.encounter;assert.equal(e.kind,'channeler');assert.equal(e.ward,true);const power=O.passivePower(w.state,w.cfg);
 O.choosePet(w.state,w.cfg,'raven');w.step(w.cfg['encounter.cast.sec']);near(w.state.run.lastHit,power);assert.equal(e.wardUsed,true);
 O.choosePet(w.state,w.cfg,'turtle');w.step(w.cfg['encounter.cast.sec']);near(w.state.run.lastHit,B.mul(power,1-w.cfg['encounter.cast.penalty']));
 const late=world(59);assert.equal(late.state.run.encounter.ward,false);O.choosePet(late.state,late.cfg,'turtle');late.step(late.cfg['encounter.cast.sec']);
 near(late.state.run.lastHit,B.mul(O.passivePower(late.state,late.cfg),1-late.cfg['encounter.cast.penalty']));
});

test('третий ранг черепахи даёт две защиты только со следующей встречи и опыт за фактические срабатывания',()=>{
 const w=world(59);O.choosePet(w.state,w.cfg,'turtle');const xp=w.state.meta.outpost.petXp;
 xp.turtle=2*w.cfg['outpost.pet.xpStep']-w.cfg['outpost.turtle.wardXp'];
 delete w.state.run.encounter;S.tick(w.state,0,{...ctxOf(x,NOW,w.rng),config:w.cfg});
 assert.equal(w.state.run.encounter.wardCharges,1);const before=xp.turtle,power=O.passivePower(w.state,w.cfg);
 w.step(w.cfg['encounter.cast.sec']);assert.equal(xp.turtle,before+w.cfg['outpost.turtle.wardXp']);assert.equal(O.benefits(w.state,w.cfg).casterWards,2);
 w.step(w.cfg['encounter.cast.sec']);near(w.state.run.lastHit,B.mul(power,1-w.cfg['encounter.cast.penalty']));assert.equal(xp.turtle,before+w.cfg['outpost.turtle.wardXp']);
 delete w.state.run.encounter;S.tick(w.state,0,{...ctxOf(x,NOW,w.rng),config:w.cfg});assert.equal(w.state.run.encounter.wardCharges,2);
 O.choosePet(w.state,w.cfg,'raven');const atStart=xp.turtle;
 w.step(w.cfg['encounter.cast.sec']);near(w.state.run.lastHit,power);w.step(w.cfg['encounter.cast.sec']);near(w.state.run.lastHit,power);
 assert.equal(xp.turtle,atStart+2*w.cfg['outpost.turtle.wardXp']);assert.equal(w.state.run.encounter.wardUsedCount,2);
 w.step(w.cfg['encounter.cast.sec']);near(w.state.run.lastHit,B.mul(power,1-w.cfg['encounter.cast.penalty']));assert.equal(xp.turtle,atStart+2*w.cfg['outpost.turtle.wardXp']);
});

test('талант охоты усиливает только собственный приём по боссу, не поле и не обычного врага',()=>{
 for(const boss of [false,true]){
  const w=world(boss?60:59);w.plain();talent(w,'bran',10,'challenge');w.state.run.grid[1]=9;if(boss)w.state.run.bossT=100;
  const base=B.add(S.fieldPower(w.state,w.cfg),O.passivePower(w.state,w.cfg)),cast=S.useAbility(w.state,w.cfg,'bran',NOW);w.step(1);
  near(w.state.run.lastHit,B.add(base,B.mul(cast.damage,boss?1+cast.bossBonus:1)));
 }
});

test('долгое подавление не обрезается наличием огненного оружия',()=>{
 const w=world(58,'eira');w.state.run.gold='1e8';O.temper(w.state,w.cfg,'eira','fire');talent(w,'eira',3,'embers');
 const cast=S.useAbility(w.state,w.cfg,'eira',NOW);assert.ok(cast.suppressRegenSec>w.cfg['encounter.fire.sec']);w.step(1);
 near(w.state.run.encounter.fireT,cast.suppressRegenSec);
});

done('campaign combat');
