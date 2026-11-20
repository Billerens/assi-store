// The hub and the flight deck share these rules. No real-time or background income.
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; }
  else root.GameSim = api;
})(this, function () {
  'use strict';

  var ports = [
    { name: 'Vesper', color: '#eb9a72', sky: '#241a36', prices: [12, 38, 29], radius: 19 },
    { name: 'Pelagos', color: '#64d5d4', sky: '#0d2539', prices: [29, 16, 42], radius: 25 },
    { name: 'Oriole', color: '#debd6d', sky: '#24203a', prices: [36, 31, 15], radius: 22 }
  ];
  var goods = ['Alloy', 'Cultures', 'Optics'];
  var modes = ['Freight', 'Patrol', 'Survey'];
  var frames = [
    { name: 'Swift', cost: 0, hold: 6, speed: 28, shield: 66, turn: 1.65 },
    { name: 'Manta', cost: 410, hold: 10, speed: 25, shield: 84, turn: 1.42 },
    { name: 'Kestrel', cost: 530, hold: 5, speed: 35, shield: 94, turn: 1.95 }
  ];
  var modules = [
    { name: 'Freight rack', cost: 120, desc: 'Four extra cargo slots' },
    { name: 'Pulse array', cost: 180, desc: 'Stronger pulse bolts' },
    { name: 'Vector jets', cost: 185, desc: 'Faster flight and turns' },
    { name: 'Shield cell', cost: 160, desc: 'Larger rechargeable shield' },
    { name: 'Field scanner', cost: 165, desc: 'Longer sampling reach and better survey pay' }
  ];
  var roles = [
    { name: 'Engineer', cost: 150, desc: 'Quicker shield recharge' },
    { name: 'Navigator', cost: 160, desc: 'Extra cruise speed and wider gates' },
    { name: 'Geologist', cost: 155, desc: 'Better sample pay and reach' }
  ];
  var skills = ['Commerce', 'Handling', 'Fieldwork'];
  var cabinColors = ['Amber', 'Glacier', 'Orchid'];

  function fresh() {
    return { credits: 220, port: 0, trips: 0, xp: 0, skills: [0,0,0], points: 0,
      frames: [0], frame: 0, modules: [], fit: [], crew: [], cabin: 0, cabinMount: 'desk', bunks: 1,
      cargo: [0,0,0], cost: [0,0,0], stock: [10,10,10], ledger: [], flight: null, onboard: null,
      stats: { drones: 0, samples: 0, freight: 0 }, visited: [0], finish: null };
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function init() { return { run: {}, layers: {}, meta: fresh() }; }
  function whole(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && Math.floor(v) === v; }
  function validate(state) {
    var p = state && state.meta;
    if (!p || !whole(p.credits) || !whole(p.port) || p.port >= ports.length || !whole(p.trips)) return 'Invalid captain account';
    if (!p.cargo || !p.skills || !p.stats || !p.frames || !p.crew || !p.fit || !p.stock || !p.cost || !p.ledger) return 'Missing ship loadout';
    for (var i = 0; i < goods.length; i++) if (!whole(p.cargo[i]) || !whole(p.cost[i]) || !whole(p.stock[i])) return 'Invalid cargo manifest';
    return null;
  }
  function has(list, value) { return list.indexOf(value) >= 0; }
  function total(list) { var n=0; for(var i=0;i<list.length;i++) n+=list[i]; return n; }
  function level(xp) { return 1 + Math.floor(Math.sqrt(xp / 35)); }
  function stats(p) {
    var f = frames[p.frame], fitted = function (n) { return has(p.fit,n); };
    var tech = has(p.crew,0), nav = has(p.crew,1), geo = has(p.crew,2);
    return { hold: f.hold + (fitted(0)?4:0), speed: f.speed + (fitted(2)?6:0) + (nav?3:0) + 1.5*p.skills[1],
      turn: f.turn + (fitted(2)?0.22:0) + 0.08*p.skills[1], shield: f.shield + (fitted(3)?35:0),
      strength: fitted(1)?19:13, regen: tech?9:5, gateRadius: nav?23:18,
      reach: 3.3 + (fitted(4)?1.6:0) + (geo?1.3:0) + 0.3*p.skills[2],
      samplePay: 38 + (fitted(4)?10:0) + (geo?12:0) + 5*p.skills[2] };
  }
  function price(p, port, item) {
    var base = ports[port].prices[item];
    return base + ((p.trips + port*2 + item) % 3) - 1;
  }
  function room(p) { return stats(p).hold - total(p.cargo); }
  function log(p, tag, value) {
    p.ledger.unshift({ tag: tag, value: value, at: p.trips });
    if(p.ledger.length>20) p.ledger.pop();
  }
  function trade(p, item, buy) {
    if(p.flight || !whole(item) || item>=goods.length) return false;
    var amount=price(p,p.port,item);
    if(buy) {
      if(room(p)<=0 || p.credits<amount || !p.stock[item]) return false;
      p.credits-=amount; p.cargo[item]++; p.cost[item]+=amount; p.stock[item]--;
    } else {
      if(!p.cargo[item]) return false;
      p.cost[item]-=Math.round(p.cost[item]/p.cargo[item]); p.cargo[item]--; p.stock[item]++;
      p.credits+=amount;
    }
    log(p,buy?'Cargo bought':'Cargo sold',buy?-amount:amount);
    return true;
  }
  function equip(p, kind, id) {
    if(p.flight || !whole(id)) return false;
    var entry, owned;
    if(kind==='skill') {
      if(!skills[id] || !p.points || p.skills[id]>=4) return false;
      p.skills[id]++; p.points--; return true;
    }
    if(kind==='cabin') { if(!cabinColors[id]) return false; p.cabin=id; return true; }
    if(kind==='bunks') {
      if(p.bunks>=3 || p.credits<190) return false;
      p.credits-=190; p.bunks++; log(p,'Cabin refit',-190); return true;
    }
    if(kind==='frame') { entry=frames[id]; owned=p.frames; }
    else if(kind==='module') { entry=modules[id]; owned=p.modules; }
    else if(kind==='crew') { entry=roles[id]; owned=p.crew; }
    if(!entry) return false;
    if(kind==='crew' && (has(owned,id) || owned.length>=p.bunks)) return false;
    if(kind==='frame' && total(p.cargo)>entry.hold+(has(p.fit,0)?4:0)) return false;
    if(kind==='module' && has(p.fit,id)) {
      if(id===0 && total(p.cargo)>frames[p.frame].hold) return false;
      p.fit.splice(p.fit.indexOf(id),1); return true;
    }
    if(kind==='module' && p.fit.length>=2) return false;
    if(!has(owned,id)) {
      if(p.credits<entry.cost) return false;
      p.credits-=entry.cost; owned.push(id); log(p,'Outfitting',-entry.cost);
    }
    if(kind==='frame') p.frame=id;
    if(kind==='module') p.fit.push(id);
    return true;
  }
  function baseReward(p, mode, dest) {
    return (mode===0?125:mode===1?205:135) + ((dest-p.port+3)%3)*12 + 12*p.skills[0];
  }
  function cargoGain(p,dest) {
    var gain=0;
    for(var i=0;i<goods.length;i++) gain+=Math.max(0,price(p,dest,i)*p.cargo[i]-p.cost[i]);
    return gain;
  }
  function quote(p, mode, dest) {
    return baseReward(p,mode,dest) + cargoGain(p,dest) + (mode===2?stats(p).samplePay*3:0);
  }
  function settle(p, f, rescue) {
    if(!p.flight || p.flight!==f || !whole(f.dest) || f.dest>2) return false;
    var base=baseReward(p,f.mode,f.dest), extra=0, sales=0, oldLevel=level(p.xp), gain=0;
    if(rescue) { base=rescue==='recall'?0:40; }
    else {
      gain=cargoGain(p,f.dest);
      for(var i=0;i<goods.length;i++) {
        var offer=price(p,f.dest,i)*p.cargo[i];
        if(p.cargo[i] && offer>=p.cost[i]) { sales+=offer; p.cargo[i]=0; p.cost[i]=0; }
      }
      extra=(f.mode===2?f.samples*stats(p).samplePay:0)+f.rings*12;
      p.port=f.dest; if(!has(p.visited,f.dest)) p.visited.push(f.dest);
      p.trips++; p.stock=[10,10,10]; if(f.mode===0) p.stats.freight++;
    }
    p.xp+=rescue?(rescue==='recall'?0:10):35+f.hits*4+f.samples*6;
    p.points+=level(p.xp)-oldLevel;
    p.stats.drones+=f.hits; p.stats.samples+=f.samples;
    p.credits+=base+extra+sales;
    p.finish={ base:base, extra:extra, gain:gain, sales:sales, rescue:!!rescue, xp:p.xp, leveled:level(p.xp)>oldLevel };
    log(p,rescue?'Recovery grant':'Route profit',base+extra+gain);
    p.flight=null; return true;
  }
  return { init:init, tick:function(){}, prestigeGain:function(){return 0;}, migrate:function(state){return state;},
    validate:validate, summary:function(s){return {line:'Freeboard · '+s.meta.trips+' · ¤'+s.meta.credits};},
    fresh:fresh, clone:clone, ports:ports, goods:goods, modes:modes, frames:frames, modules:modules,
    roles:roles, skills:skills, cabinColors:cabinColors, stats:stats, price:price, room:room, trade:trade,
    equip:equip, quote:quote, settle:settle, level:level, total:total, cargoGain:cargoGain };
});
