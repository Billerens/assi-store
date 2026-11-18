'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {H,GAME}=require('./env');
const Big=require(path.join(H.HUB,'engine/big.js'));
const scope={exports:{},require:p=>{assert.equal(p,'../engine/big.js');return Big;}};
vm.runInNewContext(fs.readFileSync(path.join(GAME,'artifacts.js'),'utf8'),scope,{filename:'artifacts.js'});
const A=scope.exports,copy=x=>JSON.parse(JSON.stringify(x)),cfg={};
let passed=0;function test(name,fn){fn();passed++;console.log('ok '+name);}
function fresh(wave=150,prestige=1){const s={ver:3,seq:17,run:{maxWave:wave,gold:'1e5',grid:[8,8,4],pending:[9]},meta:{seed:12,custom:{keep:['yes',4]}},layers:{forge:{count:prestige,currency:'1e100',state:{record:wave,spent:'3e0',paid:7,total:99}},star:{count:0,currency:'0e0',state:{}}}};A.ensure(s);return s;}
function sameBig(a,b){assert.equal(Big.str(a),Big.str(b));}
function unlockAll(s,n=1){for(const d of A.CATALOG)s.meta.artifacts.items[d.id]={level:n,enabled:true,cooldown:0};}
function notExtensions(s){const c=copy(s);delete c.meta.artifacts;delete c.run.artifacts;return c;}
function allZero(mods){assert.ok(Object.values(mods).every(v=>v===0));}
test('37 distinct relics: 17 simultaneous passives,12 manual procs,8 independent actives',()=>{
 assert.equal(A.CATALOG.length,37);assert.equal(new Set(A.CATALOG.map(d=>d.id)).size,37);
 for(const [kind,n]of [['passive',17],['click',12],['active',8]])assert.equal(A.CATALOG.filter(d=>d.kind===kind).length,n);
 assert.equal(new Set(A.CATALOG.filter(d=>d.kind==='passive').map(d=>d.effect)).size,17);
});
test('empty collection is exact identity; additive ensure preserves arbitrary legacy data and consumes no RNG',()=>{
 const s=fresh();delete s.meta.artifacts;delete s.run.artifacts;const before=copy(s);A.ensure(s);assert.deepEqual(notExtensions(s),before);const once=JSON.stringify(s);A.ensure(s);assert.equal(JSON.stringify(s),once);
 let rolls=0;const rng={next(){rolls++;return 0;}};allZero(A.modifiers(s));assert.equal(A.onTap(s,cfg,rng,{manual:true,accepted:true}).commands.length,0);A.offline(s,3600);assert.equal(rolls,0);assert.deepEqual(notExtensions(s),before);assert.equal(A.validate(s),null);
});
test('six progressive groups require first prestige; old owned items remain accessible',()=>{
 const s=fresh(60,0);assert.equal(A.model(s,cfg).availableCount,0);s.layers.forge.count=1;
 for(const[wave,count]of [[60,6],[70,12],[80,19],[100,25],[120,31],[150,37]]){s.run.maxWave=wave;s.layers.forge.state.record=wave;assert.equal(A.model(s,cfg).availableCount,count);}
 assert.ok(A.buy(s,cfg,'twinLever').ok);s.run.maxWave=1;s.layers.forge.state.record=0;s.layers.forge.count=0;assert.ok(A.available(s,'twinLever'));assert.ok(!A.available(s,'feedingBowl'));
});
test('purchase and upgrade spend exactly live price, preserve total-earned coal bonus, never grant ordinary upgrade levels',()=>{
 const s=fresh();s.layers.forge.currency='1e3';s.run.up={sharp:17};const ordinary=copy(s.run.up),before=copy(s.layers.forge.state),total=Big.add(s.layers.forge.currency,s.layers.forge.state.spent);
 for(let n=1;n<=3;n++){const price=A.cost(s,cfg,'pairHammer'),balance=s.layers.forge.currency,spent=s.layers.forge.state.spent;const result=A.buy(s,cfg,'pairHammer');assert.ok(result.ok);assert.equal(result.level,n);sameBig(s.layers.forge.currency,Big.sub(balance,price));sameBig(s.layers.forge.state.spent,Big.add(spent,price));sameBig(Big.add(s.layers.forge.currency,s.layers.forge.state.spent),total);}
 sameBig(s.layers.forge.currency,994);sameBig(s.layers.forge.state.spent,9);
 assert.deepEqual(s.run.up,ordinary);for(const k of ['record','paid','total'])assert.equal(s.layers.forge.state[k],before[k]);
 s.layers.forge.currency='0e0';const poor=JSON.stringify(s);assert.equal(A.buy(s,cfg,'whetstone').ok,false);assert.equal(JSON.stringify(s),poor);
});
test('every owned passive contributes simultaneously; toggling one never disables another, each upgrade has positive marginal value',()=>{
 const s=fresh();unlockAll(s);const all=A.modifiers(s);assert.equal(A.model(s,cfg).owned,37);assert.ok(A.model(s,cfg).allOwnedActive);
 for(const d of A.CATALOG.filter(d=>d.kind==='passive')){
  assert.ok(all[d.effect]>0,d.id);A.setEnabled(s,d.id,false);const without=A.modifiers(s);assert.ok(without[d.effect]<all[d.effect],d.id);for(const k in all)if(k!==d.effect)assert.equal(without[k],all[k]);
  A.setEnabled(s,d.id,true);s.meta.artifacts.items[d.id].level++;assert.ok(A.modifiers(s)[d.effect]>all[d.effect],d.id);s.meta.artifacts.items[d.id].level--;
 }
});
test('all12 accepted manual triggers may work together but merge command is at most one; auto/rejected/offline never roll',()=>{
 const s=fresh();unlockAll(s);let rolls=0;const rng={next(){rolls++;return 0;}};
 for(const ctx of [{},{manual:false,accepted:true},{manual:true,accepted:false}])assert.equal(A.onTap(s,cfg,rng,ctx).commands.length,0);assert.equal(rolls,0);
 const before=copy(s),hit=A.onTap(s,cfg,rng,{manual:true,accepted:true});assert.equal(hit.commands.length,12);assert.equal(hit.commands.filter(c=>c.kind==='merge').length,1);assert.equal(hit.commands.find(c=>c.kind==='merge').value,1);assert.deepEqual(copy(s),before);assert.equal(rolls,12);
 A.setEnabled(s,'pairHammer',false);const disabled=A.onTap(s,cfg,rng,{manual:true,accepted:true});assert.equal(disabled.commands.length,11);assert.ok(!disabled.commands.some(c=>c.kind==='merge'));
 const beforeNoTarget=rolls;assert.equal(A.onTap(s,cfg,rng,{manual:true,accepted:true,can:Object.fromEntries(A.CATALOG.filter(d=>d.kind==='click').map(d=>[d.effect,false]))}).commands.length,0);assert.equal(rolls,beforeNoTarget);
});
test('all8 active relics work at once; their cooldowns are independent and upgrades/toggles/reload cannot reset them',()=>{
 const s=fresh();unlockAll(s);const active=A.CATALOG.filter(d=>d.kind==='active');for(const d of active)assert.ok(A.activate(s,cfg,d.id).ok,d.id);assert.equal(Object.keys(s.run.artifacts.effects).length,5);
 for(const d of active){const cooldown=s.meta.artifacts.items[d.id].cooldown;assert.ok(cooldown>0);assert.equal(A.activate(s,cfg,d.id).ok,false);A.setEnabled(s,d.id,false);A.setEnabled(s,d.id,true);assert.equal(s.meta.artifacts.items[d.id].cooldown,cooldown);assert.ok(A.buy(s,cfg,d.id).ok);assert.equal(s.meta.artifacts.items[d.id].cooldown,cooldown);}
 const loaded=copy(s);A.ensure(loaded);assert.deepEqual(loaded,copy(s));const meta=copy(s.meta.artifacts);s.run={maxWave:1};s.layers.forge={count:0,currency:'0e0',state:{spent:'0e0'}};s.layers.star.count=1;A.ensure(s);assert.deepEqual(copy(s.meta.artifacts),meta);assert.deepEqual(copy(s.run.artifacts.effects),{});
});
test('no-target activation is rejected atomically before consuming cooldown',()=>{
 const s=fresh();unlockAll(s);const before=JSON.stringify(s);assert.equal(A.activate(s,cfg,'twinLever',{can:{merge:false}}).ok,false);assert.equal(JSON.stringify(s),before);
});
test('timed effects expire in game-time segments and never contaminate a passive-only offline rate',()=>{
 const s=fresh();unlockAll(s);const passive=copy(A.modifiers(s,cfg,{passiveOnly:true}));A.activate(s,cfg,'warStandard');A.activate(s,cfg,'frozenClock');assert.equal(A.nextExpiry(s),10);assert.ok(A.modifiers(s).damage>passive.damage);assert.deepEqual(copy(A.modifiers(s,cfg,{passiveOnly:true})),passive);
 const split=copy(s);A.tick(split,3);A.tick(split,6);A.tick(s,9);assert.deepEqual(copy(s),split);A.offline(s,3);assert.equal(A.nextExpiry(s),Infinity);assert.deepEqual(copy(A.modifiers(s)),passive);assert.ok(s.meta.artifacts.items.warStandard.cooldown>0);A.offline(s,1e6);assert.equal(s.meta.artifacts.items.warStandard.cooldown,0);assert.deepEqual(copy(A.modifiers(s)),passive);
});
test('all channels stay strictly below documented bounds even with every active and level1million',()=>{
 for(const n of [1,100,1000000]){const s=fresh();unlockAll(s,n);for(const d of A.CATALOG.filter(d=>d.kind==='active'))assert.ok(A.activate(s,cfg,d.id).ok);const mods=A.modifiers(s);for(const k in mods)assert.ok(Number.isFinite(mods[k])&&mods[k]>=0&&mods[k]<A.LIMITS[k],k);assert.equal(A.validate(s),null);}
});
test('model gives live prices, progressive unlocks and positive upgrade previews for disabled items without enabling them',()=>{
 const s=fresh();A.buy(s,cfg,'whetstone');A.setEnabled(s,'whetstone',false);const before=JSON.stringify(s),item=A.model(s,cfg).items.find(d=>d.id==='whetstone');assert.ok(item.nextRequiresEnable);assert.ok(item.next.args[0]>item.current.args[0]);assert.equal(JSON.stringify(s),before);assert.equal(s.meta.artifacts.items.whetstone.enabled,false);
});
test('critical chance overflow remains useful at the ordinary cap with identical expected damage; disabled crits stay disabled',()=>{
 const s=fresh();unlockAll(s,100);A.activate(s,cfg,'focusCrystal');const mods=A.modifiers(s);
 for(const base of [0,.1,.38,.4]){
  const result=A.criticalStats(s,{'crit.maxChance':.4},base,2.5);
  assert.ok(result.chance<=.4);const expected=1+(base+mods.critChance)*(2.5*(1+mods.critMult)-1);
  assert.ok(Math.abs((1+result.chance*(result.multiplier-1))-expected)<1e-12);
 }
 const capped=A.criticalStats(s,{'crit.maxChance':.4},.4,2.5);assert.ok(capped.overflow>0);assert.ok(capped.multiplier>2.5*(1+mods.critMult));
 const disabled=A.criticalStats(s,{'crit.maxChance':0},.4,2.5);assert.equal(disabled.chance,0);assert.equal(disabled.overflow,0);
 const empty=fresh();assert.deepEqual(copy(A.criticalStats(empty,{'crit.maxChance':.4},.2,2.5)),{chance:.2,multiplier:2.5,overflow:0});
 assert.ok(A.modifiers(s).offlineIncome>0);assert.equal(A.modifiers(s).offlineShare,undefined);
});
test('invalid saved levels/timers/flags/effects are rejected and never silently repaired',()=>{
 const mutations=[s=>s.meta.artifacts=null,s=>s.meta.artifacts.items=[],s=>s.meta.artifacts.items.whetstone={level:-1,enabled:true,cooldown:0},s=>s.meta.artifacts.items.whetstone={level:1.5,enabled:true,cooldown:0},s=>s.meta.artifacts.items.whetstone={level:1,enabled:'yes',cooldown:0},s=>s.meta.artifacts.items.warStandard={level:1,enabled:true,cooldown:-1},s=>{s.meta.artifacts.items.warStandard={level:1,enabled:true,cooldown:0};s.run.artifacts.effects.warStandard={left:13,power:.1};},s=>s.run.artifacts.effects.warStandard={left:2,power:.1}];
 for(const mutate of mutations){const s=fresh();mutate(s);const raw=JSON.stringify(s);A.ensure(s);assert.equal(JSON.stringify(s),raw);assert.ok(A.validate(s));}
});
test('large-rank coal prices use Big without Infinity and unrelated unknown data survive purchases',()=>{
 const s=fresh();s.layers.forge.currency='1e1000';s.meta.artifacts.extra={legacy:'yes'};s.meta.artifacts.items.whetstone={level:1000,enabled:true,cooldown:0,unknown:['keep']};const price=A.cost(s,cfg,'whetstone');assert.ok(Big.valid(price)&&Big.gt(price,'1e100'));assert.ok(A.buy(s,cfg,'whetstone').ok);assert.deepEqual(s.meta.artifacts.items.whetstone.unknown,['keep']);assert.deepEqual(s.meta.artifacts.extra,{legacy:'yes'});assert.deepEqual(s.meta.custom,{keep:['yes',4]});
});
console.log('Artifacts: '+passed+' meaningful cases passed');
