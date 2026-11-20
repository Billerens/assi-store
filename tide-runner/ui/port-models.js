import {Model,PI} from './model-kit.js';

const ink='#233e47',shadow='#203b40',steel='#547378',brass='#bd8e56',sand='#dfbb85',cream='#ffedc7',paper='#eddfbb',
  sail='#e3d2a6', orange='#e87344', oxide='#ad4d37', navy='#315967',teal='#418e88', aqua='#a9c9b4', slat='#8a674c';
function hull(m,stations,paints){
  const sections=stations.map(([z,w,lift])=>[
    [-w*.86,1.21+lift,z],[w*.86,1.21+lift,z],[w,1.08+lift,z],[w*.99,.94+lift,z],
    [w*.94,.70+lift*.7,z],[w*.74,.15+lift*.6,z],[w*.25,-.33+lift*.6,z],
    [-w*.25,-.33+lift*.6,z],[-w*.74,.15+lift*.6,z],[-w*.94,.70+lift*.7,z],[-w*.99,.94+lift,z],[-w,1.08+lift,z]]);
  m.skin(sections,paints);
}
function lifering(m,at,r,yaw=0){
  m.ring(at,r,r*.235,cream,[0,yaw,0]);
  for(let j=0;j<4;j++)m.ring(at,r,r*.25,orange,[0,yaw,j*PI*.5+.15],[1,1,1],PI*.19);
}
function trawler(far=false){
  const m=new Model(),stations=[[-5.45,.05,.92],[-4.89,.72,.60],[-3.97,1.43,.31],[-2.8,1.8,.10],[-1.3,1.96,.015],[.9,1.98,0],[2.92,1.84,.03],[4.25,1.48,.09],[4.56,1.16,.14]];
  hull(m,stations,[sand,'#f7e4b6','#32464b','#de724c','#368585','#24666c','#24424a','#24666c','#368585','#de724c','#32464b','#f7e4b6']);
  const cabin=[[-1.96,1.22],[-1.46,1.43],[.82,1.37],[1.13,1.1]];
  m.skin(cabin.map(([z,w])=>[[-w,1.22,z],[w,1.22,z],[w*.92,2.9,z],[-w*.92,2.9,z]]),[cream,'#e6cc9b',paper,'#e8cda1']);
  m.box([0,2.99,-.4],[3.05,.18,3.4],navy);
  for(const s of [-1,1]){
    const x=s*1.343;
    m.face([[x,2.1,-1.53],[x,2.13,.68],[x*.95,2.77,.72],[x*.95,2.75,-1.49]],'#386477');
    for(const z of [-1.48,-.75,.02,.68])m.rod([x,2.1,z],[x*.95,2.77,z],.044,.044,cream);
    if(!far){
      for(const z of [-2.9,1.2,2.15]){
        const at=[s*1.81,.91,z];
        m.rod([s*1.77,1.4,z-.12],[at[0],1.00,z],.025,.025,slat);
        m.ring(at,.22,.106,ink,[0,PI*.52,0],[.72,1.32,1]);
      }
      for(const z of [-3.8,-2.8,1.9,3.2])m.rod([s*(z< -3.3?1.25:1.58),1.3,z],[s*(z< -3.3?1.25:1.58),1.84,z],.026,.026,cream);
      m.tube([[s*.08,2.13,-5.1],[s*1.26,1.86,-3.8],[s*1.58,1.82,-2.7]],.032,cream);
    }
  }
  m.box([0,2.49,1.025],[1.72,.55,.025],'#416879');
  for(const x of [-.58,.04,.6])m.box([x,2.49,1.055],[.055,.56,.043],cream);
  m.loft([[3.07,.35,.33],[3.72,.31,.30],[3.85,.37,.35]],oxide,12,[.58,0,.12],[.10,0,0]);
  m.loft([[3.71,.326,.31],[3.87,.37,.35]],ink,12,[.58,0,.12],[.10,0,0]);
  m.rod([-.13,2.95,-1.04],[-.2,5.35,-1.21],.085,.037,brass);
  m.rod([-1.1,4.42,-1.15],[.9,4.42,-1.15],.044,.044,cream);
  m.face([[-.20,5.27,-1.24],[-.20,4.94,-1.21],[.65,4.97,-.90]],orange);
  m.rod([0,1.36,2.8],[-.78,3.86,2.41],.08,.046,sand);
  m.rod([0,1.36,2.9],[.78,3.86,2.41],.08,.046,sand);
  m.rod([-.77,3.85,2.41],[.77,3.85,2.41],.06,.06,orange);
  if(!far){
    m.tube([[-.2,5.3,-1.2],[-.9,3.3,.65],[-1.55,1.5,3.4]],.017,ink);
    m.tube([[-.2,5.3,-1.2],[-.5,3.65,-3.2],[-.1,2,-5.04]],.018,ink);
    lifering(m,[.83,1.93,1.15],.24);
    for(let i=0;i<3;i++)m.box([-.61+i*.58,1.55,3.21],[.52,.40,.75],i%2?oxide:teal);
    for(let j=0;j<3;j++)m.ring([.8,1.3+j*.064,-2.64],.36-j*.025,.043,slat,[PI/2,0,0],[1,1.28,1]);
  }
  return m.finish();
}
function lateen(){
  const m=new Model(),stations=[[-4.65,.055,.52],[-4.0,.68,.30],[-2.8,1.15,.12],[-1.1,1.43,0],[1.3,1.45,0],[2.9,1.11,.09],[3.67,.54,.24],[3.89,.10,.38]];
  hull(m,stations,[sand,cream,ink,orange,navy,'#254e58',ink,'#254e58',navy,orange,ink,cream]);
  for(const z of [-1.74,.12,1.74])m.box([0,1.41,z],[2.14,.10,.42],slat);
  m.rod([0,1.25,-.66],[.10,7.85,-.60],.097,.051,slat,12);
  m.rod([-.14,2.21,2.68],[.10,8.05,-2.17],.075,.046,brass,10);
  // The diagonal yard carries a lateen sail. Its panels billow between sewn radial seams.
  const peak=[.10,7.88,-2.08],clew=[-.09,2.28,2.62],tack=[.15,2.16,-2.92];
  const stitch=(u,v)=>{
    const w=1-u-v,bulge=3.6*u*v*w;
    return [peak[0]*w+clew[0]*u+tack[0]*v+bulge*2.6,peak[1]*w+clew[1]*u+tack[1]*v,peak[2]*w+clew[2]*u+tack[2]*v];
  };
  const cloth=['#f07b49','#d96542','#eb8757','#e99062','#dd6b43'];
  const N=7;
  for(let j=0;j<N;j++)for(let i=0;i<N-j;i++){
    const a=stitch(i/N,j/N),b=stitch((i+1)/N,j/N),c=stitch(i/N,(j+1)/N);
    const color=(i===2&&j>0)?cream:cloth[(i+2*j)%cloth.length];m.face([a,b,c],color);
    if(i+j<N-1)m.face([b,stitch((i+1)/N,(j+1)/N),c],color);
  }
  for(const v of [1/7,3/7,5/7]){
    const pts=[];for(let i=0;i<5;i++){const p=stitch(i/4*(1-v),v);p[0]+=.01;pts.push(p);}
    m.tube(pts,.012,'#b45439',5);
  }
  m.rod([0,7.6,-.59],[0,1.74,-4.45],.017,.017,ink,5);
  m.face([[0,6.7,-1.4],[.16,2.07,-3.96],[.50,2.13,-1.46]],cream);
  m.rod([0,7.62,-.59],[.9,1.29,2.67],.019,.019,slat,5);
  m.face([[.10,7.78,-.6],[.12,7.45,-.59],[-.13,7.54,-.05],[-.20,7.72,.22]],teal);
  return m.finish();
}
function lighthouse(far=false){
  const m=new Model();
  m.loft([[-1,2.7,2.7],[-.40,2.6,2.7],[-.04,2.18,2.34],[.23,1.89,2.07],[.34,1.58,1.69]],'#777e76',14);
  m.loft([[.24,1.28,1.28],[.57,1.30,1.30],[.70,1.12,1.12],[6.13,.75,.75]],cream,20);
  for(const [y,r] of [[1.08,1.105],[3.33,.96],[5.52,.807]]){
    m.loft([[y,r,r],[y+.72,r-.045,r-.045]],oxide,20);
  }
  m.loft([[6.08,.81,.81],[6.25,.95,.95],[6.36,1.16,1.16],[6.49,1.18,1.18]],navy,20);
  m.loft([[6.50,.67,.67],[7.39,.61,.61]],'#ffc66f',10);
  for(let i=0;i<8;i++){const a=i*PI/4;m.rod([Math.cos(a)*.68,6.50,Math.sin(a)*.68],[Math.cos(a)*.64,7.4,Math.sin(a)*.64],.048,.045,ink);}
  m.loft([[7.39,.78,.78],[7.51,.94,.94],[7.57,.78,.78],[7.96,.28,.28],[8.05,.12,.12]],'#477c77',16);
  m.rod([0,8.04,0],[0,8.57,0],.055,.025,brass);
  if(!far){
    m.ring([0,6.86,0],1.12,.038,paper,[PI/2,0,0]);
    m.ring([0,6.65,0],1.12,.022,ink,[PI/2,0,0]);
    for(let i=0;i<10;i++){const a=i*PI/5;m.rod([Math.cos(a)*1.1,6.42,Math.sin(a)*1.1],[Math.cos(a)*1.1,6.86,Math.sin(a)*1.1],.025,.025,ink);}
    for(const y of [1.0,2.7,4.62]){
      const rad=1.16-.065*y; m.box([-.65*rad,y+.27,.77*rad],[.35,.47,.11],'#2c505a',[0,-.67,0]);
    }
  }return m.finish();
}
function crane(far=false){
  const m=new Model();
  for(const z of [-1.35,1.35]){
    m.box([0,.47,z],[4.65,.55,.49],navy);
    for(const s of [-1,1]){
      m.rod([s*1.99,.55,z],[s*1.09,7.13,z],.16,.12,teal,6);
      m.rod([s*1.95,.69,z],[s*-1.05,6.8,z],.07,.06,brass,5);
      m.rod([s*1.08,6.89,z],[s*.55,8.43,0],.14,.095,teal,6);
    }
  }
  m.box([0,7.27,0],[3.1,.43,3.1],navy);m.box([.14,7.98,.45],[1.75,1.02,1.72],orange);
  m.box([.15,8.15,1.334],[1.32,.46,.06],ink);m.box([.2,8.55,.48],[2.03,.14,1.94],cream);
  const st=[1.1,8.44,-.35],tip=[-6.84,11.88,-.35];
  for(const z of [-.62,.05]){
    m.rod([st[0],st[1],z],[tip[0],tip[1],z],.13,.07,orange,6);
    m.rod([1.44,9.24,z],[-6.80,12.16,z],.10,.045,brass,6);
    if(!far)for(let j=0;j<7;j++){
      const x=1.1-j*1.08,y=8.45+j*.465;m.rod([x,y,z],[x-.82,y+1.0-j*.063,z],.04,.036,cream,5);
    }
  }
  m.rod([-.24,8.47,-.35],[-.88,10.33,-.35],.12,.08,teal);
  m.rod([-.88,10.33,-.35],[-6.80,12.07,-.35],.025,.025,ink);
  m.rod([-6.78,11.78,-.35],[-6.78,7.09,-.35],.034,.032,ink);
  m.ring([-6.77,6.92,-.35],.18,.055,brass,[0,0,.42],[1,1,1],PI*1.57);
  return m.finish();
}
function fishMark(m,at,scale){
  const [x,y,z]=at;
  const f=(dy,dz)=>[x,y+dy*scale,z+dz*scale];
  m.face([f(0,-.78),f(.19,-.48),f(.27,-.04),f(.13,.29),f(.32,.64),f(.02,.54),f(-.27,.68),f(-.12,.25),f(-.23,-.14),f(-.12,-.59)],cream);
  m.face([f(.13,-.23),f(.42,-.08),f(.20,.02)],orange);
  m.oval(f(.038,-.48),[.023,.043*scale,.044*scale],navy);
}
function fishHall(style,far=false){
  const m=new Model(),wall=['#df966d','#d9b98d','#79a49a'][style],shutter=[teal,'#557c92','#ae6550'][style];
  const h=[3.7,4.5,3.45][style],half=4.15;
  m.box([-.18,h*.45,0],[4.92,h,8.28],wall);
  m.box([-.16,.20,0],[5.13,.54,8.46],'#918b77');
  m.box([-.18,h-.17,0],[5.15,.20,8.51],paper);
  if(style===1){
    const curve=[[-2.78,h-.18],[-2.78,h+.05],[-2.46,h+.70],[-1.72,h+1.18],[-.39,h+1.40],[.89,h+1.23],[1.93,h+.79],[2.48,h+.13],[2.48,h-.19]];
    m.skin([-half-.3,half+.3].map(z=>curve.map(([x,y])=>[x,y,z])),[navy,'#547b83','#618a8b','#7c9b98','#749797','#5e888c','#577e87',navy,slat]);
    for(const z of [-3.8,-1.8,.3,2.4,4.0])m.tube(curve.slice(1,-1).map(([x,y])=>[x,y+.02,z]),.051,'#577a7c',5);
    m.oval([-.32,h+.31,4.445],[.53,.48,.035],navy);m.ring([-.32,h+.31,4.48],.45,.047,cream,[0,0,0],[1,.95,1]);
  }else{
    const roofSections=[-half-.28,half+.28].map(z=>[[-2.87,h-.16,z],[-2.87,h+.02,z],[-.33,h+1.18,z],[2.5,h+.05,z],[2.5,h-.15,z]]);
    m.skin(roofSections,[shadow,'#a55641','#cb7452',oxide,sand]);
    m.rod([-.33,h+1.18,-4.53],[-.33,h+1.18,4.53],.105,.105,oxide,10);
  }
  if(!far){
    if(style!==1)for(let z=-3.9;z<4.4;z+=.8)m.rod([-.28,h+1.2,z],[2.47,h+.065,z],.033,.044,'#ab604a',6);
    m.loft([[0,.37,.32],[.34,.48,.43],[.43,.41,.39]],brass,10,[-1.1,h+.82,-2.0]);
  }
  for(const z of [-2.67,0,2.67]){
    m.box([2.31,h*.59,z],[.13,1.32,1.24],paper);
    m.box([2.396,h*.59,z],[.055,1.10,.99],navy);
    m.box([2.432,h*.59,z],[.06,.065,1.02],sail);
    for(const s of [-1,1])m.box([2.42,h*.59,z+s*.756],[.13,1.16,.28],shutter,[0,s*.14,0]);
  }
  const awning=style===2?'#3a8d89':'#dd8654';
  for(let j=0;j<7;j++){
    const col=j%2?cream:awning,z=-3.53+j*1.01;
    m.face([[2.4,2.38,z],[2.4,2.38,z+1],[3.08,2.29,z+1],[3.08,2.29,z]],col);
    m.face([[3.08,2.29,z],[3.08,2.29,z+1],[3.69,1.96,z+1],[3.69,1.96,z]],col);
    m.face([[3.69,1.96,z],[3.69,1.96,z+1],[3.70,1.83,z+.87],[3.70,1.77,z+.51],[3.70,1.82,z+.13]],col);
  }
  m.box([2.87,.78,0],[.85,1.2,6.4],shutter);
  m.box([2.97,1.43,0],[1.18,.13,6.55],sand);
  if(!far){
    m.tube([[2.47,3.3,-3.17],[2.62,3.51,-3.17],[3.47,3.51,-3.17]],.055,ink);
    if(style===0){m.box([3.40,3.01,-3.17],[.12,.76,1.69],navy);fishMark(m,[3.475,3.02,-3.15],.95);}
    else if(style===1){m.rod([3.36,3.04,-3.17],[3.48,3.04,-3.17],.42,.42,cream,16);
      m.box([3.5,3.16,-3.17],[.04,.24,.035],ink);m.box([3.5,3.06,-3.07],[.04,.045,.20],ink);}
    else{lifering(m,[3.47,3.02,-3.17],.32,PI/2);}
    for(const j of [-2,-.8,.4,1.6]){
      m.box([3.18,1.53,j],[.66,.20,.99],slat);
      for(let k=0;k<3;k++)m.oval([3.17+(k%2)*.16,1.68,j+(k-1)*.26],[.17,.08,.19],k%2?orange:'#d6aa55');
    }
  }
  return m.finish();
}
function cargo(){
  const m=new Model();m.box([0,.12,0],[1.67,.23,1.32],slat);
  for(let i=0;i<4;i++)m.box([0,.39+i*.338,0],[1.57,.315,1.19],['#a65e3c','#b7774d','#bc8050','#ab704e'][i]);
  for(const x of [-.68,.68])for(const z of [-.62,.62])m.box([x,.93,z],[.17,1.49,.09],sand);
  for(const z of [-.625,.625])m.rod([-.56,.35,z],[.55,1.52,z],.087,.087,'#e0aa69',4);
  m.box([0,1.63,0],[1.62,.09,1.31],brass);
  for(const x of [-.43,.43]){m.box([x,.93,.647],[.087,1.4,.035],navy);m.box([x,1.69,0],[.09,.035,1.3],navy);}
  m.box([-.16,.87,.666],[.33,.25,.025],cream);m.box([-.16,.88,.685],[.21,.038,.012],oxide,[0,0,.24]);
  for(const x of [-.7,.7])for(const y of [.28,1.48])m.oval([x,y,.679],[.045,.043,.015],ink);return m.finish();
}
function hurdle(){
  const m=new Model();
  for(const s of [-1,1]){
    const x=s*.77;m.loft([[0,.16,.15],[.085,.16,.15],[.12,.10,.105],[.41,.094,.094],[.47,.125,.125],[.50,.092,.093]],ink,12,[x,0,0]);
    m.loft([[.21,.097,.097],[.31,.098,.098]],cream,12,[x,0,0]);
  }
  m.tube([[-.78,.418,0],[-.38,.37,.015],[0,.347,.027],[.38,.37,.015],[.78,.418,0]],.047,slat,7);
  for(let j=-2;j<=2;j++){
    const x=j*.271,y=.365+Math.abs(j)*.018;
    m.rod([x-.116,y,0],[x+.116,y,0],.093,.093,j%2?orange:cream,10);
  }return m.finish();
}
function underSail(){
  const m=new Model();
  for(const x of [-.87,.87])m.rod([x,0,.03],[x*1.02,2.08,-.03],.046,.038,brass);
  for(let j=0;j<5;j++){
    const x=-.94+j*.376,y=1.50+Math.abs(j-2)*.055,col=j%2?'#6daca0':'#37867f';
    m.face([[x,2.13,-.36],[x+.376,2.13,-.36],[x+.376,1.92,.23],[x,1.92,.23]],col);
    m.face([[x,1.92,.23],[x+.376,1.92,.23],[x+.376,y+.04,.32],[x+.188,y,.32],[x,y+.04,.32]],col);
    m.face([[x+.03,y+.08,.33],[x+.347,y+.08,.33],[x+.19,y+.014,.33]],cream);
  }
  m.rod([-.94,2.1,-.38],[.94,2.1,-.38],.048,.048,navy);return m.finish();
}
function gate(color,bars){
  const m=new Model();
  for(const s of [-1,1]){
    const x=s*.78;
    m.loft([[-.1,.115,.115],[.12,.14,.12],[.19,.084,.085]],cream,10,[x,0,0]);
    m.tube([[x,.13,0],[x*1.05,1.02,-.01],[x*.96,1.88,.022],[x*.89,2.04,.034]],.037,navy);
    const mx=x*.97;
    m.face([[mx,1.90,.032],[mx-s*.22,1.80,.084],[mx-s*.16,1.48,.14],[mx,1.54,.051]],color);
  }
  m.tube([[-.70,2.04,.04],[-.32,1.97,.07],[0,1.95,.094],[.32,1.97,.07],[.70,2.04,.04]],.024,cream);
  for(let j=0;j<bars;j++){const x=(j-(bars-1)/2)*.21;
    m.face([[x-.082,1.96,.10],[x+.082,1.96,.10],[x+.012,1.72,.15]],color);}
  return m.finish();
}
function timberDeck(){
  const m=new Model();
  // The cuts, chamfers and end grain remain visible below the racing surface.
  for(let j=0;j<8;j++){
    const a=-2+j*.5+.009,b=a+.482,half=3.825;
    const rings=[[-half,.022],[-half+.045,0],[half-.045,0],[half,.022]].map(([x,lip])=>[
      [x,-.02-lip,a+.035],[x,-.02-lip,b-.035],[x,-.061-lip,b],[x,-.213,b-.012],
      [x,-.236,b-.048],[x,-.236,a+.048],[x,-.21,a+.012],[x,-.060-lip,a]]);
    m.skin(rings,['#ffffff','#ead7b8','#af9073','#9b8069','#937966','#907762','#ae8e72','#e8d3b4']);
  }
  const g=m.finish(),uv=[];
  const p=g.getAttribute('position');
  for(let i=0;i<p.count;i++)uv.push(p.getX(i)/7.65+.5,p.getZ(i)/4+.5);
  const Attr=p.constructor;g.setAttribute('uv',new Attr(uv,2));return g;
}
function mooring(){
  const m=new Model();
  m.loft([[0,.39,.33],[.065,.41,.35],[.125,.33,.29]],'#755542',12);
  m.loft([[.12,.215,.19],[.19,.22,.19],[.25,.152,.14],[.50,.149,.135],[.57,.20,.18]],ink,12);
  m.rod([-.28,.554,0],[.28,.554,0],.115,.115,navy,10);
  for(const s of [-1,1])m.oval([s*.278,.562,0],[.092,.135,.13],navy);
  m.loft([[.34,.158,.148],[.395,.157,.145]],cream,12);
  for(let i=0;i<3;i++)m.ring([.013,.133+i*.054,.03],.275-i*.016,.038,sand,[PI/2,0,0],[1,1.07,1]);
  m.tube([[.23,.2,.02],[.37,.14,.19],[.38,.09,.49],[.16,.074,.61]],.033,brass,6);
  return m.finish();
}
export function portModels(){
  const out={trawler:trawler(),trawlerFar:trawler(true),lateen:lateen(),beacon:lighthouse(),beaconFar:lighthouse(true),derrick:crane(),derrickFar:crane(true),
    cargo:cargo(),hurdle:hurdle(),underSail:underSail(),mooring:mooring(),pierDeck:timberDeck(),
    gateShore:gate('#a2f4d5',1),gateMid:gate('#ffbe48',2),gateOuter:gate('#fa794b',3)};
  for(let i=0;i<3;i++){out['fishHall'+i]=fishHall(i);out['fishHall'+i+'Far']=fishHall(i,true);}
  return out;
}
