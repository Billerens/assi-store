'use strict';
// The bot reads only exported logical deductions. A mistake either turns an intended flag
// into an opening (missed hold) or lands on an adjacent hidden cell. No hidden mine lookups.
// Time is an explicit thinking model: 0.6 s per decision + 0.25 s per action.
function play(x, state, options = {}) {
  const sim=x.sim,cfg=x.cfg;
  const errors=x.Rng.make(options.seed || 1234);
  const priorities=['spare','oak','sense','apprentice','boots','patch','shovel','xray','sand','brake','greedy-pick','belt','quiet-shop','vein','neat','stride','shard'];
  let actions=0,thinking=0,choices=0,shops=0,firstBuy=null,wrongTaps=0,stalled=false;
  let lastField=-1,fieldStart=0;const fieldSeconds=[];
  const rank=id=>{const i=priorities.indexOf(id);return i<0?priorities.length:i;};
  const time=()=>thinking*0.6+actions*0.25+choices*3+shops*3;
  if(state.run.status==='ready') sim.startRun(state,cfg,{seed:options.seed || 1234,mode:options.mode || 'rogue',depth:options.depth || 0},x.ctx(options.seed || 1234));
  for(let guard=0;guard<5000;guard++) {
    const r=state.run;
    if(r.fieldIndex!==lastField){if(lastField>=0)fieldSeconds.push(time()-fieldStart);lastField=r.fieldIndex;fieldStart=time();}
    if(['won','lost'].includes(r.status))break;
    if(r.status==='choice'){
      const picked=r.choices.slice().sort((a,b)=>rank(a)-rank(b))[0];
      sim.choose(state,picked,cfg);choices++;continue;
    }
    if(r.status==='shop'){
      for(const offer of r.shop.slice().sort((a,b)=>rank(a.id)-rank(b.id))) {
        if(sim.shopBuy(state,offer.id,cfg)){if(firstBuy===null)firstBuy=time();actions++;}
      }
      sim.advance(state,cfg);shops++;continue;
    }
    if(r.status!=='playing')throw Error('Unexpected phase '+r.status);
    const f=r.field;
    if(!f.generated){sim.tap(state,Math.floor(f.w*f.h/2),cfg,1);actions++;thinking++;continue;}
    if(r.tools.patch>0&&r.hearts<r.maxHearts){sim.useTool(state,'patch',0,cfg,1);actions++;continue;}
    const hints=sim.logicalHints(state,cfg);
    // Defuse every deducible mine before opening another safe cell.
    let movedWhileFlagging=false;
    for(const mine of hints.mines){
      if(state.run.status!=='playing')break;
      if(f.vis[mine.i]==='-'){
        if(errors.chance(options.missRate||0)){sim.tap(state,mine.i,cfg,1);wrongTaps++;movedWhileFlagging=true;}
        else sim.flag(state,mine.i,cfg);
        actions++;
        if(movedWhileFlagging)break;
      }
    }
    if(state.run.status!=='playing'||movedWhileFlagging)continue;
    let safe=hints.safe.find(i=>f.vis[i]==='-');
    if(safe===undefined) {
      // A wrong flag may hide the last safe square; remove only a logically proven wrong flag.
      const wrongFlag=hints.safe.find(i=>f.vis[i]==='f'||f.vis[i]==='F');
      if(wrongFlag!==undefined){sim.flag(state,wrongFlag,cfg);actions++;continue;}
      if(options.maxFields&&r.completed>=options.maxFields)break;
      stalled=true;break;
    }
    if(options.useTools!==false) {
      const tool=['shovel','xray'].find(id=>r.tools[id]>0);
      if(tool){sim.useTool(state,tool,safe,cfg,1);actions++;thinking++;continue;}
    }
    if(errors.chance(options.missRate || 0)){
      const nearby=[];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const px=safe%f.w+dx,py=Math.floor(safe/f.w)+dy,i=py*f.w+px;
        if(px>=0&&px<f.w&&py>=0&&py<f.h&&f.vis[i]==='-')nearby.push(i);
      }
      if(nearby.length){safe=errors.pick(nearby);wrongTaps++;}
    }
    sim.tap(state,safe,cfg,1);actions++;thinking++;
    if(options.maxFields&&state.run.completed>=options.maxFields)break;
    if(options.roundTrip && guard%11===0){
      const restored=x.Core.pick([{json:JSON.stringify(state),seq:state.seq,source:'bot'}],x.game,sim);
      if(!restored.state)throw Error('Save rejected '+JSON.stringify(restored.broken));
      Object.assign(state,restored.state);
    }
  }
  if(['won','lost'].includes(state.run.status))fieldSeconds.push(time()-fieldStart);
  return {state,won:state.run.status==='won',actions,thinking,seconds:time(),fieldSeconds,firstBuy,wrongTaps,stalled};
}
module.exports={play};
