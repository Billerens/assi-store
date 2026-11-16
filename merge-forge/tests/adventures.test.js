'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {open,ctxOf,test,done,GAME}=require('./env');
const x=open(),A=x.env.require('modules/games/merge-forge/adventures.js');
const cfg=Object.assign({},x.cfg,A.defaults),NOW=Date.UTC(2026,10,16,13);
const clone=s=>JSON.parse(JSON.stringify(s));
function fresh(wave=80){const state=x.Core.newState(x.game,x.sim,ctxOf(x,NOW,x.Rng.make(97)));x.sim.ensure(state);state.run.maxWave=wave;state.run.wave=wave;state.run.gold='100e0';state.run.earned='0e0';state.run.grid.fill(0);A.ensure(state);return state;}
function cells(s){return x.sim.openCells(s,cfg);}
function accept(s,mode='gold',benefits){const offer=A.offers(s,cfg)[0];assert.ok(offer);assert.ok(A.acceptContract(s,cfg,offer.id,mode,benefits).ok);return offer;}
function quote(n){return x.Big.of(10*n);}
function compareBig(a,b){assert.ok(Math.abs(x.Big.toNumber(x.Big.sub(a,b)))<1e-8,`${x.Big.str(a)} != ${x.Big.str(b)}`);}
test('новая схема сохраняет старые поля и закрывает будущие поручения',()=>{
 const s=fresh(1);delete s.run.adventures;delete s.meta.adventures;s.run.custom={keep:true};const old=clone(s);A.ensure(s);const result=clone(s);delete result.run.adventures;delete result.meta.adventures;assert.deepStrictEqual(result,old);
 const m=A.model(s,cfg);assert.equal(m.contract.unlocked,false);assert.equal(m.expedition.unlocked,false);assert.equal(m.trial.unlocked,false);assert.equal(A.startExpedition(s,cfg,'quarry').ok,false);assert.equal(A.startTrial(s,cfg).ok,false);
});
test('предложения стабильны, принятие не позволяет менять награду или обходить очередь',()=>{
 const s=fresh(),offers=A.offers(s,cfg);s.run.up.steel=8;assert.deepStrictEqual(A.offers(s,cfg),offers);
 assert.ok(A.acceptContract(s,cfg,offers[0].id,'training').ok);assert.equal(A.acceptContract(s,cfg,offers[1].id,'gold').ok,false);assert.equal(s.run.adventures.contract.mode,'training');assert.deepStrictEqual(A.offers(s,cfg),[]);
});
test('ошибка любой выбранной клетки не расходует клинки и не начисляет стоимость',()=>{
 const s=fresh();accept(s);s.run.grid[0]=5;s.run.grid[1]=5;const before=clone(s);
 assert.equal(A.deliver(s,cfg,[0,0],cells(s),quote).ok,false);assert.deepStrictEqual(s,before);
 assert.equal(A.deliver(s,cfg,[0,34],cells(s),quote).ok,false);assert.deepStrictEqual(s,before);
 assert.equal(A.deliver(s,cfg,[0,1],cells(s),()=>'-1e0').ok,false);assert.deepStrictEqual(s,before);
});
test('частичная поставка фиксирует цену и награда выдаётся только один раз',()=>{
 const s=fresh(),offer=accept(s,'gold',{contractBonus:99});const open=cells(s);for(let i=0;i<offer.count;i++)s.run.grid[open[i]]=2;
 assert.ok(A.deliver(s,cfg,[open[0]],open,quote).ok);assert.equal(s.run.grid[open[0]],0);assert.equal(A.claimContract(s,cfg).ok,false);
 assert.ok(A.deliver(s,cfg,open.slice(1,offer.count),open,quote).ok);
 const value=s.run.adventures.contract.value,gold=s.run.gold;const result=A.claimContract(s,cfg,{contractBonus:0});assert.ok(result.ok);
 compareBig(result.gold,x.Big.floor(x.Big.mul(value,1.25)));compareBig(s.run.gold,x.Big.add(gold,result.gold));
 assert.equal(A.claimContract(s,cfg).ok,false);assert.equal(s.meta.adventures.contracts,1);assert.equal(A.offers(s,cfg).length,0);A.tick(s,120,cfg);assert.equal(A.offers(s,cfg).length,3);
});
test('опыт наставника хранится в банке и списывается выбранному герою один раз',()=>{
 const s=fresh(),offer=accept(s,'training'),open=cells(s);for(let i=0;i<offer.count;i++)s.run.grid[open[i]]=2;A.deliver(s,cfg,open.slice(0,offer.count),open,quote);
 assert.ok(A.claimContract(s,cfg).ok);assert.equal(s.meta.adventures.trainingXp,10);
 assert.equal(A.trainHero(s,cfg,'missing').ok,false);assert.equal(s.meta.adventures.trainingXp,10);
 s.meta.outpost.heroes.bran.unlocked=true;s.meta.outpost.heroes.bran.xp=0;
 assert.ok(A.trainHero(s,cfg,'bran').ok);assert.equal(s.meta.outpost.heroes.bran.xp,10);assert.equal(s.meta.adventures.trainingXp,0);assert.equal(A.trainHero(s,cfg,'bran').ok,false);
});
test('отмена и перековка сохраняют перезарядки и не возвращают переданные клинки',()=>{
 const s=fresh();accept(s);s.run.grid[0]=3;A.deliver(s,cfg,[0],cells(s),quote);assert.ok(A.cancelContract(s,cfg).ok);assert.equal(s.run.grid[0],0);assert.equal(A.offers(s,cfg).length,0);
 A.tick(s,70,cfg);A.onPrestige(s,cfg);assert.ok(s.meta.adventures.contractCooldown>=120);assert.equal(A.offers(s,cfg).length,0);assert.equal(A.claimContract(s,cfg).ok,false);
});
function kill(s,serial,gold='10e0',farm=false){s.run.encounterSerial=serial;return A.onKill(s,cfg,{serial,wave:s.run.wave,boss:false,farm,gold});}
test('поход считает только новые подходящие встречи, а развилка временно снимает модификатор',()=>{
 const s=fresh(45);s.run.encounterSerial=9;assert.ok(A.startExpedition(s,cfg,'quarry').ok);assert.equal(kill(s,9),false);assert.equal(kill(s,10,'10e0',true),false);
 assert.equal(kill(s,10),true);assert.equal(kill(s,10),false);assert.equal(kill(s,11),true);assert.equal(s.run.adventures.expedition.awaitingChoice,true);assert.equal(A.modifiers(s,cfg).hpMult,1);
 assert.equal(kill(s,12),false);assert.ok(A.chooseRoute(s,cfg,'short').ok);assert.equal(kill(s,12),false);assert.equal(kill(s,13),true);assert.equal(s.run.adventures.expedition.complete,true);
 const gold=s.run.gold,result=A.claimExpedition(s,cfg);assert.ok(result.ok);compareBig(result.gold,3);compareBig(s.run.gold,x.Big.add(gold,3));assert.equal(s.meta.adventures.trainingXp,6);assert.equal(A.claimExpedition(s,cfg).ok,false);assert.equal(A.startExpedition(s,cfg,'grove').ok,false);
});
test('руины требуют больше встреч и дают ограниченную награду от их настоящего золота',()=>{
 const s=fresh();A.startExpedition(s,cfg,'beacons');kill(s,1);kill(s,2);assert.ok(A.chooseRoute(s,cfg,'ruins').ok);assert.equal(A.modifiers(s,cfg).enemyKind,'channeler');assert.ok(A.modifiers(s,cfg).hpMult<=1.15);
 kill(s,3);kill(s,4);assert.equal(A.claimExpedition(s,cfg).ok,false);kill(s,5);const r=A.claimExpedition(s,cfg);compareBig(r.gold,7);assert.equal(r.xp,10);assert.equal(s.meta.adventures.collection.beacons,1);
});
test('время офлайн только уменьшает ожидание и не завершает поход или заказ',()=>{
 const s=fresh();accept(s);A.startExpedition(s,cfg,'grove');const before=clone(s.run.adventures);A.tick(s,36000,cfg);assert.deepStrictEqual(s.run.adventures,before);assert.equal(s.meta.adventures.trainingXp,0);
});
function solve(grid,target,budget){
 const queue=[{grid:grid.slice(),moves:[]}],seen=new Set([grid.join(',')]);
 for(let head=0;head<queue.length;head++){
  const cur=queue[head];if(cur.grid.some(v=>v>=target))return cur.moves;if(cur.moves.length>=budget)continue;
  for(let a=0;a<9;a++)if(cur.grid[a])for(let b=0;b<9;b++){
   if(Math.abs(Math.floor(a/3)-Math.floor(b/3))+Math.abs(a%3-b%3)!==1||cur.grid[b]&&cur.grid[b]!==cur.grid[a])continue;
   const next=cur.grid.slice();next[b]=next[b]?next[b]+1:next[a];next[a]=0;const key=next.join(',');if(seen.has(key))continue;seen.add(key);queue.push({grid:next,moves:cur.moves.concat([[a,b]])});
  }
 }
 return null;
}
test('три настоящие головоломки решаемы в бюджет и не меняют поле кузни',()=>{
 for(let tier=0;tier<3;tier++){
  const s=fresh(60+tier*10);s.run.grid[0]=21;s.run.pending=[22];const field=JSON.stringify({grid:s.run.grid,pending:s.run.pending,outpost:s.run.outpost,gold:s.run.gold});
  assert.ok(A.startTrial(s,cfg).ok);const trial=s.run.adventures.trial;const steps=solve(trial.grid,trial.target,trial.budget);assert.ok(steps,'puzzle '+tier);
  for(const [a,b] of steps)assert.ok(A.moveTrial(s,cfg,a,b).ok);assert.equal(s.run.adventures.trial.complete,true);
  assert.equal(JSON.stringify({grid:s.run.grid,pending:s.run.pending,outpost:s.run.outpost,gold:s.run.gold}),field);assert.ok(A.claimTrial(s,cfg).ok);assert.equal(s.meta.adventures.trainingXp,10);assert.equal(A.claimTrial(s,cfg).ok,false);assert.equal(A.startTrial(s,cfg).ok,false);
 }
});
test('испытание сохраняет промежуточный ход, повтор безопасен, следующая награда требует нового рекорда',()=>{
 const s=fresh(60);A.startTrial(s,cfg);assert.ok(A.moveTrial(s,cfg,0,1).ok);const reload=clone(s);assert.equal(A.validate(reload),null);assert.equal(reload.run.adventures.trial.moves,1);
 assert.ok(A.resetTrial(reload,cfg).ok);assert.equal(reload.run.adventures.trial.moves,0);const t=reload.run.adventures.trial;
 for(const [a,b] of solve(t.grid,t.target,t.budget))A.moveTrial(reload,cfg,a,b);A.claimTrial(reload,cfg);A.onPrestige(reload,cfg);assert.equal(A.startTrial(reload,cfg).ok,false);
 reload.run.maxWave=70;assert.ok(A.startTrial(reload,cfg).ok);assert.equal(reload.run.adventures.trial.tier,1);
});
test('ES5 и сериализация всех поручений',()=>{
 assert.deepStrictEqual(clone(x.Core.lint(fs.readFileSync(path.join(GAME,'adventures.js'),'utf8'),true)),[]);
 const s=fresh();accept(s);A.startExpedition(s,cfg,'quarry');A.startTrial(s,cfg);const reload=clone(s);assert.equal(A.validate(reload),null);assert.deepStrictEqual(A.model(reload,cfg),A.model(s,cfg));
 reload.run.adventures.trial.grid[0]=Infinity;assert.ok(A.validate(reload));
});

test('повреждённые награды, ветки и поля сохраняются для отказа валидатора, а не исправляются молча',()=>{
 const valid=fresh();accept(valid);A.startExpedition(valid,cfg,'quarry');A.startTrial(valid,cfg);assert.equal(A.validate(valid),null);
 const mutations=[
  s=>s.meta.adventures.trainingXp=-1,s=>s.meta.adventures.trainingXp=1000000000001,
  s=>s.meta.adventures.trialClaimedTier=.5,s=>s.meta.adventures.collection=null,
  s=>s.run.adventures.contract.mode='unknown',s=>s.run.adventures.contract.count=0,
  s=>s.run.adventures.contract.level=1001,s=>s.run.adventures.contract.bonus=.11,s=>s.run.adventures.contract.id='',
  s=>s.run.adventures.expedition.branch='unknown',s=>s.run.adventures.expedition.minSerial=-1,
  s=>s.run.adventures.expedition.progress=100,s=>s.run.adventures.expedition.complete=true,
  s=>s.run.adventures.trial.target=0,s=>s.run.adventures.trial.moves=.5,
  s=>s.run.adventures.trial.complete=true,s=>s.run.adventures.trial.grid[0]=0,
  s=>s.run.adventures.trial=0,s=>s.run.adventures=0,s=>s.meta.adventures=0
 ];
 for(const mutate of mutations){const s=clone(valid);mutate(s);const before=clone(s);A.ensure(s);assert.deepStrictEqual(s,before);assert.ok(A.validate(s));}
});

test('старый заказ без бонуса не усиливается задним числом, обучение не списывает опыт у предела',()=>{
 const s=fresh(),offer=accept(s),open=cells(s);for(let i=0;i<offer.count;i++)s.run.grid[open[i]]=2;A.deliver(s,cfg,open.slice(0,offer.count),open,quote);
 delete s.run.adventures.contract.bonus;assert.equal(A.validate(s),null);const value=s.run.adventures.contract.value;
 const claimed=A.claimContract(s,cfg,{contractBonus:1});compareBig(claimed.gold,x.Big.floor(x.Big.mul(value,1.15)));
 s.meta.adventures.trainingXp=10;s.meta.outpost.heroes.bran.unlocked=true;s.meta.outpost.heroes.bran.xp=cfg['adventures.training.cap'];
 assert.equal(A.trainHero(s,cfg,'bran').ok,false);assert.equal(s.meta.adventures.trainingXp,10);
});
done('adventures');
