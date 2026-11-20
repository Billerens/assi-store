import * as T from '../vendor/three.module.js';
import {Model, PI} from './model-kit.js';
import {outfitModels} from './outfit-models.js';

const ink='#183848',deep='#244d59',teal='#277f80',safety='#fc723d',coral='#c7492b',honey='#ffc950',cream='#fff1cb',leather='#ad6546',skin='#b97751';
const denim='#345d69';
function board(color,water=false){
  const m=new Model();
  const stations=[[-1.22,.022,.30],[-1.12,.22,.24],[-.88,.33,.19],[-.47,.38,.16],[.08,.37,.15],[.57,.33,.17],[.91,.28,.21],[1.08,.19,.29],[1.13,.04,.30]];
  const sections=stations.map(([z,w,y])=>[[-w*.88,y+.045,z],[0,y+.056,z],[w*.88,y+.045,z],[w,y+.011,z],[w*.94,y-.016,z],[w*.78,y-.052,z],[0,y-.066,z],[-w*.78,y-.052,z],[-w*.94,y-.016,z],[-w,y+.011,z]]);
  m.skin(sections,[color,color,'#fff1b7','#e3ad55','#653f30','#1e5559','#226b70','#653f30','#e3ad55','#fff1b7']);
  for(const [z,w,l] of [[-.52,.255,.38],[.45,.23,.35]]){
    m.oval([0,.22,z],[w,.015,l],ink);
    for(const zz of [-.12,0,.12])m.box([0,.236,z+zz],[w*1.45,.008,.012],'#83a49c');
  }
  for(const z of [-.88,-.78,.81,.91]){
    const w=z<0?.23:.20,y=z<0?.248:.27;
    m.face([[-w,y,z+.05],[0,y+.01,z-.028],[w,y,z+.05],[w,y,z+.09],[0,y+.01,z+.025],[-w,y,z+.09]],cream);
  }
  if(water){
    for(const x of [-.19,.19])m.face([[x,.11,.47],[x+.02,-.115,.6],[x+.02,-.155,.79],[x,.14,.74]],deep);
  }else for(const z of [-.64,.64]){
    m.box([0,.095,z],[.28,.10,.13],ink);
    m.rod([-.35,.083,z],[.35,.083,z],.038,.038,'#b5beb0',10);
    for(const s of [-1,1]){
      m.rod([s*.27,.1,z],[s*.39,.1,z],.105,.105,'#d97542',12);
      m.rod([s*.39,.1,z],[s*.41,.1,z],.071,.071,cream,12);
      m.rod([s*.41,.1,z],[s*.417,.1,z],.031,.031,ink,10);
    }
  }
  m.tube([[-.1,.24,.89],[.04,.29,1.11],[.28,.34,1.12],[.35,.29,.91],[.25,.25,.75]],.018,honey);
  return m.finish();
}
function torso(){
  const m=new Model();
  m.loft([[-.035,.205,.151],[.01,.229,.168],[.09,.225,.174],[.22,.248,.163],[.38,.295,.182],[.48,.287,.158],[.53,.21,.132],[.55,.112,.10]],safety,18);
  m.loft([[-.047,.202,.154],[.003,.234,.173],[.043,.232,.172]],deep,18);
  m.loft([[.43,.27,.15],[.50,.265,.156],[.542,.17,.116]],'#ff9955',18);
  // Raised hood and collar frame the neck. The facing side is the rider’s back (+Z).
  m.oval([0,.488,.104],[.191,.104,.124],coral,[.42,0,0]);
  m.tube([[-.173,.50,.115],[-.117,.415,.205],[0,.393,.224],[.144,.431,.185],[.185,.511,.101]],.023,cream);
  for(const s of [-1,1]){
    m.tube([[s*.06,.5,.148],[s*.19,.405,.155],[s*.244,.32,.122]],.019,cream);
    m.tube([[s*.193,.075,.099],[s*.22,.14,.096],[s*.24,.26,.061]],.008,coral);
  }
  m.tube([[-.246,.44,.115],[-.15,.349,.19],[-.035,.254,.195],[.083,.141,.179],[.18,.036,.133]],.039,ink);
  m.loft([[-.105,.09,.038],[-.075,.136,.056],[.046,.145,.060],[.087,.122,.052]],deep,12,[.098,.169,.173],[.08,0,.26]);
  m.rod([-.025,.234,.221],[.214,.194,.198],.035,.035,teal);
  m.box([.108,.163,.242],[.032,.075,.013],cream,[0,0,.20]);
  m.ring([.208,.146,.199],.035,.008,honey,[0,.34,.20]);
  m.face([[-.167,.312,.155],[-.075,.378,.183],[-.114,.356,.198],[-.051,.355,.199],[-.11,.296,.212],[-.093,.333,.204]],cream);
  m.face([[-.172,.349,.183],[-.084,.374,.198],[-.111,.341,.203],[-.074,.337,.207],[-.138,.301,.205],[-.119,.331,.203]],cream);
  m.box([-.076,.288,.215],[.064,.051,.018],honey,[0,0,-.59]);
  m.tube([[0,.04,-.174],[.013,.24,-.163],[0,.40,-.181],[0,.52,-.13]],.008,ink);
  m.face([[-.162,.357,-.148],[-.085,.399,-.163],[-.111,.365,-.168],[-.066,.365,-.171],[-.133,.316,-.171],[-.115,.351,-.17]],cream);
  return m.finish();
}
function head(){
  const m=new Model();
  m.loft([[-.062,.10,.083,0,.014],[-.018,.134,.13,0,0],[.048,.154,.141,0,-.012],[.143,.172,.157],[.226,.16,.148],[.264,.114,.105]],skin);
  m.oval([0,.074,-.156],[.051,.039,.059],'#ca8c62');
  m.tube([[-.048,.026,-.135],[-.012,.018,-.154],[.036,.027,-.148]],.008,'#704135',5);
  for(const s of [-1,1]){
    m.oval([s*.155,.092,.003],[.033,.051,.030],leather);
    m.oval([s*.158,.076,.015],[.021,.028,.018],honey);
  }
  m.loft([[.04,.159,.15,0,.023],[.11,.175,.161,0,.028],[.178,.179,.167]],'#543c37',16);
  for(let i=0;i<9;i++){
    const angle=i*PI/8;
    m.oval([Math.cos(angle)*.149,.085-.025*Math.sin(angle),.034+Math.sin(angle)*.147],[.052,.071,.046],i%2?'#58392f':'#6b4536',[.21,0,.3*Math.sin(angle)]);
  }
  m.loft([[.126,.194,.182],[.155,.204,.185],[.205,.201,.18],[.293,.170,.153],[.344,.102,.096],[.362,.02,.025]],'#8ed0c1',20);
  m.loft([[.117,.18,.165],[.137,.205,.185],[.153,.206,.187]],ink,20);
  m.tube([[0,.15,.185],[0,.25,.171],[0,.327,.117],[0,.36,.02],[0,.34,-.09],[0,.276,-.155]],.024,safety);
  m.tube([[.056,.16,.174],[.055,.244,.159],[.045,.326,.102],[.016,.35,.031]],.011,cream);
  m.oval([0,.154,-.159],[.166,.024,.064],'#619f98',[-.16,0,0]);
  for(const s of [-1,1]){
    m.oval([s*.19,.215,.025],[.014,.040,.047],cream);
    for(const dz of [-.070,.082])m.oval([s*.187,.227,dz],[.013,.011,.023],deep);
  }
  m.oval([0,.106,-.151],[.149,.048,.034],ink);
  for(const s of [-1,1])m.oval([s*.069,.111,-.171],[.067,.027,.022],'#73c3bb',[0,s*.20,s*.07]);
  m.rod([-.126,.148,.15],[-.116,.05,.17],.012,.009,ink);
  return m.finish();
}
function leg(upper){
  const m=new Model();
  if(upper) {
    m.loft([[0,.109,.115],[.13,.128,.122],[.38,.122,.119],[.67,.103,.107],[.9,.087,.09],[1,.083,.081]],denim,14);
    m.loft([[.69,.102,.106],[.76,.101,.103],[.81,.097,.099]],'#608990',14);
    m.box([.088,.48,.050],[.037,.22,.085],teal,[0,.12,.05]);
  }else{
    m.loft([[0,.082,.082],[.13,.090,.094],[.38,.092,.098],[.73,.061,.068],[.95,.053,.059],[1,.055,.062]],ink,14);
    m.loft([[.58,.073,.084],[.67,.072,.08],[.79,.063,.07]],teal,14);
    m.loft([[.69,.068,.079],[.73,.068,.077]],cream,14);
  }return m.finish();
}
function shoe(){
  const m=new Model();
  m.loft([[.01,.09,.159,0,-.037],[.033,.102,.179,0,-.039],[.055,.108,.181,0,-.039],[.074,.102,.173,0,-.04]],'#ffe4ac',14);
  m.loft([[.064,.103,.172,0,-.038],[.094,.096,.149,0,-.034],[.126,.081,.115,0,-.011],[.166,.066,.071,0,.021]],'#d1643d',14);
  m.oval([0,.084,-.15],[.083,.042,.061],cream);
  for(const z of [-.095,-.055,-.018])m.box([0,.122+(.1+z)*.18,z],[.124,.013,.017],cream,[0,.12,.04]);
  m.oval([0,.13,.079],[.04,.032,.024],ink);return m.finish();
}
function arm(upper){
  const m=new Model();
  if(upper){
    m.loft([[0,.088,.093],[.12,.12,.114],[.32,.12,.109],[.63,.098,.099],[.92,.088,.083],[1,.078,.074]],safety,14);
    m.loft([[.65,.101,.099],[.73,.099,.096]],cream,14);m.loft([[.92,.090,.086],[1,.079,.075]],coral,14);
  }else{
    m.loft([[0,.067,.069],[.22,.073,.07],[.64,.054,.057],[.85,.045,.049],[1,.041,.046]],skin,12);
    m.loft([[.79,.054,.055],[.9,.053,.055],[.97,.046,.052]],deep,12);
  }return m.finish();
}
function hand(){
  const m=new Model();m.oval([0,0,0],[.072,.045,.081],ink);
  for(let j=0;j<4;j++)m.oval([-.047+j*.031,-.008,-.067+(j===0?.013:0)],[.016,.022,.046-j*.002],skin,[.25,0,j*.07]);
  m.oval([.063,.006,-.015],[.024,.025,.047],skin,[0,.45,0]);return m.finish();
}
function scarf(){
  const m=new Model();
  const rows=[[[0,.015,.0],[.11,.016,.0]],[[.01,.026,.16],[.096,.03,.16]],[[.045,.065,.30],[.128,.041,.31]],[[.087,.043,.43],[.128,.026,.35]]];
  m.skin(rows,[cream],false);
  m.face([[.047,.066,.282],[.122,.044,.291],[.126,.04,.306],[.05,.063,.302]],safety);return m.finish();
}
function shorts(){
  const m=new Model();
  m.loft([[-.092,.183,.125],[-.052,.214,.151],[.018,.217,.151],[.095,.193,.133]],denim,16);
  m.loft([[.035,.216,.148],[.09,.20,.14]],'#234754',16);
  m.tube([[-.132,.015,.112],[-.101,-.038,.145],[-.065,-.055,.143]],.008,'#729397');
  return m.finish();
}
export function riderModels(){
  const base={rideBoard0:board(safety),rideBoard1:board('#dda31a'),rideBoard2:board('#278b84'),rideBoard3:board('#986cb0'),
    rideSurf0:board(safety,true),rideSurf1:board('#dda31a',true),rideSurf2:board('#278b84',true),rideSurf3:board('#986cb0',true),
    rideTorso:torso(),rideHead:head(),rideHips:shorts(),rideThigh:leg(true),rideShin:leg(false),rideShoe:shoe(),
    rideSleeve:arm(true),rideForearm:arm(false),rideHand:hand(),rideScarf:scarf()};
  return Object.assign(base,outfitModels(base));
}
const up=new T.Vector3(0,1,0);
// Solve in the plane set by the planted foot and its toe direction. Both leg lengths stay
// constant as the pelvis moves; knees track the toes instead of swinging out sideways.
function joint(a,b,upper,lower,pole){
  const start=new T.Vector3(...a),line=new T.Vector3(...b).sub(start);
  const distance=Math.min(upper+lower-.0001,Math.max(Math.abs(upper-lower)+.0001,line.length()));
  line.normalize();const toward=new T.Vector3(...pole);
  toward.addScaledVector(line,-toward.dot(line)).normalize();
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  return start.addScaledVector(line,along).addScaledVector(toward,Math.sqrt(Math.max(0,upper*upper-along*along))).toArray();
}
function poseBoard(place,r,skin,ghost=false,home=false) {
  const a=r.tick/60,turn=Math.max(-1,Math.min(1,r.lane-r.pos)),swell=r.blend;
  const crouch=Math.min(1,r.slide/5),air=r.air?Math.sin(PI*(46-r.air)/46):0;
  const carve=home?0:Math.sin(a*3.62)*(swell+(r.surge>0?.55:0));
  const pump=home?0:(.5+.5*Math.cos(a*7.24))*swell;
  const bend=.012*Math.sin(a*(swell?3.4:4.2))+.052*swell+.11*pump+.335*crouch+.090*air;
  const rideYaw=.36+.20*swell+turn*.13+.105*carve,left=-1,right=1;
  const boardQ=new T.Quaternion().setFromEuler(new T.Euler(-.105*air-.052*pump,rideYaw,.035+turn*.19+swell*.12+.135*carve));
  function component(name,p,size=[1,1,1],rotation=[0,0,0]){
    const v=new T.Vector3(...p).applyQuaternion(boardQ);
    const q=rotation.isQuaternion?rotation.clone():new T.Quaternion().setFromEuler(new T.Euler(...rotation));
    place(name,v.toArray(),size,boardQ.clone().multiply(q),ghost);
  }
  function limb(name,a,b){
    const v=new T.Vector3(...b).sub(new T.Vector3(...a)),len=v.length();
    component(name,a,[1,len,1],new T.Quaternion().setFromUnitVectors(up,v.normalize()));
  }
  component((swell>.65?'rideSurf':'rideBoard')+(skin%4),[0,0,0]);
  const hip=[.095+.055*crouch-turn*.065-.051*carve,1.012-bend,.032+.043*crouch+.045*pump];
  const hipYaw=1.18-.075*swell;
  component('rideHips',hip,[1,1,1],[0,hipYaw,0]);
  for(const s of [left,right]){
    const forward=s===right,footYaw=forward?.98:1.44;
    const foot=[forward?-.084:.080,.225,forward?-.39:.407];
    const ankle=[foot[0]+.020*Math.sin(footYaw),foot[1]+.139,foot[2]+.020*Math.cos(footYaw)];
    const pelvis=[hip[0]+s*.133*Math.cos(hipYaw),hip[1]-.025,hip[2]-s*.133*Math.sin(hipYaw)];
    const knee=joint(pelvis,ankle,.387,.367,[-Math.sin(footYaw),0,-Math.cos(footYaw)]);
    limb('rideThigh',pelvis,knee);limb('rideShin',knee,ankle);
    component('rideShoe',foot,[1,1,1],[0,footYaw,0]);
  }
  const bodyYaw=home?1.28:.70+.06*Math.sin(a*.73)-.11*swell-.21*carve;
  const bodyQ=new T.Quaternion().setFromEuler(new T.Euler(-.22-crouch*.49-.105*pump,bodyYaw,-turn*.13-.06*swell-.19*carve,'YXZ'));
  const bodyPoint=p=>new T.Vector3(...p).applyQuaternion(bodyQ).add(new T.Vector3(...hip)).toArray();
  component('rideTorso',hip,[1,1,1],bodyQ);
  const neck=bodyPoint([0,.582,-.015]);
  component('rideHead',neck,[1,1,1],[-.08-crouch*.11,home?2.23:.55+.09*swell+turn*.18,.025*Math.sin(a*2.3)]);
  component('rideScarf',bodyPoint([-.078,.505,.12]),[1,1,1],[.11*Math.sin(a*8),.40+.26*Math.sin(a*5.3),.21*Math.cos(a*5.3)]);
  for(const s of [left,right]){
    const shoulder=bodyPoint([s*.24,.437,0]),forward=s===right;
    const wrist=[shoulder[0]+(forward?.31:-.31)+turn*.08,shoulder[1]-(home?.31:forward?.20:.13)+swell*.095+air*.09+s*.13*carve,
      shoulder[2]+(forward?-.225-.045*swell:.255+.04*swell)-s*.08*pump];
    const elbow=joint(shoulder,wrist,.275,.245,[forward?.27:-.35,-1,forward?-.35:.44]);
    limb('rideSleeve',shoulder,elbow);limb('rideForearm',elbow,wrist);
    component('rideHand',wrist,[1,1,1],[.3,-s*.81,s*.24]);
  }
}

// A foot rolls from heel to toe during stance, then recovers high behind the body.
// The recovery takes less time than two alternating contacts, leaving an aerial phase.
function runningFoot(cycle,side){
  const phase=(cycle+(side>0?.5:0))%1;
  if(phase<.405){
    const t=phase/.405,pitch=.24*(1-t)-.72*t*t*t;
    return {z:-.39+.78*t,y:.012+Math.max(.12*Math.sin(pitch),-.206*Math.sin(pitch)),pitch};
  }
  const t=(phase-.405)/.595,s=Math.sin(t*PI),ease=t*t*(3-2*t);
  return {z:.39-.78*ease+.14*Math.sin(t*2*PI),y:.13*(1-t)+.045*t+.39*s*(1.28-.50*t),
    pitch:-.74*(1-t)+.23*t-.68*Math.sin(PI*t)};
}
function poseFeet(place,r,ghost,home){
  const turn=Math.max(-1,Math.min(1,r.lane-r.pos));
  const cycle=(r.d/(5.95+Math.min(1.7,r.d/1350)))%1,angle=cycle*PI*2;
  const slide=r.slide?Math.min(1,(44-r.slide)/5,r.slide/6):0;
  const jump=r.air?Math.sin(PI*(46-r.air)/46):0;
  const running=home?0:(1-slide)*(1-jump);
  const bob=home?0:(.047*Math.cos(angle*2-.55)+.014)*running;
  const hip=[Math.sin(angle)*.039*running-turn*.096,.795+bob-.425*slide+.037*jump,.012+.10*slide];
  const lean=(home?-.03:-.275)-running*.037*Math.sin(angle*2)-.09*jump+.87*slide;
  const worldQ=new T.Quaternion().setFromEuler(new T.Euler(0,home?2.35:.12+turn*.21,turn*.13,'YXZ'));
  const bodyQ=new T.Quaternion().setFromEuler(new T.Euler(lean,.22*Math.sin(angle)*running+(home?.24:0),.075*Math.cos(angle)*running,'YXZ'));
  const pelvisYaw=-.16*Math.sin(angle)*running;
  function emit(name,at,size=[1,1,1],rot=[0,0,0]){
    const point=new T.Vector3(...at).applyQuaternion(worldQ);
    const q=rot.isQuaternion?rot:new T.Quaternion().setFromEuler(new T.Euler(...rot));
    place(name,point.toArray(),size,worldQ.clone().multiply(q),ghost);
  }
  function segment(name,a,b){
    const dir=new T.Vector3(...b).sub(new T.Vector3(...a)),length=dir.length();
    emit(name,a,[1,length,1],new T.Quaternion().setFromUnitVectors(up,dir.normalize()));
  }
  const bodyPoint=p=>new T.Vector3(...p).applyQuaternion(bodyQ).add(new T.Vector3(...hip)).toArray();
  emit('rideHips',hip,[1,1,1],[0,pelvisYaw,0]);
  for(const side of [-1,1]){
    const foot=runningFoot(cycle,side);
    let z=home?side*.16:foot.z,y=home?.019:foot.y,pitch=home?0:foot.pitch;
    if(jump){z+=(side>0?-.40-z:.32-z)*jump;y+=(side>0?.34-y:.47-y)*jump;pitch+=(side>0?.15-pitch:-.85-pitch)*jump;}
    if(slide){z+=(side>0?-.52-z:.27-z)*slide;y+=(side>0?.097-y:.063-y)*slide;pitch+=(side>0?.49-pitch:-.26-pitch)*slide;}
    const footX=side*(.148+.072*slide)+turn*.035,heading=-side*(home?.20:.065);
    const rot=new T.Quaternion().setFromEuler(new T.Euler(pitch,heading,side*.02,'YXZ'));
    const shoe=[footX,y,z],ankle=new T.Vector3(0,.13,.022).applyQuaternion(rot).add(new T.Vector3(...shoe)).toArray();
    const origin=[hip[0]+side*.131*Math.cos(pelvisYaw),hip[1]-.016,hip[2]-side*.131*Math.sin(pelvisYaw)];
    const knee=joint(origin,ankle,.393,.375,[side*(.11+.38*slide),.04,-1]);
    segment('rideThigh',origin,knee);segment('rideShin',knee,ankle);
    emit('rideShoe',shoe,[1,1,1],rot);
  }
  emit('rideTorso',hip,[1,1,1],bodyQ);
  emit('rideHead',bodyPoint([0,.574,-.015]),[1,1,1],[-.09+.19*slide,home?.04:-.025*Math.sin(angle)+turn*.12,.035*Math.cos(angle)*running]);
  emit('rideScarf',bodyPoint([-.078,.51,.112]),[1,1,1],[.39+.13*Math.sin(angle*2),.31+.22*Math.sin(angle),.20*Math.cos(angle)]);
  for(const side of [-1,1]){
    // Right arm forwards as the left foot reaches forwards. A bent elbow leads the backward swing.
    const swing=-side*Math.cos(angle-.35)*running;
    const shoulder=bodyPoint([side*.24,.44,0]);
    let upper=[side*(.071+.042*jump),-.207+.11*Math.max(0,-swing),swing*.235-.048];
    let lower=[-side*.035,.115-.083*Math.max(0,swing),-.202+.062*swing];
    if(slide){upper=[side*(.08+.13*slide),-.20,.14*slide];lower=[side*.10,-.07+.098*(side>0),side>0?-.15:.15];}
    if(jump){upper[0]+=side*.12*jump;upper[1]+=.19*jump;lower[1]+=.09*jump;}
    if(home){upper=[side*.098,-.235,side*.072];lower=[-side*.06,.008,-.23];}
    const elbow=new T.Vector3(...upper).normalize().multiplyScalar(.278).add(new T.Vector3(...shoulder)).toArray();
    const wrist=new T.Vector3(...lower).normalize().multiplyScalar(.245).add(new T.Vector3(...elbow)).toArray();
    segment('rideSleeve',shoulder,elbow);segment('rideForearm',elbow,wrist);
    emit('rideHand',wrist,[1,1,1],[.49,-side*.24,-side*.28]);
  }
}
export function poseRider(place,r,skin=0,ghost=false,home=false,outfit=0){
  const wearing=outfit>=1&&outfit<=3 ? (name,...args)=>place(/^ride(?:Board|Surf)/.test(name)?name:name+outfit,...args):place;
  if(r.blend>.24||r.surge>0||r.rules===1)poseBoard(wearing,r,skin,ghost,home);
  else poseFeet(wearing,r,ghost,home);
}
