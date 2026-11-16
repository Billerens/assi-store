'use strict';
const assert=require('assert');
const {load,harness}=require('./helpers');
const {play}=require('./bot');
const x=load();
process.on('exit',()=>x.env.close());
const count=Number(process.env.BALANCE_RUNS||100);
const cases=[
  {name:'empty',depth:0,workshop:{},target:0.25},
  {name:'middle',depth:0,workshop:{heart:1,supplies:2,pouch:2,choice:0,discount:2,luck:2},target:0.60},
  {name:'max',depth:0,workshop:{heart:2,supplies:3,pouch:5,choice:1,discount:4,luck:5},target:0.90},
  {name:'depth12',depth:12,workshop:{heart:2,supplies:3,pouch:5,choice:1,discount:4,luck:5},target:0.20}
];
harness.test('бот с ошибкой 2%: четыре мастерские, честные метрики и конечное состояние',()=>{
 const report=[];
 for(const variant of cases){
  let won=0,stalled=0,errors=0;const times=[],firstBuys=[],rewards=[],stalledSeeds=[];
  for(let n=0;n<count;n++){
   const seed=1000+n;
   const state=x.fresh(seed);
   state.meta.workshop=Object.assign({},variant.workshop);state.meta.depthUnlocked=variant.depth;
   const result=play(x,state,{seed,depth:variant.depth,missRate:0.02});
   if(result.won){won++;times.push(result.seconds);}
   if(result.stalled){stalled++;stalledSeeds.push(seed);console.log('BALANCE_STALL '+JSON.stringify({name:variant.name,seed,field:state.run.fieldIndex,board:state.run.field,talismans:state.run.talismans}));}
   errors+=result.wrongTaps;
   if(result.firstBuy!==null)firstBuys.push(result.firstBuy);
   rewards.push(x.Big.toNumber(state.run.reward));
   assert.equal(x.sim.validate(state),null,'seed '+seed);
   assert.equal(x.Core.validate(state,x.game),null,'seed '+seed);
  }
  const median=values=>{values.sort((a,b)=>a-b);return values.length?values[Math.floor(values.length/2)]:null;};
  report.push({name:variant.name,runs:count,wins:won,winRate:won/count,target:variant.target,stalled,stalledSeeds,wrongTaps:errors,medianWinSec:median(times),medianFirstShopSec:median(firstBuys),medianOre:median(rewards)});
 }
 console.log('BALANCE_REPORT '+JSON.stringify(report));
 assert.equal(report.reduce((sum,r)=>sum+r.stalled,0),0,'solver stalled: '+JSON.stringify(report.map(r=>[r.name,r.stalledSeeds])));
});
harness.done('balance minesweeper-rogue');
