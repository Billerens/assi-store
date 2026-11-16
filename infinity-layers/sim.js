/* Shared deterministic simulation. All resource arithmetic uses the local extended number type. */
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('./numbers.js'), require('../engine/big.js')) : make(root.InfinityNumbers, root.Big);
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; } else { root.GameSim = api; }
})(this, function (N, Big) {
  'use strict';
  var IDS = ['compression', 'fold', 'collapse'];
  var NAMES = ['Точка', 'Отрезок', 'Плоскость', 'Объём', 'Поток', 'Узел', 'Сеть', 'Ткань', 'Полотно'];
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function blankLayer() { return {currency:'0e0',count:0,best:'0e0',lastAt:0,state:{}}; }
  function freshRun(cfg) {
    var tiers = [];
    for (var i = 0; i < 9; i++) tiers.push({amount:'0e0',bought:0});
    return {points:N.str(cfg['start.points']),enginePoints:N.str(cfg['start.points']),enginePointsSeen:N.str(cfg['start.points']),earned:'0e0',tiers:tiers,resonance:0,totalBought:0,boostUntil:0,eventBoostUntil:0,eventBoost:1,mirrorUntil:0,densityFactor:1,nextEventAt:0,event:null,eventPower:1,autoPhase:0,decayPhase:0,rhythm:{anchor:0,combo:0,until:0,bonus:false,lastBeat:-1}};
  }
  function init(ctx) {
    var cfg = ctx.config;
    return {run:freshRun(cfg),layers:{compression:blankLayer(),fold:blankLayer(),collapse:blankLayer()},meta:{foldTree:{},collapseTree:{},completed:{},highestLayer:3,challenge:0,foldUnlocked:false,collapseUnlocked:false,foldsEarned:'0e0',totalCompressions:0,totalDensity:'0e0',auto:{tiers:[false,false,false,false,false,false,false,false,false],resonance:false,compression:false,fold:false,compressionRatio:cfg['auto.compressionRatio'],foldRatio:cfg['auto.foldRatio']},offlineSummary:null}};
  }
  function engineValue(value, cfg) {
    var x = N.of(value);
    if (x.t || x.e > cfg['engine.maxOrder']) return Big.of({m:1,e:cfg['engine.maxOrder']});
    return Big.of(N.str(x));
  }
  function syncOut(s,cfg) {
    s.run.enginePoints = Big.str(engineValue(s.run.points,cfg));
    s.run.enginePointsSeen = s.run.enginePoints;
  }
  function syncIn(s,cfg) {
    var r=s.run;
    if (r.enginePointsSeen !== undefined && !Big.eq(r.enginePoints,r.enginePointsSeen)) {
      r.points=N.str(N.max(0,N.add(r.points,Big.str(Big.sub(r.enginePoints,r.enginePointsSeen)))));
      if(cfg) syncOut(s,cfg); else r.enginePointsSeen=Big.str(r.enginePoints);
    }
  }
  function layer(s,id) { if (!s.layers[id]) s.layers[id]=blankLayer(); return s.layers[id]; }
  function currency(s,id) {
    var l=layer(s,id);
    if (l.state.extCurrency) {
      if (l.state.engineSeen && !Big.eq(l.currency,l.state.engineSeen)) {
        l.state.extCurrency=Big.isZero(l.state.engineSeen) ? N.str(l.currency) : N.str(N.mul(l.state.extCurrency,Big.str(Big.div(l.currency,l.state.engineSeen))));
        l.state.engineSeen=Big.str(l.currency);
      }
      return N.of(l.state.extCurrency);
    }
    return N.of(l.currency);
  }
  function setCurrency(s,id,amount,cfg) {
    var l=layer(s,id), x=N.max(0,amount);
    if (x.t || x.e > cfg['engine.maxOrder']) {
      l.state.extCurrency=N.str(x);
      l.currency=Big.str(engineValue(x,cfg));
      l.state.engineSeen=l.currency;
    } else { l.currency=N.str(x); delete l.state.extCurrency; delete l.state.engineSeen; }
    return x;
  }
  // A tree node holds its level: true in old saves means level 1. A node with a «.growth» setting
  // can be bought again without a ceiling, each level dearer by that factor.
  function level(tree,id) { var v=tree ? tree[id]:0; return v===true ? 1 : typeof v==='number' && v>0 ? Math.floor(v):0; }
  function upgradeKey(id,tree) { return (tree==='collapse' ? 'collapseUpgrade.':'upgrade.')+id; }
  function repeatable(id,cfg,tree) { return cfg[upgradeKey(id,tree)+'.growth']!==undefined; }
  function upgradeLevel(s,id,tree) { return level(tree==='collapse' ? s.meta.collapseTree:s.meta.foldTree,id); }
  function upgradeCost(s,id,cfg,tree) {
    var key=upgradeKey(id,tree),price=cfg[key+'.cost'];
    if (price===undefined) return null;
    if (!repeatable(id,cfg,tree)) return N.of(price);
    return N.floor(N.mul(price,N.pow(cfg[key+'.growth'],upgradeLevel(s,id,tree))));
  }
  function rule(s,index) { return Math.max(0,Math.floor((s.meta.highestLayer-4-index)/8)+1); }
  function hasChallenge(s,n) { return s.meta.challenge===n || (s.meta.challenge===8 && n<=3); }
  function unlocked(s,cfg) {
    if (hasChallenge(s,2)) return cfg['start.tiers'];
    var start=s.meta.foldTree.denseStart ? cfg['denseStart.tiers'] : cfg['start.tiers'];
    // One stage per Compression; the rule «Ступень 9 Полотно» adds a ninth to the same ladder.
    return Math.min(rule(s,0)>0 ? 9 : 8,start+layer(s,'compression').count);
  }
  function priceGrowth(s,i,cfg) {
    var g=N.of(cfg['tier.'+(i+1)+'.growth']);
    if (s.meta.completed[3]) g=N.mul(g,cfg['challenge.priceReward']);
    g=N.mul(g,Math.pow(cfg['transition.priceFactor'],rule(s,1)));
    if (hasChallenge(s,3)) g=N.pow(g,cfg['challenge.pricePower']);
    return N.max(1,g);
  }
  function cost(s,i,cfg) { return N.mul(cfg['tier.'+(i+1)+'.cost'],N.pow(priceGrowth(s,i,cfg),Math.floor(s.run.tiers[i].bought/cfg['tier.batch']))); }
  function resonanceCost(s,cfg) { return N.mul(cfg['resonance.cost'],N.pow(cfg['resonance.growth'],s.run.resonance)); }
  function resonanceMultiplier(s,cfg) { return N.pow(s.meta.completed[1] ? cfg['resonance.rewardMult']:cfg['resonance.mult'],s.run.resonance); }
  function multiplier(s,i,cfg) {
    var b=s.run.tiers[i].bought;
    var value=N.pow(cfg['tier.mult']+(cfg['tier.echoMult']-cfg['tier.mult'])*level(s.meta.foldTree,'echo'),Math.floor(b/cfg['tier.batch']));
    value=N.mul(value,resonanceMultiplier(s,cfg));
    if (!hasChallenge(s,5)) {
      var density=N.mul(currency(s,'compression'),s.run.densityFactor);
      if (rule(s,2)) density=N.mul(density,N.pow(resonanceMultiplier(s,cfg),rule(s,2)));
      value=N.mul(value,N.add(1,N.mul(density,s.meta.completed[5] ? cfg['compression.rewardBonus']:cfg['compression.bonus'])));
    }
    var milestones=String(cfg['tier.milestones']).split(',');
    for (var j=0;j<milestones.length;j++) if (b>=Number(milestones[j])) value=N.mul(value,cfg['tier.milestoneMult']);
    if (s.meta.completed[2] && i<4) value=N.mul(value,cfg['challenge.earlyMult']);
    if (s.meta.collapseTree.singularPower) value=N.mul(value,N.pow(cfg['collapse.powerMult'],level(s.meta.collapseTree,'singularPower')));
    return value;
  }
  function buy(s,i,mode,cfg) {
    syncIn(s,cfg);
    if (i<0 || i>=unlocked(s,cfg)) return false;
    var batch=cfg['tier.batch'], n=mode==='ten' ? batch-s.run.tiers[i].bought%batch:1;
    var bought=0;
    for (var j=0;j<n;j++) {
      if (hasChallenge(s,7) && s.run.totalBought>=cfg['challenge.buyLimit']) break;
      var free=s.meta.completed[7] && (s.run.totalBought+1)%cfg['challenge.freeEvery']===0;
      var price=free ? N.ZERO:cost(s,i,cfg);
      if (N.lt(s.run.points,price)) break;
      s.run.points=N.str(N.sub(s.run.points,price));
      s.run.tiers[i].amount=N.str(N.add(s.run.tiers[i].amount,1));
      s.run.tiers[i].bought++;
      s.run.totalBought++;
      bought++;
    }
    syncOut(s,cfg);
    return bought>0;
  }
  function buyResonance(s,cfg) {
    syncIn(s,cfg);
    if (hasChallenge(s,1)) return false;
    var p=resonanceCost(s,cfg);
    if (N.lt(s.run.points,p)) return false;
    s.run.points=N.str(N.sub(s.run.points,p)); s.run.resonance++; syncOut(s,cfg); return true;
  }
  function buyAll(s,cfg) {
    var count=0;
    // Resonance gets first claim on the available budget, then higher stages.
    for (var r=0;r<cfg['auto.maxPasses'] && buyResonance(s,cfg);r++) count++;
    for (var i=unlocked(s,cfg)-1;i>=0;i--) {
      for (var p=0;p<cfg['auto.maxPasses'] && buy(s,i,'ten',cfg);p++) count++;
    }
    return count;
  }
  function matrix(s,cfg,now,mult) {
    var count=unlocked(s,cfg), a=[], i,j;
    for(i=0;i<=count;i++) {a[i]=[];for(j=0;j<=count;j++) a[i][j]=N.ZERO;}
    var boost=(s.run.boostUntil>now ? cfg['boost.mult']:1)*(s.run.eventBoostUntil>now ? s.run.eventBoost:1)*(s.run.rhythm.until>now ? cfg['rhythm.mult']:1)*(mult||1);
    for(i=1;i<=count;i++) {
      var v=N.mul(multiplier(s,i-1,cfg),boost);
      if (i===1) { if (!(s.run.mirrorUntil>now)) a[0][1]=N.mul(v,cfg['tier.pointRate']); }
      else if (hasChallenge(s,4)) a[0][i]=N.mul(v,cfg['tier.chainRate']);
      else {
        a[i-1][i]=N.mul(v,cfg['tier.chainRate']);
        if (s.meta.completed[4]) a[0][i]=N.mul(v,cfg['tier.rewardPointRate']);
        if (rule(s,7)) a[i-2][i]=N.add(a[i-2][i],N.mul(v,cfg['transition.skipRate']*rule(s,7)));
      }
      if(i===2 && s.run.mirrorUntil>now) a[0][2]=N.add(a[0][2],N.mul(v,cfg['tier.chainRate']));
    }
    return a;
  }
  function income(s,cfg,now,mult) {
    var a=matrix(s,cfg,now||0,mult||1), v=N.ZERO;
    for(var j=1;j<a.length;j++) v=N.add(v,N.mul(a[0][j],s.run.tiers[j-1].amount));
    return v;
  }
  // exp(A*t) is a finite polynomial for this strictly upper triangular production matrix.
  // Therefore 0.1-second screen ticks and 10-second offline chunks integrate the same chain.
  function produce(s,sec,cfg,now,mult) {
    if (!(sec>0)) return;
    var a=matrix(s,cfg,now,mult), count=a.length, values=[N.of(s.run.points)], term=[], sums=[], i,j,k;
    for(i=1;i<count;i++) values[i]=N.of(s.run.tiers[i-1].amount);
    for(i=0;i<count;i++) {term[i]=values[i];sums[i]=values[i];}
    for(k=1;k<count;k++) {
      var next=[],nonzero=false;
      for(i=0;i<count;i++) {
        var v=N.ZERO;
        for(j=i+1;j<count;j++) if(!N.isZero(a[i][j]) && !N.isZero(term[j])) v=N.add(v,N.mul(a[i][j],term[j]));
        next[i]=N.mul(v,sec/k);
        if(!N.isZero(next[i])) nonzero=true;
        sums[i]=N.add(sums[i],next[i]);
      }
      term=next;
      if(!nonzero) break;
    }
    s.run.earned=N.str(N.add(s.run.earned,N.max(0,N.sub(sums[0],s.run.points))));
    s.run.points=N.str(sums[0]);
    for(i=1;i<count;i++) s.run.tiers[i-1].amount=N.str(sums[i]);
  }
  function rawGain(s,id,cfg) {
    if (s.meta.challenge && id!=='compression') return N.ZERO;
    var index=IDS.indexOf(id);
    if(index<0) {
      var n=Number(String(id).replace('layer',''));
      if (!(n>=4) || !s.meta.completed[8] || n>s.meta.highestLayer+1) return N.ZERO;
      var lower=n===4 ? 'collapse':'layer'+(n-1), x=currency(s,lower);
      if(N.lt(x,cfg['transition.threshold'])) return N.ZERO;
      var result=N.floor(N.pow(N.div(x,cfg['transition.threshold']),cfg['transition.power']));
      return N.mul(result,N.pow(cfg['transition.gainBase'],currency(s,'layer'+(n+1))));
    }
    if(N.lt(s.run.points,cfg[id+'.threshold'])) return N.ZERO;
    var exponent=N.div(N.sub(N.log(s.run.points),N.log(cfg[id+'.threshold'])),cfg[id+'.divisor']);
    var gain=N.floor(N.pow(cfg['prestige.gainBase'],exponent));
    if(id==='compression') gain=N.mul(gain,N.pow(cfg['fold.densityBase'],currency(s,'fold')));
    if(id==='fold') {
      gain=N.mul(gain,N.pow(cfg['collapse.foldBase'],currency(s,'collapse')));
      if(s.meta.foldTree.extraFold) gain=N.add(gain,level(s.meta.foldTree,'extraFold'));
      if(s.run.rhythm.bonus) gain=N.add(gain,cfg['rhythm.foldBonus']);
      if(rule(s,6)) gain=N.add(gain,N.mul(currency(s,'collapse'),rule(s,6)));
    }
    if(id==='collapse') gain=N.mul(gain,N.pow(cfg['transition.gainBase'],currency(s,'layer4')));
    return N.floor(gain);
  }
  function prestigeGain(s,id,cfg) { return engineValue(rawGain(s,id,cfg),cfg); }
  function bonus(s,id,amount,cfg) {
    if(id==='compression') return engineValue(N.add(1,N.mul(amount,s.meta.completed[5] ? cfg['compression.rewardBonus']:cfg['compression.bonus'])),cfg);
    return engineValue(N.pow(id==='fold' ? cfg['fold.densityBase']:cfg['collapse.foldBase'],amount),cfg);
  }
  function seedMemory(s,cfg,kind) {
    var amount=kind==='challenge' && s.meta.collapseTree.challengeMemory ? cfg['collapse.memoryAmount'] : kind==='compression' && s.meta.foldTree.memory ? cfg['memory.amount']:0;
    // Units only («остаётся по 10 штук»): nothing counts as bought, so no ten (×2) and no dearer price.
    if(amount) for(var i=0;i<unlocked(s,cfg);i++) s.run.tiers[i].amount=N.str(amount);
  }
  function onPrestige(s,id,before,ctx) {
    var cfg=ctx.config,index=IDS.indexOf(id),gain=rawGain(before,id,cfg);
    setCurrency(s,id,N.add(currency(before,id),gain),cfg);
    if(index>=1) {s.layers.compression.count=0;s.run.rhythm.bonus=false;if(id==='fold') s.meta.foldsEarned=N.str(N.add(s.meta.foldsEarned,gain));}
    if(index>=2) {
      s.layers.fold.count=0;
      if(s.meta.collapseTree.foldMemory) setCurrency(s,'fold',cfg['collapse.foldStart']*level(s.meta.collapseTree,'foldMemory'),cfg);
    }
    if(id==='fold') s.meta.foldUnlocked=true;
    if(id==='collapse') {s.meta.foldUnlocked=true;s.meta.collapseUnlocked=true;}
    if(id==='compression') {
      s.meta.totalCompressions=(s.meta.totalCompressions||0)+1;
      s.meta.totalDensity=N.str(N.add(s.meta.totalDensity||0,gain));
      s.run.rhythm.bonus=before.run.rhythm.bonus;
      if(rule(s,4)) s.run.points=N.str(N.max(cfg['start.points'],N.mul(before.run.points,cfg['transition.keepPoints'])));
    }
    seedMemory(s,cfg,id);syncOut(s,cfg);achievements(s,cfg,ctx.now);
  }
  function reset(s,id,ctx) {
    var gain=rawGain(s,id,ctx.config),index=IDS.indexOf(id);
    if(index<0 || N.lt(gain,1)) return false;
    var before=copy(s);
    s.run=freshRun(ctx.config);
    for(var i=0;i<index;i++) s.layers[IDS[i]]=blankLayer();
    var l=layer(s,id);l.count++;l.lastAt=ctx.now;l.best=N.str(N.max(l.best,gain));
    onPrestige(s,id,before,ctx);return true;
  }
  function transition(s,n,ctx) {
    var cfg=ctx.config,id='layer'+n,gain=rawGain(s,id,cfg);
    if(N.lt(gain,1)) return false;
    var old=N.of(currency(s,id));
    s.run=freshRun(cfg);
    for(var i=0;i<3;i++) s.layers[IDS[i]]=blankLayer();
    for(var j=4;j<n;j++) s.layers['layer'+j]=blankLayer();
    var l=layer(s,id);l.count++;l.lastAt=ctx.now;setCurrency(s,id,N.add(old,gain),cfg);
    s.meta.highestLayer=Math.max(s.meta.highestLayer,n);s.meta.challenge=0;
    s.meta.foldTree={};s.meta.collapseTree={};
    s.meta.auto={tiers:[false,false,false,false,false,false,false,false,false],resonance:false,compression:false,fold:false,compressionRatio:cfg['auto.compressionRatio'],foldRatio:cfg['auto.foldRatio']};
    seedMemory(s,cfg,false);syncOut(s,cfg);achievements(s,cfg,ctx.now);return true;
  }
  function buyUpgrade(s,id,cfg,tree) {
    var collapse=tree==='collapse',owned=collapse ? s.meta.collapseTree:s.meta.foldTree;
    var again=repeatable(id,cfg,tree);
    if((owned[id] && !again) || !(collapse ? s.meta.collapseUnlocked:s.meta.foldUnlocked)) return false;
    var price=upgradeCost(s,id,cfg,tree);
    if(price===null || (id==='auto9' && !rule(s,0))) return false;
    var cur=collapse ? 'collapse':'fold';
    if(N.lt(currency(s,cur),price)) return false;
    setCurrency(s,cur,N.sub(currency(s,cur),price),cfg);owned[id]=again ? level(owned,id)+1:true;
    if(/^auto[1-9]$/.test(id)) s.meta.auto.tiers[Number(id.slice(4))-1]=true;
    if(id==='autoResonance') s.meta.auto.resonance=true;
    return true;
  }
  function setAuto(s,id,value,cfg) {
    if(/^tier[1-9]$/.test(id)) {var i=Number(id.slice(4))-1;if(s.meta.foldTree['auto'+(i+1)]) s.meta.auto.tiers[i]=!!value;}
    else if(id==='compressionRatio' || id==='foldRatio') s.meta.auto[id]=Math.max(1,Number(value)||cfg['auto.'+id]);
    else if(id==='resonance' && s.meta.foldTree.autoResonance) s.meta.auto.resonance=!!value;
    else if(id==='compression' && s.meta.foldTree.autoCompression) s.meta.auto.compression=!!value;
    else if(id==='fold' && rule(s,5)) s.meta.auto.fold=!!value;
  }
  function automate(s,ctx) {
    var cfg=ctx.config,a=s.meta.auto,i;
    if(a.resonance && s.meta.foldTree.autoResonance) buyResonance(s,cfg);
    for(i=unlocked(s,cfg)-1;i>=0;i--) if(a.tiers[i] && s.meta.foldTree['auto'+(i+1)]) buy(s,i,'one',cfg);
    if(a.fold && rule(s,5) && N.gte(rawGain(s,'fold',cfg),N.max(1,N.mul(currency(s,'fold'),a.foldRatio)))) reset(s,'fold',ctx);
    else if(a.compression && s.meta.foldTree.autoCompression && N.gte(rawGain(s,'compression',cfg),N.max(1,N.mul(currency(s,'compression'),a.compressionRatio)))) reset(s,'compression',ctx);
  }
  function hasAuto(s) {var a=s.meta.auto;if(a.resonance||a.compression||a.fold)return true;for(var i=0;i<a.tiers.length;i++)if(a.tiers[i])return true;return false;}
  function startChallenge(s,id,ctx) {
    if(!s.meta.collapseUnlocked || id<1 || id>8 || id%1) return false;
    s.run=freshRun(ctx.config);s.layers.compression=blankLayer();s.meta.challenge=id;
    // A challenge is a fresh Folding: spendable folds reset; both purchased trees survive.
    s.layers.fold=blankLayer();seedMemory(s,ctx.config,'challenge');syncOut(s,ctx.config);return true;
  }
  function exitChallenge(s,ctx) {
    if(!s.meta.challenge) return false;
    s.meta.challenge=0;s.run=freshRun(ctx.config);s.layers.compression=blankLayer();seedMemory(s,ctx.config,false);syncOut(s,ctx.config);return true;
  }
  function completeChallenge(s,ctx) {
    var id=s.meta.challenge;
    if(!id || N.lt(s.run.points,ctx.config['fold.threshold'])) return false;
    s.meta.completed[id]=true; s.meta.challenge=0;
    // Completion grants the normal Folding payout, using the just-finished run.
    reset(s,'fold',ctx);return true;
  }
  function achievements(s,cfg,now) {
    var got=s.meta.achievements=s.meta.achievements||{};
    function award(id,yes) {if(yes && !got[id]) got[id]=now||1;}
    award('first-compression',layer(s,'compression').count>0 || s.meta.foldUnlocked);
    award('eight-tiers',unlocked(s,cfg)>=8);
    award('googol',N.gte(s.run.points,cfg['achievement.googol']));
    award('beyond',N.gte(s.run.points,cfg['achievement.edge']));
    award('first-fold',s.meta.foldUnlocked);award('collapse',s.meta.collapseUnlocked);
    var all=true;for(var i=1;i<=8;i++)if(!s.meta.completed[i])all=false;
    award('all-challenges',all);award('order-order',N.gte(s.run.points,cfg['achievement.order']));award('layer-five',s.meta.highestLayer>=5);
  }
  function beginOffline(s,at,cfg) {
    var track=s.meta.offlineTrack;
    if(track && Math.abs(track.end-at)<1) return;
    var amounts=[];
    for(var i=0;i<9;i++) amounts.push(s.run.tiers[i].amount);
    s.meta.offlineTrack={before:s.run.points,density:s.meta.totalDensity||'0e0',count:s.meta.totalCompressions||0,amounts:amounts,end:at};
  }
  function updateOffline(s,end,cfg) {
    var track=s.meta.offlineTrack,best=0,ratio=N.ZERO;
    if(!track) return;
    track.end=end;
    for(var i=0;i<9;i++) {
      var growth=N.div(s.run.tiers[i].amount,N.max(1,track.amounts[i]));
      if(N.gt(growth,ratio)){ratio=growth;best=i;}
    }
    s.meta.offlineSummary={before:track.before,after:s.run.points,compressions:Math.max(0,(s.meta.totalCompressions||0)-track.count),density:N.str(N.max(0,N.sub(s.meta.totalDensity||0,track.density))),tier:best+1,ready:N.gte(rawGain(s,'collapse',cfg),1) ? 'Коллапс':N.gte(rawGain(s,'fold',cfg),1) ? 'Свёртка':''};
  }
  function offlineEvents(s) {
    var report=s.meta.offlineSummary;
    if(!report) return [];
    return ['Очки: '+N.fmt(report.before)+' → '+N.fmt(report.after),'Авто-Сжатий: '+report.compressions+' · Плотность +'+N.fmt(report.density),'Больше всего выросла ступень «'+NAMES[report.tier-1]+'»'+(report.ready ? ' · Готова: '+report.ready:'')];
  }
  function tick(s,dt,ctx) {
    var cfg=ctx.config;
    syncIn(s,cfg);
    if(!(dt>0)) return;
    var end=ctx.now,at=end-dt*1000,remaining=dt,auto=hasAuto(s),r=s.run;
    if(ctx.offline) beginOffline(s,at,cfg); else s.meta.offlineTrack=null;
    while(remaining>0.00000001) {
      r=s.run;
      var step=remaining;
      if(auto) step=Math.min(step,Math.max(0.00000001,cfg['auto.intervalSec']-r.autoPhase));
      if(hasChallenge(s,6)) step=Math.min(step,Math.max(0.00000001,cfg['challenge.decaySec']-r.decayPhase));
      var ends=[r.boostUntil,r.eventBoostUntil,r.mirrorUntil,r.rhythm.until];
      for(var i=0;i<ends.length;i++) if(ends[i]>at && ends[i]<at+step*1000) step=(ends[i]-at)/1000;
      var efficiency=ctx.offline ? (1+(cfg['night.efficiency']-1)*level(s.meta.foldTree,'night'))*(s.meta.completed[6] ? cfg['challenge.offlineMult']:1) : 1;
      produce(s,step,cfg,at,(ctx.mult||1)*efficiency);at+=step*1000;remaining-=step;
      if(hasChallenge(s,6)) {r.decayPhase+=step;if(r.decayPhase+0.00000001>=cfg['challenge.decaySec']) {r.points=N.str(N.div(r.points,cfg['challenge.decayFactor']));r.decayPhase=0;}}
      syncOut(s,cfg);
      if(auto) {r.autoPhase+=step;if(r.autoPhase+0.00000001>=cfg['auto.intervalSec']) {r.autoPhase=0;automate(s,{config:cfg,now:at,rng:ctx.rng,mult:ctx.mult,offline:ctx.offline});}}
      completeChallenge(s,{config:cfg,now:at,rng:ctx.rng,mult:ctx.mult});
    }
    if(!ctx.offline) {
      r=s.run;
      if(r.event && r.event.expires<=end) r.event=null;
      if(!r.nextEventAt) r.nextEventAt=end+(ctx.rng ? ctx.rng.range(cfg['event.minSec'],cfg['event.maxSec']):cfg['event.minSec'])*1000;
      if(end>=r.nextEventAt && !r.event) {r.event={id:ctx.rng ? ctx.rng.int(1,cfg['event.count']||8):1,expires:end+cfg['event.windowSec']*1000,power:r.eventPower};r.eventPower=1;r.nextEventAt=end+(ctx.rng ? ctx.rng.range(cfg['event.minSec'],cfg['event.maxSec']):cfg['event.maxSec'])*1000;}
    } else {s.run.event=null;s.run.nextEventAt=0;}
    syncOut(s,cfg);achievements(s,cfg,end);
    if(ctx.offline) updateOffline(s,end,cfg);
  }
  // Engine-side helper. The screen omits this wrapper so Core.runner can yield between chunks.
  function offline(s,sec,ctx) {
    var cfg=ctx.config,remaining=sec,at=ctx.now-sec*1000;
    s.meta.offlineTrack=null;
    while(remaining>0.00000001) {
      var d=Math.min(cfg['offline.stepSec'],remaining);at+=d*1000;
      tick(s,d,{config:cfg,now:at,rng:ctx.rng,mult:ctx.mult||1,offline:true});remaining-=d;
    }
    return {events:offlineEvents(s)};
  }
  function advanceReward(s,sec,ctx) {produce(s,sec,ctx.config,ctx.now,ctx.mult||1);syncOut(s,ctx.config);achievements(s,ctx.config,ctx.now);}
  function tapEvent(s,choice,ctx) {
    var cfg=ctx.config,e=s.run.event;
    if(!e || e.expires<ctx.now || ctx.offline) return false;
    if(e.id===6 && choice!=='time' && choice!=='density') return false;
    var power=e.power||1;s.run.event=null;
    if(e.id===1) {s.run.eventBoost=cfg['event.burstMult']*power;s.run.eventBoostUntil=ctx.now+cfg['event.burstSec']*1000;}
    if(e.id===2) {
      var cheapest=0;
      for(var i=1;i<unlocked(s,cfg);i++)if(N.lt(cost(s,i,cfg),cost(s,cheapest,cfg)))cheapest=i;
      var n=cfg['tier.batch']*power;
      if(hasChallenge(s,7)) n=Math.min(n,Math.max(0,cfg['challenge.buyLimit']-s.run.totalBought));
      s.run.tiers[cheapest].amount=N.str(N.add(s.run.tiers[cheapest].amount,n));s.run.tiers[cheapest].bought+=n;s.run.totalBought+=n;
    }
    if(e.id===3) advanceReward(s,cfg['event.echoSec']*power,ctx);
    if(e.id===4 && !hasChallenge(s,1)) s.run.resonance+=power;
    if(e.id===5) s.run.eventPower=cfg['event.calmMult']*power;
    if(e.id===6) {if(choice==='time') advanceReward(s,cfg['event.riftSec']*power,ctx);else s.run.densityFactor*=Math.pow(cfg['event.riftDensity'],power);}
    if(e.id===7) s.run.tiers[7].amount=N.str(N.add(s.run.tiers[7].amount,cfg['tier.batch']*power));
    if(e.id===8) s.run.mirrorUntil=ctx.now+cfg['event.mirrorSec']*power*1000;
    syncOut(s,cfg);return true;
  }
  function rhythmTap(s,now,cfg) {
    if(!s.meta.foldTree.rhythm) return false;
    var r=s.run.rhythm;
    if(!r.anchor) {r.anchor=now;r.lastBeat=0;r.combo=1;r.until=now+cfg['rhythm.durationSec']*Math.pow(cfg['transition.rhythmMult'],rule(s,3))*1000;return true;}
    var beat=Math.round((now-r.anchor)/cfg['rhythm.periodMs']);
    var distance=Math.abs(now-r.anchor-beat*cfg['rhythm.periodMs']);
    if(distance>cfg['rhythm.windowMs'] || beat!==r.lastBeat+1) {r.combo=0;r.until=0;r.anchor=now;r.lastBeat=0;return false;}
    r.lastBeat=beat;r.combo++;r.until=now+cfg['rhythm.durationSec']*Math.pow(cfg['transition.rhythmMult'],rule(s,3))*1000;
    if(r.combo>=cfg['rhythm.target'])r.bonus=true;
    return true;
  }
  function boost(s,now,cfg) {s.run.boostUntil=Math.max(now,s.run.boostUntil)+cfg['boost.minutes']*60*1000;return true;}
  function chest(s,rng,cfg) {
    var before=N.of(s.run.points);advanceReward(s,cfg['chest.minutes']*60,{config:cfg,now:s.lastTick||0,mult:1,rng:rng});
    return {title:'Сдвиг пространства',items:[{title:'Очки',amount:engineValue(N.sub(s.run.points,before),cfg)}]};
  }
  function validate(s) {
    function integer(v,min) {return typeof v==='number' && isFinite(v) && v>=min && v%1===0;}
    function resource(v) {return N.valid(v) && N.gte(v,0);}
    if(!s.run || !Array.isArray(s.run.tiers) || s.run.tiers.length!==9)return 'Неверный список ступеней';
    var r=s.run,m=s.meta;
    if(!resource(r.points) || !resource(r.earned))return 'Неверные Очки';
    if(!Big.valid(r.enginePoints) || !Big.valid(r.enginePointsSeen) || Big.lt(r.enginePoints,0) || Big.lt(r.enginePointsSeen,0))return 'Неверный журнал Очков';
    for(var i=0;i<9;i++) {var t=r.tiers[i];if(!t || !resource(t.amount) || !integer(t.bought,0))return 'Неверная ступень '+(i+1);}
    if(!integer(r.resonance,0) || !integer(r.totalBought,0))return 'Неверный счётчик покупок';
    if(!m || !m.foldTree || !m.collapseTree || !m.completed || !m.auto)return 'Нет постоянного прогресса';
    if(!integer(m.highestLayer,3) || !integer(m.challenge,0) || m.challenge>8)return 'Неверный слой или испытание';
    if(!Array.isArray(m.auto.tiers) || m.auto.tiers.length!==9)return 'Неверная автоматизация';
    if(!isFinite(m.auto.compressionRatio) || m.auto.compressionRatio<1 || !isFinite(m.auto.foldRatio) || m.auto.foldRatio<1)return 'Неверный порог автоматизации';
    if(!r.rhythm || !integer(r.rhythm.combo,0) || !isFinite(r.rhythm.anchor) || !isFinite(r.rhythm.until))return 'Неверный Ритм';
    if(r.event && (!integer(r.event.id,1) || r.event.id>8 || !isFinite(r.event.expires)))return 'Неверная флуктуация';
    for(var id in s.layers) {
      var l=s.layers[id];
      if(!l || !resource(l.currency) || !integer(l.count,0) || !l.state)return 'Неверный слой '+id;
      if(l.state.extCurrency!==undefined && !resource(l.state.extCurrency))return 'Неверная валюта слоя '+id;
      if(l.state.engineSeen!==undefined && (!Big.valid(l.state.engineSeen) || Big.lt(l.state.engineSeen,0)))return 'Неверный журнал слоя '+id;
    }
    syncIn(s,null);
    return null;
  }
  function migrate(s) {return s;}
  function summary(s,cfg) {
    var depth=s.meta.highestLayer>3 ? s.meta.highestLayer : s.meta.collapseUnlocked ? 3 : s.meta.foldUnlocked ? 2 : layer(s,'compression').count ? 1 : 0;
    return {line:N.fmt(s.run.points)+' Очков · '+N.fmt(income(s,cfg,s.lastTick||0))+'/с · слой '+depth};
  }
  function next(s,now,cfg) {
    var out=[],titles=['Доступно Сжатие','Доступна Свёртка','Доступен Коллапс'];
    for(var i=IDS.length-1;i>=0;i--) if(N.gte(rawGain(s,IDS[i],cfg),1)) out.push({id:IDS[i],at:now+1000,text:titles[i]});
    return out;
  }
  return {init:init,tick:tick,offline:offline,offlineEvents:offlineEvents,prestigeGain:prestigeGain,rawGain:rawGain,onPrestige:onPrestige,bonus:bonus,reset:reset,transition:transition,currency:currency,setCurrency:setCurrency,unlocked:unlocked,rule:rule,buy:buy,buyAll:buyAll,buyResonance:buyResonance,cost:cost,resonanceCost:resonanceCost,multiplier:multiplier,income:income,buyUpgrade:buyUpgrade,upgradeLevel:upgradeLevel,upgradeCost:upgradeCost,repeatable:repeatable,setAuto:setAuto,startChallenge:startChallenge,exitChallenge:exitChallenge,completeChallenge:completeChallenge,tapEvent:tapEvent,rhythmTap:rhythmTap,boost:boost,chest:chest,validate:validate,migrate:migrate,summary:summary,next:next,advanceReward:advanceReward,syncOut:syncOut,NAMES:NAMES};
});
