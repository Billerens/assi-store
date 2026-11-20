'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const race=require('../race.js');

test('running exchanges support feet, swings the opposite arm and deploys the board only when riding',async()=>{
  const {poseRider}=await import('../ui/rider-model.js');
  function pose(state,outfit=0){
    const parts={};
    poseRider((name,at,scale)=>{(parts[name]??=[]).push({at,scale});},state,0,false,false,outfit);
    return parts;
  }
  const r=race.fresh(43117),first=pose(r);
  r.d=5.95/2;const next=pose(r);
  assert.ok(first.rideShoe[0].at[1]<.06&&first.rideShoe[1].at[1]>.27);
  assert.ok(next.rideShoe[1].at[1]<.06&&next.rideShoe[0].at[1]>.27);
  assert.ok(first.rideHand[0].at[2]>first.rideHand[1].at[2]);
  assert.ok(next.rideHand[1].at[2]>next.rideHand[0].at[2]);
  for(const frame of [first,next]){
    for(const {scale} of frame.rideThigh)assert.ok(Math.abs(scale[1]-.393)<.001);
    for(const {scale} of frame.rideShin)assert.ok(Math.abs(scale[1]-.375)<.001);
    assert.equal(frame.rideBoard0,undefined);
  }
  const duck=pose({...r,slide:26}),jump=pose({...r,air:23});
  assert.ok(duck.rideHead[0].at[1]<first.rideHead[0].at[1]-.32);
  assert.ok(jump.rideShoe.every(foot=>foot.at[1]>.30));
  assert.ok(pose({...r,blend:1}).rideSurf0);
  assert.ok(pose({...r,surge:60}).rideBoard0);
  assert.ok(pose(r,3).rideHead3);
});
