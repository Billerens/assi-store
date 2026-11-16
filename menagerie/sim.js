(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/rng.js'), require('./combat.js')) : make(root.Big, root.Rng, root.Combat);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Rng, Combat) {
  'use strict';
  var LAYER = 'expedition';
  var UPGRADES = ['nest','aviary','bedding','feed','training','vet','book','pedigree','selection','luck','catcher','arena','banners','bench','tactician','coach','incubator','chronicle','double','keeper'];
  var TRAITS = ['tireless','trickster','longlife','fertile','albino','glow','leader','stubborn','keen','resilient','vigorous'];
  var LEAGUES = ['Ярмарка','Уездный турнир','Губернские игры','Столичная арена','Большой круг','Лига древних'];
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function round(x) { return Math.round(x * 1000000) / 1000000; }
  function up(s, id) { return s.run.upgrades[id] || 0; }
  function has(b, id) { return b.traits.indexOf(id) >= 0; }
  function fail(reason) { return {ok:false, reason:reason}; }
  function find(s, id) { for (var i=0;i<s.run.beasts.length;i++) if (s.run.beasts[i].id===id) return s.run.beasts[i]; return null; }
  function mean(b) { return (b.genes[0]+b.genes[1]+b.genes[2]+b.genes[3])/4; }
  function capacity(s,cfg) { return Math.min(cfg['capacity.max'], cfg['capacity.base']+up(s,'aviary')*cfg['capacity.perUpgrade']); }
  function nests(s,cfg) { return Math.min(cfg['nests.max'],cfg['nests.base']+up(s,'nest')); }
  function occupiedNests(s) { var ids={}; s.run.eggs.forEach(function(e){if(e.nest)ids[e.nest]=true;}); return Object.keys(ids).length; }
  function cap(s,cfg) {
    var points=s.meta.genePool||0;
    var early=(cfg['genes.softCap']-cfg['genes.baseCap'])*cfg['genes.pointsPerCap'];
    return cfg['genes.baseCap']+Math.floor(Math.min(points,early)/cfg['genes.pointsPerCap'])+Math.floor(Math.max(0,points-early)/cfg['genes.latePointsPerCap']);
  }
  function legacy(s,cfg) { return Math.floor((s.meta.genePool||0)/cfg['genes.pointsPerCap'])*cfg['genes.legacyPerTen']; }
  function coinBonus(s,cfg) { return 1+Math.floor((s.meta.genePool||0)/cfg['genes.pointsPerCap'])*cfg['genes.coinPerTen']; }
  function sigma(s,cfg) { return Math.max(cfg['genes.sigmaMin'],cfg['genes.sigma']-up(s,'selection')*cfg['upgrade.selection.effect']); }
  function availableSpecies(s,cfg) {
    var continent=s.meta.continent||1;
    var count=continent>1 ? cfg['world.baseSpecies']+(continent-1)*cfg['world.newSpecies'] : Math.min(cfg['world.baseSpecies'],cfg['world.initialSpecies']+Math.floor(s.run.league/cfg['world.baseSpeciesLeagueStep']));
    var out=[];for(var i=0;i<count;i++)out.push(i);return out;
  }
  function nextId(s) { s.meta.serial=(s.meta.serial||0)+1;return 'beast-'+s.meta.serial; }
  function visible(a,b,part,cfg,rng) { var da=cfg['dominance.'+a+'.'+part];var db=cfg['dominance.'+b+'.'+part];return da===db?(rng.chance(0.5)?a:b):(da>db?a:b); }
  function record(s,b) {
    s.meta.archive[b.id]=clone(b);
    for(var p=0;p<5;p++)s.meta.album.parts[b.parts[p].visible+'-'+p]=true;
    s.meta.album.colors[b.colors[0]]=true;s.meta.album.colors[b.colors[1]]=true;
    s.meta.album.pairs[Math.min(b.colors[0],b.colors[1])+'-'+Math.max(b.colors[0],b.colors[1])]=true;
    b.traits.forEach(function(t){s.meta.album.traits[t]=true;});
    var key=String(b.generation);var row=s.meta.generations[key];
    if(!row)row=s.meta.generations[key]={count:0,sums:[0,0,0,0]};
    row.count++;for(var q=0;q<4;q++)row.sums[q]+=b.genes[q];
    s.meta.maxGeneration=Math.max(s.meta.maxGeneration||0,b.generation);
    s.meta.maxPotential=Math.max(s.meta.maxPotential||0,Math.max.apply(null,b.genes));
  }
  function baseBeast(s,species,ctx,starter) {
    var cfg=ctx.config;var rng=ctx.rng;var id=nextId(s);var parts=[];var genes=[];
    for(var p=0;p<5;p++)parts.push({a:species,b:species,visible:species});
    for(var q=0;q<4;q++)genes.push(round(Math.min(cap(s,cfg),rng.range(cfg[starter?'start.geneMin':'wild.geneMin'],cfg[starter?'start.geneMax':'wild.geneMax'])+legacy(s,cfg))));
    return {id:id,name:'Зверь '+s.meta.serial,level:cfg[starter?'start.level':'wild.level'],xp:0,genes:genes,parts:parts,colors:[rng.int(12),rng.int(12)],traits:[],generation:1,parents:[],fights:0,eggs:0,restUntil:0,readyAt:0,sick:false,bornAt:ctx.now};
  }
  function newWild(s,ctx,novel) {
    var cfg=ctx.config;var pool=availableSpecies(s,cfg);var missing=[];
    if(novel)for(var i=0;i<pool.length;i++)for(var p=0;p<5;p++)if(!s.meta.album.parts[pool[i]+'-'+p])missing.push({species:pool[i],part:p});
    var chosen=missing.length?ctx.rng.pick(missing):{species:ctx.rng.pick(pool),part:0};
    var b=baseBeast(s,chosen.species,ctx,false);
    if(ctx.rng.chance(cfg['trait.newChance']))b.traits=[ctx.rng.pick(TRAITS.slice(0,s.meta.continent>=3?TRAITS.length:cfg['trait.baseCount']))];
    return b;
  }
  function init(ctx) {
    var s={run:{coins:Big.str(ctx.config['start.coins']),earned:'0',beasts:[],eggs:[],upgrades:{},team:[],founders:[],league:0,step:0,streak:0,lastBattle:null,battles:[],event:null,fairUntil:0,strongNext:false,wildAt:ctx.now,eventAt:ctx.now+ctx.config['event.intervalMinSec']*1000,now:ctx.now,news:[]},layers:{},meta:{genePool:0,continent:1,serial:0,album:{parts:{},colors:{},pairs:{},traits:{}},archive:{},generations:{},trophies:[],retired:[],maxGeneration:0,maxPotential:0,soloWin:false}};
    for(var i=0;i<ctx.config['start.beasts'];i++) { var b=baseBeast(s,i%ctx.config['world.initialSpecies'],ctx,true);s.run.beasts.push(b);record(s,b);if(i<3)s.run.team.push(b.id); }
    s.run.founders=s.run.team.slice();return s;
  }
  function cost(s,id,cfg) { if(UPGRADES.indexOf(id)<0)return Big.ZERO;return Big.ceil(Big.costGeom(cfg['upgrade.'+id+'.cost'],cfg['upgrade.'+id+'.growth'],up(s,id),1)); }
  function buy(s,id,cfg) {
    if(UPGRADES.indexOf(id)<0||up(s,id)>=cfg['upgrade.'+id+'.max'])return false;
    var price=cost(s,id,cfg);if(Big.lt(s.run.coins,price))return false;
    s.run.coins=Big.sub(s.run.coins,price);s.run.upgrades[id]=up(s,id)+1;
    if(id==='vet')s.run.beasts.forEach(function(b){b.sick=false;});return true;
  }
  function xpNeed(level,cfg) { return cfg['xp.base']*Math.pow(cfg['xp.growth'],level); }
  function addXp(b,amount,cfg) {
    if(b.level>=cfg['xp.maxLevel']) {b.xp=0;return 0;}
    var before=b.level;b.xp+=amount;
    while(b.level<cfg['xp.maxLevel']&&b.xp+1e-8>=xpNeed(b.level,cfg)){b.xp=Math.max(0,b.xp-xpNeed(b.level,cfg));b.level++;}
    if(b.level>=cfg['xp.maxLevel'])b.xp=0;return b.level-before;
  }
  function noise(rng,n) {var total=0;for(var i=0;i<n;i++)total+=rng.next();return (total-n/2)*Math.sqrt(12/n);}
  function offspring(s,a,b,ctx,forceBreak) {
    var cfg=ctx.config;var rng=ctx.rng;var child=baseBeast(s,0,ctx,false);
    child.level=1;child.generation=Math.max(a.generation,b.generation)+1;child.parents=[a.id,b.id];child.traits=[];
    for(var p=0;p<5;p++) {var aa=rng.chance(0.5)?a.parts[p].a:a.parts[p].b;var bb=rng.chance(0.5)?b.parts[p].a:b.parts[p].b;child.parts[p]={a:aa,b:bb,visible:visible(aa,bb,p,cfg,rng)};}
    child.colors=[rng.pick(a.colors),rng.pick(b.colors)];
    for(var q=0;q<4;q++)child.genes[q]=round(clamp((a.genes[q]+b.genes[q])/2+noise(rng,cfg['genes.noiseSamples'])*sigma(s,cfg)+legacy(s,cfg),0,cap(s,cfg)));
    child.breakthrough=!!forceBreak||rng.chance(Math.min(1,cfg['genes.breakChance']+up(s,'luck')*cfg['upgrade.luck.effect']));
    if(child.breakthrough){var target=rng.int(4);child.genes[target]=Math.min(cap(s,cfg),child.genes[target]+cfg['genes.breakAmount']);}
    var permitted=TRAITS.slice(0,s.meta.continent>=3?TRAITS.length:cfg['trait.baseCount']);
    permitted.forEach(function(t){var count=(has(a,t)?1:0)+(has(b,t)?1:0);if(count&&rng.chance(cfg[count===2?'trait.twoParents':'trait.oneParent']))child.traits.push(t);});
    if(rng.chance(cfg['trait.newChance'])){var choices=permitted.filter(function(t){return !has(child,t);});if(choices.length)child.traits.push(rng.pick(choices));}
    return child;
  }
  function incubation(s,generation,cfg) {return Math.min(cfg['breed.maxDurationSec'],cfg['breed.durationSec']*Math.pow(cfg['breed.generationGrowth'],generation/cfg['breed.generationDivisor']))*Math.max(cfg['breed.minDurationFactor'],1-up(s,'bedding')*cfg['upgrade.bedding.effect']);}
  function breed(s,aId,bId,ctx) {
    var cfg=ctx.config;var a=find(s,aId);var b=find(s,bId);
    if(!a||!b||a.id===b.id)return fail('Выберите двух разных зверей');
    if(a.level<cfg['breed.adultLevel']||b.level<cfg['breed.adultLevel'])return fail('Родители должны дорасти до уровня '+cfg['breed.adultLevel']);
    if(a.restUntil>ctx.now||b.restUntil>ctx.now)return fail('Родители ещё отдыхают');
    if(a.eggs>=cfg['breed.maxEggs']||b.eggs>=cfg['breed.maxEggs'])return fail('Исчерпан запас яиц родителей');
    if(occupiedNests(s)>=nests(s,cfg))return fail('Все гнёзда заняты');
    var free=capacity(s,cfg)-s.run.beasts.length-s.run.eggs.length;
    if(free<1)return fail('Нужны места для будущего помёта');
    var double=has(a,'fertile')||has(b,'fertile')||ctx.rng.chance(Math.min(1,up(s,'double')*cfg['breed.doubleChance']));
    var count=Math.min(double?2:1,cfg['breed.maxEggs']-a.eggs,cfg['breed.maxEggs']-b.eggs,free);
    var nest='nest-'+(s.meta.serial+1);var ids=[];
    for(var i=0;i<count;i++) {var child=offspring(s,a,b,ctx,i===0&&s.run.strongNext);var duration=incubation(s,child.generation,cfg);s.run.eggs.push({id:'egg-'+child.id,beast:child,remaining:duration,duration:duration,nest:nest});ids.push(child.id);}
    s.run.strongNext=false;a.eggs+=count;b.eggs+=count;
    a.restUntil=ctx.now+Math.max(cfg['breed.minRestSec'],cfg['breed.restSec']-up(s,'vet')*cfg['upgrade.vet.effect'])*1000;b.restUntil=a.restUntil;
    s.meta.archive[a.id]=clone(a);s.meta.archive[b.id]=clone(b);
    return {ok:true,eggs:count,ids:ids};
  }
  function forecast(s,aId,bId,cfg) {
    var a=typeof aId==='string'?find(s,aId):aId;var b=typeof bId==='string'?find(s,bId):bId;
    if(!a||!b||!up(s,'book'))return null;
    var ranges=[];var parts=[];var spread=sigma(s,cfg)*2;
    for(var q=0;q<4;q++){var midpoint=(a.genes[q]+b.genes[q])/2+legacy(s,cfg);ranges.push([clamp(round(midpoint-spread),0,cap(s,cfg)),clamp(round(midpoint+spread),0,cap(s,cfg))]);}
    for(var p=0;p<5;p++){var probs={};var aa=[a.parts[p].a,a.parts[p].b];var bb=[b.parts[p].a,b.parts[p].b];for(var i=0;i<2;i++)for(var j=0;j<2;j++){var da=cfg['dominance.'+aa[i]+'.'+p];var db=cfg['dominance.'+bb[j]+'.'+p];if(da===db){probs[aa[i]]=(probs[aa[i]]||0)+0.125;probs[bb[j]]=(probs[bb[j]]||0)+0.125;}else{var id=da>db?aa[i]:bb[j];probs[id]=(probs[id]||0)+0.25;}}parts.push(probs);}
    return {ranges:ranges,parts:parts,confidence:0.95,breakChance:Math.min(1,cfg['genes.breakChance']+up(s,'luck')*cfg['upgrade.luck.effect']),breakAmount:cfg['genes.breakAmount']};
  }
  function advance(s,sec,ctx,offline) {
    var cfg=ctx.config;var events=[];var rate=offline&&!up(s,'incubator')?cfg['breed.offlineRate']:1;var training=up(s,'training')*cfg['xp.trainingHourly']/3600;
    var start=ctx.now-sec*1000;var ready=0;
    s.run.beasts.forEach(function(b){if(b.readyAt>start&&b.readyAt<=ctx.now)ready++;var raised=addXp(b,training*sec,cfg);if(raised)events.push(b.name+': уровень '+b.level);});
    for(var i=0;i<s.run.eggs.length;){var e=s.run.eggs[i];var old=e.remaining;e.remaining=Math.max(0,e.remaining-sec*rate);if(e.remaining<=1e-7&&s.run.beasts.length<capacity(s,cfg)){var young=e.beast;var after=Math.max(0,sec-old/rate);young.bornAt=ctx.now-after*1000;var grown=addXp(young,training*after,cfg);s.run.beasts.push(young);record(s,young);s.run.eggs.splice(i,1);events.push('Вылупился '+young.name+' · '+young.genes.map(function(v){return Math.round(v);}).join(' / ')+(grown?' · уровень '+young.level:''));}else i++;}
    if(ready)events.push('Готовы к бою: '+ready);
    s.run.now=ctx.now;
    if(!offline&&ctx.now>=s.run.eventAt&&!s.run.event)triggerEvent(s,ctx);
    return events;
  }
  function tick(s,dt,ctx) {advance(s,Math.max(0,dt),ctx,!!ctx.offline);}
  function offline(s,sec,ctx) {return {events:advance(s,Math.max(0,sec),ctx,true)};}
  function retirementLimit(b,s,cfg) {return cfg['fight.retireAt']+up(s,'coach')*cfg['fight.coachExtra']+(has(b,'longlife')?cfg['fight.longlifeExtra']:0);}
  function retirementGain(b,s,cfg) {return b.rescued?0:(Math.pow(mean(b)/cfg['pool.divisor'],cfg['pool.power'])+b.generation/cfg['pool.generationDivisor'])*(1+up(s,'keeper')*cfg['upgrade.keeper.effect']);}
  function removeBeast(s,b) {s.meta.archive[b.id]=clone(b);s.run.beasts=s.run.beasts.filter(function(x){return x.id!==b.id;});s.run.team=s.run.team.filter(function(id){return id!==b.id;});s.run.founders=s.run.founders.filter(function(id){return id!==b.id;});}
  function retire(s,id,ctx) {var b=find(s,id);if(!b)return fail('Зверь уже покинул вольер');var gain=retirementGain(b,s,ctx.config);removeBeast(s,b);s.meta.genePool+=gain;s.meta.retired.push(id);return {ok:true,gain:gain};}
  function setTeam(s,ids,cfg) {var unique=[];for(var i=0;i<ids.length;i++)if(find(s,ids[i])&&unique.indexOf(ids[i])<0)unique.push(ids[i]);if(!unique.length||unique.length>3+up(s,'bench'))return false;s.run.team=unique;return true;}
  function selectFounders(s,ids) {if(!Array.isArray(ids)||ids.length>3)return false;var unique=[];for(var i=0;i<ids.length;i++){if(!find(s,ids[i])||unique.indexOf(ids[i])>=0)return false;unique.push(ids[i]);}s.run.founders=unique;return true;}
  function enemies(s,seed,ctx) {
    var cfg=ctx.config;var rng=Rng.make(seed).fork('opponents');var out=[];var scratch={meta:{serial:0,genePool:0},run:{league:s.run.league}};var pool=availableSpecies(s,cfg);
    for(var i=0;i<3;i++){var b=baseBeast(scratch,rng.pick(pool),{rng:rng,config:cfg,now:ctx.now},false);b.id='enemy-'+i;b.name='Соперник '+(i+1);b.level=Math.min(cfg['xp.maxLevel'],cfg['fight.enemyLevelBase']+s.run.league*cfg['fight.enemyLevelLeague']);for(var q=0;q<4;q++)b.genes[q]=Math.max(1,round(cfg['fight.enemyGeneBase']+s.run.league*cfg['fight.enemyGeneLeague']+s.run.step*cfg['fight.enemyGeneStep']+rng.range(-cfg['fight.enemySpread'],cfg['fight.enemySpread'])));out.push(b);}return out;
  }
  function fight(s,ctx,training) {
    var cfg=ctx.config;if(training&&!up(s,'arena'))return fail('Нужна арена во дворе');
    var team=[];var blocked=[];for(var i=0;i<s.run.team.length;i++){var b=find(s,s.run.team[i]);if(!b)continue;if(!training&&b.readyAt>ctx.now)continue;if(!training&&b.sick&&!up(s,'vet')){b.sick=false;b.readyAt=ctx.now+cfg['fight.cooldownSec']*1000;blocked.push(b.name);continue;}if(!training)b.sick=false;team.push(b);}
    if(!team.length)return fail(blocked.length?'Хворь: '+blocked.join(', ')+' пропускает бой':'Выберите готовых зверей в команду');
    var seed=ctx.rng.int(0,2147483647);var foe=enemies(s,seed,ctx);var snapshot=clone(team);var settings={};Object.keys(cfg).forEach(function(key){if(key.indexOf('combat.')===0)settings[key]=cfg[key];});
    var result=Combat.fight(snapshot,foe,seed,settings,{tactician:!!up(s,'tactician')});var reward=Big.ZERO;var xp=0;
    var participants=team.filter(function(member,index){return index<cfg['combat.teamSize']||result.log.some(function(row){return row.kind==='enter'&&row.target===member.id;});});
    if(!training){
      var base=cfg['coins.win']*Math.pow(cfg['coins.leagueGrowth'],s.run.league)*(1+s.run.step/cfg['coins.stepDivisor']);
      reward=Big.mul(base*(result.win?(1+up(s,'banners')*cfg['upgrade.banners.effect']):cfg['coins.lossFactor']),coinBonus(s,cfg)*(s.run.fairUntil>ctx.now?cfg['event.fairMult']:1));
      s.run.coins=Big.add(s.run.coins,reward);s.run.earned=Big.add(s.run.earned,reward);
      xp=cfg[result.win?'xp.win':'xp.loss']*(1+up(s,'feed')*cfg['upgrade.feed.effect']);
      participants.forEach(function(member){member.fights++;member.readyAt=ctx.now+cfg['fight.cooldownSec']*(has(member,'tireless')?cfg['fight.tirelessFactor']:1)*1000;addXp(member,xp,cfg);s.meta.archive[member.id]=clone(member);});
      s.run.streak=result.win?Math.max(0,s.run.streak)+1:Math.min(0,s.run.streak)-1;
      if(s.run.streak>=cfg['league.streak']){s.run.streak=0;if(s.run.step<cfg['league.steps']-1)s.run.step++;else if(s.run.league<cfg['league.count']-1){s.run.step=0;s.run.league++;if(s.meta.trophies.indexOf(s.run.league)<0)s.meta.trophies.push(s.run.league);}}
      if(s.run.streak<=-cfg['league.streak']){s.run.streak=0;if(s.run.step>0)s.run.step--;else if(s.run.league>0){s.run.league--;s.run.step=cfg['league.steps']-1;}}
      if(result.win&&team.length===1)s.meta.soloWin=true;
      participants.forEach(function(member){if(member.fights>=retirementLimit(member,s,cfg))retire(s,member.id,ctx);});
    }
    var battle={seed:seed,at:ctx.now,team:snapshot,enemies:clone(foe),result:result,win:result.win,rounds:result.rounds,log:result.log,training:!!training,coins:Big.str(reward),xp:xp,config:settings,tactician:!!up(s,'tactician'),skipped:blocked};
    s.run.lastBattle=battle;s.run.battles.push({seed:seed,win:result.win,at:ctx.now,training:!!training});while(s.run.battles.length>cfg['history.battles'])s.run.battles.shift();return {ok:true,battle:battle};
  }
  function replay(s,cfg) {var b=s.run.lastBattle;if(!b)return null;return Combat.fight(b.team,b.enemies,b.seed,b.config||cfg,{tactician:b.tactician});}
  function triggerEvent(s,ctx,id) {
    var cfg=ctx.config;var kind=id||ctx.rng.pick(['circus','guest','fair','illness','strong']);var event={id:kind,taps:0,at:ctx.now};
    if(kind==='guest')event.beast=newWild(s,ctx,true);
    if(kind==='fair')s.run.fairUntil=ctx.now+cfg['event.fairSec']*1000;
    if(kind==='strong')s.run.strongNext=true;
    if(kind==='illness'&&s.run.beasts.length){var victim=ctx.rng.pick(s.run.beasts);victim.sick=!up(s,'vet');event.beastId=victim.id;event.cured=!!up(s,'vet');}
    s.run.event=event;s.run.eventAt=ctx.now+ctx.rng.range(cfg['event.intervalMinSec'],cfg['event.intervalMaxSec'])*1000;return event;
  }
  function eventAction(s,action,id,ctx) {
    var e=s.run.event;if(!e)return fail('Событие уже завершено');var cfg=ctx.config;
    if(action==='dismiss'){s.run.event=null;return {ok:true};}
    if(action==='tame'&&e.id==='guest'){if(s.run.beasts.length+s.run.eggs.length>=capacity(s,cfg))return fail('Освободите место в вольере');e.taps++;if(e.taps>=cfg['event.guestTaps']){s.run.beasts.push(e.beast);record(s,e.beast);s.run.event=null;}return {ok:true};}
    if(action==='sell'&&e.id==='circus'){var b=find(s,id);if(!b)return fail('Выберите зверя');var price=mean(b)*cfg['event.salePerGene']*cfg['event.circusMult'];removeBeast(s,b);s.run.coins=Big.add(s.run.coins,price);s.run.earned=Big.add(s.run.earned,price);s.run.event=null;return {ok:true,coins:price};}
    return fail('Это действие недоступно');
  }
  function catchWild(s,ctx) {
    var rescue=s.run.beasts.length<2&&!s.run.eggs.length;var cfg=ctx.config;
    if(!rescue&&!up(s,'catcher'))return fail('Нужен ловчий');
    if(!rescue&&s.run.wildAt>ctx.now)return fail('Ловчий вернётся завтра');
    if(s.run.beasts.length+s.run.eggs.length>=capacity(s,cfg))return fail('В вольере нет места');
    var b=newWild(s,ctx,true);if(rescue)b.rescued=true;s.run.beasts.push(b);record(s,b);s.run.wildAt=ctx.now+cfg['wild.cooldownSec']*1000;return {ok:true,beast:b};
  }
  function chest(s,rng,cfg) {
    var now=s.run.now||s.lastTick||0;var b=newWild(s,{now:now,config:cfg,rng:rng},true);b.level=1;var duration=incubation(s,b.generation,cfg);
    s.run.eggs.push({id:'egg-'+b.id,beast:b,remaining:duration,duration:duration,nest:null,wild:true});return {title:'Яйцо дикого зверя',items:[{title:'Яйцо с новым доступным аллелем',amount:1}]};
  }
  function walk(s,ctx) {var count=0;s.run.team.forEach(function(id){var b=find(s,id);if(b){addXp(b,ctx.config['xp.walk'],ctx.config);count++;}});return {ok:count>0,count:count};}
  function rest(s,id,ctx) {var b=find(s,id);if(!b||b.restUntil<=ctx.now)return fail('Зверь уже отдохнул');b.restUntil=ctx.now;return {ok:true};}
  function prestigeGain(s,id,cfg) {return id===LAYER&&s.meta.continent<cfg['expedition.maxContinent']&&s.meta.genePool>=cfg['expedition.threshold']*s.meta.continent&&s.run.founders.length===cfg['expedition.founders']&&s.run.founders.every(function(b){return !!find(s,b);})?Big.ONE:Big.ZERO;}
  function bonus(s,id,amount,cfg) {return Big.add(1,amount);}
  function onPrestige(s,id,before,ctx) {
    if(id!==LAYER)return;
    s.meta.continent=Math.min(ctx.config['expedition.maxContinent'],before.meta.continent+1);
    s.run.beasts=before.run.founders.map(function(b){return clone(find(before,b));});
    s.run.team=s.run.beasts.map(function(b){return b.id;});s.run.founders=s.run.team.slice();
    s.run.beasts.forEach(function(b){b.readyAt=ctx.now;b.restUntil=ctx.now;b.sick=false;});
  }
  function ancestry(s,id,depth) {var b=find(s,id)||s.meta.archive[id];if(!b)return {beast:null,parents:[],missing:true};return {beast:clone(b),parents:depth>0?b.parents.map(function(p){return ancestry(s,p,depth-1);}):[]};}
  function stats(s,cfg) {return {beasts:s.run.beasts.length,eggs:s.run.eggs.length,capacity:capacity(s,cfg),nests:nests(s,cfg),cap:cap(s,cfg),legacy:legacy(s,cfg),genePool:s.meta.genePool,league:s.run.league,step:s.run.step,coinBonus:coinBonus(s,cfg)};}
  function achievementIds(s,cfg) {var ids=[];if(s.meta.maxGeneration>=cfg['achievement.generation'])ids.push('generation-ten');if(s.meta.maxPotential>=cfg['achievement.potential'])ids.push('potential-hundred');if(s.run.league===cfg['league.count']-1||s.meta.trophies.indexOf(cfg['league.count']-1)>=0)ids.push('ancient-league');var complete=true;for(var p=0;p<5;p++)if(!s.meta.album.parts['0-'+p])complete=false;if(complete)ids.push('mohorog-parts');if(s.meta.soloWin)ids.push('solo-win');return ids;}
  function summary(s,cfg) {return {line:'Зверей '+s.run.beasts.length+' · '+LEAGUES[s.run.league]+' '+(s.run.step+1)+' · генофонд '+Math.floor(s.meta.genePool)};}
  function next(s,now,cfg) {var out=[];var rate=up(s,'incubator')?1:cfg['breed.offlineRate'];var remaining=null;s.run.eggs.forEach(function(e){if(e.remaining>0&&(remaining===null||e.remaining<remaining))remaining=e.remaining;});if(remaining!==null)out.push({id:'hatch',at:now+remaining/rate*1000,text:'В гнезде вылупится зверь'});var ready=null;s.run.team.forEach(function(id){var b=find(s,id);if(b&&b.readyAt>now&&(ready===null||b.readyAt<ready))ready=b.readyAt;});if(ready!==null)out.push({id:'ready',at:ready,text:'Зверь снова готов к турниру'});return out;}
  function validate(s) {
    function integer(v,min,max) {return typeof v==='number'&&isFinite(v)&&v%1===0&&v>=min&&(max===undefined||v<=max);}
    function finite(v,min) {return typeof v==='number'&&isFinite(v)&&v>=min;}
    function object(v) {return v&&typeof v==='object'&&!Array.isArray(v);}
    if(!s||!object(s.run)||!object(s.meta))return 'Нет данных игры';
    var r=s.run;var m=s.meta;
    if(!Big.valid(r.coins)||Big.sign(r.coins)<0||!Big.valid(r.earned)||Big.sign(r.earned)<0)return 'Неверные монеты';
    if(!finite(m.genePool,0))return 'Неверный генофонд';
    if(!integer(m.continent,1,3)||!integer(m.serial,0))return 'Неверный материк';
    if(!object(m.album)||!object(m.album.parts)||!object(m.album.colors)||!object(m.album.pairs)||!object(m.album.traits)||!object(m.archive)||!object(m.generations)||!Array.isArray(m.trophies)||!Array.isArray(m.retired))return 'Повреждён архив';
    if(!Array.isArray(r.beasts)||!Array.isArray(r.eggs)||!object(r.upgrades)||!Array.isArray(r.team)||!Array.isArray(r.founders))return 'Повреждён вольер';
    if(!integer(r.league,0,5)||!integer(r.step,0,9)||!integer(r.streak,-2,2))return 'Неверная лига';
    if(!finite(r.fairUntil,0)||!finite(r.wildAt,0)||!finite(r.eventAt,0)||!finite(r.now,0))return 'Неверные часы';
    for(var upgrade in r.upgrades)if(UPGRADES.indexOf(upgrade)<0||!integer(r.upgrades[upgrade],0))return 'Неверное улучшение';
    var ids={};var creatures=r.beasts.slice();
    for(var e=0;e<r.eggs.length;e++){var egg=r.eggs[e];if(!egg||typeof egg.id!=='string'||!finite(egg.remaining,0)||!finite(egg.duration,0)||egg.remaining>egg.duration)return 'Неверное яйцо';creatures.push(egg.beast);}
    for(var i=0;i<creatures.length;i++){
      var beast=creatures[i];
      if(!beast||typeof beast.id!=='string'||!beast.id||ids[beast.id])return 'Повтор зверя';ids[beast.id]=true;
      if(typeof beast.name!=='string'||!Array.isArray(beast.genes)||beast.genes.length!==4||!Array.isArray(beast.parts)||beast.parts.length!==5||!Array.isArray(beast.colors)||beast.colors.length!==2||!Array.isArray(beast.traits)||!Array.isArray(beast.parents))return 'Повреждены гены';
      for(var q=0;q<4;q++)if(!finite(beast.genes[q],0))return 'Неверное качество';
      for(var p=0;p<5;p++){var gene=beast.parts[p];if(!gene||!integer(gene.a,0,13)||!integer(gene.b,0,13)||!integer(gene.visible,0,13))return 'Неверный аллель';if(gene.visible!==gene.a&&gene.visible!==gene.b)return 'Часть не из аллелей';}
      for(var c=0;c<2;c++)if(!integer(beast.colors[c],0,11))return 'Неверный окрас';
      var traits={};for(var trait=0;trait<beast.traits.length;trait++){var tid=beast.traits[trait];if(TRAITS.indexOf(tid)<0||traits[tid])return 'Неверная черта';traits[tid]=true;}
      if(!integer(beast.level,1)||!finite(beast.xp,0)||!integer(beast.eggs,0)||!integer(beast.fights,0)||!integer(beast.generation,1)||!finite(beast.readyAt,0)||!finite(beast.restUntil,0)||typeof beast.sick!=='boolean')return 'Неверный возраст';
    }
    var selections=[r.team,r.founders];
    for(var k=0;k<selections.length;k++){var unique={};if(selections[k].length>(k===0?4:3))return 'Слишком большая команда';for(var j=0;j<selections[k].length;j++){var bid=selections[k][j];if(!find(s,bid)||unique[bid])return 'Неверная команда';unique[bid]=true;}}
    if(r.event&&['circus','guest','fair','illness','strong'].indexOf(r.event.id)<0)return 'Неверное событие';
    return null;
  }
  function migrate(s,fromVer) {return s;}
  function procedural(kind,rng) {
    if(kind==='names')return {title:rng.pick(['Кедрик','Шорох','Пятныш','Листик','Север','Орешек']),text:'Имя из полевой книги заводчика.'};
    if(kind==='species')return {title:'Полевой дневник',text:'В новых землях встречаются незнакомые очертания и окрасы. Сравнивайте части в альбоме.'};
    return {title:'Вести ярмарки',text:'Заводчики обсуждают родословные и готовят новых участников к следующему турниру.'};
  }
  function validateStock(kind,item) {if(['names','species','news'].indexOf(kind)<0)return 'Неизвестный запас';if(!item||typeof item.title!=='string'||typeof item.text!=='string'||item.title.length<2||item.title.length>40||item.text.length<8||item.text.length>160)return 'Неверный текст';if(/:\/\/|[<>]/.test(item.title+item.text))return 'Недопустимая разметка';return null;}
  return {LAYER:LAYER,UPGRADES:UPGRADES,TRAITS:TRAITS,LEAGUES:LEAGUES,combat:Combat,init:init,tick:tick,offline:offline,cost:cost,buy:buy,capacity:capacity,nests:nests,occupiedNests:occupiedNests,cap:cap,legacy:legacy,coinBonus:coinBonus,sigma:sigma,find:find,mean:mean,xpNeed:xpNeed,addXp:addXp,availableSpecies:availableSpecies,newWild:newWild,offspring:offspring,incubation:incubation,breed:breed,forecast:forecast,retirementLimit:retirementLimit,retirementGain:retirementGain,retire:retire,setTeam:setTeam,selectFounders:selectFounders,fight:fight,replay:replay,triggerEvent:triggerEvent,eventAction:eventAction,catchWild:catchWild,chest:chest,walk:walk,rest:rest,prestigeGain:prestigeGain,bonus:bonus,onPrestige:onPrestige,ancestry:ancestry,stats:stats,achievementIds:achievementIds,summary:summary,next:next,validate:validate,migrate:migrate,procedural:procedural,validateStock:validateStock};
});
