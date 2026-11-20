import {Model,PI} from './model-kit.js';

function token(far=false){
  const m=new Model();
  if(far){
    m.rod([0,0,-.055],[0,0,.055],.295,.295,'#e4a136',12);
    for(const side of [-1,1]){
      const z=.06*side;
      m.rod([0,0,z],[0,0,z*1.10],.241,.241,'#ffe88b',10);
      m.face([[-.032,.125,z*1.2],[.032,.125,z*1.2],[.032,-.06,z*1.2],[.12,-.015,z*1.2],[0,-.136,z*1.2],[-.12,-.015,z*1.2],[-.032,-.06,z*1.2]],'#b77b32');
    }
    return m.finish();
  }
  m.rod([0,0,-.066],[0,0,.066],.295,.295,'#e28b24',16);
  for(const side of [-1,1]){
    const z=.07*side;
    m.rod([0,0,z],[0,0,z*1.12],.258,.258,'#fff39a',16);
    m.rod([0,0,z*1.18],[0,0,z*1.23],.205,.205,'#f3b637',16);
    const face=.094*side,navy='#99552c';
    m.ring([0,.104,face],.035,.013,navy);
    m.rod([0,.071,face],[0,-.119,face],.017,.017,navy);
    m.tube([[-.127,-.044,face],[-.076,-.106,face],[0,-.127,face],[.077,-.106,face],[.127,-.044,face]],.019,navy);
    m.rod([-.057,.036,face],[.057,.036,face],.014,.014,navy);
  }
  return m.finish();
}
function magnet(){
  const m=new Model();
  m.tube([[-.256,.23,0],[-.255,-.054,0],[-.167,-.224,0],[0,-.29,0],[.167,-.224,0],[.255,-.054,0],[.256,.23,0]],.105,'#f2583c',8);
  for(const s of [-1,1]){
    m.box([s*.25,.219,0],[.208,.156,.207],'#faedc7');
    m.box([s*.25,.298,0],[.207,.045,.205],'#4cbbc3');
  }
  return m.finish();
}
function boost(){
  const m=new Model();
  m.loft([[-.36,.078,.093],[-.29,.15,.14],[-.20,.192,.171],[.19,.19,.17],[.269,.133,.13],[.31,.06,.068]],'#f3833c',14);
  for(const y of [-.22,.195])m.loft([[y,.195,.174],[y+.037,.193,.173]],'#235a6c',14);
  m.ring([0,.32,0],.073,.018,'#ffdc82');
  m.face([[.02,.166,.174],[-.096,-.024,.175],[-.017,-.024,.176],[-.048,-.17,.176],[.103,.037,.176],[.025,.026,.176]],'#fff5ac');
  for(const side of [-1,1])m.face([[side*.117,-.15,0],[side*.23,-.26,0],[side*.21,-.025,0]],'#f5bf58');
  m.ring([0,-.313,0],.087,.016,'#ffd987',[PI/2,0,0]);
  return m.finish();
}
export function pickupModels(){return {portToken:token(),portTokenFar:token(true),magnetPickup:magnet(),boostPickup:boost()};}
