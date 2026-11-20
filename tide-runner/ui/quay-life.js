import {Model,PI} from './model-kit.js';

const ink='#254451',teal='#438d88',green='#558575',cream='#f4e5bf',brass='#d9a953',skin='#b97955',
  wood='#966c47',willow='#c19b62',rope='#cba674',navy='#36596b',rubber='#343e40',coral='#dc794e';
function person(role,far=false){
  const m=new Model(),show=!far,colour=[teal,'#d59b41',navy,coral][role];
  if(far){
    for(const side of [-1,1]){
      const x=side*.12,z=side*.06;
      m.rod([x,.07,z],[x+.01,.76,z],.064,.105,navy,7);
      m.loft([[0,.081,.14],[.10,.079,.11]],rubber,7,[x,0,z-.025]);
    }
    m.loft([[.73,.18,.12],[.84,.205,.14],[1.21,.23,.142],[1.34,.18,.12],[1.38,.082,.082]],colour,9);
    m.loft([[1.38,.077,.083],[1.45,.124,.123],[1.60,.134,.125],[1.65,.11,.09]],skin,9);
    m.loft([[1.59,.162,.153],[1.64,.172,.156],[1.69,.127,.12],[1.73,.063,.065]],role===1?brass:role===2?coral:cream,9);
    m.rod([-.2,1.25,0],[-.235,1.01,-.091],.085,.058,colour,6);
    if(role===0||role===3){m.box([0,.98,-.20],[.43,.19,.29],willow);m.rod([.20,1.25,0],[.23,1.03,-.1],.083,.06,colour,6);}
    return m.finish();
  }
  // Facing the quay. Foot, knee and hip centres stay on a natural soft-standing line.
  for(const s of [-1,1]){
    const x=s*.125,z=s*.061;
    m.oval([x,.089,z-.041],[.094,.09,.154],rubber);
    m.rod([x,.126,z],[x+.012,.47,z-.028],.073,.092,navy,9);
    m.rod([x+.012,.47,z-.028],[s*.111,.83,z*.3],.092,.123,navy,9);
  }
  m.loft([[.72,.18,.122],[.84,.204,.148],[1.04,.201,.14],[1.26,.247,.145],[1.34,.196,.129],[1.39,.10,.09]],colour,14);
  if(role===0){
    m.face([[-.117,1.29,-.15],[.107,1.29,-.15],[.168,.83,-.149],[.178,.71,-.128],[-.174,.71,-.128]],cream);
    m.tube([[-.115,1.25,-.15],[-.152,1.32,-.11],[-.155,1.34,.02]],.016,cream);
    m.tube([[.105,1.25,-.15],[.150,1.32,-.11],[.153,1.34,.02]],.016,cream);
  }else if(role===2){
    for(const y of [.89,1.03,1.17])m.loft([[y,.203+(y-.89)*.14,.147],[y+.048,.212+(y-.89)*.14,.149]],cream,12);
  }else if(role===3){
    m.tube([[-.157,1.31,.10],[-.10,1.12,.163],[.12,.84,.137]],.031,cream);
  }
  m.rod([0,1.32,0],[0,1.47,-.018],.073,.082,skin);
  m.loft([[1.397,.077,.08],[1.45,.118,.113,0,-.018],[1.56,.14,.128],[1.65,.124,.127],[1.68,.09,.09]],skin,12);
  m.oval([0,1.52,-.125],[.038,.03,.032],skin);
  if(show){
    for(const s of [-1,1]){
      m.oval([s*.057,1.54,-.117],[.014,.012,.014],ink);
      m.oval([s*.127,1.51,0],[.022,.032,.027],skin);
    }
  }
  if(role===0){
    m.loft([[1.59,.145,.137],[1.64,.154,.143],[1.70,.13,.104],[1.72,.06,.06]],cream,12);
    m.oval([-.124,1.60,.05],[.055,.076,.067],'#593e32');
  }else if(role===1||role===3){
    m.loft([[1.596,.187,.19],[1.628,.191,.19],[1.643,.143,.14],[1.715,.128,.12],[1.75,.077,.08]],role===1?brass:cream,14);
    m.loft([[1.635,.145,.142],[1.662,.144,.141]],role===1?wood:teal,12);
  }else{
    m.loft([[1.597,.146,.139],[1.64,.16,.146],[1.685,.157,.133],[1.731,.071,.07]],'#a74f3b',12);
  }
  const elbow=[-.28,1.047,-.057],hand=[-.22,.96,-.18];
  m.rod([-.21,1.25,-.005],elbow,.091,.076,colour,9);m.rod(elbow,hand,.063,.045,skin,9);
  m.oval(hand,[.054,.054,.056],skin);
  if(role===0||role===3){
    const otherHand=[.153,1.025,-.222];
    m.rod([.203,1.25,0],[.275,1.059,-.072],.09,.075,colour,9);
    m.rod([.275,1.059,-.072],otherHand,.062,.048,skin,9);
    m.box([0,.968,-.24],[.43,.20,.32],role===0?willow:'#9a6949');
    if(show)for(const x of [-.14,.14])m.box([x,.969,-.405],[.043,.222,.022],cream);
  }
  return m.finish();
}
function flagArm(role){
  const m=new Model(),c=role===1?'#d59b41':navy;
  m.rod([0,0,0],[.14,-.14,-.014],.087,.069,c,9);
  m.rod([.14,-.14,-.014],[.27,.031,-.089],.064,.042,skin,9);
  m.oval([.271,.048,-.092],[.051,.047,.047],skin);
  if(role===1){
    m.rod([.27,-.013,-.091],[.32,.58,-.105],.018,.014,wood,6);
    m.face([[.32,.566,-.105],[.307,.33,-.105],[.53,.35,-.016],[.67,.417,.022],[.52,.53,-.05]],coral);
    m.face([[.32,.539,-.11],[.313,.475,-.107],[.54,.434,-.016],[.60,.444,.008]],cream);
  }else{
    m.rod([.27,-.02,-.09],[.31,.21,-.10],.035,.024,'#846044',8);
  }
  return m.finish();
}
function netRack(far){
  const m=new Model();
  for(const s of [-1,1]){
    m.rod([s*.83,0,0],[s*.69,1.67,.06],.058,.047,wood,7);
    m.rod([s*.81,.04,.48],[s*.69,1.55,.06],.044,.039,willow,6);
  }
  m.rod([-.86,1.66,.06],[.86,1.66,.06],.047,.049,wood,8);
  const point=(u,v)=>[(u-.5)*1.36,1.57-v*(.80+.36*Math.sin(u*PI))-.06*Math.sin(u*PI),.08+.14*Math.sin(u*PI)*Math.sin(v*PI)];
  const N=far?4:9;
  for(let i=0;i<=N;i++){
    const u=i/N;
    m.tube([point(u,0),point(u,.5),point(u,1)],far?.012:.013,green,4);
    const v=i/N;
    m.tube([point(0,v),point(.25,v),point(.5,v),point(.75,v),point(1,v)],.012,teal,4);
    if(!far&&i%2===0)m.oval(point(u,.035),[.052,.051,.042],i%4?cream:coral);
  }
  return m.finish();
}
function pot(){
  const m=new Model();
  m.box([0,.075,0],[.90,.12,.68],wood);
  for(const z of [-.31,-.10,.10,.31]){
    const a=[];for(let j=0;j<=8;j++){const t=PI*j/8;a.push([.424*Math.cos(t),.10+.43*Math.sin(t),z]);}
    m.tube(a,.027,willow,5);
  }
  for(let j=0;j<=7;j++){const t=PI*j/7,x=.429*Math.cos(t),y=.10+.43*Math.sin(t);m.rod([x,y,-.34],[x,y,.34],.023,.023,rope,5);}
  m.ring([.12,.543,.04],.12,.028,rope,[PI/2,0,0]);return m.finish();
}
function cargoHeap(){
  const m=new Model();
  for(const [x,z,h,col] of [[-.34,-.19,.58,teal],[.26,.22,.49,wood],[-.12,.32,.63,'#b4774c']]){
    m.box([x,h*.46,z],[.63,h,.56],col);for(const s of [-1,1])m.box([x+s*.205,h*.47,z+.29],[.054,h,.034],willow);
  }
  m.loft([[0,.22,.21],[.09,.27,.24],[.31,.30,.27],[.58,.26,.24],[.65,.20,.20]],brass,12,[.53,0,-.35]);
  for(const h of [.16,.49])m.loft([[h,.282,.255],[h+.039,.282,.255]],ink,12,[.53,0,-.35]);return m.finish();
}
function marketCart(canopy){
  const m=new Model(),colour=canopy?teal:'#8f634c';
  for(const s of [-1,1]){
    m.ring([s*.52,.34,.05],.315,.043,navy,[0,PI/2,0]);
    for(let i=0;i<5;i++){
      const a=i*PI/5;
      m.rod([s*.52,.34+.28*Math.cos(a),.05+.28*Math.sin(a)],[s*.52,.34-.28*Math.cos(a),.05-.28*Math.sin(a)],.012,.013,willow,4);
    }
    m.rod([s*.42,.54,-.34],[s*.42,.83,-1.02],.043,.041,wood,6);
    m.rod([s*.39,.48,.45],[s*.39,.051,.7],.038,.040,navy,6);
  }
  m.box([0,.55,0],[.91,.25,1.47],colour);
  m.box([0,.7,0],[1.01,.067,1.56],willow);
  for(const z of [-.38,.38]){
    m.box([0,.745,z],[.84,.069,.67],cream);
    for(const s of [-1,1])m.box([s*.451,.785,z],[.055,.15,.71],wood);
    for(let i=0;i<3;i++){
      const x=(i-1)*.22;
      if(canopy){
        m.oval([x,.815,z],[.079,.058,.22],i%2?'#7d9f9e':'#a0bab3',[0,.18,0]);
        m.face([[x,.831,z+.15],[x-.072,.852,z+.27],[x+.073,.852,z+.25]],navy);
      }else m.rod([x,.808,z-.23],[x+.085,.81,z+.23],.046,.054,i%2?brass:ink,7);
    }
  }
  if(canopy){
    m.rod([0,.61,.18],[0,2.57,.18],.034,.024,brass,8);
    for(let j=0;j<10;j++){
      const a=j*2*PI/10,b=(j+1)*2*PI/10;
      const p=(angle,r,h)=>[r*Math.cos(angle),h,.18+r*Math.sin(angle)];
      const c=j%2?cream:'#cf7047';
      m.face([[0,2.52,.18],p(a,.54,2.40),p(b,.54,2.40)],c);
      m.face([p(a,.54,2.40),p(a,1.02,2.22),p(b,1.02,2.22),p(b,.54,2.40)],c);
      m.face([p(a,1.02,2.22),p((a+b)/2,1.03,2.14),p(b,1.02,2.22)],c);
    }
  }return m.finish();
}
function gauge(){
  const m=new Model();
  m.loft([[0,.20,.20],[.13,.22,.22],[.22,.14,.14]],navy,10);
  m.box([0,1.18,0],[.23,2.31,.16],cream);
  for(let j=0;j<9;j++)m.box([j%2?.057:.02,.28+j*.22,.086],[j%2?.08:.17,.038,.014],j%3?ink:coral);
  m.loft([[2.32,.179,.17],[2.53,.142,.14],[2.58,.09,.09]],brass,10);
  m.ring([.11,1.16,.11],.29,.069,cream);return m.finish();
}
function highBoat(){
  const m=new Model();
  m.skin([[-2,.05],[-1.43,.53],[.26,.74],[1.48,.48],[1.81,.20]].map(([z,w])=>[[-w,.37,z],[w,.37,z],[w*.83,.14,z],[0,-.12,z],[-w*.83,.14,z]]),[cream,navy,'#3c6b72','#3c6b72',navy]);
  m.rod([0,.3,-.32],[0,3.74,-.32],.032,.021,wood,6);
  m.face([[0,3.59,-.29],[.16,.61,.99],[.33,.71,-.23]],cream);m.face([[0,3.24,-.39],[0,.71,-1.61],[.05,.71,-.40]],'#cc8059');
  return m.finish();
}
function headland(){
  const m=new Model();
  const sections=[[-11,1.2,.30],[-8,3.7,1.8],[-4,5.1,3.1],[-1,6.3,4.0],[2.8,5.7,3.6],[6.4,4.5,2.6],[11,1.3,.50]];
  m.skin(sections.map(([z,w,h])=>[[-w,-.55,z],[-w*.82,h*.34,z],[-w*.30,h*.89,z],[w*.17,h,z],[w*.64,h*.55,z],[w,-.41,z]]),
    ['#899d90','#85a39a','#97b2a1','#a8b7a0','#94ab9b','#91aaa2']);
  for(let j=0;j<7;j++){
    const z=-5.8+j*1.7,h=1.3+(j%3)*.36;
    m.box([2.25,h*.5+.7,z],[1.12,h,1.4],j%2?'#c6bda3':'#d2cbb1');
    m.skin([z-.78,z+.78].map(at=>[[1.55,h+.68,at],[2.25,h+1.16,at],[2.95,h+.68,at]]),['#aa8977','#bd9980','#9aa098']);
  }
  return m.finish();
}
function pennants(){
  const m=new Model();
  m.tube([[0,0,-4.8],[0,-.33,-1.5],[0,-.36,1.1],[0,0,4.8]],.018,wood,4);
  const cols=[cream,coral,teal,brass];
  for(let j=0;j<8;j++){const z=-4.04+j*1.12,y=-.36*(1-Math.pow(z/4.8,2)),c=cols[j%4];
    m.face([[0,y,z-.21],[0,y,z+.22],[.09+(j%2)*.05,y-.48,z+.03]],c);}
  return m.finish();
}
function tern(wing){
  const m=new Model();
  if(wing){
    const parts=[[[0,.016,.08],[.19,.059,.06],[.38,.097,-.06],[.52,.111,-.17]],[[0,.015,-.12],[.19,.074,-.14],[.38,.098,-.15],[.52,.111,-.17]]];
    m.skin(parts,['#ebe2c8','#dfddd0','#38525b'],false);
  }else{
    m.oval([0,0,0],[.081,.076,.166],cream);m.oval([0,.075,-.081],[.066,.065,.071],cream);
    m.face([[0,.079,-.209],[-.028,.066,-.14],[.032,.065,-.14]],brass);
    for(const s of [-1,1])m.face([[0,.024,.119],[s*.043,.026,.20],[s*.076,.064,.284],[s*.063,.024,.12]],'#bec9bf');
  }return m.finish();
}
export function quayModels(){
  const models={signalArm:flagArm(1),mateArm:flagArm(2),netRack:netRack(false),netRackFar:netRack(true),lobsterPot:pot(),cargoHeap:cargoHeap(),fishCart:marketCart(true),toolCart:marketCart(false),gauge:gauge(),distantSail:highBoat(),headland:headland(),pennants:pennants(),tern:tern(false),ternWing:tern(true)};
  for(let i=0;i<4;i++){models['worker'+i]=person(i);models['worker'+i+'Far']=person(i,true);}
  return models;
}
