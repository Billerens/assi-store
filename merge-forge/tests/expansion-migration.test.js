'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {open,ctxOf,test,done,GAME}=require('./env');
const x=open(),O=x.sim.outpost,NOW=Date.UTC(2026,10,16,9);
const copy=v=>JSON.parse(JSON.stringify(v));
function fresh(){const rng=x.Rng.make(709);const state=x.Core.newState(x.game,x.sim,ctxOf(x,NOW,rng));x.sim.ensure(state);return{state,rng};}

test('Core читает v1 без изменения старого поля, валют, seq, seed и неизвестных полей',()=>{
 const original=JSON.parse(fs.readFileSync(path.join(GAME,'fixtures/v1.json'),'utf8')),untouched=copy(original);
 const result=x.Core.pick([{state:original,seq:original.seq}],x.game,x.sim);
 assert.ok(result.state,JSON.stringify(result.broken));assert.equal(result.migratedFrom,1);assert.equal(result.state.ver,x.game.saveVersion);
 const normalized=copy(result.state);delete normalized.run.outpost;delete normalized.meta.outpost;delete normalized.run.adventures;delete normalized.meta.adventures;delete normalized.run.artifacts;delete normalized.meta.artifacts;normalized.ver=1;
 assert.deepStrictEqual(normalized,untouched);assert.deepStrictEqual(original,untouched);
 const again=x.Core.pick([{json:JSON.stringify(result.state),seq:result.state.seq}],x.game,x.sim);
 assert.deepStrictEqual(again.state,result.state);assert.equal(again.migratedFrom,null);
});

test('v2 сохраняет состав из двух героев, их оружие, очередь и подготовленный удар',()=>{
 const old=JSON.parse(fs.readFileSync(path.join(GAME,'fixtures/v2.json'),'utf8')),original=copy(old);
 const picked=x.Core.pick([{state:old}],x.game,x.sim);assert.ok(picked.state);assert.equal(picked.migratedFrom,2);assert.equal(picked.state.ver,3);
 function contains(actual,expected,p){
  if(expected&&typeof expected==='object'){
   if(Array.isArray(expected)){assert.ok(Array.isArray(actual),p);assert.equal(actual.length,expected.length,p);}
   Object.keys(expected).forEach(k=>{if(p===''&&k==='ver')return;contains(actual[k],expected[k],p+'.'+k);});
  }else assert.deepStrictEqual(actual,expected,p);
 }
 contains(picked.state,original,'');assert.deepStrictEqual(old,original);
 assert.deepStrictEqual(copy(x.sim.outpost.model(picked.state,x.cfg).heroes.filter(h=>h.active).map(h=>h.id)),['bran','veya']);
 assert.equal(picked.state.meta.outpost.heroes.eira.unlocked,false);assert.equal(picked.state.meta.outpost.dragon.form,'ash');
 assert.equal(picked.state.run.encounter.pending.length,1);assert.equal(x.sim.validate(picked.state),null);
});

test('сломанное новое оружие не заменяет валидное старое сохранение',()=>{
 const old=JSON.parse(fs.readFileSync(path.join(GAME,'fixtures/v1.json'),'utf8'));
 const newer=x.Core.pick([{state:old}],x.game,x.sim).state;
 newer.run.outpost.equipment.bran={level:1001,temper:'fire'};
 const result=x.Core.pick([{state:newer,seq:100},{state:old,seq:17}],x.game,x.sim);
 assert.ok(result.state);assert.equal(result.index,1);assert.equal(result.state.seq,17);assert.equal(result.broken.length,1);
});

test('обычные новые покупки открываются постепенно и не ускоряют пассивную ковку',()=>{
 const {state}=fresh();state.run.gold='1e9';state.run.maxWave=9;state.run.stats.sold=9;
 // «Лавка кузнеца» вобрала «Переплавку»: она открыта с начала, первые уровни поднимают долю продажи.
 assert.equal(x.sim.upOpen(state,x.cfg,'stall'),true);
 assert.equal(x.sim.upOpen(state,x.cfg,'hammer'),false);state.run.stats.sold=10;
 const oldPrice=x.sim.sellPrice(state,x.cfg,1),oldSpeed=x.sim.forgeSpeed(state,x.cfg),oldTap=x.sim.tapSeconds(state,x.cfg,NOW);
 assert.equal(x.sim.buyUp(state,x.cfg,'stall'),true);assert.equal(x.Big.toNumber(oldPrice),4);
 assert.equal(x.Big.toNumber(x.sim.sellPrice(state,x.cfg,1)),Math.floor(10*(x.cfg['sell.share']+x.cfg['up.stall.share'])*x.sim.saleMult(state,x.cfg)));
 state.run.maxWave=20;assert.equal(x.sim.buyUp(state,x.cfg,'hammer'),true);
 assert.ok(x.sim.tapSeconds(state,x.cfg,NOW)>oldTap);assert.ok(x.sim.tapSeconds(state,x.cfg,NOW)<x.sim.forgeInterval(state,x.cfg,NOW));assert.equal(x.sim.forgeSpeed(state,x.cfg),oldSpeed);
 const cost=x.sim.upCost(state,x.cfg,'hammer');assert.equal(x.sim.buyUp(state,x.cfg,'hammer'),true);assert.ok(x.Big.gt(x.sim.upCost(state,x.cfg,'hammer'),cost));
});

test('перековка хранит спутников и силу дракона; память учитывает оружие героя',()=>{
 const {state,rng}=fresh();state.run.maxWave=80;
 O.recruit(state,x.cfg,'bran');O.choosePet(state,x.cfg,'fox');state.run.grid[0]=15;assert.ok(O.equip(state,x.cfg,0,'bran',x.sim.openCells(state,x.cfg)).ok);
 state.meta.outpost.heroes.bran.xp=90;state.meta.outpost.dragon.absorbed='1e6';state.meta.outpost.dragon.fed=30;
 state.run.outpost.dragon.queue=[{level:4,left:10}];state.run.outpost.rack=[{level:12,temper:'ice'}];
 const layer=x.sim.forgeLayer(state);layer.state.mf.memory=1;const meta=copy(state.meta.outpost);
 const result=x.Core.prestige(x.sim,x.game,state,'forge',ctxOf(x,NOW,rng));assert.ok(result.ok);
 assert.deepStrictEqual(state.meta.outpost,meta);assert.equal(state.run.outpost.equipment.bran,null);assert.equal(state.run.outpost.rack.length,0);assert.equal(state.run.outpost.dragon.queue.length,0);
 assert.ok(state.run.grid.includes(x.cfg['mf.memory.maxLevel']));assert.equal(x.sim.validate(state),null);
});

test('второй слот требует покупки и не покупается второй раз',()=>{
 const {state}=fresh();state.run.maxWave=50;O.recruit(state,x.cfg,'bran');O.recruit(state,x.cfg,'veya');
 assert.equal(O.model(state,x.cfg).slots,1);const layer=x.sim.forgeLayer(state);layer.currency='1e6';
 assert.equal(x.sim.buyMf(state,x.cfg,'team'),false);layer.state.mf.memory=1;
 assert.equal(x.sim.buyMf(state,x.cfg,'team'),true);assert.equal(O.model(state,x.cfg).slots,2);assert.equal(x.sim.buyMf(state,x.cfg,'team'),false);
});

test('уровень 1000 считается в Big без Infinity в боевой силе и кормлении',()=>{
 const {state,rng}=fresh();state.run.maxWave=1000;state.run.grid[0]=1000;
 assert.ok(x.Big.valid(x.sim.cellPower(state,x.cfg,0)));assert.ok(x.Big.valid(x.sim.dps(state,x.cfg,0)));
 O.recruit(state,x.cfg,'bran');assert.ok(O.equip(state,x.cfg,0,'bran',x.sim.openCells(state,x.cfg)).ok);
 assert.ok(x.Big.valid(O.passivePower(state,x.cfg)));state.run.grid[1]=1000;O.noteForged(state,1000);assert.ok(O.feed(state,Object.assign({},x.cfg,{'outpost.dragon.gap':0}),1,x.sim.openCells(state,x.cfg)).ok);
 O.tick(state,60,x.cfg,{offline:true});assert.ok(x.Big.valid(state.meta.outpost.dragon.absorbed));assert.ok(x.Big.valid(O.dragonPower(state,x.cfg)));
 assert.equal(x.sim.validate(state),null);
});

test('час офлайн с лисой, героями и кормлением совпадает с пошаговым расчётом',()=>{
 const {state}=fresh();state.run.maxWave=35;state.run.up.apprentice=1;state.run.up.bellows=6;state.run.grid[0]=8;state.run.grid[1]=5;state.run.grid[2]=6;O.noteForged(state,9);
 O.recruit(state,x.cfg,'bran');O.equip(state,x.cfg,0,'bran',x.sim.openCells(state,x.cfg));O.choosePet(state,x.cfg,'fox');
 O.feed(state,x.cfg,1,x.sim.openCells(state,x.cfg));O.feed(state,x.cfg,2,x.sim.openCells(state,x.cfg));
 state.run.farmRate='3e0';state.run.outpost.cooldowns.bran=18;
 const formula=copy(state),steps=copy(state),r1=x.Rng.make(900),r2=x.Rng.make(900);
 x.sim.offline(formula,3600,ctxOf(x,NOW+3600e3,r1,{offline:true}));
 for(let i=1;i<=3600;i++)x.sim.tick(steps,1,ctxOf(x,NOW+i*1000,r2,{offline:true}));
 assert.deepStrictEqual(formula.run.grid,steps.run.grid);assert.deepStrictEqual(formula.run.pending,steps.run.pending);
 assert.deepStrictEqual(formula.run.outpost,steps.run.outpost);assert.deepStrictEqual(formula.meta.outpost,steps.meta.outpost);
 assert.equal(formula.run.stats.forged,steps.run.stats.forged);assert.equal(formula.run.stats.merged,steps.run.stats.merged);
 assert.ok(Math.abs(x.Big.toNumber(x.Big.div(formula.run.gold,steps.run.gold))-1)<1e-10);
});
done('expansion migration');
