import {Model} from './model-kit.js';

// The same local geometry is used by both previews, including Canvas.
function sprintBoot(){
  const m=new Model();
  m.loft([[-.32,.16,.41,0,-.02],[-.28,.19,.47,0,-.03],[-.23,.19,.46,0,-.03]],'#202e39');
  for(const z of [-.32,-.18,-.04,.32])m.box([0,-.323,z],[.30,.036,.065],'#52606a');
  m.loft([[-.22,.17,.44,0,-.04],[-.13,.19,.42,0,-.03],[-.04,.17,.31,0,.04],[.14,.14,.17,0,.16],[.23,.13,.14,0,.17]],'#308686');
  m.oval([0,-.12,-.29],[.17,.079,.18],'#d7e7ca');
  m.loft([[.17,.135,.148,0,.17],[.24,.15,.15,0,.17],[.262,.115,.116,0,.17]],'#f5c96b');
  m.oval([0,.252,.17],[.109,.016,.106],'#233944');
  for(let i=0;i<4;i++)m.rod([-.105,-.054+i*.033,-.20+i*.077],[.105,-.054+i*.033,-.17+i*.077],.014,.014,'#f7e1a8');
  for(const side of [-1,1]){
    m.rod([side*.175,-.172,-.2],[side*.163,.03,.135],.024,.025,'#f5b14f');
    for(let i=0;i<3;i++)m.ring([side*.094,-.208+i*.024,.23],.051,.01,'#f2a94b',[Math.PI/2,0,0]);
  }
  return m.finish();
}
function kneePads(){
  const m=new Model();
  for(const side of [-1,1]){
    const x=side*.178,y=side*.055;
    m.oval([x,y,0],[.153,.235,.095],'#273b49');
    for(const offset of [-.135,.13]){
      m.ring([x,y+offset,-.022],.124,.025,'#53758a',[Math.PI/2,0,0],[1,.74,1]);
      m.box([x+.104,y+offset,.046],[.044,.043,.036],'#ebb468');
    }
    m.oval([x,y,.052],[.136,.188,.086],'#3b7388');
    m.oval([x,y+.023,.097],[.112,.129,.051],'#92bac1');
    for(const dy of [-.057,0,.057])m.rod([x-.067,y+dy,.14],[x+.067,y+dy,.14],.009,.009,'#557a84');
  }
  return m.finish();
}
function expressPass(){
  const m=new Model();
  m.tube([[-.16,.11,0],[-.18,.37,-.03],[.02,.57,-.07],[.16,.42,-.04],[.07,.11,0]],.024,'#537e85');
  m.box([0,-.11,0],[.51,.34,.061],'#8e633b');
  m.box([0,-.10,.038],[.475,.30,.021],'#e9bd60');
  m.box([0,-.107,.055],[.414,.244,.012],'#284b57');
  for(const x of [-.147,.147])m.box([x,-.112,.065],[.018,.175,.012],'#e6b35e');
  for(let i=0;i<3;i++)m.rod([-.082,-.17+i*.055,.071],[.055,-.14+i*.055,.071],.012,.012,'#f1cd7c');
  m.ring([-.043,.071,.015],.041,.013,'#ac8050');
  return m.finish();
}
export const railGear={boots:sprintBoot,pads:kneePads,pass:expressPass};
