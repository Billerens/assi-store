// Ship-local metres. +X is starboard, -Z is the bow. All Y coordinates here are eye heights.
export const STANDING_EYE = 1.67;
export const HELM = Object.freeze({x:2.72,y:1.48,z:-9.56});
export const AIRLOCK = Object.freeze({x:2.72,z:3.24});
export const rooms = Object.freeze({
  quarters: [-4.0,4.0,-3.22,3.27],
  corridor: [1.75,3.69,-7.28,-3.04],
  bridge: [.34,5.10,-12.25,-7.08]
});
export const berthLocations = Object.freeze([[-2.54,0,1.82],[-.24,0,1.82],[-2.54,1.08,1.82]]);
const radius=.23;
export function createWalker() { return {x:2.72,y:STANDING_EYE,z:2.57,yaw:0,pitch:0}; }
export function spawnAtHelm() { return {x:2.72,y:STANDING_EYE,z:-8.55,yaw:Math.PI,pitch:0}; }

function inHull(x,z) {
  return Object.values(rooms).some(([left,right,fore,aft])=>x>=left&&x<=right&&z>=fore&&z<=aft);
}
function touches(x,z,left,right,fore,aft) {
  const dx=x-Math.max(left,Math.min(x,right)), dz=z-Math.max(fore,Math.min(z,aft));
  return dx*dx+dz*dz<radius*radius;
}
export function canStand(x,z,p={}) {
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  for(const dx of [-radius,radius])for(const dz of [-radius,radius])if(!inHull(x+dx,z+dz))return false;
  const furniture=[
    [-1.70,1.70,-2.33,-1.10],[-1.10,-.46,-1.09,-.40],[.46,1.10,-1.09,-.40],
    [2.31,3.13,-10.02,-9.02],[.34,1.06,-11.47,-8.91],[4.38,5.10,-11.47,-8.91],
    [.34,5.10,-12.25,-10.86],[3.62,4.0,-2.90,2.75],[-4,-3.62,-2.43,2.55]
  ];
  const count=p.bunks===undefined?1:p.bunks;
  for(let i=0;i<Math.min(2,count);i++){
    const [bx,,bz]=berthLocations[i];furniture.push([bx-.83,bx+.83,bz-1.22,bz+1.30]);
  }
  const crew=[[-3.01,-.46],[-.79,-.74],[3.39,-.81]];
  for(const role of p.crew||[]){
    const pos=crew[role];if(pos&&Math.hypot(x-pos[0],z-pos[1])<.43)return false;
  }
  return !furniture.some(rect=>touches(x,z,...rect));
}
export function advanceWalker(walker,axes,dt,p) {
  const forward=Math.max(-1,Math.min(1,Number(axes.forward)||0)), right=Math.max(-1,Math.min(1,Number(axes.right)||0));
  const length=Math.hypot(forward,right);
  if(!length||!Number.isFinite(dt)||dt<=0)return walker;
  const distance=2.5*Math.min(dt,1)/Math.max(1,length);
  const s=Math.sin(walker.yaw), c=Math.cos(walker.yaw);
  const dx=(s*forward+c*right)*distance,dz=(-c*forward+s*right)*distance;
  // Substeps prevent a delayed frame from crossing a thin jamb. Axis sliding
  // lets a player brush against a bunk and keep moving down the aisle.
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.10));
  for(let i=0;i<steps;i++){
    if(canStand(walker.x+dx/steps,walker.z,p))walker.x+=dx/steps;
    if(canStand(walker.x,walker.z+dz/steps,p))walker.z+=dz/steps;
  }
  walker.y=STANDING_EYE;
  return walker;
}
export function nearStation(walker) {
  if(!walker)return null;
  if(Math.hypot(walker.x-HELM.x,walker.z-HELM.z)<1.64)return 'helm';
  if(Math.hypot(walker.x-AIRLOCK.x,walker.z-AIRLOCK.z)<1.22)return 'port';
  return null;
}
