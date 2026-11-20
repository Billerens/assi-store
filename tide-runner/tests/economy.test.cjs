'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
global.window={TideRace:require('../race.js')};
let stored;
global.localStorage={getItem:()=>stored,setItem:(_,value)=>{stored=value;}};
const run=(id,n,mode='open')=>({id:'run-'+id,mode,tokens:n,meters:id+1,score:id+1,bestBank:0,bestChain:0,at:id,seed:17});

test('only finished open and fixed attempts pay, even after leaderboard eviction, save and reload',async()=>{
  const {blank,record,loadProfile,saveProfile}=await import('../ui/profile.js');
  let p=blank();
  p.live={id:'run-13',state:{tokens:8}};saveProfile(p,null);p=loadProfile(null);assert.equal(p.wallet,0);
  assert.equal(record(p,run(13,8,'practice')),false);assert.equal(record(p,run(13,8,'replay')),false);
  for(let i=1;i<40;i++)record(p,run(i,3));
  assert.ok(!p.rows.some(r=>r.id==='run-1'));assert.equal(p.wallet,117);
  record(p,run(40,4,'fixed'));assert.equal(p.wallet,121);
  saveProfile(p,null);p=loadProfile(null);
  assert.equal(record(p,run(1,3)),false);assert.equal(record(p,run(40,4,'fixed')),false);assert.equal(p.wallet,121);
});
test('gear purchases cannot skip levels or repeat a charge; cosmetics and equipment survive hub save',async()=>{
  const {blank,saveProfile,loadProfile,record}=await import('../ui/profile.js');
  const {trade}=await import('../ui/economy.js');
  let p=blank();
  assert.equal(trade(p,'gear','magnet',0),p);assert.equal(trade(p,'outfit',1),p);
  record(p,run(9,100));p=trade(p,'gear','magnet',0);assert.deepEqual(p.gear,{magnet:1,boost:0,boots:0,pads:0,pass:0});assert.equal(p.wallet,84);
  assert.equal(trade(p,'gear','magnet',0),p);assert.equal(trade(p,'gear','magnet',2),p);
  p=trade(p,'outfit',1);assert.equal(p.wallet,60);assert.equal(trade(p,'outfit',1),p);
  p=trade(p,'outfit',0);p=trade(p,'outfit',1);assert.equal(p.wallet,60);assert.equal(p.outfit,1);
  const hub={state:{meta:{}},act(fn){fn(this.state);}};saveProfile(p,hub);const loaded=loadProfile(hub);
  assert.deepEqual(loaded,p);assert.notEqual(loaded,hub.state.meta.profile);
});
test('legacy profiles retain wallet, standings, unlocked boards and currently worn paint across a rules change',async()=>{
  const {loadProfile,saveProfile,unlocked,record}=await import('../ui/profile.js');
  const {trade}=await import('../ui/economy.js');
  const past={...run(5,9,'fixed'),meters:1111};
  const raw={v:0,fullWave:true,bestBank:90,skin:3,wallet:31,rows:[],fixed:[past]};
  stored=JSON.stringify(raw);const p=loadProfile(null);assert.equal(p.wallet,31);assert.equal(p.skin,3);
  assert.deepEqual(p.gear,{magnet:0,boost:0,boots:0,pads:0,pass:0});assert.deepEqual(p.ownedBoards,[0,1,2,3]);assert.deepEqual(p.ownedOutfits,[0]);
  assert.equal(record(p,past),false);assert.equal(p.wallet,31);
  p.fixed=[];saveProfile(p,null);const next=loadProfile(null);assert.ok(unlocked(next,2));assert.equal(trade(next,'board',2).skin,2);
});

test('one-time depot rewards and all five equipment levels persist across sessions',async()=>{
  const {blank,record,saveProfile,loadProfile}=await import('../ui/profile.js');
  const {trade,GEARS,UPGRADE_COST}=await import('../ui/economy.js');
  let p=blank();
  const result={...run(1,15),rules:3,meters:1100,nearTally:3,roofTally:3};
  assert.equal(record(p,{...result,mode:'practice'}),false);assert.equal(p.wallet,0);
  assert.equal(record(p,result),true);assert.equal(result.contractBonus,155);assert.equal(p.wallet,170);
  saveProfile(p,null);p=loadProfile(null);assert.deepEqual(p.contracts,['roof','express','line']);
  assert.equal(record(p,result),false);assert.equal(p.wallet,170);
  const next={...result,id:'next'};record(p,next);assert.equal(next.contractBonus,0);assert.equal(p.wallet,185);
  const total=UPGRADE_COST.reduce((a,b)=>a+b,0);
  p={...p,wallet:GEARS.length*total};
  for(const gear of GEARS){
    for(let level=0;level<5;level++)p=trade(p,'gear',gear,level);
    assert.equal(p.gear[gear],5);assert.equal(trade(p,'gear',gear,5),p);
  }
  assert.equal(p.wallet,0);
  saveProfile(p,null);assert.deepEqual(loadProfile(null).gear,p.gear);
});
