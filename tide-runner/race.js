// Fixed-step rules shared by the hub checks, browser, replays and practice mode.
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; }
  else { root.TideRace = api; }
})(this, function () {
  'use strict';
  var STEP = 1 / 60, SPAN = 348, RULES = 2;
  // Each row is left, middle, right. Even paired hazards leave an open route.
  // C = stacked cargo, J = hurdle, D = hanging canvas, G = broken boards.
  var ROWS = ['C..', '.J.', '..D', '.C.', 'G..', '..J', 'D..', '..C', '.G.',
    'CJ.', '.DC', 'C.D', 'J.C', '.GJ', 'D.G', 'GC.', 'DJ.', 'C.J', '.CD',
    'JD.', 'CG.', '.JD', 'GD.', 'J.D'];
  function hash(seed, index) {
    var a = Math.imul((seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0, 0x85ebca6b);
    a = Math.imul(a ^ (a >>> 16), 0xc2b2ae35);
    return (a ^ (a >>> 13)) >>> 0;
  }
  function course(seed, rules) { return { seed: seed >>> 0, rules: rules === 1 ? 1 : RULES, cache: {} }; }
  function district(d) { return Math.floor(d / (SPAN * 2)) % 4; }
  function speed(d,rules) { return rules===1 ? 9 + Math.min(8.8,d/480) : 11.6 + Math.min(5.4,d/220) + Math.min(2.4,d/1700); }
  function value(base, gates) { return base * (gates >= 5 ? 3 : gates >= 3 ? 2 : 1); }
  function block(c, index) {
    if (c.cache[index]) return c.cache[index];
    var origin = index * SPAN, variant = hash(c.seed, index), rows = [], events = [], waves = [];
    function emit(at, type, data) { events.push(Object.assign({ z: origin + at, type: type }, data)); }
    function wave(start, count, id, linked) {
      var gates = [], exits = [], key = origin + start;
      for (var i = 0; i < count; i++) {
        var choice = hash(variant, id * 9 + i + 88);
        var mask = count === 2 || i === 0 ? 7 : [3, 5, 6, 7][choice % 4];
        gates.push({at: start + 16 + 20 * i, mask: mask});
      }
      gates.forEach(function (g, j) {
        emit(g.at, 'gate', {mask: g.mask, key: key});
        if (j === 1 || j === 3 || j === count - 1) {
          var at = g.at + 11;
          exits.push(at);
          var roof = index % 3 === 1 && !linked && count === 5 && j === 3;
          emit(at, 'exit', {key: key, final: j === count - 1, roof: roof, nextEntry: roof ? key + 126 : 0});
        }
      });
      var end = exits[exits.length - 1] + 4;
      emit(start, 'entry', {key: key, linked: linked});
      emit(end, 'end', {key: key});
      waves.push({key: key, start: key, end: origin + end, linked: linked});
    }
    var start = index === 0 ? 68 : 58 + (variant % 3) * 4;
    wave(start, index === 0 || index % 4 === 3 ? 2 : 5, 0, false);
    if (index % 3 === 1) wave(start + 126, 4, 1, true);
    for (var k = 0; k < (c.rules===1?13:16); k++) {
      var z = c.rules===1?29+k*24:21+k*20+(k%4===3?1:0);
      if (waves.some(function (w) { return Math.abs(w.start - (origin + z)) < 15; })) continue;
      if (c.rules===1?(k === 11 || (k === 10 && index % 3 === 0)):(k===12&&index%3===0)) continue;
      var roll = hash(variant, k + 21);
      var count = index === 0 ? 9 : index < 4 ? 17 : ROWS.length;
      var pattern = index === 0 && k < 2 ? ['C..', '.J.'][k] : ROWS[roll % count];
      // The dry dock has broken boards, the yard favours cargo, the locks have low beams.
      var zone = district(origin);
      if (k % 3 === 1 && zone === 1) pattern = ['G..','C.G','.GJ'][roll % 3];
      if (k % 3 === 1 && zone === 2) pattern = ['.C.','CJ.','C.D'][roll % 3];
      if (k % 3 === 1 && zone === 3) pattern = ['..D','DJ.','D.G'][roll % 3];
      if (k > 1 && roll % 2) pattern = pattern.split('').reverse().join('');
      if(c.rules!==1&&index===0&&k<3)pattern=['.J.','.DC','C..'][k];
      var row = { z: origin + z, type: 'row', pattern: pattern };
      rows.push(row); events.push(row);
    }
    if(c.rules!==1){
      // Lines lead toward an available lane or deliberately arc over a jumpable obstacle.
      for(var group=0;group<18;group++){
        var offset=5+group*19, draw=hash(variant,group+91), count=5+draw%2;
        var near=rows.find(function(row){return row.z>=origin+offset-2&&row.z<=origin+offset+16;});
        var lanes=[0,1,2].filter(function(l){return !near||near.pattern[l]!=='C';});
        var line=lanes[draw%lanes.length];
        if(index===0&&group<2)line=1;
        for(var j=0;j<count;j++){
          var station=offset+j*2.35,delta=near?Math.abs(origin+station-near.z):99;
          var hurdle=near&&(near.pattern[line]==='J'||near.pattern[line]==='G');
          var y=hurdle&&delta<5?.85+1.38*(1-delta/5):near&&near.pattern[line]==='D'&&delta<3?.45:.9;
          emit(station,'token',{lane:line,y:y});
        }
      }
      emit(index===0?33:35+variant%17,'magnet',{lane:index===0?1:(variant>>>3)%3,y:.96});
      emit(index===0?135:185+(variant>>>6)%35,'boost',{lane:index===0?2:(variant>>>12)%3,y:.96});
    }
    events.sort(function (a,b) { return a.z - b.z; });
    var result = { events: events, rows: rows, waves: waves };
    c.cache[index] = result;
    if (Object.keys(c.cache).length > 7) {
      Object.keys(c.cache).forEach(function (key) { if (Math.abs(+key - index) > 3) delete c.cache[key]; });
    }
    return result;
  }
  function fresh(seed,gear,rules) {
    return {seed: seed >>> 0, rules:rules===1?1:RULES, gear:{magnet:level(gear&&gear.magnet),boost:level(gear&&gear.boost)},
      tokens:0,collected:0,pickups:0,magnet:0,boost:0,surge:0,shield:0,tokenTick:-200,pickupTick:-200,
      tick: 0, d: 0, lane: 1, pos: 1, air: 0, slide: 0,
      airShift: false, wave: -1, blend: 0, roofUntil: 0, grace: 0, gates: 0, raw: 0,
      bank: 0, banks: 0, bestBank: 0, bestChain: 0, dead: '', notice: '', noticeTick: -200, amount: 0};
  }
  function level(n){return Math.max(0,Math.min(3,Math.floor(+n||0)));}
  function stride(r){return r.d/(5.95+Math.min(1.7,r.d/1350));}
  function notify(r, kind, amount) { r.notice = kind; r.noticeTick = r.tick; r.amount = amount || 0; }
  function input(r, act) {
    if (r.dead) return false;
    if (act === 'L' || act === 'R') {
      var next = Math.max(0, Math.min(2, r.lane + (act === 'L' ? -1 : 1)));
      if (next === r.lane || (r.air && r.airShift)) return false;
      r.lane = next;
      if (r.wave < 0 && r.roofUntil > r.d && next !== 2) { r.roofUntil = 0; r.grace = 35; }
      if (r.air) r.airShift = true;
    } else if (act === 'U') {
      if (r.air) return false;
      r.air = 46; r.airShift = false; r.slide = 0;
    } else if (act === 'D') {
      r.air = 0; r.airShift = false; r.slide = 43;
    } else return false;
    return true;
  }
  function height(r) { return r.air ? 1.95 * Math.sin(Math.PI * (46 - r.air) / 46) : 0; }
  function drop(r, kind) { r.gates = 0; r.raw = 0; notify(r, kind); }
  function leave(r) { r.exitSurf = r.pos; r.wave = -1; r.lane = 2; r.pos = 2; r.grace = 62; }
  function pass(r, e) {
    var lane = Math.round(r.pos);
    if(e.type==='token'||e.type==='magnet'||e.type==='boost'){
      if(r.wave>=0||r.roofUntil>r.d)return;
      var coin=e.type==='token',pulled=coin&&r.magnet>0&&Math.abs(r.pos-e.lane)<=1.12;
      var close=Math.abs(r.pos-e.lane)<.57&&Math.abs((r.slide?.49:.93)+height(r)-e.y)<.99;
      if(!pulled&&!close)return;
      if(coin){r.collected++;r.tokens+=r.boost>0?2:1;r.tokenTick=r.tick;}
      else{
        r.pickups++;r.pickupTick=r.tick;r[e.type]=270+90*level(r.gear&&r.gear[e.type]);
        if(e.type==='boost'){r.surge=150;r.shield=1;}
        notify(r,e.type);
      }
    }else if (e.type === 'entry' && r.wave < 0 && lane === 2 && (!e.linked || r.roofUntil >= r.d)) {
      r.wave = e.key; r.lane = 0; r.pos = 0; r.gates = 0; r.raw = 0;
      notify(r, 'wave');
    } else if (e.type === 'row' && r.wave < 0 && !r.grace && !(r.roofUntil > r.d)) {
      var hit = e.pattern.charAt(lane);
      if (hit === 'C' || ((hit === 'J' || hit === 'G') && height(r) < .48) || (hit === 'D' && !r.slide)) {
        if(r.shield&&r.surge){r.shield=0;r.surge=0;r.grace=35;notify(r,'rescued');return;}
        r.dead = hit; notify(r, 'crash');
      }
    } else if (r.wave === e.key) {
      if (e.type === 'gate') {
        if ((e.mask & (1 << lane)) && Math.abs(r.pos - lane) < .44) {
          r.raw += (lane + 1) * 50; r.gates++; notify(r, 'gate', value(r.raw, r.gates));
        } else drop(r, 'miss');
      } else if (e.type === 'exit' && lane === 0 && Math.abs(r.pos) < .47) {
        var award = value(r.raw, r.gates);
        if (award) { r.bank += award; r.banks++; r.bestBank = Math.max(r.bestBank, award); r.bestChain = Math.max(r.bestChain, r.gates); }
        if (e.roof) { r.roofStart = e.z; r.roofUntil = e.nextEntry + 1; }
        r.raw = 0; r.gates = 0; leave(r); notify(r, award ? 'bank' : 'land', award);
      } else if (e.type === 'end') { drop(r, 'washed'); leave(r); }
    }
  }
  function step(r, c) {
    if (r.dead) return;
    var old = r.d;
    r.tick++; r.d += speed(old,c.rules) * STEP * (r.surge>0?1.15:1);
    var drift = r.lane - r.pos;
    r.pos += Math.sign(drift) * Math.min(Math.abs(drift), c.rules===1?.15:.19);
    r.blend += ((r.wave >= 0 ? 1 : 0) - r.blend) * .13;
    if (r.grace) r.grace--;
    if (r.air) r.air--;
    if (r.slide) r.slide--;
    if(r.magnet)r.magnet--;if(r.boost)r.boost--;if(r.surge)r.surge--;else r.shield=0;
    for (var b = Math.floor(old / SPAN); b <= Math.floor(r.d / SPAN); b++) {
      var list = block(c, b).events;
      for (var i = 0; i < list.length && !r.dead; i++) {
        if (list[i].z > old && list[i].z <= r.d) pass(r, list[i]);
      }
    }
  }
  function score(r) { return Math.floor(r.d) + r.bank; }
  function encode(events) {
    var prev = 0;
    return events.map(function (e) {
      var out = (e[0] - prev).toString(36) + e[1]; prev = e[0]; return out;
    }).join('.');
  }
  function decode(tape) {
    var tick = 0;
    return tape ? tape.split('.').map(function (word) {
      tick += parseInt(word.slice(0,-1), 36); return [tick, word.slice(-1)];
    }) : [];
  }
  function playback(seed, events, limit,gear,rules) {
    var c = course(seed,rules), r = fresh(seed,gear,rules), i = 0;
    while (r.tick < limit && !r.dead) {
      while (i < events.length && events[i][0] === r.tick) input(r, events[i++][1]);
      step(r, c);
    }
    return r;
  }
  return {STEP: STEP, SPAN: SPAN, RULES: RULES, hash: hash, district: district, speed: speed, value: value,
    course: course, block: block, fresh: fresh, input: input, step: step, height: height, stride:stride, score: score,
    encode: encode, decode: decode, playback: playback};
});
