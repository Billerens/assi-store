import * as T from '../vendor/three-0.160.0/three.module.js';
import {finish,coat,lamp,mesh,box,sph,rod,band,loft,fairing,surface,pathTube} from './model-kit.js';
import {berthLocations} from './ship-interior.js';

export function expeditionSuit(){
  const g=new T.Group(),enamel=coat(0xe2d5b4,.56,.24),cloth=coat(0xb96c42,.82,.07),
    seals=coat(0x283a43,.61,.25),worn=coat(0x637780,.48,.58),visor=coat(0x315771,.12,.82),light=lamp(0xa3e6db);
  sph(g,0,.98,0,.256,.34,.17,cloth);
  fairing(g,0,1.04,-.10,.43,.37,.20,enamel);
  fairing(g,0,.83,-.13,.35,.14,.16,worn);
  for(let i=0;i<3;i++)box(g,.047,.04,.022,i===0?light:seals,-.075+i*.075,1.073,-.209);
  rod(g,[0,1.26,0],[0,1.32,0],.201,worn,.203,18);
  sph(g,0,1.48,0,.244,.229,.228,enamel);
  sph(g,0,1.49,-.105,.213,.156,.171,visor);
  for(const s of [-1,1]){
    sph(g,s*.231,1.47,0,.05,.097,.094,worn);
    sph(g,s*.256,1.13,0,.124,.136,.137,enamel);
    rod(g,[s*.268,1.07,0],[s*.323,.84,-.017],.087,cloth,.077);
    rod(g,[s*.323,.86,-.017],[s*.319,.77,-.063],.079,seals,.075);
    sph(g,s*.319,.72,-.059,.075,.095,.075,enamel);
    rod(g,[s*.126,.74,-.015],[s*.151,.43,.021],.125,cloth,.104);
    sph(g,s*.15,.444,-.064,.11,.105,.089,enamel);
    rod(g,[s*.15,.394,.022],[s*.166,.136,.004],.098,enamel,.081);
    fairing(g,s*.164,.093,-.067,.205,.144,.331,seals);
  }
  fairing(g,0,1.005,.228,.372,.49,.248,enamel);
  for(const s of [-1,1])rod(g,[s*.192,.845,.235],[s*.192,1.155,.235],.053,worn,.053,12);
  pathTube(g,[[.17,1.38,.13],[.27,1.27,.24],[.21,1.17,.27]],.027,cloth);
  return finish(g);
}
function display(){
  const {ctx:c,texture}=surface('Navigation console',256);
  c.fillStyle='#12272f';c.fillRect(0,0,256,256);
  const col='#96e0c9';c.strokeStyle='#335461';c.lineWidth=1;
  for(let i=0;i<16;i++){c.beginPath();c.moveTo(0,16*i);c.lineTo(256,16*i);c.stroke();c.beginPath();c.moveTo(16*i,0);c.lineTo(16*i,256);c.stroke();}
  c.strokeStyle=col;c.lineWidth=3;
  for(const r of [19,34,51]){c.beginPath();c.ellipse(83,104,r,r*.67,-.45,0,Math.PI*2);c.stroke();}
  c.fillStyle='#efb278';c.beginPath();c.arc(90,98,8,0,Math.PI*2);c.fill();
  for(let k=0;k<9;k++){c.fillStyle=k%3?'#6aafa8':'#e4b678';c.fillRect(155,68+12*k,18+(k*19)%60,4);}
  c.font='bold 13px monospace';c.fillStyle='#d5e5d5';c.fillText('NAV  //  ORB',12,28);c.fillText('SYSTEM  03',15,210);
  c.fillStyle='#80c9bd';c.fillRect(17,226,222,3);return new T.MeshBasicMaterial({map:texture});
}
function finishMaterial(color,kind){
  const {ctx:c,texture}=surface(kind,192);c.fillStyle='#e8e5dc';c.fillRect(0,0,192,192);
  let seed=671;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  if(kind==='canvas'){
    for(let i=0;i<192;i+=2){
      c.fillStyle=i%4?'#c5beb0':'#f0eadc';c.fillRect(i,0,1,192);
      c.fillStyle='rgba(103,89,76,.18)';c.fillRect(0,i,192,1);
    }
    c.strokeStyle='rgba(113,92,76,.43)';c.lineWidth=1.5;
    for(let i=12;i<192;i+=48){c.beginPath();c.moveTo(0,i);c.lineTo(192,i);c.stroke();}
  }else{
    c.strokeStyle='#9baba6';c.lineWidth=2;c.strokeRect(2,2,188,188);
    c.strokeStyle='#f7f4e9';c.lineWidth=1;c.strokeRect(4,4,184,184);
    for(const x of [10,182])for(const y of [10,182]){c.fillStyle='#82918e';c.beginPath();c.arc(x,y,2,0,6.29);c.fill();c.fillStyle='#c7c9b9';c.fillRect(x-1.5,y-.4,3,.8);}
  }
  for(let i=0;i<3200;i++){c.fillStyle=i%2?'rgba(29,42,40,.052)':'rgba(255,254,232,.13)';c.fillRect(rnd()*192,rnd()*192,1+rnd()*2,1);}
  texture.wrapS=texture.wrapT=T.RepeatWrapping;
  const m=coat(color,kind==='canvas'?.90:.64,kind==='canvas'?.025:.30,{map:texture});m.userData.tileSize=kind==='canvas'?.46:1.17;return m;
}
function crewMember(role){
  const g=new T.Group(),skin=coat([0xb08062,0xc89d7b,0x956c55][role],.79,.02),
    hair=coat([0x393b35,0x6a5143,0x323539][role],.88,.03),jacket=coat([0x53868d,0x927650,0x647e69][role],.81,.04),
    pants=coat(0x343f4e,.84,.08),boots=coat(0x3d3b38,.67,.18),light=coat(0xe0c195,.76,.09);
  const seated=role===1,hip=seated?.57:.79;
  sph(g,0,hip+.18,0,.232,.30,.162,jacket);sph(g,0,hip-.02,0,.192,.15,.145,pants);
  rod(g,[0,hip+.41,0],[0,hip+.51,0],.083,skin);
  sph(g,0,hip+.65,0,.171,.219,.161,skin);
  const cap=mesh(g,new T.SphereGeometry(1,20,10,0,Math.PI*2,0,1.42),hair,0,hip+.685,.017);
  cap.scale.set(.181,.202,.172);
  if(role===2)sph(g,0,hip+.69,.155,.12,.12,.11,hair);
  for(const s of [-1,1]){
    sph(g,s*.162,hip+.63,.01,.035,.047,.025,skin);
    sph(g,s*.064,hip+.67,-.145,.023,.011,.010,hair);
    sph(g,s*.204,hip+.31,0,.088,.096,.108,jacket);
    const elbow=[s*.28,hip+.11,seated?-.17:-.03],hand=[s*.29,hip+(seated?.14:-.04),seated?-.40:-.105];
    rod(g,[s*.21,hip+.29,0],elbow,.08,jacket,.064);
    rod(g,elbow,hand,.065,jacket,.048);sph(g,...hand,.063,.077,.055,skin);
    const knee=[s*.126,seated?.48:.41,seated?-.35:-.035],foot=[s*.14,.12,seated?-.35:0];
    rod(g,[s*.108,hip-.05,0],knee,.113,pants,.09);rod(g,knee,foot,.091,pants,.068);
    fairing(g,s*.14,.083,foot[2]-.055,.18,.14,.28,boots);
  }
  box(g,.11,.065,.018,light,-.108,hip+.27,-.153);return finish(g);
}
export function quarters(p,connected=false){
  const g=new T.Group(),frame=coat(0x334752,.54,.57),cream=finishMaterial(0xc5c8ba,'bulkhead'),inset=coat(0x74888b,.49,.50),
    dark=coat(0x243743,.69,.29),brass=coat(0xa98553,.43,.65),leather=finishMaterial([0xb97b51,0x58a5a4,0xa1759c][p.cabin],'canvas'),
    glowing=lamp([0xffcf9a,0x94e7dc,0xf2b8dd][p.cabin]),screen=display();
  const glass=new T.MeshBasicMaterial({color:0x74b6bc,side:T.DoubleSide,transparent:true,opacity:.055,depthWrite:false});
  const linen=coat(0xeee1c7,.92,.04),strap=coat(0x946c4d,.72,.17),wood=coat(0x986749,.71,.13);
  fairing(g,0,-.23,0,9.1,.53,7.0,frame);
  for(let row=0;row<9;row++)for(let col=0;col<6;col++){
    box(g,1.40,.06,.71,(row+col)%4?inset:frame,-3.53+col*1.41,.056,-2.84+row*.716);
  }
  if(connected){
    box(g,6.27,.61,.37,dark,-1.37,.34,-3.23);
    box(g,.72,.61,.37,dark,4.02,.34,-3.23);
  }else box(g,9,.34,.37,dark,0,.26,-3.29);
  box(g,9,.38,.54,cream,0,3.01,-3.14);
  box(g,.45,3.07,6.49,cream,-4.23,1.55,-.05);
  box(g,.34,3.02,6.46,cream,4.23,1.55,-.05);
  // The window is an opening in the pressure shell. Every pane looks straight
  // onto the same planet, ring station and moving ships as the exterior dock.
  box(g,8.36,.20,1.10,frame,0,3.22,-2.79);
  box(g,8.32,.10,1.19,cream,0,3.08,-2.72);
  for(let i=0;i<6;i++){
    const z=-2.50+i*1.04;
    box(g,8.3,.16,1.025,cream,0,3.21,z);
    box(g,7.97,.10,.105,inset,0,3.08,z+.48);
    for(const s of [-1,1]){
      const corner=box(g,.59,.16,1.00,frame,s*3.83,3.0,z);corner.rotation.z=s*-.55;
      if(i%2===0)box(g,.43,.04,.56,glowing,s*2.95,3.10,z-.06);
    }
  }
  for(let i=0;i<3;i++){
    const x=-2.74+i*2.74;
    if(connected&&i===2){
      box(g,.36,2.84,.27,cream,1.58,1.47,-3.19);
      box(g,.47,2.84,.27,cream,3.97,1.47,-3.19);
      box(g,2.75,.38,.33,frame,2.74,2.73,-3.19);
      continue;
    }
    for(const s of [-1,1])fairing(g,x+s*1.31,1.78,-3.19,.125,2.21,.30,frame);
    for(const y of [.72,2.83])fairing(g,x,y,-3.19,2.72,.13,.33,frame);
    mesh(g,new T.PlaneGeometry(2.48,1.99),glass,x,1.78,-3.19);
    box(g,2.55,.058,.11,inset,x,.79,-3.06);
    const housing=fairing(g,x,.55,-3.11,2.58,.43,.39,cream);
    for(let j=0;j<8;j++)box(g,.08,.14,.028,dark,x-.58+j*.17,.55,-2.89);
    box(g,2.35,.052,.08,glowing,x,2.82,-2.86);
  }
  for(const xpos of [-4.05,-1.37,1.37,4.04]){
    rod(g,[xpos,.15,-3.02],[xpos,2.95,-3.02],.093,brass,.092,10);
    rod(g,[xpos,2.94,-2.99],[xpos,3.25,-2.53],.115,inset,.085);
  }
  // Side wall lockers and a bolted instrument rail with removable items.
  for(const x of [-3.85,3.85]){
    box(g,.09,.09,5.88,glowing,x,2.70,-.03);
    pathTube(g,[[x,2.77,2.8],[x,2.89,2.3],[x,2.89,-2.38],[x,2.72,-2.78]],.066,frame);
  }
  for(const z of [-2.25,-.74,.70,2.01]){
    fairing(g,3.96,1.49,z,.34,2.38,1.28,inset);
    box(g,.07,.81,.81,dark,3.75,1.78,z);
    for(let h=0;h<5;h++)box(g,.08,.025,.66,brass,3.70,1.55+h*.09,z);
  }
  // The hatch and recessed, handled lockers line the port wall.
  fairing(g,-3.91,1.36,.53,.23,2.44,1.48,frame);
  for(const z of [.17,.89]){
    fairing(g,-3.74,1.37,z,.15,2.12,.65,inset);
    box(g,.11,.12,.28,brass,-3.64,1.26,z);
  }
  for(const z of [-1.79,-.96,2.14]){
    fairing(g,-3.87,1.02,z,.44,1.77,.71,inset);
    box(g,.045,.42,.47,cream,-3.63,1.38,z);box(g,.05,.22,.075,brass,-3.61,.95,z+.17);
  }
  pathTube(g,[[-3.82,2.62,2.90],[-3.82,2.62,-2.49],[-3.65,2.79,-2.82],[-2.01,2.79,-2.82]],.064,brass);
  for(let i=0;i<p.bunks;i++){
    const [x,offset,z]=connected?berthLocations[i]:[-2.54+i*2.48,0,1.82];
    const berthStart=g.children.length;
    fairing(g,x,.39,z,1.65,.56,2.44,frame);
    fairing(g,x,.72,z,1.50,.23,2.28,cream);fairing(g,x,.87,z+.27,1.44,.17,1.52,leather);
    fairing(g,x,.91,z-.73,1.05,.18,.43,cream);box(g,1.41,.13,.09,brass,x,.90,z+1.09);
    for(let j=0;j<5;j++){const seam=box(g,1.33,.027,.018,inset,x,.960,z-.16+j*.19);seam.rotation.z=.01;}
    for(const s of [-1,1])rod(g,[x+s*.73,.43,z-.45],[x+s*.73,.83,z-.45],.035,brass);
    // Inner headboard, reading lamp and strapped soft bag form a sleeping niche.
    fairing(g,x,1.08,z+1.21,1.66,1.53,.13,frame);
    fairing(g,x,1.36,z+1.11,1.46,.64,.13,leather);
    box(g,1.33,.055,.09,glowing,x,1.72,z+1.08);
    const bag=fairing(g,x+.44,1.02,z+.35,.51,.22,.46,strap);
    for(const dz of [-.13,.13])box(g,.50,.022,.048,linen,x+.44,1.14,z+.35+dz);
    box(g,.47,.18,.027,brass,x-.42,.42,z-1.22);
    if(offset){
      g.children.slice(berthStart).forEach(piece=>piece.position.y+=offset);
      for(const a of [-1,1])for(const b of [-1,1])rod(g,[x+a*.76,.18,z+b*1.08],[x+a*.76,offset+.52,z+b*1.08],.047,frame);
    }
  }
  fairing(g,0,.93,-1.72,3.38,.15,1.18,cream);
  for(const x of [-1.37,1.37])fairing(g,x,.56,-1.80,.38,.78,.72,frame);
  for(const x of [-.78,.78]){
    const mon=new T.Group();g.add(mon);mon.position.set(x,1.41,-1.96);mon.rotation.x=-.14;
    fairing(mon,0,0,0,1.04,.72,.11,dark);mesh(mon,new T.PlaneGeometry(.90,.58),screen,0,0,.065);
    fairing(g,x,1.045,-1.38,.64,.06,.25,frame);for(let k=0;k<5;k++)box(g,.075,.022,.065,cream,x-.21+k*.105,1.087,-1.39);
    fairing(g,x,.60,-.77,.62,.22,.61,leather);fairing(g,x,.86,-.49,.62,.58,.14,leather);
    rod(g,[x,.17,-.77],[x,.53,-.77],.1,frame);fairing(g,x,.16,-.77,.50,.11,.53,frame);
  }
  for(let j=0;j<2;j++){
    rod(g,[1.45,.999,-1.52+j*.28],[1.45,1.18,-1.52+j*.28],.09,j?brass:cream,.106,14);
  }
  const mount=p.cabinMount==='berth'?[ -2.55,1.78,2.77 ]:[1.55,1.02,-1.85];
  const [mx,my,mz]=mount;
  fairing(g,mx,my+.035,mz,.55,.10,.42,wood);
  for(const x of [-.18,.18])rod(g,[mx+x,my+.07,mz],[mx+x,my+.24,mz],.029,brass);
  if(p.stats.samples){
    const sample=mesh(g,new T.OctahedronGeometry(.25,0),coat(0x83bdb0,.24,.48),mx,my+.30,mz);
    sample.scale.set(.82,1.35,.79);sample.rotation.z=.20;
  }else{
    sph(g,mx,my+.28,mz,.12,.12,.12,brass);
    const armillary=band(g,mx,my+.28,mz,.22,.020,glowing,24);armillary.rotation.set(.7,.38,-.2);
    const band2=band(g,mx,my+.28,mz,.20,.021,brass,24);band2.rotation.set(-.28,.87,.18);
  }
  const staticModel=finish(g);
  const rear=new T.Group();
  box(rear,8.45,3.06,.18,cream,0,1.58,3.30);
  const hatchX=connected?2.72:.55;
  fairing(rear,hatchX,1.44,3.16,1.55,2.65,.16,frame);
  for(const s of [-1,1]){fairing(rear,hatchX+s*.33,1.46,3.06,.61,2.30,.09,inset);box(rear,.22,.07,.035,brass,hatchX+s*.33,1.54,2.99);}
  if(connected){const glassPort=band(rear,hatchX,1.87,2.99,.20,.036,brass);sph(rear,hatchX,1.87,3.01,.18,.18,.045,dark);}
  box(rear,8.15,.07,.10,glowing,0,2.87,3.14);
  staticModel.userData.aftWall=finish(rear);staticModel.add(rear);
  const locations=[[-3.01,.12,-.46,1.30],[-.79,.12,-.74,0],connected?[3.39,.12,-.81,-1.27]:[2.87,.12,-1.41,-1.27]];
  p.crew.forEach(id=>{const w=crewMember(id),[x,y,z,yaw]=locations[id];w.position.set(x,y,z);w.rotation.y=yaw;staticModel.add(w);});
  return staticModel;
}
export function mineral(index){
  const g=new T.Group(),base=coat([0x776856,0x496469,0x6e5868][index],.85,.16);
  const palettes=[['#6daa9e','#b3e4cb','#82bba3'],['#c68e61','#efd0a2','#e0a873'],['#96719e','#dbc7e7','#bca1cf']];
  const mats=palettes[index].map((col,i)=>coat(col,.26+i*.06,.48,{emissive:col,emissiveIntensity:.09}));
  function crystal(x,z,h,r,lean,spin){
    const col=new T.Group();g.add(col);col.position.set(x,.14,z);col.rotation.z=lean;col.rotation.y=spin;
    const rings=[[0,r*.78],[h*.18,r],[h*.73,r*.84],[h*.85,r*.80],[h,r*.07]];
    const side=6;
    for(let i=0;i<side;i++){
      const a=i*2*Math.PI/side,b=(i+1)*2*Math.PI/side;
      const positions=[],idx=[];
      rings.forEach(([y,rad])=>positions.push(Math.cos(a)*rad,y,Math.sin(a)*rad,Math.cos(b)*rad,y,Math.sin(b)*rad));
      for(let n=0;n<rings.length-1;n++)idx.push(n*2,n*2+2,n*2+1,n*2+1,n*2+2,n*2+3);
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(idx);geo.computeVertexNormals();
      mesh(col,geo,mats[i%3]);
    }
  }
  for(let i=0;i<8;i++){
    const a=i*2.4,r=.40+(i%3)*.15;
    const rock=mesh(g,new T.IcosahedronGeometry(.45*(i%2?.9:1.4),0),base,Math.sin(a)*r,.13,Math.cos(a)*r);
    rock.scale.y=.41;rock.rotation.y=a;
  }
  crystal(0,0,1.95,.29,-.17,.16);crystal(-.43,.19,1.22,.23,.42,1.3);crystal(.35,-.21,1.42,.25,-.45,.6);
  crystal(.34,.38,.75,.15,-.23,1.8);crystal(-.18,-.46,.92,.18,.27,2.5);return finish(g);
}
