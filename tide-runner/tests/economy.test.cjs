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
  record(p,run(9,100));p=trade(p,'gear','magnet',0);assert.deepEqual(p.gear,{magnet:1,boost:0});assert.equal(p.wallet,84);
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
  assert.deepEqual(p.gear,{magnet:0,boost:0});assert.deepEqual(p.ownedBoards,[0,1,2,3]);assert.deepEqual(p.ownedOutfits,[0]);
  assert.equal(record(p,past),false);assert.equal(p.wallet,31);
  p.fixed=[];saveProfile(p,null);const next=loadProfile(null);assert.ok(unlocked(next,2));assert.equal(trade(next,'board',2).skin,2);
});
