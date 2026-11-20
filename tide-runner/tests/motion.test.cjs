'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const race=require('../race.js');

test('running exchanges support feet, swings the opposite arm and deploys the board only when riding',async()=>{
  const {poseRider,runCycle}=await import('../ui/rider-model.js');
  function pose(state,outfit=0){
    const parts={};
    poseRider((name,at,scale)=>{(parts[name]??=[]).push({at,scale});},state,0,false,false,outfit);
    return parts;
  }
  const r=race.fresh(43117),first=pose(r);
  const course=race.course(r.seed);
  while(runCycle(r)<.5)race.step(r,course);
  const next=pose(r);
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
  const padded=pose({...r,rules:3,slide:60,gear:{pads:5}});
  assert.ok(padded.rideHead[0].at[1]<first.rideHead[0].at[1]-.32);
  const falling=pose({...r,rules:3,surface:'air',fallSpeed:9});
  assert.ok(falling.rideShoe.every(foot=>foot.at[1]>.25));
});

test('on straight rails every outfit faces along the track; successive footfalls and shoulder turns mirror',async()=>{
  const {poseRider}=await import('../ui/rider-model.js');
  const {Vector3}=await import('../vendor/three.module.js');
  const r=race.fresh(337);
  function frame(state,phase,outfit){
    const parts={};
    poseRider((part,at,scale,q)=>{
      (parts[part]??=[]).push({at,q,facing:new Vector3(0,0,-1).applyQuaternion(q)});
    },state,0,false,false,outfit,phase);
    return parts;
  }
  for(const outfit of [0,1,2,3]){
    const skin=outfit||'';
    for(let i=0;i<12;i++){
      const a=frame(r,i/12,outfit),b=frame(r,((i+6)%12)/12,outfit);
      const head=a['rideHead'+skin][0].facing, shoulders=a['rideTorso'+skin][0].facing;
      assert.ok(Math.abs(head.x)<.002 && head.z<-.99,'centreline from rear of helmet');
      assert.ok(Math.abs(shoulders.x)<.08 && shoulders.z<-.94,'shoulders stay square');
      assert.ok(Math.abs(shoulders.x+b['rideTorso'+skin][0].facing.x)<.001);
      const [left,right]=a['rideShoe'+skin], nextRight=b['rideShoe'+skin][1];
      assert.ok(left.at[0]<-.1 && right.at[0]>.1);
      assert.ok(Math.hypot(left.at[0]+nextRight.at[0],left.at[1]-nextRight.at[1],left.at[2]-nextRight.at[2])<.001);
    }
  }
  for(const [lane,sign] of [[0,-1],[2,1]]){
    const head=frame({...r,lane,pos:1},.3,0).rideHead[0].facing;
    assert.ok(head.x*sign>.10,'looks into the lane change');
  }
});
