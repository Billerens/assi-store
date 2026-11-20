(function(root, build){
  if(typeof module==='object' && module.exports) module.exports=build();
  else root.FreeFlight=build();
})(this,function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(v,b));
  function gap(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}
  function heading(yaw,pitch){return {x:Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};}
  function create(p,mode,dest,stats){
    const side=((dest+p.trips)%2)?1:-1;
    const length=mode===1?165:235+(dest===2?40:0);
    const f={mode,dest,from:p.port,phase:'space',x:0,y:0,z:0,yaw:0,pitch:0,vx:0,vy:0,vz:0,
      speed:0,shield:stats.shield,hull:100,sinceHit:10,t:0,nextShot:0,rings:0,hits:0,samples:0,
      gates:[],enemies:[],bolts:[],flashes:[],rocks:[],nodes:[],pulse:0,harvest:0,harvestId:-1,
      finish:null, thrust:0.68,goal:{x:0,y:0,z:-length}, seed:27+dest*74+p.trips*51};
    for(let i=0;i<3;i++) f.gates.push({x:[8,-14,10][i]*side,y:[1,6,-1][i],z:-35-i*44,passed:false});
    for(let i=0;i<12;i++){
      const sign=i%2?1:-1;
      f.rocks.push({x:sign*(17+((i*17+f.seed)%32)),y:(i*9%26)-14,z:-20-i*18,r:2+i%4,phase:i*1.7});
    }
    if(mode===1){
      for(let i=0;i<3;i++) f.enemies.push({x:0,y:0,z:0,bx:(i-1)*13,by:i===1?5:-2,bz:-39-i*17,
        hp:26+(p.trips>3?8:0),phase:i*2.1,fire:4+i*1.3,flash:0});
      placeEnemies(f,0,false);
    }
    return f;
  }
  function placeEnemies(f,dt,advance){
    for(const e of f.enemies){
      if(e.hp<=0) continue;
      if(advance && gap(f,e)>54){
        const approach=1-Math.exp(-dt*0.18);
        e.bx+=(f.x-e.bx)*approach; e.by+=(f.y-e.by)*approach; e.bz+=(f.z-e.bz)*approach;
      }
      e.x=e.bx+Math.sin(f.t*0.68+e.phase)*6; e.y=e.by+Math.sin(f.t*0.91+e.phase)*3;
      e.z=e.bz+Math.cos(f.t*0.72+e.phase)*4; e.flash=Math.max(0,e.flash-dt);
    }
  }
  function guide(f){
    if(f.phase==='surface'){
      if(f.samples>=3) return {x:0,y:0,z:0};
      return nearest(f,f.nodes.filter(n=>!n.taken));
    }
    if(f.mode===1){
      const e=nearest(f,f.enemies.filter(en=>en.hp>0));
      if(e) return e;
    }
    return f.goal;
  }
  function nearest(p, list){
    let best=null, d=Infinity;
    for(const o of list){const n=gap(p,o); if(n<d){d=n;best=o;}}
    return best;
  }
  function burst(f,pos,color){
    f.flashes.push({x:pos.x,y:pos.y,z:pos.z,life:0.52,color});
  }
  function shoot(f,stats){
    const d=heading(f.yaw,f.pitch);
    let target=null, best=0.958;
    for(const e of f.enemies){
      if(e.hp<=0) continue;
      const range=gap(f,e);
      const dot=((e.x-f.x)*d.x+(e.y-f.y)*d.y+(e.z-f.z)*d.z)/Math.max(0.1,range);
      if(range<100 && dot>best){best=dot;target=e;}
    }
    if(target){
      const range=Math.max(1,gap(f,target));
      d.x=(target.x-f.x)/range;d.y=(target.y-f.y)/range;d.z=(target.z-f.z)/range;
      target.hp-=stats.strength;target.flash=0.2;
      if(target.hp<=0){f.hits++;burst(f,target,'enemy');}
    }
    f.bolts.push({x:f.x+d.x*2,y:f.y+d.y*2,z:f.z+d.z*2,dx:d.x,dy:d.y,dz:d.z,life:0.48,enemy:false});
    f.nextShot=0.28;
  }
  function damage(f,n){
    const use=Math.min(f.shield,n);f.shield-=use; f.hull=Math.max(0,f.hull-(n-use));f.sinceHit=0;
    if(f.hull<=0) f.finish='rescue';
  }
  function enterSurface(f){
    f.phase='surface';f.x=3;f.y=0;f.z=-2.7;f.yaw=0;f.pitch=0;f.vx=0;f.vy=0;f.vz=0;f.speed=0;
    f.landing=1.35;
    f.bolts=[];f.flashes=[];const side=f.dest===1?-1:1;
    f.nodes=[{x:-6*side,y:0,z:-10},{x:7*side,y:0,z:-17},{x:2*side,y:0,z:-26}].map(n=>Object.assign(n,{taken:false}));
  }
  function surface(f,dt,input,stats){
    f.landing=Math.max(0,(f.landing||0)-dt);
    const mag=Math.hypot(input.x,input.y);
    const k=mag>1?1/mag:1;
    f.x=clamp(f.x+input.x*k*dt*8,-35,35);
    f.z=clamp(f.z+input.y*k*dt*8,-38,18);
    if(mag>0.05) f.yaw=Math.atan2(input.x,-input.y);
    const index=f.nodes.findIndex(n=>!n.taken && gap(f,n)<=stats.reach);
    if(input.action && index>=0){
      if(f.harvestId!==index) f.harvest=0;
      f.harvestId=index;f.harvest+=dt;
      if(f.harvest>=0.55){f.nodes[index].taken=true;f.samples++;f.harvest=0;burst(f,f.nodes[index],'sample');}
    } else {f.harvest=0;f.harvestId=-1;}
    if(f.samples>=3 && Math.hypot(f.x,f.z)<5 && input.action) f.finish='success';
  }
  function step(f,dt,input,stats){
    if(f.finish) return;
    dt=clamp(dt,0,0.06); f.t+=dt;
    for(const fx of f.flashes) fx.life-=dt;
    f.flashes=f.flashes.filter(fx=>fx.life>0);
    if(f.phase==='surface'){surface(f,dt,input,stats);return;}
    f.yaw+=input.x*stats.turn*dt;
    f.pitch=clamp(f.pitch-input.y*stats.turn*dt*0.82,-1.25,1.25);
    const d=heading(f.yaw,f.pitch);
    const speed=input.brake?0:stats.speed*(input.boost?1.58:f.thrust);
    const response=1-Math.exp(-dt*(input.brake?4.5:2.0));
    f.vx+=(d.x*speed-f.vx)*response;f.vy+=(d.y*speed-f.vy)*response;f.vz+=(d.z*speed-f.vz)*response;
    f.x+=f.vx*dt;f.y+=f.vy*dt;f.z+=f.vz*dt;f.speed=Math.hypot(f.vx,f.vy,f.vz);
    f.nextShot-=dt;f.sinceHit+=dt;f.pulse=Math.max(0,f.pulse-dt);
    if(f.sinceHit>2.8) f.shield=Math.min(stats.shield,f.shield+stats.regen*dt);
    for(const gate of f.gates) if(!gate.passed && gap(f,gate)<11){gate.passed=true;f.rings++;burst(f,gate,'ring');}
    for(const rock of f.rocks){
      const dist=gap(f,rock);
      if(dist<rock.r+1.1 && f.sinceHit>0.8){damage(f,9);f.pulse=0.24;}
    }
    placeEnemies(f,dt,true);
    if(input.action && f.nextShot<=0) shoot(f,stats);
    for(const e of f.enemies){
      if(e.hp<=0 || (e.fire-=dt)>0) continue;
      e.fire=2.8+e.phase*0.12;
      const distance=Math.max(gap(f,e),0.5);
      if(distance<65) f.bolts.push({x:e.x,y:e.y,z:e.z,dx:(f.x-e.x)/distance,dy:(f.y-e.y)/distance,
        dz:(f.z-e.z)/distance,life:3.2,enemy:true});
    }
    for(const b of f.bolts){
      const vel=b.enemy?20:116;
      b.x+=b.dx*vel*dt;b.y+=b.dy*vel*dt;b.z+=b.dz*vel*dt;b.life-=dt;
      if(b.enemy && gap(f,b)<2.5){b.life=0;damage(f,7);f.pulse=0.2;}
    }
    f.bolts=f.bolts.filter(b=>b.life>0);
    if(!f.finish && gap(f,f.goal)<stats.gateRadius && (f.mode!==1 || f.hits===f.enemies.length)){
      if(f.mode===2) enterSurface(f);else f.finish='success';
    }
  }
  return {create,step,guide,gap,heading,nearest};
});
