import {Model,PI} from './model-kit.js';

const metal='#465d68', iron='#263b47', rubber='#24303a', paper='#edd8a9', brass='#edac55';
const coral='#ba4b37', wine='#753f41', blue='#356c78', glass='#24424f', light='#fff4c1';
const railWidth=.89, carLength=10;

// Front faces +Z, towards the player. Assets are scaled to the physical length of a car.
function train(cab){
  const m=new Model(), paint=cab?coral:blue, dark=cab?wine:'#27505c';
  const profile=(z,k=1,h=2.55)=>[
    [-.66*k,.40,z],[.66*k,.40,z],[railWidth*k,.63,z],[railWidth*k,h-.39,z],
    [.80*k,h-.15,z],[.63*k,h,z],[-.63*k,h,z],[-.80*k,h-.15,z],
    [-railWidth*k,h-.39,z],[-railWidth*k,.63,z]
  ];
  const faceProfile=profile(4.98,.89,2.39).map(([x,y,z])=>[x,y,z-Math.max(0,y-1)*.24]);
  m.skin([profile(-4.92,.96),profile(-4.66),profile(cab?4.12:4.70),
    ...(cab?[profile(4.53,.966,2.49),faceProfile]:[profile(4.92,.96)])],
    [iron,dark,paint,paint,paper,'#b3ada0',paper,paint,paint,dark]);
  m.box([0,.45,.02],[1.58,.19,9.46],iron);
  for(const z of [-3.22,2.96]){
    m.box([0,.28,z],[1.46,.24,1.26],rubber);
    for(const side of [-1,1])for(const dz of [-.39,.39]){
      m.rod([side*.63,.27,z+dz],[side*.83,.27,z+dz],.245,.245,iron,10);
      m.rod([side*.83,.27,z+dz],[side*.84,.27,z+dz],.122,.117,'#8a8e86',8);
    }
  }
  for(const side of [-1,1]){
    const sx=side*.895;
    m.box([sx,.95,-.22],[.024,.16,9.12],paper);
    m.box([sx,1.071,-.24],[.026,.045,9.06],brass);
    for(const z of [-3.83,-2.92,-.85,.05,2.11,3.05]){
      m.box([sx,1.73,z],[.021,.66,.79],iron);
      m.box([side*.911,1.745,z],[.022,.49,.65],glass);
      m.face([[side*.925,1.97,z-.29],[side*.925,1.97,z+.23],[side*.925,1.81,z+.10],[side*.925,1.81,z-.29]],'#54818a');
      m.box([side*.929,1.65,z],[.012,.021,.65],'#708f8c');
    }
    for(const z of [-1.89,1.17]){
      m.box([sx,1.31,z],[.024,1.55,.85],dark);
      for(const s of [-1,1]){
        m.box([side*.91,1.33,z+s*.206],[.022,1.47,.376],paint);
        m.box([side*.923,1.72,z+s*.204],[.017,.55,.258],glass);
      }
      m.box([side*.93,.56,z],[.045,.046,.88],brass);
    }
  }
  for(const z of [-3.9,-2.5,-1.1,.3,1.7,3.1]){
    m.box([0,2.549,z],[1.24,.022,.048],'#828c8b');
    for(const s of [-1,1])m.box([s*.64,2.537,z],[.077,.018,.36],paper);
  }
  if(cab){
    // Paint, glass and gaskets share the same bevel as the nose casting.
    const nose=(x,y,bias=.008)=>[x,y,4.98-Math.max(0,y-1)*.24+bias];
    const panel=(points,col,bias)=>m.face(points.map(([x,y])=>nose(x,y,bias)),col);
    m.face(faceProfile.map(([x,y,z])=>[x,y,z+.005]),'#d6613c');
    panel([[-.765,1.33],[.765,1.33],[.74,2.02],[.56,2.26],[-.56,2.26],[-.74,2.02]],'#f0d6a2',.016);
    panel([[-.69,1.42],[.69,1.42],[.664,2.00],[.51,2.18],[-.51,2.18],[-.664,2]],'#243d4b',.024);
    for(const s of [-1,1]){
      panel([[s*.045,1.48],[s*.616,1.48],[s*.607,1.94],[s*.47,2.11],[s*.045,2.11]],'#456b79',.034);
      panel([[s*.046,2.09],[s*.457,2.09],[s*.593,1.94],[s*.588,1.86],[s*.046,1.99]],'#a4c7bb',.045);
      panel([[s*.046,1.91],[s*.588,1.79],[s*.588,1.76],[s*.046,1.87]],'#749a9a',.045);
      m.rod(nose(s*.12,1.49,.061),nose(s*.43,1.71,.061),.015,.019,rubber,5);
      m.rod([s*.57,1.12,4.91],[s*.57,1.12,5.028],.160,.150,iron,12);
      m.rod([s*.57,1.12,5.029],[s*.57,1.12,5.053],.110,.099,light,12);
      panel([[s*.026,.83],[s*.74,1.11],[s*.74,.942],[s*.026,.672]],paper,.026);
      panel([[s*.025,.647],[s*.73,.91],[s*.73,.87],[s*.025,.609]],brass,.029);
      m.rod([s*.62,.65,4.98],[s*.62,.65,5.037],.043,.045,'#ff653a');
    }
    panel([[-.45,2.205],[.45,2.205],[.37,2.353],[-.37,2.353]],iron,.030);
    for(const [x,w] of [[-.28,.07],[-.16,.09],[-.02,.09],[.16,.17]]){
      panel([[x,2.245],[x+w,2.245],[x+w,2.298],[x,2.298]],'#fff0a2',.040);
    }
    m.box([0,1.22,4.96],[.36,.07,.068],paper);
    m.box([0,.57,5.00],[1.21,.088,.102],rubber);
  }
  m.box([0,.38,4.97],[.29,.18,.14],metal);
  return m.finish();
}
function freight(){
  const m=new Model();
  m.box([0,1.49,0],[1.75,1.96,9.81],'#ad5940');
  m.box([0,.49,0],[1.78,.22,9.94],iron);
  m.box([0,2.508,0],[1.82,.084,9.91],'#c9a068');
  for(const side of [-1,1]){
    for(let k=0;k<15;k++)m.box([side*.884,1.5,-4.54+k*.645],[.054,1.55,.108],'#cb7151');
    for(const y of [.62,2.28])m.box([side*.9,y,0],[.035,.115,9.81],'#794f41');
    for(const z of [-3.1,3.1]){
      m.box([0,.28,z],[1.43,.23,1.67],rubber);
      for(const d of [-.48,.48])m.rod([side*.65,.26,z+d],[side*.82,.26,z+d],.242,.242,metal,8);
    }
    m.box([side*.69,2.55,0],[.042,.013,9.5],paper);
    for(const z of [-3,0,3])m.box([side*.89,.65,z],[.06,.15,.32],brass);
  }
  for(const z of [-4,-2.23,-.46,1.31,3.08]){
    m.box([0,2.55,z],[1.49,.026,.047],'#897963');
    for(const side of [-1,1])m.box([side*.40,2.555,z+.15+side*.11],[.33,.018,.067],'#e7cd91',[0,side*.52,0]);
  }
  for(const side of [-1,1]){
    m.box([side*.43,1.48,4.925],[.77,1.75,.025],'#96553e');
    for(const x of [.17,.65])m.rod([side*x,.63,4.96],[side*x,2.32,4.96],.021,.023,brass,6);
  }
  return m.finish();
}
function sleeperSegment(){
  const m=new Model(), length=4;
  for(const lane of [-2.06,0,2.06]){
    for(let i=0;i<5;i++){
      const z=-1.6+i*.80;
      m.box([lane,-.084,z],[1.85,.105,.19],['#584d49','#64564c','#514b49'][i%3],[0,(i%3-1)*.018,0]);
      for(const side of [-1,1])
        m.box([lane+side*.61,-.023,z],[.231,.033,.201],'#424c52');
    }
    for(const side of [-1,1]){
      const x=lane+side*.61;
      m.box([x,-.006,0],[.105,.091,length+.012],'#78584b');
      m.box([x,.031,0],[.086,.045,length+.013],'#b7b6a5');
    }
  }
  return m.finish();
}
function gantry(){
  const m=new Model();
  for(const s of [-1,1]){
    const x=s*3.83;
    m.box([x,.20,0],[.46,.40,.51],'#a99e87');
    m.box([x,2.87,0],[.135,5.43,.23],metal);
    m.box([x+s*.21,2.84,0],[.074,5.39,.14],metal);
    for(let i=0;i<5;i++)m.rod([x,.42+i,0],[x+s*.21,1.32+i,0],.032,.032,metal,4);
    m.box([x,.96,0],[.23,.71,.26],brass);
    m.rod([x,4.32,0],[x-s*.79,5.32,0],.066,.054,metal,5);
  }
  for(const y of [5.31,5.83])m.box([0,y,0],[7.95,.101,.18],metal);
  for(let i=0;i<12;i++){
    const x=-3.90+i*.65;
    m.rod([x,5.33,0],[x+.65,i%2?5.33:5.81,0],.031,.031,metal,5);
    if(i%2)m.rod([x,5.81,0],[x+.65,5.33,0],.03,.03,metal,5);
  }
  for(const x of [-2.06,0,2.06]){
    m.rod([x,5.31,0],[x,4.99,0],.051,.048,rubber);
    m.rod([x-.34,4.98,0],[x+.38,4.98,0],.03,.03,brass);
  }
  return m.finish();
}
function tunnelRib(portal){
  const m=new Model(),radius=3.89,centre=2.01,segments=16;
  const p=(i,r,z)=>[Math.cos(Math.PI*i/segments)*r,centre+Math.sin(Math.PI*i/segments)*r,z];
  const shade=['#a28b76','#b09982','#978977','#a8917c'],trim=portal?.64:.16,depth=portal?.74:.16;
  for(let i=0;i<segments;i++){
    m.skin([[p(i,radius,0),p(i,radius+trim,0),p(i+1,radius+trim,0),p(i+1,radius,0)],
      [p(i,radius,-depth),p(i,radius+trim,-depth),p(i+1,radius+trim,-depth),p(i+1,radius,-depth)]],
      portal?[shade[i%4],shade[i%4],shade[i%4],'#586674']:['#566576']);
    if(portal)m.face([p(i,radius,.012),p(i,radius+trim,.012),p(i+.024,radius+trim,.012),p(i+.024,radius,.012)],'#635c57');
  }
  for(const side of [-1,1]){
    m.box([side*(radius+trim*.5),centre*.5,-depth*.5],[trim,centre,depth],portal?shade[1]:'#505e6c');
    if(portal){
      m.box([side*4.49,1.78,-.65],[1.01,3.66,1.6],'#aa8e73');
      m.box([side*4.49,3.63,-.65],[1.16,.18,1.8],paper);
    }
  }
  if(portal){
    m.box([0,6.28,-.14],[2.04,.44,.35],'#445963');
    for(let i=0;i<3;i++)m.box([-.41+.22*i,6.30,.047],[.084,.21,.035],brass,[0,0,-.31]);
    m.box([.29,6.30,.048],[.32,.08,.037],paper);
  }
  return m.finish();
}
function stopSignal(){
  const m=new Model();
  m.box([0,.16,0],[.31,.32,.32],'#948c76');
  m.rod([0,.20,0],[0,2.60,0],.055,.045,metal);
  m.box([0,.94,0],[.13,.62,.13],paper);
  m.box([0,2.49,0],[.32,.90,.28],iron);
  for(const [y,col] of [[2.75,'#785045'],[2.48,'#806c47'],[2.21,'#9fe1ac']]){
    m.rod([0,y,.14],[0,y,.166],.10,.10,col,10);
    m.box([0,y+.103,.15],[.24,.046,.18],rubber,[.19,0,0]);
  }
  return m.finish();
}
function hurdle(low){
  const m=new Model(),y=low?1.24:.48,span=1.72;
  for(const s of [-1,1]){
    m.box([s*.81,.08,0],[.20,.15,.48],iron);
    m.box([s*.81,y*.5,0],[.10,y,.12],metal);
  }
  m.box([0,y,0],[span,low?.32:.27,.20],paper);
  for(let i=0;i<7;i++)m.face([[-.81+i*.235,y-.132,.103],[-.69+i*.235,y-.132,.103],[-.59+i*.235,y+.132,.103],[-.71+i*.235,y+.132,.103]],coral);
  if(low){
    m.box([0,y+.66,0],[span,.99,.145],blue);
    for(const s of [-1,1])m.box([s*.79,y+.55,0],[.075,1.17,.18],brass);
    for(const x of [-.38,0,.38]){m.box([x,y+.66,.078],[.09,.48,.03],paper);m.box([x-.066,y+.51,.079],[.09,.23,.03],paper,[0,0,.58]);m.box([x+.066,y+.51,.079],[.09,.23,.03],paper,[0,0,-.58]);}
  }
  return m.finish();
}

export function railModels(){
  return {metroCab:train(true),metroCoach:train(false),cargoWagon:freight(),railSleepers:sleeperSegment(),
    railGantry:gantry(),railPortal:tunnelRib(true),tunnelRib:tunnelRib(false),railSignal:stopSignal(),
    railHurdle:hurdle(false),lowSignal:hurdle(true)};
}
