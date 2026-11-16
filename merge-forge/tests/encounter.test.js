'use strict';
const assert=require('node:assert/strict');
const {open,ctxOf,test,done}=require('./env');
const x=open(),S=x.sim,O=S.outpost,B=x.Big,NOW=Date.UTC(2026,10,16,9);
function near(actual,expected,message){
 const a=B.of(actual),b=B.of(expected),den=B.max(1,B.max(B.abs(a),B.abs(b)));
 assert.ok(B.toNumber(B.div(B.abs(B.sub(a,b)),den))<1e-10,message||B.str(a)+' != '+B.str(b));
}
function world(wave,hero){
 const cfg={...x.cfg,'crit.chance':0,'crit.maxChance':0};const rng=x.Rng.make(724);
 const state=x.Core.newState(x.game,S,{...ctxOf(x,NOW,rng),config:cfg});S.ensure(state);
 const r=state.run;r.grid.fill(0);r.wave=wave||21;r.maxWave=Math.max(30,r.wave);r.farm=false;
 r.hp='1e4';r.hpMax='1e4';r.walkT=0;r.volleyT=cfg['combat.hitSec'];r.bossT=0;r.forgeT=1e9;r.eventT=1e9;
 if(hero){r.grid[S.openCells(state,cfg)[0]]=3;assert.ok(O.recruit(state,cfg,hero).ok);assert.ok(O.equip(state,cfg,S.openCells(state,cfg)[0],hero,S.openCells(state,cfg)).ok);}
 delete r.encounter;S.tick(state,0,{...ctxOf(x,NOW,rng),config:cfg});let now=NOW;
 return {state,cfg,rng,step(dt,offline){now+=dt*1000;S.tick(state,dt,{...ctxOf(x,now,rng),config:cfg,offline:!!offline});},context(){return {...ctxOf(x,now,rng),config:cfg};}};
}

test('подход сохраняет одинокого врага и полный таймер босса до ворот',()=>{
 const w=world(30);const r=w.state.run;r.grid[0]=1;r.walkT=w.cfg['wave.walkSec'];r.bossT=S.bossTimer(w.state,w.cfg);
 delete r.encounter;const before=S.encounterView(w.state,w.cfg);assert.equal(before.kind,'plain');
 const clock=r.bossT,hp=r.hp,volley=r.volleys;w.step(w.cfg['wave.walkSec']);
 assert.equal(r.walkT,0);near(r.hp,hp);near(r.bossT,clock);assert.equal(r.volleys,volley);
 w.step(w.cfg['combat.hitSec']);assert.equal(r.volleys,volley+1);assert.ok(B.lt(r.hp,hp));near(r.bossT,clock-w.cfg['combat.hitSec']);
});

test('встретить: порог, один выбор на встречу, сокращение ограничено и есть перезарядка',()=>{
 const w=world(21);const r=w.state.run;r.walkT=w.cfg['wave.walkSec'];delete r.encounter;
 r.maxWave=w.cfg['encounter.prepare.fromWave']-1;assert.equal(S.prepare(w.state,w.cfg,'meet'),false);
 r.maxWave=w.cfg['encounter.prepare.fromWave'];assert.equal(S.prepare(w.state,w.cfg,'meet'),true);
 near(r.walkT,w.cfg['wave.walkSec']-w.cfg['encounter.meet.cutSec']);near(r.meetCooldown,w.cfg['encounter.meet.cooldown']);
 const before=JSON.stringify(r);assert.equal(S.prepare(w.state,w.cfg,'meet'),false);assert.equal(S.prepare(w.state,w.cfg,'aim'),false);assert.equal(JSON.stringify(r),before);
 const copy=JSON.parse(JSON.stringify(w.state));assert.equal(S.prepare(copy,w.cfg,'aim'),false,'перезагрузка не повторяет подготовку');
 delete r.encounter;r.walkT=w.cfg['wave.walkSec'];assert.equal(S.prepare(w.state,w.cfg,'meet'),false,'новый враг не сбрасывает перезарядку');
 w.step(w.cfg['encounter.meet.cooldown']);delete r.encounter;r.walkT=w.cfg['wave.walkSec'];assert.equal(S.prepare(w.state,w.cfg,'meet'),true);
 delete r.encounter;r.meetCooldown=0;r.walkT=w.cfg['encounter.meet.minSec'];assert.equal(S.prepare(w.state,w.cfg,'meet'),false,'контакт не перескакивает минимальный подход');
});

test('прицеливание усиливает ровно первый залп и исключает раннюю встречу',()=>{
 const w=world(21);const r=w.state.run;r.grid[0]=2;r.walkT=w.cfg['wave.walkSec'];delete r.encounter;
 assert.ok(S.prepare(w.state,w.cfg,'aim'));assert.equal(S.prepare(w.state,w.cfg,'meet'),false);
 const base=S.cellPower(w.state,w.cfg,0);w.step(w.cfg['wave.walkSec']+w.cfg['combat.hitSec']);
 near(r.lastHit,B.mul(base,1+w.cfg['encounter.aim.bonus']));assert.equal(r.encounter.aim,false);
 w.step(w.cfg['combat.hitSec']);near(r.lastHit,base);
});

test('умение ждёт следующего настоящего залпа и не создаёт бесплатный залп поля',()=>{
 const w=world(23,'bran');const r=w.state.run;r.volleyT=0.8;const hp=r.hp,volley=r.volleys;
 assert.ok(S.useAbility(w.state,w.cfg,'bran',NOW).ok);near(r.volleyT,0.8);
 assert.equal(S.useAbility(w.state,w.cfg,'bran',NOW).ok,false);assert.equal(r.encounter.pending.length,1);
 w.step(0.4);near(r.hp,hp);assert.equal(r.volleys,volley);
 w.step(0.4);assert.equal(r.volleys,volley+1);assert.ok(B.lt(r.hp,hp));assert.equal(r.encounter.pending.length,0);
 const after=r.hp;w.step(0.2);near(r.hp,after);assert.equal(r.volleys,volley+1);
});

test('панцирь имеет ограниченный запас; Раскол снимает его без двойного глобального множителя',()=>{
 const plain=world(21,'bran'),skill=world(21,'bran');assert.equal(plain.state.run.encounter.kind,'armored');
 near(plain.state.run.encounter.shield,B.mul(plain.state.run.hpMax,plain.cfg['encounter.armor.share']));
 const hp=plain.state.run.hp,shield=plain.state.run.encounter.shield;plain.step(1);near(plain.state.run.hp,hp);assert.ok(B.lt(plain.state.run.encounter.shield,shield));
 S.forgeLayer(skill.state).currency='1e1';const power=O.heroPower(skill.state,skill.cfg,'bran'),global=S.dmgMult(skill.state,skill.cfg,NOW);
 assert.ok(S.useAbility(skill.state,skill.cfg,'bran',NOW).ok);skill.step(1);
 near(skill.state.run.encounter.shield,0);near(skill.state.run.lastHit,B.mul(global,B.mul(power,1+skill.cfg['outpost.bran.hit'])));
});

test('регенерация ограничена общим бюджетом, а огненная закалка её подавляет',()=>{
 const heal=world(22,'bran');assert.equal(heal.state.run.encounter.kind,'regenerator');
 const r=heal.state.run;r.hp='5e3';const before=r.hp,budget=r.encounter.regenLeft,power=O.heroPower(heal.state,heal.cfg,'bran');
 heal.step(40);const healed=B.add(B.sub(r.hp,before),B.mul(power,r.volleys));near(healed,budget);near(r.encounter.regenLeft,0);assert.ok(B.lte(r.hp,r.hpMax));
 const fire=world(22,'bran');fire.state.run.gold='1e6';assert.ok(O.temper(fire.state,fire.cfg,'bran','fire').ok);fire.state.run.hp='5e3';
 const old=fire.state.run.hp,left=fire.state.run.encounter.regenLeft;fire.step(5);
 near(fire.state.run.hp,B.sub(old,B.mul(O.heroPower(fire.state,fire.cfg,'bran'),5)));near(fire.state.run.encounter.regenLeft,left);
});

test('заклинатель ослабляет один залп; подготовленное умение прерывает заклинание',()=>{
 const w=world(23,'bran');assert.equal(w.state.run.encounter.kind,'channeler');const power=O.heroPower(w.state,w.cfg,'bran');
 for(let i=1;i<=7;i++){w.step(1);near(w.state.run.lastHit,power);}
 assert.equal(S.encounterView(w.state,w.cfg).casting,true);w.step(1);near(w.state.run.lastHit,B.mul(power,1-w.cfg['encounter.cast.penalty']));
 w.step(1);near(w.state.run.lastHit,power);
 const interrupt=world(23,'bran');interrupt.step(7);assert.ok(S.useAbility(interrupt.state,interrupt.cfg,'bran',NOW+7000).ok);interrupt.step(1);
 near(interrupt.state.run.lastHit,B.mul(O.heroPower(interrupt.state,interrupt.cfg,'bran'),1+interrupt.cfg['outpost.bran.hit']));near(interrupt.state.run.encounter.castT,interrupt.cfg['encounter.cast.sec']);
});

test('убийство умением выдаёт обычную награду один раз и создаёт только следующего врага',()=>{
 const w=world(29,'bran');const r=w.state.run;r.hp='1e0';const gold=r.gold,kills=r.stats.kills,wave=r.wave;
 const reward=B.mul(S.goldOf(w.cfg,wave),S.goldMult(w.state,w.cfg,wave));assert.ok(S.useAbility(w.state,w.cfg,'bran',NOW).ok);
 w.step(1);assert.equal(r.stats.kills,kills+1);assert.equal(r.wave,wave+1);near(r.gold,B.add(gold,reward));
 const after=r.gold;w.step(0.5);near(r.gold,after);assert.equal(r.stats.kills,kills+1);assert.ok(r.walkT>0);
});

test('офлайн не ведёт бой и не исполняет подготовленное умение',()=>{
 const w=world(23,'bran');const r=w.state.run;r.walkT=3;delete r.encounter;assert.ok(S.useAbility(w.state,w.cfg,'bran',NOW).ok);
 const hp=r.hp,walk=r.walkT,clock=S.encounterView(w.state,w.cfg).castT,kills=r.stats.kills,queued=JSON.stringify(r.encounter.pending);r.farmRate='0e0';
 S.offline(w.state,600,{...w.context(),now:NOW+600000});
 near(r.hp,hp);near(r.walkT,walk);near(r.encounter.castT,clock);assert.equal(r.stats.kills,kills);assert.equal(JSON.stringify(r.encounter.pending),queued);
 assert.equal(S.useAbility(w.state,w.cfg,'bran',NOW+600000).ok,false,'одна готовая способность не дублируется после восстановления перезарядки');
});

test('одиночные поведения одинаковы при длинном шаге и частых шагах',()=>{
 for(const wave of [21,22,23]){
  const one=world(wave,'bran'),many=world(wave,'bran');one.state.run.hp='5e3';many.state.run.hp='5e3';
  one.step(12);for(let i=0;i<120;i++)many.step(0.1);
  near(one.state.run.hp,many.state.run.hp,'HP, волна '+wave);near(one.state.run.volleyT,many.state.run.volleyT);assert.equal(one.state.run.volleys,many.state.run.volleys);
  near(one.state.run.encounter.shield,many.state.run.encounter.shield);near(one.state.run.encounter.regenLeft,many.state.run.encounter.regenLeft);near(one.state.run.encounter.castT,many.state.run.encounter.castT);
 }
});

test('звонкая закалка отдаёт эхо в следующий залп без рекурсивного усиления',()=>{
 const w=world(23,'veya');const r=w.state.run;r.gold='1e6';assert.ok(O.temper(w.state,w.cfg,'veya','resonant').ok);
 const power=O.heroPower(w.state,w.cfg,'veya');assert.ok(S.useAbility(w.state,w.cfg,'veya',NOW).ok);
 w.step(1);near(r.lastHit,B.mul(power,1+w.cfg['outpost.veya.hit']));near(r.encounter.echo,B.mul(power,w.cfg['encounter.resonant.share']));
 w.step(1);near(r.lastHit,B.mul(power,1+w.cfg['encounter.resonant.share']));near(r.encounter.echo,0);
 w.step(1);near(r.lastHit,power);near(r.encounter.echo,0);
});

test('подготовленное оружие нельзя переодеть до исполнения умения, затем замена доступна',()=>{
 const w=world(23,'bran');const cells=S.openCells(w.state,w.cfg);const cell=cells[0];w.state.run.grid[cell]=4;
 assert.ok(S.useAbility(w.state,w.cfg,'bran',NOW).ok);const gear=JSON.stringify(w.state.run.outpost.equipment),grid=JSON.stringify(w.state.run.grid);
 assert.equal(O.equip(w.state,w.cfg,cell,'bran',cells).ok,false);assert.equal(JSON.stringify(w.state.run.outpost.equipment),gear);assert.equal(JSON.stringify(w.state.run.grid),grid);
 w.step(1);assert.ok(O.equip(w.state,w.cfg,cell,'bran',cells).ok);
});

test('точный рипост усиливает только удар Веи в окне замаха и только у ворот',()=>{
 const timed=world(23,'veya');timed.step(timed.cfg['encounter.cast.sec']-timed.cfg['encounter.cast.windSec']);
 const power=O.heroPower(timed.state,timed.cfg,'veya');const cast=S.useAbility(timed.state,timed.cfg,'veya',NOW+6000);
 assert.ok(cast.ok&&cast.timed);near(cast.damage,B.mul(power,timed.cfg['outpost.veya.hit']*(1+timed.cfg['encounter.riposte.bonus'])));
 timed.step(1);near(timed.state.run.lastHit,B.add(power,cast.damage));
 const early=world(23,'veya');const plain=S.useAbility(early.state,early.cfg,'veya',NOW);assert.ok(plain.ok&&!plain.timed);near(plain.damage,B.mul(O.heroPower(early.state,early.cfg,'veya'),early.cfg['outpost.veya.hit']));
 const walking=world(23,'veya');walking.state.run.walkT=2;walking.state.run.encounter.castT=1;const queued=S.useAbility(walking.state,walking.cfg,'veya',NOW);assert.ok(queued.ok&&!queued.timed,'до ворот нет рипоста на замах');
});

test('ледяное оружие замедляет и заклинание, и таймер босса, сохраняя ход времени',()=>{
 const w=world(23,'bran');w.state.run.gold='1e6';assert.ok(O.temper(w.state,w.cfg,'bran','ice').ok);
 const duration=w.cfg['encounter.cast.sec'],slow=1+w.cfg['encounter.ice.slow'],power=O.heroPower(w.state,w.cfg,'bran');
 w.step(duration);near(w.state.run.encounter.castT,duration-duration/slow);near(w.state.run.lastHit,power);assert.equal(w.state.run.encounter.weakened,false);
 w.step(1);near(w.state.run.lastHit,B.mul(power,1-w.cfg['encounter.cast.penalty']));
 const boss=world(30,'bran');boss.state.run.gold='1e6';assert.ok(O.temper(boss.state,boss.cfg,'bran','ice').ok);boss.state.run.bossT=30;boss.step(10);near(boss.state.run.bossT,30-10/slow);
});

test('повторные криты поддерживают ограниченное эхо, не умножая прошлое эхо',()=>{
 const w=world(23,'veya');w.state.run.gold='1e6';assert.ok(O.temper(w.state,w.cfg,'veya','resonant').ok);
 w.cfg['crit.chance']=1;w.cfg['crit.maxChance']=1;w.state.run.grid[0]=1;
 const field=B.mul(S.cellPower(w.state,w.cfg,0),S.critMult(w.state,w.cfg)),hero=O.heroPower(w.state,w.cfg,'veya');
 w.step(1);near(w.state.run.lastHit,B.add(field,hero));near(w.state.run.encounter.echo,B.mul(hero,w.cfg['encounter.resonant.share']));
 w.step(1);const hit=w.state.run.lastHit;near(hit,B.add(field,B.mul(hero,1+w.cfg['encounter.resonant.share'])));
 w.step(1);near(w.state.run.lastHit,hit);near(w.state.run.encounter.echo,B.mul(hero,w.cfg['encounter.resonant.share']));
});

done('encounter');
