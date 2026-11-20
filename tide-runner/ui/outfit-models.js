import * as T from '../vendor/three.module.js';
import {Model,PI} from './model-kit.js';

const brass='#d9a74e', ivory='#f4dfad', rubber='#233c43', copper='#bc714d', gold='#e9ad39';
const suits = [
  null,
  {coat:'#e6b139', light:'#ffce50', edge:'#996632', pants:'#375c56', shoe:'#294746', detail:'#faf0c6'},
  {coat:'#303d64', light:'#505b86', edge:'#232e42', pants:'#44496b', shoe:'#664a42', detail:'#d89c64'},
  {coat:'#58857a', light:'#8ca897', edge:'#38514e', pants:'#50695e', shoe:'#4e4137', detail:'#c98555'}
];

function jacket(id) {
  const s=suits[id], m=new Model();
  const hem=id===1?-.105:id===2?-.145:-.04;
  m.loft([[hem,.241,.172],[hem+.037,.246,.174],[.13,.221,.163],[.30,.25,.17],
    [.43,.292,.181],[.49,.279,.167],[.532,.203,.13],[.54,.112,.097]],s.coat,18);
  m.loft([[hem,.244,.174],[hem+.018,.247,.176]],s.edge,18);
  if(id===1){
    // Cape yoke runs over the shoulders and sheds rain down the back.
    m.loft([[.273,.267,.182,0,.008],[.30,.273,.183,0,.008],[.45,.298,.185],[.50,.274,.166],[.534,.19,.128]],s.light,18);
    m.loft([[.271,.269,.184,0,.008],[.292,.275,.185,0,.008]],ivory,18);
    m.oval([0,.495,.092],[.173,.113,.135],s.edge,[.35,0,0]);
    m.oval([0,.51,.109],[.161,.102,.119],s.light,[.35,0,0]);
    m.tube([[0,.53,-.11],[0,.42,-.181],[.015,.19,-.164],[.015,hem+.02,-.171]],.012,s.edge);
    for(const sign of [-1,1]) {
      m.box([sign*.136,.119,-.138],[.12,.085,.025],s.light,[0,sign*.48,sign*.10]);
      m.oval([sign*.135,.131,-.153],[.012,.012,.007],brass);
    }
  } else if(id===2) {
    m.loft([[.439,.279,.165],[.477,.274,.168],[.531,.205,.126],[.573,.174,.116]],s.edge,18);
    for(const sign of [-1,1]){
      m.face([[sign*.052,.51,-.148],[sign*.197,.411,-.132],[sign*.143,.28,-.164],[sign*.036,.41,-.176]],s.light);
      for(const y of [.07,.19,.305])m.oval([sign*.088,y,-.16],[.018,.018,.011],brass);
      m.tube([[sign*.201,.446,-.092],[sign*.254,.45,.006],[sign*.20,.429,.114]],.019,s.detail);
    }
    m.tube([[-.229,.379,.099],[-.118,.29,.159],[0,.226,.186],[.14,.14,.159],[.216,.077,.104]],.029,'#a5704e');
    m.box([.076,.12,.183],[.184,.129,.064],'#80513d',[0,.16,-.13]);
    m.box([.076,.15,.215],[.191,.06,.018],s.detail,[0,.16,-.13]);
    m.box([.081,.126,.231],[.025,.028,.015],brass);
    m.tube([[0,.38,.171],[0,.19,.168],[0,hem+.007,.176]],.008,s.light);
  } else {
    m.loft([[.025,.236,.169],[.074,.233,.17]],'#66513d',18);
    m.loft([[.427,.293,.186],[.468,.291,.189],[.505,.252,.162],[.533,.188,.131]],copper,20);
    m.loft([[.496,.257,.166],[.514,.24,.156]],brass,20);
    for(const side of [-1,1]){
      const x=side*.104;
      m.rod([x,.062,.177],[x,.34,.177],.071,.071,'#647b71',12);
      m.oval([x,.063,.177],[.071,.06,.071],rubber);
      m.oval([x,.337,.177],[.071,.062,.071],brass);
      m.rod([x,.37,.177],[x,.414,.177],.028,.026,copper,8);
      for(const y of [.108,.281])m.rod([x,y,.177],[x,y+.024,.177],.075,.075,'#584838',12);
      m.tube([[side*.155,.48,-.121],[side*.183,.40,-.14],[side*.153,.249,-.161],[side*.131,.07,-.147]],.022,'#70543d');
    }
    m.tube([[.103,.405,.177],[.19,.444,.128],[.234,.433,-.014],[.193,.362,-.138]],.015,rubber);
    m.oval([0,.234,-.182],[.067,.067,.017],brass);m.oval([0,.236,-.200],[.049,.049,.012],ivory);
    m.rod([0,.237,-.216],[.023,.258,-.215],.005,.004,'#842f28',6);
  }
  return m.finish();
}

function face(m, skin, hair) {
  m.loft([[-.065,.09,.09],[-.022,.129,.12],[.05,.152,.139,0,-.009],[.147,.166,.147],[.222,.145,.142]],skin,16);
  m.oval([0,.076,-.15],[.04,.037,.048],skin);
  m.oval([0,.145,.069],[.155,.135,.104],hair);
  for(const s of [-1,1]){
    m.oval([s*.148,.095,.008],[.029,.049,.027],skin);
    m.oval([s*.065,.108,-.133],[.019,.010,.007],rubber);
  }
}

function head(id) {
  const m=new Model();
  if(id===1){
    face(m,'#bc8056','#724937');
    m.loft([[.166,.165,.16],[.204,.176,.177],[.278,.145,.154],[.31,.084,.09]],gold,18);
    const sections=[];
    for(const radius of [0,.55,1]){
      const ring=[];
      for(let i=0;i<24;i++){
        const a=i*PI/12,back=(1+Math.sin(a))*.5;
        ring.push([( .16+radius*.088)*Math.cos(a),.197-radius*(.041+.113*back),(.158+radius*(.083+.085*back))*Math.sin(a)]);
      }
      sections.push(ring);
    }
    m.skin(sections,['#ecc14c']); 
    m.tube([[-.16,.147,0],[-.14,.022,-.011],[0,-.068,-.045],[.142,.015,.009],[.16,.147,0]],.009,'#614731');
  }else if(id===2){
    face(m,'#885c47','#362e32');
    m.loft([[.141,.163,.151],[.164,.192,.169],[.23,.197,.179],[.302,.172,.155],[.35,.09,.087],[.362,.014,.017]],'#8a5c47',18);
    for(let i=0;i<15;i++){
      const a=i*PI*2/15,c=Math.cos(a),s=Math.sin(a);
      m.tube([[c*.18,.198,s*.164],[c*.183,.24,s*.172],[c*.155,.298,s*.142],[c*.065,.353,s*.066]],.008,'#af7859',5);
    }
    m.loft([[.136,.18,.166],[.149,.193,.177],[.195,.199,.179],[.205,.19,.173]],'#a97052',20);
    m.box([-.072,.168,-.157],[.065,.045,.014],ivory,[0,-.33,.04]);m.oval([-.071,.168,-.166],[.016,.013,.006],rubber);
  }else{
    m.loft([[-.059,.119,.11],[-.025,.186,.176],[.004,.196,.182]],brass,20);
    m.oval([0,.151,.004],[.219,.239,.215],copper);
    for(const sign of [-1,1]){
      m.rod([sign*.178,.149,.008],[sign*.231,.149,.008],.087,.081,brass,14);
      m.rod([sign*.230,.149,.008],[sign*.237,.149,.008],.065,.062,'#285459',14);
      m.rod([sign*.239,.094,.008],[sign*.239,.202,.008],.009,.009,brass,6);
    }
    m.oval([0,.138,-.172],[.158,.147,.066],brass);
    m.oval([0,.138,-.199],[.127,.117,.054],'#245359');
    for(const s of [-1,1])m.rod([s*.088,.058,-.227],[-s*.088,.215,-.226],.010,.010,brass,6);
    m.oval([-.048,.178,-.246],[.035,.015,.006],'#98cdc1',[0,0,.40]);
    m.loft([[.332,.105,.10],[.351,.102,.10],[.372,.073,.07]],brass,14);
    m.tube([[0,.342,-.066],[0,.375,-.032],[0,.382,.059],[0,.331,.119],[0,.268,.166]],.018,brass);
    for(const x of [-.09,0,.09])m.oval([x,.12,.202-x*x],[.017,.021,.011],brass);
  }
  return m.finish();
}

// Preserve the original rig and footwear construction while replacing its cloth,
// soles, cuffs and stitching with each uniform's materials.
function dye(geometry, palette) {
  const g=geometry.clone(), col=g.getAttribute('color'), c=new T.Color(), map=new Map();
  for(const [from,to] of Object.entries(palette))map.set(new T.Color(from).getHex(),new T.Color(to));
  for(let i=0;i<col.count;i++){
    c.fromBufferAttribute(col,i);const paint=map.get(c.getHex());
    if(paint)col.setXYZ(i,paint.r,paint.g,paint.b);
  }
  return g;
}
export function outfitModels(base) {
  const models={};
  for(const id of [1,2,3]){
    const s=suits[id], palette={'#fc723d':s.coat,'#c7492b':s.edge,'#345d69':s.pants,'#608990':s.light,'#277f80':s.edge,
      '#183848':rubber,'#244d59':s.edge,'#234754':s.edge,'#729397':s.detail,'#fff1cb':s.detail,'#d1643d':s.shoe,'#ffe4ac':s.edge};
    models['rideTorso'+id]=jacket(id);models['rideHead'+id]=head(id);
    for(const part of ['Sleeve','Forearm','Hand','Hips','Thigh','Shin','Shoe','Scarf']){
      const p={...palette};
      if(part==='Forearm'||(part==='Hand'&&id===3))p['#b97751']=id===3?rubber:s.coat;
      if(part==='Hand'&&id===2)p['#b97751']='#885c47';
      models['ride'+part+id]=dye(base['ride'+part],p);
    }
  }
  return models;
}
