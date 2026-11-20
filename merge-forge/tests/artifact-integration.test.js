'use strict';
const assert=require('assert');
const {open,ctxOf,test,done}=require('./env');
const x=open(),S=x.sim,A=S.artifacts,O=S.outpost,NOW=Date.UTC(2026,10,16,9),copy=v=>JSON.parse(JSON.stringify(v));
function fresh(){const rng=x.Rng.make(332),state=x.Core.newState(x.game,S,ctxOf(x,NOW,rng));S.ensure(state);state.run.maxWave=150;O.ensure(state);return{state,rng};}
function own(state,id,level=8){state.meta.artifacts.items[id]={level,enabled:true,cooldown:0};}
function close(a,b){assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);}
function zeroRng(){return{next:()=>0,chance:p=>p>0};}

test('коллекция работает одновременно и угольные покупки не теряют старый бонус',()=>{
 const {state}=fresh();const layer=S.forgeLayer(state);layer.count=1;layer.currency='1e5';layer.state.record=150;
 const before=S.coalsAll(state),upgrades=copy(state.run.up);
 for(const d of A.CATALOG)assert.ok(S.buyArtifact(state,x.cfg,d.id).ok,d.id);
 assert.strictEqual(A.model(state,x.cfg).owned,37);close(S.coalsAll(state),before);assert.deepStrictEqual(state.run.up,upgrades);
 const mods=A.modifiers(state,x.cfg);for(const k of Object.keys(A.LIMITS))assert.ok(mods[k]>=0&&mods[k]<A.LIMITS[k]);
 for(const id of ['whetstone','goldenSeal','forgeHeart'])assert.strictEqual(state.meta.artifacts.items[id].enabled,true);
 const damage=S.dmgMult(state,x.cfg,NOW),gold=S.goldMult(state,x.cfg,1),speed=S.forgeSpeed(state,x.cfg);
 assert.ok(S.setArtifactEnabled(state,'whetstone',false).ok);assert.ok(x.Big.lt(S.dmgMult(state,x.cfg,NOW),damage));
 close(S.goldMult(state,x.cfg,1),gold);close(S.forgeSpeed(state,x.cfg),speed);
 assert.strictEqual(S.validate(state),null);
});

test('парный молот срабатывает только от принятого ручного удара и сливает ровно одну пару',()=>{
 const {state,rng}=fresh();own(state,'pairHammer',100);state.run.grid.fill(0);state.run.grid[0]=2;state.run.grid[1]=2;state.run.grid[2]=2;state.run.grid[3]=2;state.run.forgeT=100;
 assert.ok(S.tap(state,x.cfg,zeroRng(),NOW));assert.strictEqual(state.run.stats.merged,1);
 assert.strictEqual(state.run.grid.filter(v=>v===3).length,1);assert.strictEqual(state.run.grid.filter(v=>v===2).length,2);
 state.run.tapBudget=0;const before=JSON.stringify(state);assert.strictEqual(S.tap(state,x.cfg,zeroRng(),NOW),false);assert.strictEqual(JSON.stringify(state),before);
 S.tick(state,.1,ctxOf(x,NOW+100,rng,{offline:true}));assert.strictEqual(state.run.stats.merged,1);
 S.offline(state,1,ctxOf(x,NOW+1100,rng,{offline:true}));assert.strictEqual(state.run.stats.merged,1);
});

test('ручные срабатывания меняют именно таймеры, выручку и заряд без новой бесплатной партии',()=>{
 const {state}=fresh();['emberSpark','coinDie','dragonChime','hourNeedle','apprenticeSpring','crySpark'].forEach(id=>own(state,id));
 state.run.forgeT=10;state.run.up.apprentice=1;state.run.appT=6;state.run.up.cry=1;state.run.cryReadyAt=NOW+10000;
 state.run.outpost.cooldowns.bran=5;state.run.outpost.dragon.charge=0;
 const gold=state.run.gold,price=S.sellPrice(state,x.cfg,S.forgeLevel(state,x.cfg));
 S.tap(state,x.cfg,zeroRng(),NOW);
 close(state.run.forgeT,10-S.tapSeconds(state,x.cfg,NOW)-.6);close(state.run.appT,5.5);close(state.run.cryReadyAt,NOW+9500);
 close(state.run.outpost.cooldowns.bran,4.5);close(state.run.outpost.dragon.charge,1.5);
 assert.strictEqual(x.Big.str(state.run.gold),x.Big.str(x.Big.add(gold,x.Big.mul(price,.4))));
 assert.strictEqual(state.run.stats.forged,0);assert.strictEqual(state.run.stats.sold,0);
});

test('щит и регенерация меняются малыми воздействиями без бесплатного удара',()=>{
 const {state}=fresh();own(state,'shieldAwl');own(state,'mossVial');state.run.forgeT=100;
 state.run.encounter={kind:'regenerator',shield:'1e2',regenLeft:'1e2',fireT:0};const hp=state.run.hp;
 S.tap(state,x.cfg,zeroRng(),NOW);close(x.Big.toNumber(state.run.encounter.shield),98);close(state.run.encounter.fireT,.4);
 assert.strictEqual(state.run.hp,hp);assert.strictEqual(state.run.stats.kills,0);
});

test('добавление времени ограничено текущим боссом и максимальным таймером',()=>{
 const {state}=fresh();own(state,'sandPin');state.run.forgeT=100;state.run.wave=150;state.run.farm=false;state.run.walkT=0;
 state.run.bossT=S.bossTimer(state,x.cfg)-.1;S.tap(state,x.cfg,zeroRng(),NOW);close(state.run.bossT,S.bossTimer(state,x.cfg));
 state.run.wave=149;state.run.bossT=10;S.tap(state,x.cfg,zeroRng(),NOW);assert.strictEqual(state.run.bossT,10);
});

test('ускорение кормления обрабатывает очередь без снижения геройских откатов',()=>{
 const {state}=fresh();own(state,'feedingBowl');O.noteForged(state,10);state.run.grid[0]=7;
 assert.ok(O.feed(state,x.cfg,0,S.openCells(state,x.cfg)).ok);state.run.outpost.cooldowns.bran=17;
 const left=state.run.outpost.dragon.queue[0].left,grid=JSON.stringify(state.run.grid),fed=state.meta.outpost.dragon.fed;
 assert.ok(S.activateArtifact(state,x.cfg,'feedingBowl',NOW).ok);close(state.run.outpost.dragon.queue[0].left,left-4);
 assert.strictEqual(state.run.outpost.cooldowns.bran,17);assert.strictEqual(JSON.stringify(state.run.grid),grid);assert.strictEqual(state.meta.outpost.dragon.fed,fed);
 assert.strictEqual(S.activateArtifact(state,x.cfg,'feedingBowl',NOW).ok,false);
});

test('предпросмотр еды и очередь показывают реальное время с колыбелью и логовом',()=>{
 const {state}=fresh();own(state,'dragonCradle');S.forgeLayer(state).state.mf.dragonCare=2;O.noteForged(state,10);state.run.grid[0]=7;
 const preview=O.feedPreview(state,x.cfg,0,S.openCells(state,x.cfg));assert.ok(preview.ok);assert.ok(preview.seconds<x.cfg['outpost.dragon.digestSec']);
 assert.ok(O.feed(state,x.cfg,0,S.openCells(state,x.cfg)).ok);close(O.model(state,x.cfg).dragon.queue[0].left,preview.seconds);
 O.digest(state,preview.seconds/2,x.cfg);close(O.model(state,x.cfg).dragon.queue[0].left,preview.seconds/2);
 const result=O.digest(state,preview.seconds/2,x.cfg);assert.strictEqual(result.fed,1);assert.strictEqual(state.run.outpost.dragon.queue.length,0);
});

test('отсутствие цели не расходует перезарядку мгновенной активки',()=>{
 const {state}=fresh();own(state,'twinLever');state.run.grid.fill(0);
 assert.strictEqual(S.activateArtifact(state,x.cfg,'twinLever',NOW).ok,false);assert.strictEqual(state.meta.artifacts.items.twinLever.cooldown,0);
 state.run.grid[0]=2;state.run.grid[1]=2;assert.ok(S.activateArtifact(state,x.cfg,'twinLever',NOW).ok);
 assert.strictEqual(state.run.stats.merged,1);assert.strictEqual(state.run.grid.filter(v=>v===3).length,1);
 assert.strictEqual(S.activateArtifact(state,x.cfg,'twinLever',NOW).ok,false);
});

test('пассивные скорости ковки и ученика ускоряют часы, а базовые интервалы сохранены',()=>{
 const a=fresh(),b=fresh();for(const entry of [a,b]){entry.state.run.up.apprentice=1;entry.state.run.forgeT=4;entry.state.run.appT=4;entry.state.run.farmRate='0e0';}
 own(a.state,'forgeHeart');own(a.state,'apprenticeGear');
 const speed=S.forgeSpeed(a.state,x.cfg),appSpeed=S.apprenticeSpeed(a.state,x.cfg);
 assert.ok(speed>1&&appSpeed>1);close(S.forgeInterval(a.state,x.cfg,NOW),S.forgeInterval(b.state,x.cfg,NOW));close(S.apprenticeInterval(a.state,x.cfg),S.apprenticeInterval(b.state,x.cfg));
 S.tick(a.state,1,ctxOf(x,NOW+1000,a.rng,{offline:true}));close(a.state.run.forgeT,4-speed);close(a.state.run.appT,4-appSpeed);
});

test('временный бонус учитывается только до своего истечения в большом офлайн расчёте',()=>{
 const {state}=fresh();own(state,'hotBellows');own(state,'marketBell');S.openCells(state,x.cfg).forEach(c=>state.run.grid[c]=1);state.run.up.steel=5;state.run.farmRate='0e0';
 assert.ok(S.activateArtifact(state,x.cfg,'hotBellows',NOW).ok);assert.ok(S.activateArtifact(state,x.cfg,'marketBell',NOW).ok);
 const a=copy(state),b=copy(state),ra=x.Rng.make(551),rb=x.Rng.make(551);
 S.offline(a,60,ctxOf(x,NOW+60000,ra,{offline:true}));for(let i=1;i<=60;i++)S.tick(b,1,ctxOf(x,NOW+i*1000,rb,{offline:true}));
 assert.strictEqual(a.run.stats.forged,b.run.stats.forged);assert.strictEqual(a.run.stats.sold,b.run.stats.sold);assert.strictEqual(x.Big.str(a.run.gold),x.Big.str(b.run.gold));assert.strictEqual(ra.state(),rb.state());
 assert.deepStrictEqual(a.run.artifacts.effects,{});for(const id of Object.keys(a.meta.artifacts.items))close(a.meta.artifacts.items[id].cooldown,b.meta.artifacts.items[id].cooldown);close(a.run.forgeT,b.run.forgeT);
 const plain=copy(state);plain.run.artifacts.effects={};const rc=x.Rng.make(551);S.offline(plain,60,ctxOf(x,NOW+60000,rc,{offline:true}));
 assert.ok(x.Big.gt(a.run.gold,plain.run.gold));assert.ok(a.run.stats.forged<=plain.run.stats.forged+1,'мехи не действовали все60секунд');
});

test('временные боевые бонусы не остаются в ставке многодневного офлайн фарма',()=>{
 const {state}=fresh();state.run.wave=9;state.run.grid.fill(0);state.run.grid[0]=2;own(state,'warStandard');own(state,'focusCrystal');
 const rate=S.farmRateNow(state,x.cfg),dps=S.dps(state,x.cfg,NOW),chance=S.critChance(state,x.cfg);
 assert.ok(S.activateArtifact(state,x.cfg,'warStandard',NOW).ok);assert.ok(S.activateArtifact(state,x.cfg,'focusCrystal',NOW).ok);
 assert.ok(x.Big.gt(S.dps(state,x.cfg,NOW),dps));assert.ok(S.critChance(state,x.cfg)>chance);
 assert.strictEqual(x.Big.str(S.farmRateNow(state,x.cfg)),x.Big.str(rate));assert.strictEqual(state.run.lastArtifactFx.at,NOW);
});

test('разбиение по временным бонусам не обходит общий предел событий офлайн',()=>{
 const {state,rng}=fresh();own(state,'hotBellows');own(state,'marketBell');S.activateArtifact(state,x.cfg,'hotBellows',NOW);S.activateArtifact(state,x.cfg,'marketBell',NOW);
 S.openCells(state,x.cfg).forEach(c=>state.run.grid[c]=1);state.run.farmRate='0e0';
 const cfg=Object.assign({},x.cfg,{'offline.maxEvents':2});S.offline(state,3600,ctxOf(x,NOW+3600000,rng,{offline:true,config:cfg}));
 assert.strictEqual(state.run.stats.forged,2);assert.strictEqual(state.run.stats.sold,2);
 assert.deepStrictEqual(state.run.artifacts.effects,{});
});

test('герой и клинок на поле получают одинаковый критический бонус коллекции',()=>{
 const {state}=fresh();state.run.grid.fill(0);state.run.grid[0]=20;state.run.up.temper=100;state.run.up.hand=50;
 ['keenLens','heavyPommel','whetstone','focusCrystal'].forEach(id=>own(state,id));S.activateArtifact(state,x.cfg,'focusCrystal',NOW);
 const crit=1+S.critChance(state,x.cfg)*(S.critMult(state,x.cfg)-1),expected=x.Big.mul(S.cellPower(state,x.cfg,0),crit);
 O.recruit(state,x.cfg,'bran');O.equip(state,x.cfg,0,'bran',S.openCells(state,x.cfg));close(x.Big.toNumber(x.Big.div(O.heroPower(state,x.cfg,'bran'),expected)),1);
 assert.ok(S.critChance(state,x.cfg)<=x.cfg['crit.maxChance']);
});

test('избыток артефактного шанса усиливает крит, сохраняя предел вероятности и паритет героя',()=>{
 // «Глаз мастера» right at the cap of the chance: its own levels past it are «Сокрушительный удар» (upgrade-progress).
 const {state}=fresh();state.run.up.eye=S.room(x.cfg['crit.chance'],x.cfg['crit.maxChance'],x.cfg['up.eye.step']);state.run.up.hand=10;state.run.grid.fill(0);state.run.grid[0]=20;
 const before=S.criticalStats(state,x.cfg);own(state,'keenLens');own(state,'focusCrystal');S.activateArtifact(state,x.cfg,'focusCrystal',NOW);
 const after=S.criticalStats(state,x.cfg),bonus=A.modifiers(state,x.cfg).critChance;
 close(after.chance,x.cfg['crit.maxChance']);assert.ok(after.overflow>0);assert.ok(after.multiplier>before.multiplier);
 close(1+after.chance*(after.multiplier-1),1+(before.chance+bonus)*(before.multiplier-1));
 const expected=x.Big.mul(S.cellPower(state,x.cfg,0),1+after.chance*(after.multiplier-1));O.recruit(state,x.cfg,'bran');O.equip(state,x.cfg,0,'bran',S.openCells(state,x.cfg));close(x.Big.toNumber(x.Big.div(O.heroPower(state,x.cfg,'bran'),expected)),1);
 const disabled=Object.assign({},x.cfg,{'crit.maxChance':0});assert.strictEqual(S.critChance(state,disabled),0);
});

test('ночной артефакт полезен при100% смене и не умножает ковочные продажи повторно',()=>{
 const a=fresh(),b=fresh();for(const item of [a,b]){item.state.run.up.night=1000;item.state.run.farmRate='1e2';S.openCells(item.state,x.cfg).forEach(c=>item.state.run.grid[c]=1);}
 own(a.state,'nightLantern');const bonus=A.modifiers(a.state,x.cfg).offlineIncome;
 assert.ok(bonus>0&&bonus<.15);assert.strictEqual(S.offlineShare(a.state,x.cfg),1);
 S.offline(a.state,80,ctxOf(x,NOW+80000,a.rng,{offline:true}));S.offline(b.state,80,ctxOf(x,NOW+80000,b.rng,{offline:true}));
 close(x.Big.toNumber(x.Big.sub(a.state.run.gold,b.state.run.gold)),100*80*bonus);
 assert.strictEqual(a.state.run.stats.sold,b.state.run.stats.sold);
});

test('активное замедление применяется к расходу босса и заканчивается вовремя',()=>{
 const {state,rng}=fresh();own(state,'frozenClock');state.run.grid.fill(0);state.run.wave=10;state.run.maxWave=150;state.run.farm=false;state.run.walkT=0;
 state.run.forgeT=1e9;state.run.eventT=1e9;state.run.hp='1e20';state.run.hpMax=state.run.hp;state.run.bossT=S.bossTimer(state,x.cfg);state.run.encounter=null;
 assert.ok(S.activateArtifact(state,x.cfg,'frozenClock',NOW).ok);const slow=1+A.modifiers(state,x.cfg).bossSlow,before=state.run.bossT;
 S.tick(state,11,ctxOf(x,NOW+11000,rng));close(state.run.bossT,before-10/slow-1);assert.deepStrictEqual(state.run.artifacts.effects,{});
});

test('опыт от действий и заряд получают бонус один раз; ручное лакомство имеет явную величину',()=>{
 const {state}=fresh();['petTalisman','mentorBook','emberVein','petTreat'].forEach(id=>own(state,id));O.choosePet(state,x.cfg,'salamander');O.recruit(state,x.cfg,'bran');state.run.grid[0]=6;O.equip(state,x.cfg,0,'bran',S.openCells(state,x.cfg));state.meta.outpost.dragon.fed=3;state.run.forgeT=100;
 const mods=A.modifiers(state,x.cfg);S.tap(state,x.cfg,zeroRng(),NOW);close(state.meta.outpost.petXp.salamander,1+mods.petXp+1);
 const before=state.meta.outpost.heroes.bran.xp;O.onKill(state,x.cfg,false);close(state.meta.outpost.heroes.bran.xp-before,x.cfg['outpost.hero.killXp']*(1+mods.heroXp));
 close(state.run.outpost.dragon.charge,x.cfg['outpost.dragon.killCharge']*(1+mods.dragonCharge));
});

test('перековка сохраняет коллекцию и откаты, но не временный эффект; star не возвращает старые расходы',()=>{
 const {state,rng}=fresh();S.forgeLayer(state).count=1;S.forgeLayer(state).currency='1e3';assert.ok(S.buyArtifact(state,x.cfg,'warStandard').ok);S.activateArtifact(state,x.cfg,'warStandard',NOW);
 const owned=copy(state.meta.artifacts);const result=x.Core.prestige(S,x.game,state,'forge',ctxOf(x,NOW,rng));assert.ok(result.ok);
 assert.deepStrictEqual(state.meta.artifacts,owned);assert.deepStrictEqual(state.run.artifacts.effects,{});
 const old=copy(state);state.layers.forge={currency:'0e0',count:0,state:{spent:0,mf:{},total:0,paid:0,record:0}};state.run=S.init(ctxOf(x,NOW,rng)).run;
 S.onPrestige(state,'star',old,ctxOf(x,NOW,rng));assert.deepStrictEqual(state.meta.artifacts,owned);assert.strictEqual(S.forgeLayer(state).state.spent,0);assert.strictEqual(S.coalsAll(state),0);
 assert.strictEqual(S.validate(state),null);
});

done('artifact integration');
