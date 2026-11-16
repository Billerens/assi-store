/* Shared simulation: currencies use Big; wall-clock deadlines survive offline and saves. */
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/fmt.js'), require('../engine/rng.js'), {
    world: require('./content/world.json'), mutations: require('./content/mutations.json'),
    constants: require('./content/constants.json'), events: require('./content/events.json'),
    laws: require('./content/laws.json'), chronicle: require('./content/chronicle.json')
  }) : make(root.Big, root.Fmt, root.Rng, null);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else root.GameSim = api;
})(this, function (Big, Fmt, Rng, content) {
  'use strict';
  var C = content;
  function use(data) { C = data; }
  function data() { return C; }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function num(v) { return Big.toNumber(v); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function law(s, id) { return (s.meta.laws && s.meta.laws[id]) || 0; }
  function availableMutations(s) { return C.mutations.concat(s.meta.extraMutations || []); }
  function availableConstants(s) { return C.constants.concat(s.meta.extraConstants || []); }
  function constant(s) { var c = find(availableConstants(s), s.run.constant); return c ? (c.template || c.id) : 'balanced'; }
  function rngOf(s) { return Rng.make(s.run.seed); }
  function saveRng(s, rng) { s.run.seed = rng.state(); }
  function init(ctx) {
    var cfg = ctx.config;
    var made = {
      run: {
        stage: 1, stageAt: ctx.now, resource: cfg['stage1.initial'], maxima: ['0','0','0','0','0','0','0','0'],
        producers: [0,0,0,0], levels: { mitosis: 0, capacity: 0 }, legacy: 1,
        mutations: {}, pendingMutations: [], generation: 0, nextGeneration: ctx.now + cfg['mutation.generationSec'] * 1000,
        ocean: [cfg['ocean.initialA'], cfg['ocean.initialH'], cfg['ocean.initialC']], hexes: [],
        roles: [cfg['tribe.role0'],cfg['tribe.role1'],cfg['tribe.role2'],cfg['tribe.role3']],
        people: cfg['tribe.initialPeople'], food: cfg['tribe.initialFood'], tools: '0', epoch: 0, discoveries: [false,false,false,false],
        colonies: [], worlds: cfg['space.initialWorlds'], constant: 'balanced', universeChoices: [],
        event: null, nextEvent: ctx.now + cfg['event.minSec'] * 1000, buffs: [], stageMult: 1,
        freeLand: 0, discount: false, immunity: false, wheel: false, finished: false,
        seed: ctx.rng.int(1, 2147483646), autoAt: ctx.now + 1000, bestStage: 1, coldCapHours: cfg['life.coldCapBonus']
      },
      layers: {},
      meta: { laws: {}, atlas: [], collection: {}, memory: '', priority: [], mutationCount: 0, universes: 0,
        extraMutations: [], extraConstants: [], descriptions: {}, chronicles: [], feats: {} }
    };
    made.run.universeChoices=ctx.rng.fork('birth').shuffle(C.constants).slice(0,cfg['universe.choices']).map(function(c){return c.id;});
    return made;
  }
  function updateMax(s) {
    var r = s.run;
    r.maxima[r.stage - 1] = Big.str(Big.max(r.maxima[r.stage - 1], r.resource));
    r.bestStage = Math.max(r.bestStage, r.stage);
  }
  function gain(s, amount) { s.run.resource = Big.str(Big.add(s.run.resource, amount)); updateMax(s); }
  function pay(s, price) {
    if (!Big.valid(price) || Big.sign(price) < 0 || Big.lt(s.run.resource, price)) return false;
    s.run.resource = Big.str(Big.sub(s.run.resource, price)); return true;
  }
  function milestone(n, cfg, broth) {
    var p = broth ? 'broth.' : 'producer.';
    var count = (n >= cfg[p+'milestone1'] ? 1 : 0) + (n >= cfg[p+'milestone2'] ? 1 : 0) + (n >= cfg[p+'milestone3'] ? 1 : 0);
    return Math.pow(cfg['producer.milestoneMult'], count);
  }
  function mutationMult(s, cfg, producer, stageOnly) {
    var result = Big.ONE;
    var list = availableMutations(s);
    for (var i = 0; i < list.length; i++) {
      var m = list[i], count = s.run.mutations[m.id] || 0;
      if (!count) continue;
      var applies = m.effect === 'stage' || (!stageOnly && m.effect === 'producer' && (producer === undefined || m.producer === producer));
      if (applies) result = Big.mul(result, Big.pow(cfg['mutation.'+m.id+'.mult'] || (m.effect === 'stage' ? cfg['mutation.rareMult'] : cfg['mutation.commonMult']), count));
    }
    return result;
  }
  function hasEffect(s, effect) {
    var list = availableMutations(s);
    for (var i = 0; i < list.length; i++) if (list[i].effect === effect && s.run.mutations[list[i].id]) return true;
    return false;
  }
  function stageMultiplier(s, cfg) {
    var r = s.run, st = r.stage, c = constant(s);
    var result = Big.mul(Big.mul(r.legacy, r.stageMult), Big.mul(Big.pow(cfg['law.stageMult'], law(s, 'stage'+st)),cfg['stage'+st+'.pace']));
    if (c === 'slow') result = Big.mul(result, cfg['constant.slowAll']);
    if (c === 'gravity') result = Big.mul(result, st === 8 ? cfg['constant.gravitySpace'] : st === 5 ? cfg['constant.gravityLand'] : 1);
    if (c === 'light' && st === 7) result = Big.mul(result, cfg['constant.lightCiv']);
    if (c === 'ocean' && st === 4) result = Big.mul(result, cfg['constant.oceanMult']);
    if (c === 'radiation' && st === 2) result = Big.mul(result, cfg['constant.radiationCell']);
    if (c === 'cold' && st === 2) result = Big.mul(result, cfg['constant.coldCell']);
    if (c === 'broth') result = Big.mul(result, st === 1 ? cfg['constant.brothMult'] : st === 3 ? cfg['constant.brothMulti'] : 1);
    if (c === 'suns' && st === 5) result = Big.mul(result, cfg['constant.sunsLand']);
    if (c === 'compact' && st === 5) result = Big.mul(result, cfg['constant.compactLand']);
    return result;
  }
  function capacity(s, cfg) { return Big.mul(cfg['cell.capacityBase'], Big.pow(cfg['cell.capacityGrowth'], s.run.levels.capacity)); }
  function cellRate(s, cfg) { return cfg['cell.rate'] * Math.pow(cfg['cell.rateGrowth'], s.run.levels.mitosis); }
  function logistic(n, k, rate, sec) {
    if (Big.isZero(n)) return Big.ZERO;
    if (Big.eq(n, k)) return Big.of(n);
    var exponent = Math.exp(-Math.min(745, Math.max(0, rate * sec)));
    return Big.div(k, Big.add(1, Big.mul(Big.sub(Big.div(k, n), 1), exponent)));
  }
  function oceanLimit(s, cfg, i) {
    if (i === 0) return Big.of('1e300');
    var ratio=constant(s) === 'moonless' ? cfg['ocean.softRatio'] : cfg['ocean.ratio'];
    return Big.mul(i===2?Big.min(s.run.ocean[1],Big.mul(s.run.ocean[0],ratio)):s.run.ocean[0],ratio);
  }
  function living(s, cfg) {
    var r = s.run, ratio = constant(s) === 'moonless' ? cfg['ocean.softRatio'] : cfg['ocean.ratio'];
    var a = Big.of(r.ocean[0]), h = Big.min(r.ocean[1], Big.mul(a,ratio)), c = Big.min(r.ocean[2],Big.mul(h,ratio));
    return [a,h,c];
  }
  function diversity(s, cfg) {
    var p = living(s,cfg);
    var stage=mutationMult(s,cfg,undefined,true);
    var common=Big.div(mutationMult(s,cfg,undefined,false),stage);
    return Big.mul(Big.pow(Big.mul(Big.mul(p[0],p[1]),p[2]),1/3),Big.mul(stage,Big.pow(common,1/3)));
  }
  function adjacent(a,b) { return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r)) === 1; }
  function pair(a,b) {
    return (a==='forest'&&b==='swamp')||(a==='swamp'&&b==='forest') ||
      (a==='steppe'&&b==='mountains')||(a==='mountains'&&b==='steppe') ||
      (a==='tundra'&&b==='mountains')||(a==='mountains'&&b==='tundra');
  }
  function neighborBonus(s,cfg,index) {
    var h = s.run.hexes[index], list = s.run.hexes;
    if (!h) return 1;
    for (var i=0;i<list.length;i++) if (list[i].owned && adjacent(h,list[i]) && pair(h.biome,list[i].biome)) return cfg['land.neighborMult'];
    return 1;
  }
  function landCount(s) { var count=0; for(var i=0;i<s.run.hexes.length;i++) if(s.run.hexes[i].owned) count++; return count; }
  function landIncome(s,cfg) {
    var out=Big.ZERO;
    for(var i=0;i<s.run.hexes.length;i++) {
      var h=s.run.hexes[i];
      if(h.owned) out=Big.add(out, Big.mul(h.output,neighborBonus(s,cfg,i)));
    }
    return out;
  }
  function income(s,cfg) {
    var r=s.run, st=r.stage, out=Big.ZERO, i;
    if(st===1||st===3||st===7) {
      var p=st===1?'broth.':st===3?'multi.':'civ.';
      for(i=0;i<r.producers.length;i++) {
        var each=Big.mul(cfg[p+'output'+i],r.producers[i]*milestone(r.producers[i],cfg,st===1));
        if(st===3) each=Big.mul(each,mutationMult(s,cfg,i,false));
        out=Big.add(out,each);
      }
      if(st===7) {
        var discoveries=0; for(i=0;i<r.discoveries.length;i++) if(r.discoveries[i]) discoveries++;
        out=Big.mul(out,Big.mul(Big.pow(cfg['civ.epochBonus'],r.epoch),Big.pow(cfg['civ.discoveryBonus'],discoveries)));
      }
    } else if(st===2) {
      var fraction=Big.max(0,Big.sub(1,Big.div(r.resource,capacity(s,cfg))));
      out=Big.mul(Big.mul(r.resource,fraction),cellRate(s,cfg));
    } else if(st===4) out=Big.mul(diversity(s,cfg),cfg['ocean.biomassFactor']);
    else if(st===5) out=landIncome(s,cfg);
    else if(st===6) out=Big.mul(r.people*r.roles[3]*cfg['tribe.knowledgeRate'],Big.add(1,Big.mul(r.tools,cfg['tribe.toolBonus'])));
    else if(st===8) out=Big.mul(r.worlds,cfg['space.worldIncome']);
    return Big.mul(out,stageMultiplier(s,cfg));
  }
  function cost(s,cfg,index) {
    var r=s.run, i=index===undefined?0:index;
    if(i<0||i%1!==0) return Big.of('1e300');
    if(r.stage===2) return i===0?Big.mul(cfg['cell.mitosisBase'],Big.pow(cfg['cell.mitosisGrowth'],r.levels.mitosis)):
      i===1?Big.mul(cfg['cell.environmentBase'],Big.pow(cfg['cell.environmentGrowth'],r.levels.capacity)):Big.of('1e300');
    var p=r.stage===1?'broth.':r.stage===3?'multi.':r.stage===4?'ocean.':r.stage===7?'civ.':null;
    if(!p||i>=r.producers.length) return Big.of('1e300');
    var price=Big.costGeom(cfg[p+'base'+i],cfg[p+(r.stage===7?'cityGrowth':'growth')],r.producers[i],1);
    if(r.stage===7)price=Big.mul(price,Big.pow(cfg['civ.epochGrowth'],r.epoch));
    if(r.stage===1&&constant(s)==='chemistry') price=Big.mul(price,cfg['constant.chemistryCost']);
    return price;
  }
  function buy(s,cfg,index) {
    var r=s.run,i=index===undefined?0:index;
    if(typeof i!=='number'||!isFinite(i)||i<0||i%1||[1,2,3,4,7].indexOf(r.stage)<0||i>=(r.stage===2?2:r.producers.length))return false;
    if(r.universeChoices.length||r.finished||!pay(s,cost(s,cfg,i))) return false;
    if(r.stage===2) { if(i===0)r.levels.mitosis++;else r.levels.capacity++; }
    else {
      r.producers[i]++;
      if(r.stage===4) {
        var added=Big.of(cfg['ocean.cohort']);
        r.ocean[i]=Big.str(Big.add(r.ocean[i],added));
        if(i>0&&!hasEffect(s,'shell'))r.ocean[i]=Big.str(Big.min(r.ocean[i],oceanLimit(s,cfg,i)));
      }
    }
    return true;
  }
  function goal(s,cfg) {
    if(s.run.stage===5)return Big.of(s.run.hexes.length);
    if(s.run.stage===7)return Big.of(cfg['civ.epochs']+(constant(s)==='ancient'?cfg['civ.extraEpochs']:0));
    return Big.of(cfg['stage'+s.run.stage+'.goal']);
  }
  function goalValue(s,cfg) {
    if(s.run.stage===4)return diversity(s,cfg);
    if(s.run.stage===5)return Big.of(landCount(s));
    if(s.run.stage===7)return Big.of(s.run.epoch);
    if(s.run.stage===8)return Big.of(s.run.worlds);
    return Big.of(s.run.resource);
  }
  function progress(s,cfg) { return clamp(num(Big.div(goalValue(s,cfg),goal(s,cfg))),0,1); }
  function canAdvance(s,cfg) { return !s.run.universeChoices.length&&!s.run.finished&&Big.gte(goalValue(s,cfg),goal(s,cfg)); }
  function makeHexes(s,cfg) {
    var out=[],radius=cfg['land.radius'],rng=rngOf(s),q,r;
    for(q=-radius;q<=radius;q++)for(r=Math.max(-radius,-q-radius);r<=Math.min(radius,-q+radius);r++)
      out.push({q:q,r:r,biome:rng.pick(C.world.biomes).id,owned:false,water:false,output:'0'});
    out.sort(function(a,b){return Math.max(Math.abs(a.q),Math.abs(a.r),Math.abs(a.q+a.r))-Math.max(Math.abs(b.q),Math.abs(b.r),Math.abs(b.q+b.r));});
    if(constant(s)==='compact')out=out.slice(0,cfg['land.compactCells']);
    if(constant(s)==='ocean') for(var i=out.length-1;i>=Math.max(0,out.length-cfg['land.waterCells']);i--)out[i].water=true;
    saveRng(s,rng); return out;
  }
  function enterStage(s,ctx,stage) {
    var cfg=ctx.config,r=s.run;
    r.stage=stage;r.stageAt=ctx.now;r.resource=cfg['stage'+stage+'.initial'];r.stageMult=1;r.buffs=[];r.event=null;
    r.nextEvent=ctx.now+cfg['event.minSec']*1000;r.autoAt=ctx.now+1000;r.producers=stage===3?[0,0,0,0,0]:stage===4?[0,0,0]:[0,0,0,0];
    r.levels={mitosis:0,capacity:0};r.nextGeneration=ctx.now+cfg['mutation.generationSec']*1000;
    r.discount=false;r.immunity=false;r.wheel=false;r.freeLand=0;
    if(stage===4)r.ocean=[cfg['ocean.initialA'],cfg['ocean.initialH'],cfg['ocean.initialC']];
    if(stage===5)r.hexes=makeHexes(s,cfg);
    if(stage===6){r.people=cfg['tribe.initialPeople'];r.food=cfg['tribe.initialFood'];r.tools='0';}
    if(stage===7){r.epoch=0;r.discoveries=[false,false,false,false];}
    if(stage===8){r.worlds=constant(s)==='ancient'?cfg['space.ancientWorlds']:cfg['space.initialWorlds'];r.colonies=[];}
    updateMax(s);recordFeats(s,cfg);return true;
  }
  function advance(s,ctx) {
    if(!canAdvance(s,ctx.config))return false;
    updateMax(s);
    if(s.run.stage===8){s.run.finished=true;s.meta.feats.finale=true;s.meta.atlas.push({kind:'finale',constant:s.run.constant,complexity:complexity(s),at:ctx.now});return true;}
    var legacy=1+ctx.config['legacy.factor']*Math.max(0,Big.log10(Big.max(s.run.resource,1)));
    enterStage(s,ctx,s.run.stage+1);s.run.legacy=legacy;return true;
  }
  function generationLeft(s,cfg) { return Math.max(0,(s.run.nextGeneration-(s.lastTick||s.run.stageAt))/1000); }
  function mutationChoices(s,cfg) {
    var count=law(s,'four-cards')||constant(s)==='radiation'?cfg['mutation.extendedChoices']:cfg['mutation.choices'];
    var pool=availableMutations(s).filter(function(m){return m.rarity==='common'||!s.run.mutations[m.id];}),out=[],rng=rngOf(s);
    while(out.length<count&&pool.length){
      var chosen=rng.weighted(pool,function(m){return cfg['mutation.'+m.rarity+'Weight']*(m.rarity==='rare'&&constant(s)==='chemistry'?cfg['constant.chemistryRare']:1);});
      out.push(chosen.id);pool.splice(pool.indexOf(chosen),1);
    }
    saveRng(s,rng);return out;
  }
  function queueMutation(s,cfg) {
    if(s.run.pendingMutations.length>=cfg['mutation.pendingMax'])return false;
    s.run.pendingMutations.push(mutationChoices(s,cfg));return true;
  }
  function chooseMutation(s,ctx,id) {
    var r=s.run,list=r.pendingMutations;
    if(!list.length||list[0].indexOf(id)<0||!find(availableMutations(s),id))return false;
    list.shift();r.mutations[id]=(r.mutations[id]||0)+1;s.meta.collection[id]=(s.meta.collection[id]||0)+1;s.meta.mutationCount++;
    var chosen=find(availableMutations(s),id);
    if(chosen.rarity!=='common')for(var pi=0;pi<list.length;pi++)if(list[pi].indexOf(id)>=0)list[pi]=mutationChoices(s,ctx.config);
    recordFeats(s,ctx.config);return true;
  }
  function autoMutation(s,ctx) {
    while(s.run.pendingMutations.length){
      var options=s.run.pendingMutations[0],best=options[0],rank=Infinity;
      for(var i=0;i<options.length;i++){
        var priority=s.meta.priority.indexOf(options[i]);
        var m=find(availableMutations(s),options[i]);
        if(!m)continue;
        var score=priority<0?1000+(m.rarity==='rare'?0:m.effect==='double-generation'?1:2):priority;
        if(score<rank){rank=score;best=options[i];}
      }
      if(!chooseMutation(s,ctx,best))break;
    }
  }
  function setPriority(s,ids) {
    if(!Array.isArray(ids))return false;
    var out=[];for(var i=0;i<ids.length;i++)if(find(availableMutations(s),ids[i])&&out.indexOf(ids[i])<0)out.push(ids[i]);
    s.meta.priority=out;return true;
  }
  function setMemory(s,id) { if(!s.meta.collection[id]||!law(s,'memory'))return false;s.meta.memory=id;return true; }
  function canColonize(s,cfg,index) {
    var list=s.run.hexes,h=list[index];
    if(s.run.stage!==5||!h||h.owned)return false;
    if(!landCount(s))return h.q===0&&h.r===0;
    for(var i=0;i<list.length;i++)if(list[i].owned&&adjacent(h,list[i]))return true;
    return false;
  }
  function colonizeCost(s,cfg,index) {
    if(s.run.freeLand)return Big.ZERO;
    var h=s.run.hexes[index];
    return Big.mul(Big.mul(cfg['land.costBase'],Big.pow(cfg['land.costGrowth'],landCount(s))),h&&h.water?cfg['land.waterCostMult']:1);
  }
  function colonize(s,cfg,index) {
    if(!canColonize(s,cfg,index)||!pay(s,colonizeCost(s,cfg,index)))return false;
    var h=s.run.hexes[index],order=landCount(s);
    h.owned=true;h.output=Big.str(Big.mul(cfg['land.baseYield']*(cfg['land.biome.'+h.biome]||1)*(h.water?cfg['land.waterYieldMult']:1),Big.pow(cfg['land.yieldGrowth'],order)));
    if(s.run.freeLand)s.run.freeLand--;recordFeats(s,cfg);return true;
  }
  function bestHex(s,cfg) {
    var best=-1,score=-1;
    for(var i=0;i<s.run.hexes.length;i++)if(canColonize(s,cfg,i)){
      var h=s.run.hexes[i],n=neighborBonus(s,cfg,i)*(cfg['land.biome.'+h.biome]||1);
      if(n>score){score=n;best=i;}
    }
    return best;
  }
  function setRoles(s,cfg,weights) {
    if(!Array.isArray(weights)||weights.length!==4)return false;
    var sum=0;for(var i=0;i<4;i++){if(typeof weights[i]!=='number'||!isFinite(weights[i])||weights[i]<0)return false;sum+=weights[i];}
    if(sum<=0||!isFinite(sum))return false;
    s.run.roles=weights.map(function(v){return v/sum;});return true;
  }
  function discoveryCost(s,cfg,index) {
    return Big.mul(Big.mul(cfg['civ.discoveryBase'],Big.pow(cfg['civ.epochGrowth'],s.run.epoch)),Big.pow(cfg['civ.discoveryGrowth'],index));
  }
  function discover(s,cfg,index) {
    var r=s.run;
    if(typeof index!=='number'||!isFinite(index)||r.stage!==7||r.epoch>=num(goal(s,cfg))||index<0||index>=cfg['civ.discoveries']||index%1||r.discoveries[index])return false;
    var price=Big.mul(discoveryCost(s,cfg,index),r.discount?cfg['event.wandererDiscount']:1);
    if(!pay(s,price))return false;r.discount=false;r.discoveries[index]=true;
    if(r.discoveries.every(function(v){return v;})){r.epoch++;r.discoveries=[false,false,false,false];}
    recordFeats(s,cfg);return true;
  }
  function launchCost(s,cfg,index) { return Big.mul(cfg['space.launchBase'],Big.pow(cfg['space.launchGrowth'],s.run.colonies.length)); }
  function launch(s,ctx,index) {
    var r=s.run,cfg=ctx.config,active=0;
    if(typeof index!=='number'||!isFinite(index)||r.stage!==8||index<0||index>=C.world.planets.length||index%1||r.finished)return false;
    for(var i=0;i<r.colonies.length;i++)if(!r.colonies[i].done)active++;
    if(active>=cfg['space.slots']||!pay(s,launchCost(s,cfg,index)))return false;
    var duration=Math.min(cfg['space.maxTimerSec'],cfg['space.timer'+index]*Math.pow(cfg['space.timeGrowth'],r.worlds));
    if(constant(s)==='light')duration*=cfg['constant.lightTime'];
    if(constant(s)==='slow')duration/=cfg['constant.slowAll'];
    r.colonies.push({id:C.world.planets[index].id,endsAt:ctx.now+duration*1000,done:false});return true;
  }
  function offlineFactor(s,cfg) {
    var result=Math.min(cfg['life.offlineMax'],cfg['life.offlineBase']+law(s,'offline')*cfg['life.offlineStep']);
    return result*(constant(s)==='cold'?cfg['constant.coldOffline']:1);
  }
  function buffMult(s,now,type) {
    var out=1;for(var i=0;i<s.run.buffs.length;i++){var b=s.run.buffs[i];if(b.until>now&&b.type===type)out*=b.mult;}return out;
  }
  function incomeAt(s,cfg,now) {
    return Big.mul(income(s,cfg),buffMult(s,now,'income')*(s.run.stage===6?buffMult(s,now,'knowledge'):1));
  }
  function addBuff(s,ctx,type,mult,sec) { s.run.buffs.push({type:type,mult:mult,until:ctx.now+sec*1000}); }
  function triggerEvent(s,ctx,id) {
    var decl=find(C.events,id);
    if(!decl||decl.stages.indexOf(s.run.stage)<0||s.run.event)return false;
    if(id==='tide'&&constant(s)==='moonless')return false;
    if(id==='plague'&&s.run.immunity)return false;
    s.run.event={id:id,choices:decl.choices};return true;
  }
  function resolveEvent(s,ctx,choice) {
    var r=s.run,cfg=ctx.config;
    if(!r.event)return false;
    var decl=find(C.events,r.event.id);
    if(!decl||!find(decl.choices,choice))return false;
    var id=r.event.id;r.event=null;
    if(id==='lightning')addBuff(s,ctx,'income',cfg['event.lightningMult'],cfg['event.lightningSec']);
    if(id==='volcano')addBuff(s,ctx,'income',cfg['event.volcanoMult'],cfg['event.volcanoSec']);
    if(id==='virus')queueMutation(s,cfg);
    if(id==='bloom')addBuff(s,ctx,'algae',cfg['event.bloomMult'],cfg['event.bloomSec']);
    if(id==='ice'){addBuff(s,ctx,'income',cfg['event.iceMult'],cfg['event.iceSec']);r.freeLand++;}
    if(id==='meteor'){if(choice==='survive')r.stageMult=Big.str(Big.max(r.stageMult,cfg['event.meteorMult']));else gain(s,Big.mul(income(s,cfg),cfg['event.dodgeSec']));}
    if(id==='migration'){var h=bestHex(s,cfg);if(h>=0){r.freeLand++;colonize(s,cfg,h);}}
    if(id==='drought'&&choice==='gatherers')addBuff(s,ctx,'gather',cfg['event.droughtMult'],cfg['event.droughtSec']);
    if(id==='wanderer')r.discount=true;
    if(id==='wheel')r.wheel=true;
    if(id==='comet')addBuff(s,ctx,'knowledge',cfg['event.cometMult'],cfg['event.cometSec']);
    if(id==='plague'){r.people*=1-(choice==='quarantine'?cfg['event.plagueLoss']:cfg['event.plagueUnhandledLoss']);r.immunity=choice==='quarantine';}
    if(id==='signal')for(var i=0;i<r.colonies.length;i++)if(!r.colonies[i].done)r.colonies[i].endsAt=Math.max(ctx.now,r.colonies[i].endsAt-cfg['event.signalSec']*1000);
    if(id==='tide')addBuff(s,ctx,'income',cfg['event.tideMult'],cfg['event.tideSec']);
    if(id==='fossil'){s.layers.universe.currency=Big.str(Big.add(s.layers.universe.currency,cfg['event.fossilSparks']));s.meta.atlas.push({kind:'fossil',stage:r.stage,at:ctx.now,constant:r.constant});}
    return true;
  }
  function events(s,ctx) {
    var r=s.run,cfg=ctx.config;
    if(ctx.offline||r.event||ctx.now<r.nextEvent)return;
    var rng=rngOf(s),pool=C.events.filter(function(e){return e.stages.indexOf(r.stage)>=0&&e.id!=='fossil'&&!(e.id==='tide'&&constant(s)==='moonless')&&!(e.id==='plague'&&r.immunity);});
    var chosen=rng.chance(cfg['event.fossilChance'])?'fossil':rng.weighted(pool,function(e){return e.id==='plague'?1+r.roles[1]*cfg['tribe.huntRisk']:1;}).id;
    r.nextEvent=ctx.now+rng.range(cfg['event.minSec'],cfg['event.maxSec'])*1000;saveRng(s,rng);triggerEvent(s,ctx,chosen);
  }
  function production(s,dt,ctx,start) {
    var r=s.run,cfg=ctx.config,eff=ctx.offline?offlineFactor(s,cfg):1;
    var mult=(ctx.mult||1)*eff*buffMult(s,start,'income');
    if(r.stage===2) {
      r.resource=Big.str(logistic(r.resource,capacity(s,cfg),cellRate(s,cfg)*num(stageMultiplier(s,cfg))*mult,dt));updateMax(s);
    } else if(r.stage===4) {
      var speed=cfg['ocean.reproduction']*num(Big.pow(stageMultiplier(s,cfg),0.25))*mult;
      for(var i=0;i<3;i++){
        var exp=speed*(1+r.producers[i]*cfg['ocean.breederBoost'])*(i===0?buffMult(s,start,'algae'):1)*dt;
        r.ocean[i]=Big.str(Big.mul(r.ocean[i],Big.pow10(exp/Math.LN10)));
        if(i>0&&!hasEffect(s,'shell'))r.ocean[i]=Big.str(Big.min(r.ocean[i],oceanLimit(s,cfg,i)));
      }
      gain(s,Big.mul(income(s,cfg),dt*mult));
    } else if(r.stage===6) {
      var toolMult=Big.add(1,Big.mul(r.tools,cfg['tribe.toolBonus']));
      var foodRate=r.people*(r.roles[0]*cfg['tribe.gatherRate']*buffMult(s,start,'gather')+r.roles[1]*cfg['tribe.gatherRate']*cfg['tribe.huntMult']);
      if(constant(s)==='suns')foodRate*=cfg['constant.sunsFood'];
      var madeFood=Big.mul(Big.mul(foodRate,toolMult),dt*mult);
      var need=r.people*cfg['tribe.foodNeed']*dt;
      r.food=Big.str(Big.max(0,Big.sub(Big.add(r.food,madeFood),need)));
      var births=Math.min(cfg['tribe.maxPeople']-r.people,r.people*cfg['tribe.birthRate']*dt*eff,num(Big.div(r.food,cfg['tribe.birthFood'])));
      r.people+=Math.max(0,births);r.food=Big.str(Big.max(0,Big.sub(r.food,Math.max(0,births)*cfg['tribe.birthFood'])));
      r.tools=Big.str(Big.add(r.tools,r.people*r.roles[2]*cfg['tribe.toolRate']*dt*mult*(r.wheel?cfg['event.wheelMult']:1)));
      gain(s,Big.mul(income(s,cfg),dt*mult*buffMult(s,start,'knowledge')));
    } else gain(s,Big.mul(income(s,cfg),dt*mult));
  }
  function automation(s,ctx) {
    var r=s.run,cfg=ctx.config;
    if(r.stage===1&&law(s,'auto-broth')){
      var age=Math.max(0,(ctx.now-r.stageAt)/1000);
      r.resource=Big.str(Big.max(r.resource,Big.mul(goal(s,cfg),Math.min(1,age/cfg['law.autoBrothSec']))));updateMax(s);
    }
    if(r.stage===2&&law(s,'auto-cell')&&Big.gt(r.resource,Big.mul(capacity(s,cfg),cfg['cell.autoAt']))){
      if(Big.lt(capacity(s,cfg),Big.mul(goal(s,cfg),cfg['cell.capacityGrowth'])))buy(s,cfg,1);
      if(Big.gt(r.resource,Big.mul(capacity(s,cfg),cfg['cell.autoAt'])))buy(s,cfg,0);
    }
    if(law(s,'auto-mutation'))autoMutation(s,ctx);
    if(r.stage===5&&law(s,'auto-land')){var h=bestHex(s,cfg);if(h>=0)colonize(s,cfg,h);}
  }
  function tick(s,dt,ctx) {
    if(!(dt>0)||s.run.universeChoices.length||s.run.finished)return;
    var r=s.run,cfg=ctx.config,start=ctx.now-dt*1000,end=ctx.now,at=start,stepMs=cfg['life.stepSec']*1000;
    if(ctx.offline&&r.stage===3&&r.nextGeneration<=start){
      var period=cfg['mutation.generationSec']*1000;
      r.nextGeneration+= (Math.floor((start-r.nextGeneration)/period)+1)*period;
    }
    if(r.stage===8)for(var ready=0;ready<r.colonies.length;ready++)if(!r.colonies[ready].done&&r.colonies[ready].endsAt<=start){r.colonies[ready].done=true;r.worlds++;}
    // Fixed absolute second boundaries keep 30-second offline chunks equivalent to small ticks.
    while(at<end-0.0001){
      var next=Math.min(end,(Math.floor(at/stepMs)+1)*stepMs);
      for(var bi=0;bi<r.buffs.length;bi++)if(r.buffs[bi].until>at&&r.buffs[bi].until<next)next=r.buffs[bi].until;
      if(r.stage===8)for(var deadline=0;deadline<r.colonies.length;deadline++)if(!r.colonies[deadline].done&&r.colonies[deadline].endsAt>at&&r.colonies[deadline].endsAt<next)next=r.colonies[deadline].endsAt;
      production(s,(next-at)/1000,ctx,at);
      at=next;
      var local={now:at,config:cfg,rng:ctx.rng,mult:ctx.mult,offline:ctx.offline};
      if(r.stage===3)while(r.nextGeneration<=at){
        r.generation++;queueMutation(s,cfg);
        if(hasEffect(s,'double-generation'))for(var extra=1;extra<cfg['mutation.doubleMult'];extra++)queueMutation(s,cfg);
        r.nextGeneration+=cfg['mutation.generationSec']*1000;
        if(law(s,'auto-mutation'))autoMutation(s,local);
      }
      if(r.stage===8)for(var ci=0;ci<r.colonies.length;ci++)if(!r.colonies[ci].done&&r.colonies[ci].endsAt<=at){r.colonies[ci].done=true;r.worlds++;}
      if(r.autoAt<=at){automation(s,local);r.autoAt=(Math.floor(at/1000)+1)*1000;}
      events(s,local);
    }
    r.buffs=r.buffs.filter(function(b){return b.until>end;});recordFeats(s,cfg);
  }
  function offline(s,sec,ctx) {
    var before=s.run.resource,worlds=s.run.worlds,start=ctx.now-sec*1000;
    var local={now:ctx.now,config:ctx.config,rng:ctx.rng,mult:ctx.mult,offline:true};
    // The engine's efficiency is 1; per-universe efficiency is applied to production, not deadlines.
    tick(s,sec,local);
    s.run.nextEvent=Math.max(s.run.nextEvent,ctx.now+ctx.config['event.minSec']*1000);
    var lines=['Ресурс: '+Fmt.num(before)+' → '+Fmt.num(s.run.resource)+'; цель '+Fmt.pct(progress(s,ctx.config))+'.'];
    if(s.run.pendingMutations.length)lines.push('Ждут выбора мутации: '+s.run.pendingMutations.length+'.');
    if(s.run.worlds>worlds)lines.push('Колонии завершены: '+(s.run.worlds-worlds)+'.');
    var card=chronicleFor(s,s.run.stage);
    if(card)lines.push(card.text);
    return {events:lines};
  }
  function builtinChronicle(item) {
    for(var i=0;i<C.chronicle.length;i++)if(C.chronicle[i].text===item.text)return true;
    return false;
  }
  // The newest model chronicle of the stage comes first; built-in cards are the fallback.
  function chronicleFor(s,stage) {
    var list=s.meta.chronicles||[];
    for(var i=list.length-1;i>=0;i--)if(list[i]&&list[i].stage===stage&&typeof list[i].text==='string'&&!builtinChronicle(list[i]))return list[i];
    var cards=C.chronicle.filter(function(c){return c.stage===stage;});
    return cards.length?cards[0]:null;
  }
  function complexity(s) { var sum=0;for(var i=0;i<s.run.maxima.length;i++)sum+=Math.max(0,Big.log10(Big.max(s.run.maxima[i],1)));return sum; }
  function prestigeGain(s,layer,cfg) {
    if(layer!=='universe'||s.run.stage<cfg['prestige.firstStage']||s.run.universeChoices.length)return Big.ZERO;
    var amount=Math.floor(Math.pow(complexity(s)/cfg['prestige.divisor'],cfg['prestige.power']));
    return Big.mul(amount,constant(s)==='slow'?cfg['constant.slowSparks']:1);
  }
  function bonus() { return Big.ONE; }
  function chooseUniverse(s,ctx,id) {
    if(s.run.universeChoices.indexOf(id)<0)return false;
    s.run.constant=id;s.run.universeChoices=[];s.run.stageAt=ctx.now;s.run.nextEvent=ctx.now+ctx.config['event.minSec']*1000;s.run.autoAt=ctx.now+1000;
    if(constant(s)==='chemistry')s.run.resource=Big.str(Big.mul(ctx.config['stage1.initial'],ctx.config['constant.chemistryCost']));
    return true;
  }
  function onPrestige(s,layer,before,ctx) {
    s.meta.universes++;
    s.meta.atlas.push({kind:'universe',constant:before.run.constant,stage:before.run.stage,complexity:complexity(before),at:ctx.now,finished:before.run.finished});
    var rng=rngOf(s),pool=availableConstants(s).slice(),count=law(s,'four-universes')?ctx.config['universe.extendedChoices']:ctx.config['universe.choices'];
    s.run.universeChoices=rng.shuffle(pool).slice(0,count).map(function(c){return c.id;});saveRng(s,rng);
    if(law(s,'memory')&&s.meta.memory&&s.meta.collection[s.meta.memory])s.run.mutations[s.meta.memory]=1;
    recordFeats(s,ctx.config);
  }
  function lawCost(s,cfg,id) {
    if(/^stage[1-8]$/.test(id)||id==='offline')return Big.mul(cfg['law.baseCost'],Big.pow(cfg['law.growth'],law(s,id)));
    return Big.of(cfg[id==='memory'?'law.memoryCost':id==='four-cards'?'law.fourCardsCost':id==='four-universes'?'law.fourUniversesCost':'law.automationCost']);
  }
  function buyLaw(s,cfg,id) {
    var decl=find(C.laws,id);
    if(!decl||(!decl.repeatable&&law(s,id))||(id==='offline'&&law(s,id)>=cfg['law.maxOffline']))return false;
    var price=lawCost(s,cfg,id),layer=s.layers.universe;
    if(!layer||Big.lt(layer.currency,price))return false;
    layer.currency=Big.str(Big.sub(layer.currency,price));s.meta.laws[id]=law(s,id)+1;return true;
  }
  function capBonusHours(s) { return constant(s)==='cold'?s.run.coldCapHours:0; }
  function leap(s,ctx) {
    if(s.run.universeChoices.length||s.run.finished)return false;
    if(s.run.stage===3){s.run.generation++;queueMutation(s,ctx.config);if(hasEffect(s,'double-generation'))for(var extra=1;extra<ctx.config['mutation.doubleMult'];extra++)queueMutation(s,ctx.config);if(law(s,'auto-mutation'))autoMutation(s,ctx);}
    else gain(s,Big.mul(incomeAt(s,ctx.config,ctx.now),ctx.config['link.leapSec']*(ctx.mult||1)));
    return true;
  }
  function chest(s,rng,cfg) {
    var amount=Big.mul(incomeAt(s,cfg,s.lastTick||s.run.stageAt),cfg['link.chestSec']);gain(s,amount);queueMutation(s,cfg);
    return {title:'Капсула времени',items:[{title:'Доход этапа',amount:amount},{title:'Мутация ждёт выбора',amount:1}]};
  }
  function recordFeats(s,cfg) {
    var r=s.run,f=s.meta.feats;
    if(r.stage>=2)f['first-cell']=true;if(Big.gte(r.maxima[1],cfg['stage2.goal']))f['billion-cells']=true;
    if(s.meta.mutationCount>=cfg['achievement.mutations'])f['hundred-mutations']=true;
    if(r.hexes.length&&landCount(s)===r.hexes.length)f['all-land']=true;
    if(r.stage>=6)f['first-fire']=true;if(r.stage===7&&r.epoch>=3||r.stage===8)f.steam=true;
    if(r.worlds>0)f['first-world']=true;if(r.finished)f.finale=true;
    if(s.meta.universes>=cfg['achievement.universes'])f['ten-universes']=true;
  }
  function achievementIds(s,cfg) { return Object.keys(s.meta.feats).filter(function(id){return s.meta.feats[id];}); }
  function summary(s,cfg) { return {line:C.world.stages[s.run.stage-1].title+' · '+Fmt.pct(progress(s,cfg))+' · сложность '+complexity(s).toFixed(1)}; }
  function next(s,now,cfg) {
    var out=[];
    if(s.run.universeChoices.length||s.run.finished)return out;
    if(!law(s,'auto-mutation')&&(s.run.pendingMutations.length||s.run.stage===3))out.push({id:'mutation',at:s.run.pendingMutations.length?now+1000:Math.max(now+1000,s.run.nextGeneration),text:'Ждёт выбор мутации'});
    if(canAdvance(s,cfg))out.push({id:'stage-ready',at:now+1000,text:'Цель этапа достигнута'});
    for(var i=0;i<s.run.colonies.length;i++)if(!s.run.colonies[i].done)out.push({id:'colony',at:Math.max(now+1000,s.run.colonies[i].endsAt),text:'Новая колония готова'});
    return out;
  }
  function validate(s) {
    var r=s.run;
    if(!r||r.stage<1||r.stage>8||r.stage%1)return 'Неверный этап';
    if(!Big.valid(r.resource)||Big.sign(r.resource)<0)return 'Неверный ресурс';
    if(!Array.isArray(r.maxima)||r.maxima.length!==8)return 'Неверные рекорды этапов';
    if(!Array.isArray(r.pendingMutations)||r.pendingMutations.length>4)return 'Неверная очередь мутаций';
    for(var mi=0;mi<r.pendingMutations.length;mi++){
      var offer=r.pendingMutations[mi];
      if(!Array.isArray(offer)||!offer.length)return 'Пустое предложение мутации';
      for(var oi=0;oi<offer.length;oi++)if(!find(availableMutations(s),offer[oi])||offer.indexOf(offer[oi])!==oi)return 'Неверное предложение мутации';
    }
    for(var mx=0;mx<r.maxima.length;mx++)if(!Big.valid(r.maxima[mx])||Big.sign(r.maxima[mx])<0)return 'Неверный рекорд ресурса';
    for(var pop=0;pop<r.ocean.length;pop++)if(!Big.valid(r.ocean[pop])||Big.sign(r.ocean[pop])<0)return 'Неверная популяция';
    if(!isFinite(r.people)||r.people<0||!isFinite(r.worlds)||r.worlds<0||r.worlds%1)return 'Неверная численность';
    if(!Array.isArray(r.roles)||r.roles.length!==4||Math.abs(r.roles.reduce(function(a,b){return a+b;},0)-1)>0.00001)return 'Неверные роли';
    for(var i=0;i<r.producers.length;i++)if(r.producers[i]<0||r.producers[i]%1)return 'Неверное число производителей';
    return null;
  }
  function validateStock(kind,item) {
    if(!item||typeof item!=='object')return 'Нужен объект';
    var text=JSON.stringify(item);
    if(/https?:|<|>|[\uD800-\uDBFF]/.test(text))return 'Недопустимый текст';
    if(kind==='chronicle')return typeof item.text==='string'&&item.stage>=1&&item.stage<=8&&item.stage%1===0?null:'Неверная летопись';
    if(typeof item.title!=='string'||typeof item.text!=='string')return 'Нет названия или текста';
    if(kind==='descriptions')return find(item.kind==='event'?C.events:C.mutations,item.id)?null:'Неизвестное описание';
    if(!/^[a-z][a-z0-9-]{1,40}$/.test(item.id||'')||item.id==='constructor'||item.id==='prototype')return 'Неверный идентификатор';
    if(kind==='constants')return find(C.constants,item.template)?null:'Неизвестный шаблон постоянной';
    if(kind==='mutations'){
      if(item.rarity==='common'&&item.effect==='producer'&&item.producer>=0&&item.producer<5&&item.producer%1===0)return null;
      if(item.rarity==='rare'&&item.effect==='stage')return null;
      if(item.rarity==='special'&&(item.effect==='shell'||item.effect==='double-generation'))return null;
      return 'Неизвестный эффект мутации';
    }
    return 'Неизвестный вид контента';
  }
  function registerStock(s,kind,item) {
    if(validateStock(kind,item))return false;
    if(kind==='chronicle')s.meta.chronicles.push(item);
    if(kind==='descriptions')s.meta.descriptions[item.id]=item;
    if(kind==='mutations'){if(find(availableMutations(s),item.id))return false;s.meta.extraMutations.push(item);}
    if(kind==='constants'){if(find(availableConstants(s),item.id))return false;s.meta.extraConstants.push(item);}
    return true;
  }
  function procedural(kind,rng) {
    if(kind==='chronicle')return rng.pick(C.chronicle);
    if(kind==='descriptions'){var m=rng.pick(C.mutations);return {id:m.id,title:m.title,text:m.text,kind:'mutation'};}
    if(kind==='mutations')return rng.pick(C.mutations);
    if(kind==='constants'){var c=rng.pick(C.constants);return {id:c.id,title:c.title,text:c.text,plus:c.plus,minus:c.minus,template:c.id};}
    return null;
  }
  function botPlay(s,ctx) {
    var cfg=ctx.config,r=s.run,bought=0,i;
    if(r.universeChoices.length)chooseUniverse(s,ctx,r.universeChoices[0]);
    if(r.event){var ev=find(C.events,r.event.id);resolveEvent(s,ctx,ev.choices[0].id);}
    autoMutation(s,ctx);
    if(r.stage===1||r.stage===3||r.stage===7){
      var horizon=r.stage===3?cfg['bot.multiRoiSec']:cfg['bot.roiSec'];
      for(var attempt=0;attempt<20;attempt++){
        var rate=income(s,cfg),best=-1,ratio=Big.of('1e300');
        for(i=0;i<r.producers.length;i++){
          var price=cost(s,cfg,i);r.producers[i]++;var added=Big.sub(income(s,cfg),rate);r.producers[i]--;
          var roi=Big.div(price,Big.max(added,'1e-30'));
          if(Big.lt(roi,ratio)){ratio=roi;best=i;}
        }
        if(best<0||Big.gt(ratio,horizon)||!buy(s,cfg,best))break;bought++;
      }
    } else if(r.stage===2){
      if(r.levels.mitosis<cfg['bot.cellMitosisMax']&&Big.gt(r.resource,Big.mul(cost(s,cfg,0),2))&&buy(s,cfg,0))bought++;
      if(Big.lt(capacity(s,cfg),Big.mul(goal(s,cfg),cfg['cell.capacityGrowth']))&&Big.gt(r.resource,Big.mul(capacity(s,cfg),cfg['bot.cellAt']))&&buy(s,cfg,1))bought++;
    } else if(r.stage===4){
      for(i=0;i<3;i++)if(Big.lt(cost(s,cfg,i),Big.mul(income(s,cfg),cfg['bot.oceanRoiSec']))&&buy(s,cfg,i))bought++;
    } else if(r.stage===5){var h=bestHex(s,cfg);if(h>=0&&colonize(s,cfg,h))bought++;}
    if(r.stage===7)for(i=0;i<cfg['civ.discoveries'];i++)if(discover(s,cfg,i))bought++;
    if(r.stage===8&&launch(s,ctx,0))bought++;
    return bought;
  }
  return {
    use:use,data:data,init:init,tick:tick,offline:offline,income:income,incomeAt:incomeAt,cost:cost,buy:buy,capacity:capacity,logistic:logistic,
    diversity:diversity,oceanLimit:oceanLimit,goal:goal,goalValue:goalValue,progress:progress,canAdvance:canAdvance,advance:advance,enterStage:enterStage,
    chooseMutation:chooseMutation,setPriority:setPriority,setMemory:setMemory,availableMutations:availableMutations,availableConstants:availableConstants,
    colonize:colonize,colonizeCost:colonizeCost,canColonize:canColonize,neighborBonus:neighborBonus,landCount:landCount,bestHex:bestHex,
    setRoles:setRoles,discover:discover,discoveryCost:discoveryCost,launch:launch,launchCost:launchCost,generationLeft:generationLeft,
    triggerEvent:triggerEvent,resolveEvent:resolveEvent,prestigeGain:prestigeGain,bonus:bonus,onPrestige:onPrestige,chooseUniverse:chooseUniverse,
    lawCost:lawCost,buyLaw:buyLaw,capBonusHours:capBonusHours,leap:leap,chest:chest,complexity:complexity,achievementIds:achievementIds,
    summary:summary,next:next,validate:validate,migrate:function(s){return s;},validateStock:validateStock,registerStock:registerStock,chronicleFor:chronicleFor,
    procedural:procedural,botPlay:botPlay,offlineFactor:offlineFactor,stageMultiplier:stageMultiplier,LAYER:'universe'
  };
});
