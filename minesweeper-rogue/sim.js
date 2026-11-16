// Shared deterministic rules. Nothing advances while the player is away.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var data = node ? { finds: require('./content/finds.json'), bosses: require('./content/bosses.json'), layers: require('./content/layers.json'), sappers: require('./content/sappers.json'), workshop: require('./content/workshop.json'), depths: require('./content/depths.json') } : {};
  var api = node ? make(require('../engine/big.js'), require('../engine/rng.js'), require('./logic/board.js'), data, require('./config.json')) : make(root.Big, root.Rng, root.MineBoard, data, {});
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Rng, Board, DATA, DEFAULTS) {
  'use strict';
  var LAST_CFG = {};
  var VERIFIED = {};
  var FIND_IDS = ['probe','xray','shovel','lantern','compass','flare','patch','sand','brake','seismo','boots','oak','sense','apprentice','neat','vein','nose','stride','belt','pendulum','heavy','double-sight','quiet-shop','candle','old-map','spare','greedy-pick','light-hand','shard','counter'];
  var BOSS_IDS = ['inverse','swarm','double','fog'];
  var WORK_IDS = ['heart','supplies','pouch','choice','discount','luck'];
  var BRICKS = ['inverse','swarm','double','fog','hearts','flags','movement','visibility'];
  function configure(data, cfg) { DATA = data || DATA; if (cfg) LAST_CFG = cfg; }
  function content() { return DATA; }
  function c(cfg, key) {
    if (cfg && cfg[key] !== undefined) return cfg[key];
    if (LAST_CFG[key] !== undefined) return LAST_CFG[key];
    return DEFAULTS[key] ? DEFAULTS[key].value : 0;
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function integer(value,min,max) {return typeof value==='number' && isFinite(value) && value%1===0 && value>=min && (max===undefined || value<=max);}
  function multiplier(value,fallback) {return typeof value==='number' && isFinite(value) && value>=1 ? value:(typeof fallback==='number' && isFinite(fallback) && fallback>=1 ? fallback:1);}
  function item(id) { var list = DATA.finds || []; for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function has(s, id) { return s.run.talismans.indexOf(id) >= 0; }
  function level(s, id) { return s.meta.workshop[id] || 0; }
  function charAt(text, i, value) { return text.slice(0, i) + value + text.slice(i + 1); }
  function rngFor(s) { return Rng.make(s.run.rng); }
  function randomInt(s, n) { var rng = rngFor(s); var v = rng.int(n); s.run.rng = rng.state(); return v; }
  function takeRandom(s, list) { return list.length ? list[randomInt(s, list.length)] : null; }
  function options(cfg) { return { enumLimit:c(cfg,'enumLimit'), repairTries:c(cfg,'repairTries'), nodeLimit:c(cfg,'genNodeLimit'), budget:c(cfg,'genWorkBudget'), restartAfter:c(cfg,'genRestartAfter') }; }
  function freshRun() {
    return { status:'ready',mode:'rogue',sapper:'sapper',depth:0,seed:0,rng:0,fieldIndex:0,completed:0,hearts:0,maxHearts:0,gold:0,tools:{},talismans:[],choices:[],shop:[],field:null,message:'',reward:'0e0',settled:false,noLossFields:0,heartsLost:0,rockLoss:0,toolsUsed:0,bosses:[],pregen:[],inputMode:'open',spareUsed:false,stepProbe:false,daily:null,extraFinds:[],customRule:null,lastMult:1,actions:0,lastEvent:'',pendingFind:'' };
  }
  function init(ctx) {
    if (ctx && ctx.config) LAST_CFG = ctx.config;
    return { run:freshRun(),layers:{ depth:{currency:'0e0',count:0,state:{}} },meta:{ore:'0e0',workshop:{},unlocked:{sapper:true},album:{},depthUnlocked:0,nextProbe:false,dailyBest:{},stats:{runs:0,wins:0,cells:0,mines:0,fields:0,generated:0,hints:0,runtimeHints:0,runtimeHintFields:0,bestDeep:0},earnedOre:'0e0',records:{}} };
  }
  function ensure(s) {
    if (!s.meta.workshop) s.meta.workshop = {};
    if (!s.meta.unlocked) s.meta.unlocked = {sapper:true};
    if (!s.meta.album) s.meta.album = {};
    if (!s.meta.stats) s.meta.stats = {};
    if (s.meta.stats.generated === undefined) s.meta.stats.generated = (s.meta.stats.fields || 0) + (s.run && s.run.field && s.run.field.generated && s.run.completed<=s.run.fieldIndex ? 1:0);
    if (s.meta.stats.runtimeHints === undefined) s.meta.stats.runtimeHints = 0;
    if (s.meta.stats.runtimeHintFields === undefined) s.meta.stats.runtimeHintFields = 0;
    if (!s.meta.dailyBest) s.meta.dailyBest = {};
    if (!s.meta.records) s.meta.records = {};
    if (s.meta.ore === undefined) s.meta.ore = '0e0';
    if (s.meta.earnedOre === undefined) s.meta.earnedOre = '0e0';
    if (s.meta.depthUnlocked === undefined) s.meta.depthUnlocked = 0;
  }
  function addFind(s, id, cfg, suppliedCharges) {
    var f = item(id); if (!f) return false; s.meta.album[id] = true;
    if (f.kind === 'tool') {
      var charges = suppliedCharges === undefined ? c(cfg,'tool.'+id+'.charges') : suppliedCharges;
      if (has(s,'belt') && suppliedCharges === undefined) charges += c(cfg,'talisman.belt.charges');
      s.run.tools[id] = (s.run.tools[id] || 0) + charges;
    } else if (!has(s,id)) { s.run.talismans.push(id); if (id === 'boots') s.run.maxHearts += c(cfg,'talisman.boots.hearts'); }
    return true;
  }
  function addGold(s, amount) { s.run.gold += Math.max(0,amount); }
  function applyStepProbe(s, cfg) { ensure(s); s.meta.nextProbe = true; return true; }
  function startRun(s, cfg, opts, ctx) {
    ensure(s); LAST_CFG = cfg || LAST_CFG; opts = opts || {};
    if (['playing','choice','shop'].indexOf(s.run.status) >= 0) return false;
    var mode = opts.mode || 'rogue'; var sapper = opts.sapper || 'sapper';
    if (['rogue','pure','deep','daily'].indexOf(mode) < 0 || !s.meta.unlocked[sapper]) return false;
    var depth = Math.floor(opts.depth === undefined ? s.meta.depthUnlocked : opts.depth);
    if (!integer(depth,0,Math.min(s.meta.depthUnlocked,c(cfg,'depth.max')))) return false;
    var r = freshRun(); r.mode = mode; r.sapper = sapper; r.depth = mode === 'daily' ? 0 : depth;
    r.seed = opts.seed === undefined ? (ctx && ctx.rng ? ctx.rng.int(0,4294967295) : Rng.hash(String(s.meta.seed || 0)+':'+(s.meta.stats.runs || 0))) : opts.seed >>> 0;
    if (mode === 'daily') {
      var builtInDay = dailyFor(ctx && ctx.now ? ctx.now : 0);
      var daily = opts.daily || (s.meta.daily && s.meta.dailyDay===Math.floor((ctx && ctx.now ? ctx.now:0)/86400000) ? s.meta.daily : builtInDay);
      if (validateStock('daily',daily)) return false;
      r.daily = clone(daily); r.seed = daily.seed >>> 0;
    }
    r.rng = Rng.hash(r.seed+':loot');
    r.maxHearts = (sapper === 'tidy' ? c(cfg,'sapper.tidy.hearts') : c(cfg,'start.hearts')) + level(s,'heart');
    if (sapper === 'geolog') r.maxHearts -= c(cfg,'sapper.geolog.penalty');
    if (r.depth >= 5) r.maxHearts--;
    r.maxHearts = Math.max(1,r.maxHearts); r.hearts = r.maxHearts;
    r.gold = level(s,'pouch') * c(cfg,'workshop.pouch.gold'); r.status = 'playing'; s.run = r;
    s.meta.stats.runs = (s.meta.stats.runs || 0) + 1;
    if (mode !== 'pure') {
      var supplies = level(s,'supplies');
      if (supplies) addFind(s,'probe',cfg,Math.min(supplies,c(cfg,'tool.probe.charges')));
      if (supplies >= c(cfg,'workshop.supplies.max')) addFind(s,'lantern',cfg);
      if (sapper === 'geolog') addFind(s,'lantern',cfg,c(cfg,'sapper.geolog.lantern'));
      if (s.meta.nextProbe) { addFind(s,'probe',cfg,c(cfg,'steps.probe.charges')); s.meta.nextProbe = false; r.stepProbe = true; }
    }
    r.bosses = [BOSS_IDS[randomInt(s,BOSS_IDS.length)]];
    if (r.depth >= 4) { var remaining = BOSS_IDS.filter(function (id) { return id !== r.bosses[0]; }); r.bosses.push(takeRandom(s,remaining)); }
    if (r.daily) r.bosses = [r.daily.rule];
    if (s.meta.nextRule && mode === 'rogue') { r.customRule = clone(s.meta.nextRule); delete s.meta.nextRule; }
    setupField(s,cfg); return true;
  }
  function fieldSpec(s,cfg,index) {
    var r = s.run; var n = index === undefined ? r.fieldIndex : index; var base = Math.min(n,c(cfg,'run.fields')-1);
    var spec = {w:c(cfg,'field.'+base+'.w'),h:c(cfg,'field.'+base+'.h'),mines:c(cfg,'field.'+base+'.mines'),doubles:0,roamers:0,clocks:0,deaf:0,holes:0,caches:0,fakes:0,findShare:c(cfg,'cache.findShare'),inverse:false,fog:false,fogRadius:c(cfg,'boss.fogRadius'),minOpen:has(s,'stride') ? c(cfg,'talisman.stride.open') : 0,shard:has(s,'shard')};
    if (r.mode === 'pure') {
      spec.w = Math.min(c(cfg,'maxCols'),c(cfg,'field.0.w')+Math.floor(n/c(cfg,'layer.fields')));
      spec.h = Math.min(c(cfg,'field.5.h'),c(cfg,'field.0.h')+n*c(cfg,'pure.heightStep'));
      spec.mines = Math.floor(spec.w*spec.h*Math.min(c(cfg,'pure.maxDensity'),c(cfg,'field.0.mines')/(c(cfg,'field.0.w')*c(cfg,'field.0.h'))+n*c(cfg,'pure.densityStep')));
      spec.shard = false; spec.minOpen = 0; return reserveSafeStart(spec);
    }
    if ((r.mode === 'deep' && n >= c(cfg,'run.fields')-1) || n >= c(cfg,'run.fields')) {
      spec.w = c(cfg,'maxCols'); spec.h = c(cfg,'field.5.h');
      var beyondRock=Math.max(0,n-(c(cfg,'run.fields')-1));
      spec.mines = Math.floor(spec.w*spec.h*Math.min(c(cfg,'deep.maxDensity'),c(cfg,'field.5.mines')/(spec.w*spec.h)+beyondRock*c(cfg,'deep.densityStep')));
    }
    var mineMult = 1+(r.depth>=1 ? c(cfg,'depth.mineBonus'):0)+(r.depth>=10 ? c(cfg,'depth.mineBonus'):0)+(r.depth>=12 ? c(cfg,'depth.mineBonus'):0);
    spec.mines = Math.round(spec.mines*mineMult);
    if(n>=2 || r.depth>=9) spec.doubles = Math.max(1,Math.floor(spec.mines*c(cfg,'double.share')));
    if(n>=2) spec.deaf = c(cfg,'deaf.count')*(r.depth>=12 ? c(cfg,'depth.deafMult'):1);
    if(n>=4 || (r.depth>=3 && n>=2)) spec.roamers = c(cfg,'roam.count');
    if(n>=4 || (r.depth>=7 && n>=2)) spec.clocks = c(cfg,'clock.count');
    if(n>=4) spec.holes = c(cfg,'hole.count');
    var expectedCaches=c(cfg,'cache.count')*(1+level(s,'luck')*c(cfg,'workshop.luck.amount'))*(r.depth>=2 ? c(cfg,'depth.cacheFactor'):1);
    var wholeCaches=Math.floor(expectedCaches);
    var cacheRoll=Rng.hash('caches:'+r.seed+':'+n)/4294967296;
    spec.caches = Math.max(0,wholeCaches+(cacheRoll<expectedCaches-wholeCaches ? 1:0));
    spec.fakes = c(cfg,'cache.fakeCount');
    if((n===c(cfg,'run.fields')-1 && r.mode!=='deep') || r.mode==='daily') {
      for(var i=0;i<r.bosses.length;i++) applyBrick(spec,{brick:r.bosses[i]},cfg);
      if(r.customRule) for(var j=0;j<r.customRule.bricks.length;j++) applyBrick(spec,r.customRule.bricks[j],cfg);
    }
    if(r.mode==='deep' && n>=6) spec.safeReserve=c(cfg,'deep.safeCells');
    return reserveSafeStart(spec);
  }
  function reserveSafeStart(spec) {
    spec.mines=Math.max(0,Math.min(spec.mines,spec.w*spec.h-(spec.holes||0)-Math.max(9,spec.minOpen||0,spec.safeReserve||0)));
    spec.doubles=Math.min(spec.doubles,spec.mines);return spec;
  }
  function setupField(s,cfg) {
    var spec = fieldSpec(s,cfg);
    s.run.field = {w:spec.w,h:spec.h,generated:false,m:'',t:'',vis:'',known:{},earthHints:{},runtimeHints:0,clocks:{},last:-1,mines:spec.mines,doubles:spec.doubles,inverse:spec.inverse,fog:spec.fog,openings:0,loss:0,shieldUsed:false,senseUsed:false,frozen:false,stopped:false,rowCounts:[],readings:[],flash:[],rewards:{},correctFlags:{},hints:0};
    if(s.run.customRule && s.run.fieldIndex===c(cfg,'run.fields')-1) for(var bi=0;bi<s.run.customRule.bricks.length;bi++) {var brick=s.run.customRule.bricks[bi];if(brick.brick==='hearts') {s.run.maxHearts+=brick.value||1;s.run.hearts=Math.min(s.run.maxHearts,s.run.hearts+(brick.value||1));}}
    s.run.status='playing'; s.run.choices=[]; s.run.shop=[]; s.run.message=''; s.run.lastEvent='field';
  }
  function requestFor(s,cfg,index) {
    var spec=fieldSpec(s,cfg,index); var seed=Rng.hash(s.run.seed+':field:'+index);var opts=options(cfg);
    return {key:index+':'+seed+':'+Rng.hash(JSON.stringify({spec:spec,options:opts})),spec:spec,seed:seed,options:opts};
  }
  function prepareRequests(s,cfg) {
    if(['ready','won','lost'].indexOf(s.run.status)>=0) return [];
    var out=[]; var from=s.run.fieldIndex+(s.run.field && s.run.field.generated ? 1:0); var max=s.run.fieldIndex+c(cfg,'pregen');
    for(var i=from;i<=max;i++) {
      if(s.run.mode!=='pure' && s.run.mode!=='deep' && i>=c(cfg,'run.fields')) break;
      out.push(requestFor(s,cfg,i));
    }
    return out;
  }
  function acceptPrepared(s,entries,cfg) {
    var requests=prepareRequests(s,cfg); var valid={};
    for(var j=0;j<requests.length;j++) valid[requests[j].key]=requests[j];
    var kept=[];
    for(var q=0;q<s.run.pregen.length;q++) if(valid[s.run.pregen[q].key]) kept.push(s.run.pregen[q]);
    for(var i=0;i<entries.length;i++) {
      var e=entries[i]; var request=valid[e.key];
      if(!request || !e.field || e.start!==e.field.start || e.field.w!==request.spec.w || e.field.h!==request.spec.h || !e.field.ok) continue;
      var existing=-1;
      for(var k=0;k<kept.length;k++) if(kept[k].key===e.key && kept[k].start===e.start) existing=k;
      var saved={key:e.key,start:e.start,field:clone(e.field)};
      if(existing>=0) kept[existing]=saved; else kept.push(saved);
    }
    s.run.pregen=kept; return true;
  }
  function generateField(s,index,cfg) {
    var request=requestFor(s,cfg,s.run.fieldIndex); var made=null;
    for(var i=0;i<s.run.pregen.length;i++) { var saved=s.run.pregen[i]; if(saved.key===request.key && saved.start===index) { made=clone(saved.field); break; } }
    if(!made) made=Board.generate(request.spec,request.seed,index,request.options);
    var f=s.run.field;
    f.m=made.m; f.t=made.t; f.mines=made.mines; f.doubles=made.doubles;
    f.vis=''; for(var j=0;j<f.w*f.h;j++) f.vis+='-';
    f.generated=true; f.last=index; f.hints=made.hints||0;
    f.generation={repairs:made.repairs,tries:made.tries,hints:made.hints,work:made.work};
    s.meta.stats.generated=(s.meta.stats.generated===undefined ? (s.meta.stats.fields||0):s.meta.stats.generated)+1;
    s.meta.stats.hints=(s.meta.stats.hints||0)+(made.hints ? 1:0);
    for(var h=0;h<f.t.length;h++) {
      if(f.t.charAt(h)==='e') f.known[h]=1;
      if(f.m.charAt(h)==='h' && s.run.sapper==='cartographer') f.vis=charAt(f.vis,h,'H');
    }
    var B=model(s,cfg);
    for(var z=0;z<f.t.length;z++) if(f.t.charAt(z)==='o') openSafe(s,B,z,cfg);
    s.run.pregen=s.run.pregen.filter(function(p){return p.key!==request.key;}); return B;
  }
  function model(s,cfg) {
    var f=s.run.field; var terrain=f.t;
    if(has(s,'candle')) {
      var around=Board.around(f.w,f.h);
      for(var i=0;i<terrain.length;i++) if(terrain.charAt(i)==='d') {
        var near=around[i];
        for(var j=0;j<near.length;j++) if(isFlag(f.vis.charAt(near[j]))) {terrain=charAt(terrain,i,'.'); break;}
      }
    }
    return Board.model(f.w,f.h,f.m,terrain,{inverse:f.inverse,fog:f.fog,last:f.last,fogRadius:c(cfg,'boss.fogRadius'),mines:f.mines,doubles:f.doubles});
  }
  function isFlag(ch) {return ch==='f'||ch==='F';}
  function facts(s,B) {return Board.knowledge(B,s.run.field.vis,s.run.field.known);}
  function openSafe(s,B,index,cfg) {
    var f=s.run.field; var K=facts(s,B);
    // Floods respect even a mistaken player flag.
    for(var p=0;p<B.n;p++) if(isFlag(f.vis.charAt(p))) K.open[p]=3;
    Board.reveal(B,K,index); var count=0;
    for(var i=0;i<B.n;i++) {
      if(K.open[i]===1 && f.vis.charAt(i)!=='o') {
        f.vis=charAt(f.vis,i,'o'); count++; var t=f.t.charAt(i);
        if(!f.rewards[i] && ['g','i','z'].indexOf(t)>=0) {
          f.rewards[i]=true;
          if(t==='g') addGold(s,c(cfg,'cache.gold')*(has(s,'vein') ? c(cfg,'talisman.vein.mult'):1));
          if(t==='i') { var choices=offers(s,cfg,1); if(choices.length) {addFind(s,choices[0],cfg);s.run.pendingFind=choices[0];s.run.message='Находка в тайнике: '+item(choices[0]).title;} }
        }
      } else if(K.open[i]===2) f.vis=charAt(f.vis,i,'H');
    }
    s.meta.stats.cells=(s.meta.stats.cells||0)+count; return count;
  }
  function flagWeight(s,B,i) {
    if(s.run.field.vis.charAt(i)==='F') return 2;
    if(has(s,'double-sight') && B.m[i]==='2') for(var j=0;j<B.nb[i].length;j++) if(s.run.field.vis.charAt(B.nb[i][j])==='o') return 2;
    return 1;
  }
  function setFlag(s,B,index,cfg,knownWeight) {
    var f=s.run.field;
    if(['o','H','x'].indexOf(f.vis.charAt(index))>=0) return false;
    var weight=knownWeight||flagWeight(s,B,index); f.vis=charAt(f.vis,index,weight===2 ? 'F':'f');
    if(has(s,'neat') && Board.mined(B.m[index]) && !f.correctFlags[index]) {
      f.correctFlags[index]=true; addGold(s,c(cfg,'talisman.neat.gold')*(has(s,'double-sight') ? weight:1));
    }
    return true;
  }
  function flag(s,index,cfg) {
    var f=s.run.field;
    if(s.run.status!=='playing' || !f || !f.generated || !integer(index,0,f.w*f.h-1)) return false;
    if(f.vis.charAt(index)==='f' && f.doubles>0) f.vis=charAt(f.vis,index,'F');
    else if(isFlag(f.vis.charAt(index))) f.vis=charAt(f.vis,index,'-'); else if(!setFlag(s,model(s,cfg),index,cfg)) return false;
    autoFlags(s,cfg); armClocks(s,cfg); if(has(s,'candle')) earthFallback(s,cfg);
    s.run.actions++; s.run.lastEvent='flag'; return true;
  }
  function hit(s,B,index,cfg,explosion) {
    var r=s.run; var f=r.field;
    if(f.vis.charAt(index)==='x') return false;
    if(!explosion && has(s,'sense') && !f.senseUsed) {f.senseUsed=true;f.flash=[index];r.message='Чутьё: здесь опасно';r.lastEvent='sense';return false;}
    f.vis=charAt(f.vis,index,'x'); f.known[index]=B.m[index]==='2' ? 4:2;
    s.meta.stats.mines=(s.meta.stats.mines||0)+1;
    if(s.meta.stats.mines>=c(cfg,'sapper.blaster.unlock')) s.meta.unlocked.blaster=true;
    if(r.sapper==='blaster') addGold(s,c(cfg,'sapper.blaster.gold'));
    var damage=Board.value(B.m[index]);
    if(has(s,'oak') && !f.shieldUsed) {f.shieldUsed=true;damage=0;}
    f.loss+=damage; r.heartsLost+=damage;
    if(r.fieldIndex>=4 && r.fieldIndex<=5) r.rockLoss+=damage;
    r.hearts=Math.max(0,r.hearts-damage);r.lastEvent=damage ? 'mine':'shield';
    if(r.hearts<=0 && has(s,'spare') && !r.spareUsed) {r.spareUsed=true;r.hearts=Math.min(r.maxHearts,c(cfg,'talisman.spare.hearts'));r.message='Запасное сердце вернуло вас в забег';}
    if(r.hearts<=0) finish(s,cfg,false,r.lastMult);
    return true;
  }
  function autoFlags(s,cfg) {
    if(!has(s,'apprentice') || !s.run.field.generated) return;
    var B=model(s,cfg);var K=facts(s,B);var opt=options(cfg);opt.rules='simple';opt.inspect=false;
    Board.deduce(B,K,opt);
    for(var i=0;i<B.n;i++) if(!K.open[i] && K.mask[i] && !(K.mask[i]&1)) setFlag(s,B,i,cfg,K.mask[i]===4 ? 2:1);
  }
  function roamInterval(s,cfg) {
    var r=s.run;
    var interval=r.mode!=='deep' && r.fieldIndex===c(cfg,'run.fields')-1 && r.bosses.indexOf('swarm')>=0 ? c(cfg,'boss.swarmEvery'):c(cfg,'roamEvery');
    if(r.mode==='daily' && r.bosses.indexOf('swarm')>=0) interval=c(cfg,'boss.swarmEvery');
    if(r.depth>=11) interval-=c(cfg,'depth.roamPenalty');
    return Math.max(1,interval)*(has(s,'heavy') ? c(cfg,'talisman.heavy.mult'):1);
  }
  function clockLimit(s,cfg) {return Math.max(1,c(cfg,'clockOpens')-(s.run.depth>=7 ? c(cfg,'depth.clockPenalty'):0))*(has(s,'pendulum') ? c(cfg,'talisman.pendulum.mult'):1);}
  function armClocks(s,cfg) {
    var f=s.run.field;if(!f || !f.generated || f.stopped || s.run.status!=='playing') return;
    var B=model(s,cfg);var K=facts(s,B);var opt=options(cfg);opt.inspect=false;
    Board.deduce(B,K,opt);
    for(var k=0;k<B.n;k++) if(B.m[k]==='c' && f.clocks[k]===undefined && !K.open[k] && K.mask[k] && !(K.mask[k]&1)) f.clocks[k]=clockLimit(s,cfg);
  }
  function hazardStep(s,cfg) {
    var r=s.run;var f=r.field;var B=model(s,cfg);var opt=options(cfg);opt.inspect=false;
    var keys=Object.keys(f.clocks);
    if(!f.stopped) {
      for(var j=0;j<keys.length;j++) {
        var ci=Number(keys[j]);
        if(isFlag(f.vis.charAt(ci)) || f.vis.charAt(ci)==='x') continue;
        f.clocks[ci]--;
        if(f.clocks[ci]<=0) {hit(s,B,ci,cfg,true);if(r.status!=='playing') return;}
      }
      armClocks(s,cfg);
    }
    var every=roamInterval(s,cfg);
    if(!f.frozen && f.openings%every===0) {
      var moving=[];
      for(var q=0;q<B.n;q++) if(B.m[q]==='r' && f.vis.charAt(q)==='-') moving.push(q);
      for(var a=0;a<moving.length;a++) {
        var from=moving[a];B=model(s,cfg);var near=B.nb[from].slice();var rng=rngFor(s);rng.shuffle(near);r.rng=rng.state();
        for(var p=0;p<near.length;p++) {
          var to=near[p];
          if(f.vis.charAt(to)!=='-' || B.m[to]!=='.' || f.known[to]!==undefined || f.t.charAt(to)!=='.') continue;
          var knowledge=facts(s,B);
          if(!Board.canMove(B,knowledge,from,to,opt)) continue;
          f.m=charAt(charAt(f.m,from,'.'),to,'r');delete f.known[from];delete f.known[to];f.flash.push(from);f.flash.push(to);break;
        }
      }
    } else if(!f.frozen && f.openings%every===every-1) for(var z=0;z<B.n;z++) if(B.m[z]==='r' && f.vis.charAt(z)==='-') f.flash.push(z);
    if(f.rowCounts.length) updateRows(s);
  }
  function finishedField(s,cfg) {
    var f=s.run.field;var B=model(s,cfg);
    for(var i=0;i<B.n;i++) if(!Board.mined(B.m[i]) && B.m[i]!=='h' && f.vis.charAt(i)!=='o') return false;
    return true;
  }
  function earthFallback(s,cfg) {
    var r=s.run;var f=r.field;
    if(r.status!=='playing'||!f||!f.generated) return false;
    var B=model(s,cfg);var K=facts(s,B);Board.deduce(B,K,options(cfg));
    for(var i=0;i<B.n;i++) if(!K.open[i] && K.mask[i]===1) return false;
    // A different opening order or a revealed deaf clue can join the frontier beyond the
    // configured enumeration limit. Expose the fallback as a visible earth mark, never as
    // an undisclosed solver fact; the player still chooses when to open the marked cell.
    var picked=-1;var best=-1;
    for(var j=0;j<B.n;j++) {
      if(K.open[j]||B.m[j]!=='.') continue;
      var score=(f.vis.charAt(j)==='-' ? 2:0)+(B.t[j]!=='d' ? 1:0);
      if(score>best) {picked=j;best=score;}
    }
    if(picked<0) return false;
    if(!f.earthHints) f.earthHints={};
    f.earthHints[picked]=true;f.known[picked]=1;
    if(!f.hints) s.meta.stats.hints=(s.meta.stats.hints||0)+1;
    if(!f.runtimeHints) s.meta.stats.runtimeHintFields=(s.meta.stats.runtimeHintFields||0)+1;
    f.hints=(f.hints||0)+1;f.runtimeHints=(f.runtimeHints||0)+1;
    s.meta.stats.runtimeHints=(s.meta.stats.runtimeHints||0)+1;
    autoFlags(s,cfg);armClocks(s,cfg);
    return true;
  }
  function afterMove(s,cfg,opened) {
    if(s.run.status!=='playing') return;
    autoFlags(s,cfg);
    if(finishedField(s,cfg)) {completeField(s,cfg);return;}
    if(opened) {s.run.field.openings++;hazardStep(s,cfg);if(s.run.status==='playing' && finishedField(s,cfg)) completeField(s,cfg);} else armClocks(s,cfg);
    earthFallback(s,cfg);
  }
  function tap(s,index,cfg,mult) {
    var r=s.run;var f=r.field;
    if(r.status!=='playing' || !f || !integer(index,0,f.w*f.h-1)) return false;
    r.lastMult=multiplier(mult,r.lastMult);
    var B=f.generated ? model(s,cfg):generateField(s,index,cfg);
    f.flash=[];f.last=index;r.actions++;r.lastEvent='open';
    var v=f.vis.charAt(index);var changed=false;
    if(isFlag(v) || v==='H' || v==='x') return false;
    if(v==='o') {
      var neighbors=B.nb[index];var weight=0;
      for(var j=0;j<neighbors.length;j++) {
        var n=neighbors[j];
        if(isFlag(f.vis.charAt(n))) weight+=f.inverse ? 1:flagWeight(s,B,n);
        else if(f.vis.charAt(n)==='x') weight+=f.inverse ? 1:Board.value(B.m[n]);
      }
      var required=f.inverse ? B.cnt[index]:B.sum[index];
      if(weight!==required || B.t[index]==='d') {armClocks(s,cfg);return earthFallback(s,cfg)||f.fog;}
      for(var k=0;k<neighbors.length && r.status==='playing';k++) {
        var ni=neighbors[k];if(f.vis.charAt(ni)!=='-') continue;
        if(Board.mined(B.m[ni])) changed=hit(s,B,ni,cfg,false)||changed;
        else changed=!!openSafe(s,B,ni,cfg)||changed;
      }
    } else if(Board.mined(B.m[index])) changed=hit(s,B,index,cfg,false);
    else changed=!!openSafe(s,B,index,cfg);
    afterMove(s,cfg,changed);return changed||r.lastEvent==='sense'||(v==='o'&&f.fog);
  }
  function toolArea(B,index,radius) {
    var out=[];var x=index%B.w;var y=Math.floor(index/B.w);
    for(var dy=-radius;dy<=radius;dy++) for(var dx=-radius;dx<=radius;dx++) {var nx=x+dx;var ny=y+dy;if(nx>=0 && nx<B.w && ny>=0 && ny<B.h) out.push(ny*B.w+nx);}
    return out;
  }
  function updateRows(s) {
    var f=s.run.field;f.rowCounts=[];
    for(var y=0;y<f.h;y++) {var sum=0;for(var x=0;x<f.w;x++) sum+=Board.value(f.m.charAt(y*f.w+x));f.rowCounts.push(sum);}
  }
  function useTool(s,id,index,cfg,mult) {
    var r=s.run;var f=r.field;
    if(r.status!=='playing' || !(r.tools[id]>0) || r.mode==='pure') return false;
    if(id==='patch' && r.hearts>=r.maxHearts) return false;
    var targeted=['probe','xray','shovel','lantern','compass','flare'].indexOf(id)>=0;
    if(targeted && (!f.generated || !integer(index,0,f.w*f.h-1))) return false;
    if(id!=='patch' && !f.generated) return false;
    r.tools[id]--;r.toolsUsed++;r.actions++;r.lastEvent='tool';r.lastMult=multiplier(mult,r.lastMult);
    if(id==='patch') {r.hearts=Math.min(r.maxHearts,r.hearts+c(cfg,'tool.patch.hearts'));return true;}
    var B=model(s,cfg);var cells=[index];var opened=false;f.flash=[];
    if(id==='probe') {f.known[index]=Board.mined(B.m[index]) ? (B.m[index]==='2' ? 4:2):1;f.readings.push({tool:id,i:index,value:Board.value(B.m[index])});}
    else if(id==='xray' || id==='shovel') {
      if(id==='shovel') cells=toolArea(B,index,c(cfg,'tool.shovel.radius'));
      for(var i=0;i<cells.length;i++) {var at=cells[i];if(Board.mined(B.m[at])) {setFlag(s,B,at,cfg,Board.value(B.m[at]));f.known[at]=B.m[at]==='2' ? 4:2;} else if(!isFlag(f.vis.charAt(at))) opened=!!openSafe(s,B,at,cfg)||opened;}
      f.last=index;
    } else if(id==='lantern') {
      cells=toolArea(B,index,c(cfg,'tool.lantern.radius'));var total=0;
      for(var l=0;l<cells.length;l++) total+=Board.value(B.m[cells[l]]);
      f.readings.push({tool:id,i:index,value:total,cells:cells});r.message='Фонарь: в квадрате '+total;
    } else if(id==='compass') {
      var nearest=-1;var distance=B.n;
      for(var q=0;q<B.n;q++) if(Board.mined(B.m[q]) && f.vis.charAt(q)==='-') {var d=Math.abs(q%B.w-index%B.w)+Math.abs(Math.floor(q/B.w)-Math.floor(index/B.w));if(d<distance) {nearest=q;distance=d;}}
      if(nearest>=0) {f.known[nearest]=B.m[nearest]==='2' ? 4:2;f.readings.push({tool:id,i:index,target:nearest});f.flash=[nearest];}
    } else if(id==='flare') {var row=Math.floor(index/B.w);for(var z=row*B.w;z<(row+1)*B.w;z++) if(Board.mined(B.m[z])) setFlag(s,B,z,cfg,Board.value(B.m[z]));}
    else if(id==='sand') f.frozen=true;
    else if(id==='brake') f.stopped=true;
    else if(id==='seismo') updateRows(s);
    if(f.readings.length>B.n) f.readings=f.readings.slice(-B.n);
    afterMove(s,cfg,opened);return true;
  }
  function offers(s,cfg,count) {
    var all=(DATA.finds||[]).filter(function(f){return f.kind==='tool'||!has(s,f.id);});var result=[];var rng=rngFor(s);
    while(result.length<count && all.length) {
      var picked=rng.weighted(all,function(f){return c(cfg,'rarity.'+f.rarity);});if(!picked) break;
      result.push(picked.id);all=all.filter(function(f){return f.id!==picked.id;});
    }
    s.run.rng=rng.state();return result;
  }
  function completeField(s,cfg) {
    var r=s.run;var f=r.field;r.completed++;s.meta.stats.fields=(s.meta.stats.fields||0)+1;
    if(f.loss===0) {
      r.noLossFields++;
      if(has(s,'greedy-pick')) {var tools=Object.keys(r.tools);if(tools.length) r.tools[takeRandom(s,tools)]+=c(cfg,'talisman.greedy-pick.charges');}
    }
    if(r.completed>=4) s.meta.unlocked.geolog=true;
    if(r.mode==='deep') s.meta.stats.bestDeep=Math.max(s.meta.stats.bestDeep||0,r.completed);
    if(r.mode!=='pure' && r.mode!=='deep' && r.completed>=c(cfg,'run.fields')) {finish(s,cfg,true,r.lastMult);return;}
    if(r.mode==='pure') {r.fieldIndex++;setupField(s,cfg);return;}
    var amount=c(cfg,'choice.count')+level(s,'choice')-(r.depth>=8 ? c(cfg,'depth.choicePenalty'):0);
    r.choices=offers(s,cfg,Math.max(1,amount));r.status='choice';r.lastEvent='clear';
  }
  function shopPrice(s,id,cfg) {
    var f=item(id);if(!f) return 0;
    var discount=1-level(s,'discount')*c(cfg,'workshop.discount.amount');
    if(has(s,'quiet-shop')) discount*=1-c(cfg,'talisman.quiet-shop.discount');
    if(s.run.depth>=6) discount*=c(cfg,'depth.shopMult');
    return Math.max(1,Math.ceil(c(cfg,'shop.'+f.rarity)*discount));
  }
  function choose(s,id,cfg) {
    if(s.run.status!=='choice' || s.run.choices.indexOf(id)<0 || !addFind(s,id,cfg)) return false;
    s.run.choices=[];
    if(s.run.completed%c(cfg,'layer.fields')===0) {
      var list=offers(s,cfg,c(cfg,'shop.count'));s.run.shop=[];
      for(var i=0;i<list.length;i++) s.run.shop.push({id:list[i],price:shopPrice(s,list[i],cfg),bought:false});
      s.run.status='shop';
    } else {s.run.fieldIndex++;setupField(s,cfg);}
    return true;
  }
  function shopBuy(s,id,cfg) {
    if(s.run.status!=='shop') return false;
    for(var i=0;i<s.run.shop.length;i++) {
      var offer=s.run.shop[i];if(offer.id!==id||offer.bought) continue;
      var price=shopPrice(s,id,cfg);if(s.run.gold<price) return false;
      s.run.gold-=price;offer.bought=true;offer.price=price;return addFind(s,id,cfg);
    }
    return false;
  }
  function advance(s,cfg) {if(s.run.status!=='shop') return false;s.run.fieldIndex++;setupField(s,cfg);return true;}
  function continueDeeper(s,cfg) {
    if(s.run.status!=='shop'||s.run.completed!==c(cfg,'run.fields')-1||s.run.mode!=='rogue') return false;
    s.run.mode='deep';return advance(s,cfg);
  }
  function oreReward(s,cfg,won,mult) {
    var r=s.run;
    var base=Big.add(r.completed*c(cfg,'ore.field')+r.noLossFields*c(cfg,'ore.flawless')+(won ? c(cfg,'ore.boss'):0),Big.div(r.gold,c(cfg,'ore.goldDivisor')));
    var factor=(1+r.depth*c(cfg,'depth.oreBonus'))*(r.sapper==='tidy' ? c(cfg,'sapper.tidy.mult'):1)*multiplier(mult,1);
    return Big.floor(Big.mul(base,factor));
  }
  function finish(s,cfg,won,mult) {
    var r=s.run;if(r.settled) return false;
    r.status=won ? 'won':'lost';r.reward=Big.str(oreReward(s,cfg,won,mult));r.settled=true;
    s.meta.ore=Big.str(Big.add(s.meta.ore,r.reward));s.meta.earnedOre=Big.str(Big.add(s.meta.earnedOre,r.reward));
    if(won) {
      s.meta.stats.wins=(s.meta.stats.wins||0)+1;s.meta.unlocked.cartographer=true;
      if(r.rockLoss===0) s.meta.unlocked.tidy=true;
      if(r.mode==='rogue') s.meta.records['depth-'+r.depth]=true;
      if(r.daily) s.meta.dailyBest[r.daily.id||r.daily.title]=Math.max(s.meta.dailyBest[r.daily.id||r.daily.title]||0,r.completed);
    }
    r.lastEvent=won ? 'win':'lose';return true;
  }
  function endRun(s,cfg,mult) {if(['playing','choice','shop'].indexOf(s.run.status)<0) return false;return finish(s,cfg,false,mult===undefined ? s.run.lastMult:mult);}
  function workshopCost(s,id,cfg) {if(WORK_IDS.indexOf(id)<0) return Big.ZERO;return Big.ceil(Big.mul(c(cfg,'workshop.'+id+'.base'),Big.pow(c(cfg,'workshop.growth'),level(s,id))));}
  /** The ceiling of an improvement; a negative setting means there is none. */
  function workshopMax(id,cfg) {var max=c(cfg,'workshop.'+id+'.max');return max<0 ? Infinity:max;}
  function buyWorkshop(s,id,cfg) {
    ensure(s);if(WORK_IDS.indexOf(id)<0||level(s,id)>=workshopMax(id,cfg)) return false;
    var price=workshopCost(s,id,cfg);if(Big.lt(s.meta.ore,price)) return false;
    s.meta.ore=Big.str(Big.sub(s.meta.ore,price));s.meta.workshop[id]=level(s,id)+1;return true;
  }
  function prestigeGain(s,id,cfg) {
    if(id!=='depth'||s.meta.depthUnlocked>=c(cfg,'depth.max')||s.run.status!=='won'||s.run.mode!=='rogue'||s.run.depth!==s.meta.depthUnlocked) return Big.ZERO;
    return Big.ONE;
  }
  function bonus(s,id,amount,cfg) {return Big.add(1,Big.mul(amount,c(cfg,'depth.oreBonus')));}
  function onPrestige(s,id,before,ctx) {
    if(id!=='depth') return;
    s.meta.depthUnlocked=Math.min(c(ctx.config,'depth.max'),before.meta.depthUnlocked+1);
    s.run.depth=s.meta.depthUnlocked;s.run.sapper=before.run.sapper;s.run.message='Открыта глубина '+s.meta.depthUnlocked;
  }
  function achievements(s,cfg) {
    var out=[];
    if(s.run.status==='won' && s.run.heartsLost===0) out.push('flawless');
    if(s.run.status==='won' && s.run.toolsUsed===0) out.push('no-tools');
    if(s.meta.depthUnlocked>=c(cfg,'depth.max')) out.push('depth-12');
    if((s.meta.stats.cells||0)>=c(cfg,'achievement.cells')) out.push('cells-10000');
    return out;
  }
  function view(s,cfg) {
    var r=s.run;var f=r.field;var cells=[];var remaining=f ? f.mines:0;
    var layer=r.mode==='pure' ? 'pure':r.mode==='deep' && r.fieldIndex>=c(cfg,'run.fields')-1 ? 'deep':['turf','clay','rock','boss'][Math.min(3,Math.floor(r.fieldIndex/c(cfg,'layer.fields')))];
    var title='';var layers=DATA.layers||[];
    for(var li=0;li<layers.length;li++) if(layers[li].id===layer) title=layers[li].title;
    if(f) {
      var B=f.generated ? model(s,cfg):null;
      for(var i=0;i<f.w*f.h;i++) {
        var shown=f.generated ? f.vis.charAt(i):'-';var flagged=isFlag(shown);var known=f.known[i];var t=f.generated ? f.t.charAt(i):'.';
        var fogged=f.fog && f.last>=0 && Math.max(Math.abs(i%f.w-f.last%f.w),Math.abs(Math.floor(i/f.w)-Math.floor(f.last/f.w)))>c(cfg,'boss.fogRadius');
        var deaf=B && B.t[i]==='d';var number=null;
        if(shown==='o' && !fogged && !deaf) {
          var available=0;for(var j=0;j<B.nb[i].length;j++) if(B.m[B.nb[i][j]]!=='h') available++;
          number=f.inverse ? available-B.cnt[i]:B.sum[i];
        }
        if(flagged||shown==='x') remaining--;
        cells.push({i:i,shown:shown,number:number,flag:flagged,flagWeight:flagged ? flagWeight(s,B,i):0,mine:shown==='x' ? B.m[i]:null,hole:shown==='H',earth:!!(t==='e'||f.earthHints&&f.earthHints[i]) && shown==='-',cache:(has(s,'nose')||r.sapper==='cartographer') && ['g','i','z'].indexOf(t)>=0 && shown==='-',deaf:shown==='o' && !!deaf,fogged:shown==='o' && fogged,clock:f.clocks[i]===undefined||f.stopped||flagged||shown==='x' ? null:f.clocks[i],probe:known===undefined ? null:known===1 ? 0:known===4 ? 2:1,flash:f.flash.indexOf(i)>=0});
      }
    }
    var bossText='';
    if((r.mode==='rogue' && r.fieldIndex>=(has(s,'old-map') ? 4:c(cfg,'run.fields')-1))||r.mode==='daily') {
      var bosses=DATA.bosses||[];var parts=[];
      for(var bi=0;bi<bosses.length;bi++) if(r.bosses.indexOf(bosses[bi].id)>=0) parts.push(bosses[bi].title+': '+bosses[bi].text);
      if(r.customRule) parts.push(r.customRule.title+': '+(r.customRule.text||''));
      bossText=parts.join(' · ');
    }
    return {cells:cells,remaining:remaining,showRemaining:has(s,'counter'),totalMines:f ? f.mines:0,doubles:f ? f.doubles:0,layer:layer,title:title,bossText:bossText};
  }
  function logicalHints(s,cfg) {
    if(!s.run.field||!s.run.field.generated) return {safe:[],mines:[]};
    var B=model(s,cfg);var K=facts(s,B);Board.deduce(B,K,options(cfg));var safe=[];var mines=[];
    for(var i=0;i<B.n;i++) if(!K.open[i]) {if(K.mask[i]===1) safe.push(i);else if(K.mask[i] && !(K.mask[i]&1)) mines.push({i:i,weight:K.mask[i]===4 ? 2:1});}
    return {safe:safe,mines:mines};
  }
  function applyBrick(spec,brick,cfg) {
    if(brick.brick==='inverse') {spec.inverse=true;spec.holes=0;}
    else if(brick.brick==='swarm') spec.roamers=c(cfg,'boss.swarmCount');
    else if(brick.brick==='double') spec.doubles=Math.floor(spec.mines*c(cfg,'boss.doubleShare'));
    else if(brick.brick==='fog') spec.fog=true;
    else if(brick.brick==='movement') spec.roamers=(spec.roamers||0)+(brick.value||1);
    else if(brick.brick==='visibility') spec.deaf=Math.max(0,(spec.deaf||0)-(brick.value||1));
    else if(brick.brick==='flags') spec.shard=true;
  }
  function verifyBricks(bricks) {
    var cfg=LAST_CFG;var key=JSON.stringify({bricks:bricks,config:cfg});if(VERIFIED[key]) return null;
    var count=c(cfg,'stock.verifyFields');if(count<500) return 'Для нового правила требуется не менее 500 полей';
    for(var i=0;i<count;i++) {
      var n=i%c(cfg,'run.fields');
      var spec={w:c(cfg,'field.'+n+'.w'),h:c(cfg,'field.'+n+'.h'),mines:c(cfg,'field.'+n+'.mines'),doubles:n>=2 ? Math.floor(c(cfg,'field.'+n+'.mines')*c(cfg,'double.share')):0,deaf:n>=2 ? c(cfg,'deaf.count'):0,holes:n>=4 ? c(cfg,'hole.count'):0,fogRadius:c(cfg,'boss.fogRadius')};
      for(var j=0;j<bricks.length;j++) applyBrick(spec,bricks[j],cfg);
      var start=i%(spec.w*spec.h);var made=Board.generate(spec,Rng.hash(key+':'+i),start,options(cfg));
      if(!made.ok || !Board.solve(made,options(cfg)).ok) return 'Правило требует угадывания на поле '+i;
    }
    VERIFIED[key]=true;return null;
  }
  function validateStock(kind,value) {
    if(!value||typeof value!=='object'||Array.isArray(value)) return 'Нужен объект';
    if(typeof value.title!=='string'||!value.title.length||value.title.length>c(null,'stock.maxTitle')) return 'Некорректное название';
    if(value.id!==undefined && (typeof value.id!=='string'||!value.id.length||value.id.length>c(null,'stock.maxTitle'))) return 'Некорректный идентификатор';
    if(value.text!==undefined && (typeof value.text!=='string'||value.text.length>c(null,'stock.maxText'))) return 'Некорректное описание';
    var text=JSON.stringify(value);
    if(/https?:|<script|\bfunction\b|=>|[\uD83C-\uDBFF][\uDC00-\uDFFF]/i.test(text)) return 'Ссылки и исполняемый код не допускаются';
    var allowed=kind==='daily' ? ['id','title','text','seed','rule']:['id','title','text','bricks'];
    if(Object.keys(value).some(function(key){return allowed.indexOf(key)<0;})) return 'Лишние поля элемента';
    if(kind==='daily') {
      if(!integer(value.seed,0,4294967295)) return 'Нужно целое зерно поля дня';
      if(BOSS_IDS.indexOf(value.rule)<0) return 'Неизвестное правило поля дня';
      return null;
    }
    if(kind!=='rules' && kind!=='finds') return 'Неизвестный вид контента';
    if(!Array.isArray(value.bricks)||!value.bricks.length||value.bricks.length>c(null,'stock.maxBricks')) return 'Нужно от одного до двух кирпичиков';
    var seen={};
    for(var i=0;i<value.bricks.length;i++) {
      var b=value.bricks[i];
      if(!b||BRICKS.indexOf(b.brick)<0||seen[b.brick]) return 'Неизвестный или повторный кирпичик';
      if(kind==='finds' && ['hearts','flags','movement','visibility'].indexOf(b.brick)<0) return 'Кирпичик не относится к находке';
      if(Object.keys(b).some(function(key){return key!=='brick'&&key!=='value';})) return 'Лишние поля кирпичика';
      if(b.value!==undefined && !integer(b.value,1,b.brick==='movement' ? c(null,'stock.maxMovement'):c(null,'stock.maxHearts'))) return 'Значение вне проверяемого диапазона';
      seen[b.brick]=true;
    }
    return verifyBricks(value.bricks);
  }
  function dailyFor(now) {
    var day=Math.floor(now/86400000);var seed=Rng.hash('minesweeper-rogue:daily:'+day);
    return {id:'day-'+day,title:'Поле дня',seed:seed,rule:BOSS_IDS[seed%BOSS_IDS.length],text:'Общее зерно и правило для всех сапёров'};
  }
  function procedural(kind,rng) {
    if(kind==='daily') return null;
    if(kind==='rules') {var boss=rng.pick(DATA.bosses||[]);return boss ? clone(boss):null;}
    return {title:'Тёплая метка',text:'Ещё одно сердце и безопасная метка на новом поле',bricks:[{brick:'hearts',value:1},{brick:'flags',value:1}]};
  }
  function installStock(s,kind,value,cfg,now) {
    LAST_CFG=cfg||LAST_CFG;var error=validateStock(kind,value);if(error) return false;
    if(kind==='daily') {s.meta.daily=clone(value);s.meta.dailyDay=Math.floor((typeof now==='number' && isFinite(now) ? now:0)/86400000);return true;}
    if(kind==='rules') {s.meta.nextRule=clone(value);return true;}
    if(kind==='finds' && s.run.mode!=='pure' && ['playing','choice','shop'].indexOf(s.run.status)>=0) {
      s.run.extraFinds.push(clone(value));
      for(var i=0;i<value.bricks.length;i++) {
        var b=value.bricks[i];
        if(b.brick==='hearts') {s.run.maxHearts+=b.value||1;s.run.hearts=Math.min(s.run.maxHearts,s.run.hearts+(b.value||1));}
        else if(b.brick==='flags') addFind(s,'shard',cfg);
        else if(b.brick==='visibility') addFind(s,'candle',cfg);
        else if(b.brick==='movement') addFind(s,'heavy',cfg);
      }
      return true;
    }
    return false;
  }
  function tick(s,dt,ctx) { }
  function offline(s,sec,ctx) {return {events:[]};}
  function income(s,cfg) {return Big.ZERO;}
  function chest(s,rng,cfg) {var amount=c(cfg,'chest.ore');s.meta.ore=Big.str(Big.add(s.meta.ore,amount));return {title:'Находка пассажира',items:[{title:'Руда',amount:amount}]};}
  function summary(s,cfg) {return {line:'Пройдено полей: '+(s.meta.stats.fields||0)+' · глубина '+s.meta.depthUnlocked};}
  function validate(s) {
    if(!s||!s.run||!s.meta) return 'Нет состояния забега';var r=s.run;
    if(['ready','playing','choice','shop','won','lost'].indexOf(r.status)<0) return 'Неизвестный этап';
    // Loading precedes init/configure(config) in the browser. Only structural limits belong here.
    if(['rogue','pure','deep','daily'].indexOf(r.mode)<0 || !integer(r.depth,0,12)) return 'Неверный режим или глубина';
    if(!integer(r.seed,0,4294967295)||!integer(r.rng,0,4294967295)) return 'Неверное зерно';
    if(!Big.valid(s.meta.ore)||Big.sign(s.meta.ore)<0) return 'Неверная руда';
    if(!Big.valid(s.meta.earnedOre)||Big.sign(s.meta.earnedOre)<0||!Big.valid(r.reward)||Big.sign(r.reward)<0) return 'Неверная награда';
    if(typeof r.gold!=='number'||!isFinite(r.gold)||r.gold<0) return 'Неверное золото';
    if(!integer(r.maxHearts,0)||!integer(r.hearts,0,r.maxHearts)) return 'Неверные сердца';
    if(!integer(r.fieldIndex,0)||!integer(r.completed,0)) return 'Неверный счёт полей';
    if(!integer(r.noLossFields,0,r.completed)||!integer(r.heartsLost,0)||!integer(r.rockLoss,0)||!integer(r.toolsUsed,0)||!integer(r.actions,0)||typeof r.lastMult!=='number'||!isFinite(r.lastMult)||r.lastMult<1) return 'Неверные счётчики забега';
    if(!Array.isArray(r.talismans)||!r.tools||typeof r.tools!=='object'||Array.isArray(r.tools)||!Array.isArray(r.choices)||!Array.isArray(r.shop)||!Array.isArray(r.pregen)) return 'Неверные находки или запас полей';
    if(r.talismans.some(function(id){var find=item(id);return !find||find.kind!=='talisman';})) return 'Неизвестный талисман';
    for(var id in r.tools) {var tool=item(id);if(!tool||tool.kind!=='tool'||!integer(r.tools[id],0)) return 'Неверный инструмент';}
    if(!s.meta.workshop||typeof s.meta.workshop!=='object'||Array.isArray(s.meta.workshop)) return 'Неверная мастерская';
    for(var wi in s.meta.workshop) if(WORK_IDS.indexOf(wi)<0||!integer(s.meta.workshop[wi],0)) return 'Неверная мастерская';
    if(!integer(s.meta.depthUnlocked,0,12)||!s.meta.stats||typeof s.meta.stats!=='object') return 'Неверная статистика';
    var statNames=['runs','wins','cells','mines','fields','hints','bestDeep'];
    for(var sn=0;sn<statNames.length;sn++) if(!integer(s.meta.stats[statNames[sn]],0)) return 'Неверная статистика';
    var optionalStats=['generated','runtimeHints','runtimeHintFields'];
    for(var os=0;os<optionalStats.length;os++) if(s.meta.stats[optionalStats[os]]!==undefined && !integer(s.meta.stats[optionalStats[os]],0)) return 'Неверная статистика';
    var f=r.field;
    if(f) {
      if(!integer(f.w,1,9)||!integer(f.h,1)) return 'Неверные размеры поля';
      if(typeof f.m!=='string'||typeof f.t!=='string'||typeof f.vis!=='string'||!f.known||!f.clocks||!f.rewards||!f.correctFlags||!Array.isArray(f.flash)||!Array.isArray(f.rowCounts)||!Array.isArray(f.readings)) return 'Неверные данные поля';
      if(!integer(f.mines,0,f.w*f.h)||!integer(f.doubles,0,f.mines)||!integer(f.openings,0)||!integer(f.loss,0)||!integer(f.last,-1,f.w*f.h-1)) return 'Неверные счётчики поля';
    }
    if(f && f.generated) {
      if(f.m.length!==f.w*f.h||f.t.length!==f.m.length||f.vis.length!==f.m.length) return 'Длина поля не совпадает';
      if(/[^.h12rc]/.test(f.m)||/[^.degizo]/.test(f.t)||/[^\-fFoHx]/.test(f.vis)) return 'Неизвестная клетка';
      var count=0;var dbl=0;
      for(var i=0;i<f.m.length;i++) {if(Board.mined(f.m.charAt(i))) count++;if(f.m.charAt(i)==='2') dbl++;if(f.vis.charAt(i)==='o'&&Board.mined(f.m.charAt(i))) return 'Открытая мина без отметки';}
      if(count!==f.mines||dbl!==f.doubles) return 'Счёт мин расходится';
      for(var ci in f.clocks) if(!integer(Number(ci),0,f.m.length-1)||f.m.charAt(Number(ci))!=='c'||!integer(f.clocks[ci],0)) return 'Неверные часы';
      for(var ki in f.known) if(!integer(Number(ki),0,f.m.length-1)||[1,2,4].indexOf(f.known[ki])<0) return 'Неверные сведения о клетке';
      if(f.earthHints!==undefined) {
        if(!f.earthHints||typeof f.earthHints!=='object'||Array.isArray(f.earthHints)) return 'Неверные сведения о клетке';
        for(var ei in f.earthHints) if(!integer(Number(ei),0,f.m.length-1)||f.earthHints[ei]!==true||f.m.charAt(Number(ei))!=='.'||f.known[ei]!==1) return 'Неверные сведения о клетке';
      }
    }
    return null;
  }
  function migrate(s,from) {ensure(s);return s;}
  return {init:init,tick:tick,offline:offline,income:income,prestigeGain:prestigeGain,bonus:bonus,onPrestige:onPrestige,migrate:migrate,validate:validate,summary:summary,next:function(){return [];},chest:chest,procedural:procedural,validateStock:validateStock,configure:configure,content:content,startRun:startRun,tap:tap,flag:flag,useTool:useTool,choose:choose,shopBuy:shopBuy,advance:advance,continueDeeper:continueDeeper,endRun:endRun,addFind:addFind,applyStepProbe:applyStepProbe,fieldSpec:fieldSpec,model:model,prepareRequests:prepareRequests,acceptPrepared:acceptPrepared,view:view,logicalHints:logicalHints,workshopCost:workshopCost,workshopMax:workshopMax,buyWorkshop:buyWorkshop,shopPrice:shopPrice,oreReward:oreReward,achievements:achievements,installStock:installStock,dailyFor:dailyFor,LAYER:'depth'};
});

