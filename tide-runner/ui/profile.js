import {restoreEconomy,award,updateBoards} from './economy.js';

const KEY = 'tide-runner:profile:1';
const RULES = window.TideRace.RULES;
export function blank() {
  return {v:RULES, runs:0, bestDistance:0, bestScore:0, bestBank:0, fullWave:false,
    rows:[], fixed:[], live:null, ghost:true, sound:true, skin:0, outfit:0, wallet:0,
    ownedBoards:[0], ownedOutfits:[0], gear:{magnet:0,boost:0}, settled:[]};
}
export function loadProfile(hub) {
  let raw=hub?.state?.meta?.profile;
  if (!hub) {
    try {raw=JSON.parse(localStorage.getItem(KEY)||'null');} catch (_) {raw=null;}
  }
  const p=Object.assign(blank(),raw && typeof raw==='object' ? raw : {}, {v:RULES});
  if(!Array.isArray(p.rows))p.rows=[];
  if(!Array.isArray(p.fixed))p.fixed=[];
  return restoreEconomy(p);
}
export function saveProfile(p,hub) {
  if(hub) {
    if(!hub.readonly)hub.act(s=>{
      s.meta.profile=JSON.parse(JSON.stringify(p));
      s.meta.bestDistance=p.bestDistance;
    },{now:true,reason:'tide-runner'});
  } else localStorage.setItem(KEY,JSON.stringify(p));
}
export function ranked(rows,field) {
  return rows.slice().sort((a,b)=>b[field]-a[field]||a.at-b.at).slice(0,5);
}
function collect(rows) {
  const keep=new Set([...ranked(rows,'meters'),...ranked(rows,'score'),...rows.slice(-5)]);
  return rows.filter(r=>keep.has(r));
}
export function record(p,row) {
  if(!award(p,row))return false;
  p.runs++;p.bestBank=Math.max(p.bestBank,row.bestBank);
  if(row.bestChain>=5)p.fullWave=true;
  if(row.mode==='open'){
    p.rows=collect([...p.rows,row]);p.bestDistance=Math.max(p.bestDistance,row.meters);p.bestScore=Math.max(p.bestScore,row.score);
  }else{
    const same=p.fixed.filter(r=>r.seed===row.seed),other=p.fixed.filter(r=>r.seed!==row.seed);
    p.fixed=[...other,...collect([...same,row])];
  }
  p.last=row;
  updateBoards(p);
  return true;
}
export function courseRecords(p,seed) {
  const records=[...p.fixed,...p.rows].filter(r=>r.seed===seed);
  if(p.last?.seed===seed&&!records.some(r=>r.id===p.last.id))records.push(p.last);
  return records;
}
export function unlocked(p,index) {
  return p.ownedBoards.includes(index);
}
export function weekStart(offset=0) {
  const now=new Date(),day=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7+offset*7);
  return day;
}
export function weekSeed(date) {return window.TideRace.hash(2399,Math.floor(date.getTime()/86400000))||1;}
