'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const {H,GAME,test,done}=require('./env');
const Big=require(path.join(H.HUB,'engine/big.js'));
function load(file){const scope={exports:{},require:name=>{if(name==='../engine/big.js')return Big;if(name==='./upgrade-progress.js'||name==='./artifacts.js')return load(path.join(GAME,name.slice(2)));throw Error(name);}};vm.runInNewContext(fs.readFileSync(file,'utf8'),scope,{filename:file});return scope.exports;}
const O=load(path.join(GAME,'outpost.js'));
const declarations=JSON.parse(fs.readFileSync(path.join(GAME,'config.json'),'utf8'));
const cfg=Object.assign({},Object.fromEntries(Object.entries(declarations).map(([k,v])=>[k,v.value])),O.defaults);
const json=x=>JSON.parse(JSON.stringify(x));
const cells=Array.from({length:20},(_,i)=>i);
// Captured with the shipped v2 outpost implementation; no artifact dependency at test time.
const LEGACY={"state":{"run":{"grid":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"pending":[],"up":{},"gold":"1e10","earned":"0e0","maxWave":80,"wave":80,"outpost":{"equipment":{"bran":{"level":8,"temper":""},"veya":{"level":7,"temper":""}},"rack":[],"cooldowns":{"bran":0,"veya":7,"dragon":0},"pet":{"heat":0,"merges":0},"dragon":{"anchorLevel":1,"queue":[],"charge":0}}},"meta":{"seed":91,"outpost":{"heroes":{"bran":{"unlocked":true,"xp":123},"veya":{"unlocked":true,"xp":0}},"selected":"veya","pet":"","petXp":{"salamander":0,"fox":0},"dragon":{"absorbed":"0e0","fed":0},"seenWave":80},"custom":{"keep":"yes"}},"layers":{"forge":{"currency":"1e6","state":{"mf":{"team":1},"record":0}}},"seq":41},"power":"6.75741294683e2"};
function fresh(wave=80){const state={run:{grid:Array(35).fill(0),pending:[],up:{},gold:'1e10',earned:'0e0',maxWave:wave,wave},meta:{seed:91},layers:{forge:{currency:'1e6',state:{mf:{},record:0}}},seq:41};O.ensure(state);return state;}
function equip(s,id,level=8,cell=0){assert.ok(O.recruit(s,cfg,id).ok);s.run.grid[cell]=level;assert.ok(O.equip(s,cfg,cell,id,cells).ok);}
function eqBig(a,b){assert.equal(Big.str(Big.of(a)),Big.str(Big.of(b)));}
function near(a,b){assert.ok(Math.abs(Big.toNumber(Big.div(a,b))-1)<1e-10);}
function ready(s,id){s.run.outpost.cooldowns[id]=0;s.run.encounter={pending:[]};}

test('добавочная миграция v2 сохраняет прежний состав, предметы и урон',()=>{
 const s=json(LEGACY.state),before=json(s),power=LEGACY.power;O.migrate(s);
 assert.deepStrictEqual(json(O.model(s,cfg).squad),['veya','bran']);assert.equal(O.model(s,cfg).slots,2);eqBig(O.passivePower(s,cfg),power);
 assert.equal(s.meta.outpost.heroes.eira.unlocked,false);assert.equal(s.meta.outpost.heroes.corvin.unlocked,false);
 assert.deepStrictEqual(s.run.grid,before.run.grid);assert.deepStrictEqual(s.meta.custom,before.meta.custom);assert.equal(s.run.outpost.cooldowns.veya,7);assert.equal(s.seq,41);
 const once=JSON.stringify(s);O.migrate(s);assert.equal(JSON.stringify(s),once);assert.equal(O.validate(s),null);
});

test('новые герои и питомцы открываются по собственным порогам',()=>{
 const s=fresh(39);assert.equal(O.recruit(s,cfg,'eira').ok,false);assert.equal(O.choosePet(s,cfg,'raven').ok,false);
 s.run.maxWave=40;assert.ok(O.recruit(s,cfg,'eira').ok);assert.ok(O.choosePet(s,cfg,'raven').ok);
 assert.equal(O.recruit(s,cfg,'corvin').ok,false);assert.equal(O.choosePet(s,cfg,'turtle').ok,false);
 s.run.maxWave=50;assert.ok(O.recruit(s,cfg,'corvin').ok);assert.ok(O.choosePet(s,cfg,'turtle').ok);
 eqBig(O.passivePower(s,cfg),0);assert.equal(O.model(s,cfg).heroes.length,4);assert.equal(O.model(s,cfg).pets.length,4);
});

test('отряд занимает только купленные места; замена и резерв не создают двойной урон',()=>{
 const s=fresh();['bran','veya','eira','corvin'].forEach((id,i)=>equip(s,id,6+i,i));
 assert.deepStrictEqual(json(O.model(s,cfg).squad),['bran']);eqBig(O.passivePower(s,cfg),O.heroPower(s,cfg,'bran'));
 assert.ok(O.selectHero(s,cfg,'veya').ok);assert.deepStrictEqual(json(O.model(s,cfg).squad),['veya']);
 s.layers.forge.state.mf.team=1;assert.equal(O.model(s,cfg).slots,2);assert.ok(O.selectHero(s,cfg,'eira').ok);
 const before=json(s.run.outpost.equipment);assert.equal(O.selectHero(s,cfg,'corvin').ok,false);assert.ok(O.selectHero(s,cfg,'corvin','veya').ok);
 s.layers.forge.state.mf.command=1;assert.ok(O.selectHero(s,cfg,'bran').ok);assert.equal(O.model(s,cfg).squad.length,3);
 assert.equal(O.selectHero(s,cfg,'veya').ok,false);assert.ok(O.reserveHero(s,cfg,'eira').ok);assert.ok(O.selectHero(s,cfg,'veya').ok);
 assert.deepStrictEqual(json(s.run.outpost.equipment),before);eqBig(O.passivePower(s,cfg),['corvin','bran','veya'].reduce((n,id)=>Big.add(n,O.heroPower(s,cfg,id)),Big.ZERO));
 assert.equal(O.validate(s),null);
});

test('подготовленный герой защищён от замены, резерва и смены таланта',()=>{
 const s=fresh();equip(s,'bran');O.recruit(s,cfg,'veya');s.meta.outpost.heroes.bran.xp=1000;
 s.run.encounter={pending:[{id:'bran'}]};const before=JSON.stringify(s);
 assert.equal(O.selectHero(s,cfg,'veya').ok,false);assert.equal(O.reserveHero(s,cfg,'bran').ok,false);
 assert.equal(O.chooseTalent(s,cfg,'bran',3,'heavy').ok,false);assert.equal(JSON.stringify(s),before);
});

test('таланты имеют ранги, взаимоисключающий выбор и настоящую ограниченную отдачу',()=>{
 const s=fresh();equip(s,'bran');assert.equal(O.chooseTalent(s,cfg,'bran',3,'heavy').ok,false);
 s.meta.outpost.heroes.bran.xp=48;const baseline=O.active(s,cfg,'bran');ready(s,'bran');
 assert.ok(O.chooseTalent(s,cfg,'bran',3,'heavy').ok);const heavy=O.active(s,cfg,'bran');near(heavy.damage,Big.mul(baseline.damage,1+cfg['outpost.talent.hit']));
 assert.equal(O.chooseTalent(s,cfg,'bran',3,'cadence').ok,false);O.tick(s,100,cfg,{offline:true});assert.ok(O.chooseTalent(s,cfg,'bran',3,'cadence').ok);
 const cadence=O.active(s,cfg,'bran');near(cadence.damage,baseline.damage);assert.ok(s.run.outpost.cooldowns.bran<cfg['outpost.bran.cooldown']);
 ready(s,'bran');s.meta.outpost.heroes.bran.xp=972;assert.ok(O.chooseTalent(s,cfg,'bran',6,'opening').ok);assert.ok(O.chooseTalent(s,cfg,'bran',10,'challenge').ok);
 const high=O.active(s,cfg,'bran');assert.equal(high.openingBonus,cfg['outpost.talent.opening']);assert.equal(high.bossBonus,cfg['outpost.talent.boss']);assert.equal(high.echoShare,0);
 assert.equal(Object.keys(s.meta.outpost.heroes.bran.talents).length,3);
});

test('каждый талант каждого героя имеет фактический дескриптор эффекта',()=>{
 for(const h of O.HEROS)for(const tier of O.TALENTS[h.id])for(const choice of tier.choices){
  const s=fresh();equip(s,h.id);s.meta.outpost.heroes[h.id].xp=1000;
  const base=O.active(s,cfg,h.id),baseCd=s.run.outpost.cooldowns[h.id];ready(s,h.id);
  assert.ok(O.chooseTalent(s,cfg,h.id,tier.rank,choice.id).ok);const effect=O.active(s,cfg,h.id);
  const key={opening:'openingBonus',suppress:'suppressRegenSec',slow:'slowSec',boss:'bossBonus',echo:'echoShare',riposte:'riposteBonus',mark:'markGoldShare'}[choice.effect];
  if(choice.effect==='hit')assert.ok(Big.gt(effect.damage,base.damage));
  else if(choice.effect==='cooldown')assert.ok(s.run.outpost.cooldowns[h.id]<baseCd);
  else if(choice.effect==='contract')assert.ok(O.benefits(s,cfg).contractBonus>0);
  else assert.ok(effect[key]>base[key],h.id+'/'+choice.id);
 }
});

test('Эйра выбирает стихию приёма, сохраняя настоящую закалку оружия',()=>{
 const s=fresh();equip(s,'eira');s.run.outpost.equipment.eira.temper='fire';
 assert.ok(O.setAttunement(s,cfg,'ice').ok);const ice=O.active(s,cfg,'eira');assert.equal(ice.temper,'ice');assert.equal(ice.slowSec,cfg['outpost.eira.slowSec']);assert.equal(s.run.outpost.equipment.eira.temper,'fire');
 assert.equal(O.setAttunement(s,cfg,'resonant').ok,false);ready(s,'eira');assert.ok(O.setAttunement(s,cfg,'resonant').ok);const echo=O.active(s,cfg,'eira');assert.ok(echo.echoShare>0);
 ready(s,'eira');O.setAttunement(s,cfg,'fire');assert.equal(O.active(s,cfg,'eira').suppressRegenSec,cfg['outpost.eira.suppressSec']);
});

test('Корвин и ворон дают ограниченный бонус заказов, черепаха отдельную защиту',()=>{
 const s=fresh();equip(s,'corvin');s.meta.outpost.heroes.corvin.xp=1000;O.chooseTalent(s,cfg,'corvin',3,'bounty');O.chooseTalent(s,cfg,'corvin',6,'scout');
 const mark=O.active(s,cfg,'corvin');assert.equal(mark.markGoldShare,0.11);assert.equal(O.benefits(s,cfg).contractBonus,0.05);
 O.choosePet(s,cfg,'raven');assert.ok(Math.abs(O.benefits(s,cfg).contractBonus-.10)<1e-12);O.onContract(s,cfg);assert.equal(s.meta.outpost.petXp.raven,1);
 s.meta.outpost.petXp.raven=1e15;assert.ok(O.benefits(s,cfg).contractBonus<=.15);
 O.choosePet(s,cfg,'turtle');assert.equal(O.benefits(s,cfg).casterWard,true);assert.equal(O.benefits(s,cfg).contractBonus,.05);
});

test('пепельное дыхание сохраняет v2, другие формы выбираются после взросления',()=>{
 const s=fresh(49);s.meta.outpost.dragon.fed=20;s.meta.outpost.dragon.absorbed='1e5';s.run.outpost.dragon.charge=100;
 assert.equal(O.selectForm(s,cfg,'frost').ok,false);const ash=O.active(s,cfg,'dragon');near(ash.damage,Big.mul(O.dragonPower(s,cfg),cfg['outpost.dragon.hit']));assert.equal(ash.breakArmor,true);assert.equal(ash.temper,'fire');
 s.run.maxWave=50;assert.equal(O.selectForm(s,cfg,'frost').ok,false);ready(s,'dragon');assert.ok(O.selectForm(s,cfg,'frost').ok);s.run.outpost.dragon.charge=100;
 const frost=O.active(s,cfg,'dragon');near(frost.damage,Big.mul(ash.damage,cfg['outpost.frost.hitShare']));assert.equal(frost.slowStrength,.5);assert.equal(frost.slowSec,6);assert.equal(frost.breakArmor,false);
 ready(s,'dragon');assert.ok(O.selectForm(s,cfg,'storm').ok);s.run.outpost.dragon.charge=100;const storm=O.active(s,cfg,'dragon');near(Big.add(storm.damage,storm.echoDamage),Big.mul(ash.damage,cfg['outpost.dragon.storm.mult']));assert.equal(storm.temper,'');
 s.run.encounter={pending:[storm]};s.run.outpost.cooldowns.dragon=0;assert.equal(O.selectForm(s,cfg,'ash').ok,false);
});

test('линька тратит часть Q один раз, сохраняет взрослость и требует нового рекорда',()=>{
 const s=fresh(80);s.meta.outpost.dragon.absorbed='1e6';s.meta.outpost.dragon.fed=20;
 const before=O.moltPreview(s,cfg);assert.ok(before.ok);eqBig(before.cost,250000);assert.ok(O.molt(s,cfg,'strength').ok);eqBig(s.meta.outpost.dragon.absorbed,750000);
 assert.equal(O.model(s,cfg).dragon.stage,'adult');assert.equal(s.meta.outpost.dragon.lineage,1);
 const once=JSON.stringify(s);assert.equal(O.molt(s,cfg,'ember').ok,false);assert.equal(JSON.stringify(s),once);
 s.run.maxWave=100;assert.equal(O.moltPreview(s,cfg).ok,false);s.meta.outpost.dragon.fed=40;assert.ok(O.molt(s,cfg,'ember').ok);
 s.run.outpost.dragon.charge=100;const dragon=O.model(s,cfg).dragon;assert.equal(dragon.chargeCost,95);assert.ok(O.active(s,cfg,'dragon').ok);assert.equal(s.run.outpost.dragon.charge,5);
 const meta=json(s.meta.outpost);s.layers.forge.state.mf={};s.run={grid:Array(35).fill(0),pending:[],up:{},maxWave:1,wave:1};O.onPrestige(s);assert.equal(s.meta.outpost.dragon.lineage,meta.dragon.lineage);eqBig(s.meta.outpost.dragon.absorbed,meta.dragon.absorbed);assert.equal(O.moltPreview(s,cfg).ok,false);
});

test('валидатор ловит дубли состава, неизвестные таланты и неправильные ступени линьки',()=>{
 const s=fresh();equip(s,'bran');assert.equal(O.validate(s),null);
 s.meta.outpost.squad=['bran','bran'];assert.ok(O.validate(s));s.meta.outpost.squad=['bran'];
 s.meta.outpost.heroes.bran.talents[3]='missing';assert.ok(O.validate(s));s.meta.outpost.heroes.bran.talents={};
 s.meta.outpost.dragon.perks.strength=4;assert.ok(O.validate(s));s.meta.outpost.dragon.perks.strength=0;
 assert.equal(O.validate(json(s)),null);
});

test('потеря дополнительных мест при звёздном сбросе оставляет выбранного ведущего героя',()=>{
 const s=fresh();s.layers.forge.state.mf={team:1,command:1};['bran','veya','eira'].forEach(id=>O.recruit(s,cfg,id));
 O.selectHero(s,cfg,'eira');s.layers.forge.state.mf={};O.onPrestige(s);
 assert.deepStrictEqual(json(O.model(s,cfg).squad),['eira']);assert.equal(s.meta.outpost.selected,'eira');
 assert.ok(s.meta.outpost.heroes.bran.unlocked&&s.meta.outpost.heroes.veya.unlocked);assert.equal(O.validate(s),null);
});

test('черепаха получает опыт за фактическую защиту и ограничена двумя защитами',()=>{
 const s=fresh();O.choosePet(s,cfg,'turtle');assert.equal(O.benefits(s,cfg).casterWards,1);
 for(let i=0;i<20;i++)O.onKill(s,cfg,false);assert.equal(s.meta.outpost.petXp.turtle,0);
 O.choosePet(s,cfg,'raven');O.onWard(s,cfg);assert.equal(s.meta.outpost.petXp.turtle,cfg['outpost.turtle.wardXp']);
 O.choosePet(s,cfg,'turtle');s.meta.outpost.petXp.turtle=2*cfg['outpost.pet.xpStep'];assert.equal(O.benefits(s,cfg).casterWards,2);
 s.meta.outpost.petXp.turtle=1e15;assert.equal(O.benefits(s,cfg).casterWards,2);
});

test('опыт ворона реально повышает бонус заказа до общего предела, Корвин его не обходит',()=>{
 const A=load(path.join(GAME,'adventures.js'));const s=fresh();A.ensure(s);O.choosePet(s,cfg,'raven');
 const base=O.benefits(s,cfg).contractBonus;assert.equal(base,.05);
 s.meta.outpost.petXp.raven=200;const trained=O.benefits(s,cfg).contractBonus;assert.ok(trained>base&&trained<.1);near(trained,.075);
 const offers=A.offers(s,cfg);assert.ok(A.acceptContract(s,cfg,offers[0].id,'gold',O.benefits(s,cfg)).ok);near(s.run.adventures.contract.bonus,trained);
 const joint=fresh();A.ensure(joint);equip(joint,'corvin');joint.meta.outpost.heroes.corvin.xp=1000;O.chooseTalent(joint,cfg,'corvin',6,'scout');O.choosePet(joint,cfg,'raven');joint.meta.outpost.petXp.raven=200;
 assert.ok(O.benefits(joint,cfg).contractBonus>.1);assert.ok(A.acceptContract(joint,cfg,A.offers(joint,cfg)[0].id,'gold',O.benefits(joint,cfg)).ok);near(joint.run.adventures.contract.bonus,.1);
});

test('новый core остаётся ES5 и все новые таймеры проходят офлайн',()=>{
 const Core=require(path.join(H.HUB,'engine/core.js'));assert.deepStrictEqual(Core.lint(fs.readFileSync(path.join(GAME,'outpost.js'),'utf8'),true),[]);
 const s=fresh();['bran','veya','eira','corvin','dragon'].forEach(id=>s.run.outpost.cooldowns[id]=10);O.tick(s,4,cfg,{offline:true});
 ['bran','veya','eira','corvin','dragon'].forEach(id=>assert.equal(s.run.outpost.cooldowns[id],6));
});
done('progression');
