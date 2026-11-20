// Fixed-step rules shared by the hub checks, browser, replays and practice mode.
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; }
  else { root.TideRace = api; }
})(this, function () {
  'use strict';
  var STEP = 1 / 60, SPAN = 348, RULES = 3, CAR_HEIGHT = 2.55;
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
  function edition(rules) { return rules === 1 || rules === 2 ? rules : RULES; }
  function course(seed, rules) { return { seed: seed >>> 0, rules: edition(rules), cache: {} }; }
  function district(d) { return Math.floor(d / (SPAN * 2)) % 4; }
  function speed(d,rules) {
    if(rules===1)return 9+Math.min(8.8,d/480);
    if(rules===2)return 11.6+Math.min(5.4,d/220)+Math.min(2.4,d/1700);
    return 18.2+5.5*(1-Math.exp(-d/72))+5.4*(1-Math.exp(-d/350))+5.9*(1-Math.exp(-d/2300));
  }
  function value(base, gates) { return base * (gates >= 5 ? 3 : gates >= 3 ? 2 : 1); }
  function block(c, index) {
    if (c.cache[index]) return c.cache[index];
    if(c.rules>=3)return remember(c,index,railBlock(c.seed,index));
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
    return remember(c,index,{events:events,rows:rows,waves:waves});
  }
  function remember(c,index,result) {
    c.cache[index] = result;
    if (Object.keys(c.cache).length > 7) {
      Object.keys(c.cache).forEach(function (key) { if (Math.abs(+key - index) > 3) delete c.cache[key]; });
    }
    return result;
  }
  // An oncoming nose closes faster than the scenery. Its encounter is anchored
  // to a course metre so saves, ghosts and the visual bounds use the same pose.
  function trainFront(train,distance) {
    return train.z+(train.moving?Math.max(-48,Math.min(42,(train.z-distance)*.52)):0);
  }
  function railBlock(seed,index) {
    var origin=index*SPAN, variant=hash(seed,index), events=[],rows=[],trains=[],tunnels=[],waves=[],patterns=[];
    var plans=['boarding','underpass','crossing','freight','slalom','platform'];
    var program=index===0?['boarding','underpass','crossing']:[
      plans[hash(variant,3)%plans.length],plans[hash(variant,4)%plans.length],index%2===0?'crossing':plans[hash(variant,5)%plans.length]];
    // Never run the same chamber twice in succession.
    if(program[1]===program[0])program[1]=program[0]==='underpass'?'freight':'underpass';
    if(program[2]===program[1]){
      if(index%2===0)program[1]=program[0]==='underpass'?'freight':'underpass';
      else program[2]=program[1]==='slalom'?'platform':'slalom';
    }
    program.forEach(function(id,part) {
      var start=origin+116*part, flip=(index>0||part>1)&&!!(hash(variant,part+11)&1);
      function lane(n){return flip?2-n:n;}
      function emit(at,type,data){events.push(Object.assign({z:start+at,type:type},data));}
      function row(at,slots,base) {
        var e={z:start+at,type:'row',pattern:flip?slots.split('').reverse().join(''):slots,base:base||0};
        rows.push(e);events.push(e);
      }
      function train(at,track,length,moving,ramp,down) {
        var z=start+at, l=lane(track);
        trains.push({id:z*3+l,z:z,lane:l,length:length,moving:moving,height:CAR_HEIGHT,
          ramp:ramp||0,down:down||0,kind:moving?'metro':'freight'});
      }
      // Heights describe the centre of the pickup in world coordinates; arcs
      // and low lines are a readable preview of the route the player can take.
      function line(at,track,count,height,spacing) {
        for(var k=0;k<count;k++)emit(at+k*(spacing||2.8),'token',{
          lane:lane(track),y:typeof height==='function'?height(k):height||.90});
      }
      function arc(i){return .9+1.32*Math.sin(Math.PI*i/6);}
      function wave(at,count){
        var key=start+at;
        emit(at,'entry',{key:key,linked:false});
        for(var g=0;g<count;g++) {
          var z=at+16+g*18,mask=count===2||g===0?7:[3,5,6,7][hash(variant,g+50)%4];
          emit(z,'gate',{key:key,mask:mask});
          if(g===1||g===3||g===count-1)emit(z+10,'exit',{key:key,final:g===count-1,roof:false});
        }
        var end=at+16+(count-1)*18+14;
        emit(end,'end',{key:key});waves.push({key:key,start:key,end:start+end,linked:false});
      }
      patterns.push({z:start,end:start+116,id:id,mirror:flip});
      if(id==='boarding'){
        train(24,0,33,true);
        row(43,'.J.');
        train(74,2,17,false,13);
        train(97,2,12,false,0,7);
        line(4,1,6);line(34.6,1,7,arc);
        line(54,2,3);line(62,2,5,function(i){return .9+CAR_HEIGHT*Math.min(1,(1+i*2.8)/13);});
        line(77,2,4,CAR_HEIGHT+.9);
        line(87,2,6,function(i){return CAR_HEIGHT+.90+1.1*Math.sin(Math.PI*i/5);});
        line(104,2,3,CAR_HEIGHT+.9);
        if(index===0)emit(23,'magnet',{lane:1,y:.96});
        if(index>1)row(82,'J..');
      }else if(id==='underpass'){
        tunnels.push({z:start+3,end:start+105});
        train(29,0,29,true);
        row(43,'.D.');
        if(index===0){
          // The low beam is an invitation to roll, then the lights around the
          // bend reveal a second choice. The left siding stays clear throughout.
          train(77,1,24,true);row(70,'..J');line(59,0,9);
        }else{row(70,'J..');line(59,0,7,arc);}
        if(index>1)train(82,2,24,true);
        line(5,1,5);line(33,1,7,.48);line(88,index===0?0:1,6);
        emit(index===0?69:54,'boost',{lane:lane(index===0?0:1),y:.96});
      }else if(id==='freight'){
        train(28,0,46,false,15,10);
        train(54,2,29,true);
        row(52,'J..',CAR_HEIGHT);row(66,'.D.');row(98,'..J');
        line(4,0,3);line(14,0,6,function(i){return .9+CAR_HEIGHT*(1+i*2.8)/15;});
        line(32,0,5,CAR_HEIGHT+.9);line(44,0,7,function(i){return CAR_HEIGHT+arc(i);});
        line(60,1,5,.49);line(89,2,7,arc);
      }else if(id==='slalom'){
        train(26,1,24,true);train(55,0,28,true);train(88,2,24,true);
        row(70,'.J.');line(4,1,3);line(17,2,6);line(40,1,5);line(61.6,1,7,arc);line(86,0,7);
      }else if(id==='platform'){
        train(31,2,28,false,13,8);train(68,0,27,true);
        row(48,'.J.');row(90,'..D');
        line(5,1,4);line(19,2,5,function(i){return .9+CAR_HEIGHT*(1+i*2.8)/13;});
        line(34,2,8,CAR_HEIGHT+.9);line(74,1,4);line(84,2,6,.48);
      }else{
        train(39,0,32,true);row(64,'.G.');train(88,2,23,true);
        line(6,2,6);line(31,1,5);line(55.6,1,7,arc);line(84,0,7);
        if(part===2&&index%2===0)wave(index===0?12:4,index===0?2:5);
      }
      if(index>0&&part===0)emit(6,'magnet',{lane:lane(1),y:.96});
      if(index>0&&part===2)emit(6,'boost',{lane:lane(1),y:.96});
    });
    events.sort(function(a,b){return a.z-b.z;});
    return {events:events,rows:rows,waves:waves,trains:trains,tunnels:tunnels,patterns:patterns};
  }
  function fresh(seed,gear,rules) {
    var version=edition(rules),limit=version>=3?5:3;
    var state={seed: seed >>> 0, rules:version, gear:{magnet:level(gear&&gear.magnet,limit),boost:level(gear&&gear.boost,limit)},
      tokens:0,collected:0,pickups:0,magnet:0,boost:0,surge:0,shield:0,tokenTick:-200,pickupTick:-200,
      tick: 0, d: 0, lane: 1, pos: 1, air: 0, slide: 0,
      airShift: false, wave: -1, blend: 0, roofUntil: 0, grace: 0, gates: 0, raw: 0,
      bank: 0, banks: 0, bestBank: 0, bestChain: 0, dead: '', notice: '', noticeTick: -200, amount: 0};
    if(version>=3){
      ['boots','pads','pass'].forEach(function(key){state.gear[key]=level(gear&&gear[key],5);});
      Object.assign(state,{deckY:0,fallSpeed:0,surface:'rail',nearTick:-200,roofTick:-200,
        nearTally:0,roofTally:0,shiftTick:-200,shiftFrom:1,roofId:-1,protectedTrain:-1});
    }
    return state;
  }
  function level(n,limit){return Math.max(0,Math.min(limit||3,Math.floor(+n||0)));}
  function stride(r){return r.d/(5.95+Math.min(1.7,r.d/1350));}
  function notify(r, kind, amount) { r.notice = kind; r.noticeTick = r.tick; r.amount = amount || 0; }
  function input(r, act) {
    if (r.dead) return false;
    if (act === 'L' || act === 'R') {
      var next = Math.max(0, Math.min(2, r.lane + (act === 'L' ? -1 : 1)));
      if (next === r.lane || (r.rules<3 && r.air && r.airShift)) return false;
      if(r.rules>=3){r.shiftTick=r.tick;r.shiftFrom=r.lane;}
      r.lane = next;
      if (r.wave < 0 && r.roofUntil > r.d && next !== 2) { r.roofUntil = 0; r.grace = 35; }
      if (r.air) r.airShift = true;
    } else if (act === 'U') {
      if (r.air || (r.rules>=3 && r.surface==='air')) return false;
      r.air = 46; r.airShift = false; r.slide = 0;
    } else if (act === 'D') {
      r.air = 0; r.airShift = false; r.slide = 43+(r.rules>=3?6*level(r.gear.pads,5):0);
      if(r.rules>=3)r.fallSpeed=Math.max(12,r.fallSpeed);
    } else return false;
    return true;
  }
  function height(r) {
    return r.air?1.95*(r.rules>=3?1+.08*level(r.gear.boots,5):1)*Math.sin(Math.PI*(46-r.air)/46):0;
  }
  function drop(r, kind) { r.gates = 0; r.raw = 0; notify(r, kind); }
  function leave(r) { r.exitSurf = r.pos; r.wave = -1; r.lane = 2; r.pos = 2; r.grace = 62; }
  function pass(r, e) {
    var lane = Math.round(r.pos);
    if(e.type==='token'||e.type==='magnet'||e.type==='boost'){
      if(r.wave>=0||r.roofUntil>r.d)return;
      var coin=e.type==='token',pulled=coin&&r.magnet>0&&Math.abs(r.pos-e.lane)<=1.12;
      if(r.rules>=3&&pulled&&Math.abs((r.deckY||0)+height(r)+.9-e.y)>2.15)pulled=false;
      var close=Math.abs(r.pos-e.lane)<.57&&Math.abs((r.slide?.49:.93)+(r.deckY||0)+height(r)-e.y)<.99;
      if(!pulled&&!close)return;
      if(coin){r.collected++;r.tokens+=r.boost>0?2:1;r.tokenTick=r.tick;}
      else{
        r.pickups++;r.pickupTick=r.tick;r[e.type]=270+90*level(r.gear&&r.gear[e.type],r.rules>=3?5:3);
        if(e.type==='boost'){r.surge=150;r.shield=1;}
        notify(r,e.type);
      }
    }else if (e.type === 'entry' && r.wave < 0 && lane === 2 && (!e.linked || r.roofUntil >= r.d) &&
        (r.rules<3||height(r)>.18)) {
      r.wave = e.key; r.lane = 0; r.pos = 0; r.gates = 0; r.raw = 0;
      if(r.rules>=3){r.deckY=0;r.air=0;r.surface='wave';}
      notify(r, 'wave');
    } else if (e.type === 'row' && r.wave < 0 && !r.grace && !(r.roofUntil > r.d)) {
      var hit = e.pattern.charAt(lane);
      var clearance=height(r);
      if(r.rules>=3){
        clearance+=r.deckY-e.base;
        if(clearance<-.28||r.deckY>e.base+1.55)return;
      }
      if (hit === 'C' || ((hit === 'J' || hit === 'G') && clearance < .48) || (hit === 'D' && !r.slide)) {
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
  function railContact(r,c,old,previousFeet){
    if(r.wave>=0){r.surface='wave';return;}
    var b=block(c,Math.floor(r.d/SPAN)),feet=r.deckY+height(r);
    var surface=b.tunnels.some(function(t){return r.d>=t.z&&r.d<t.end;})?'tunnel':'rail';
    var ground=0,roofId=-1;
    // The final nose in each block is at least 27 m before the next block.
    // Train motion shortens the distance to the tail of a passing consist.
    for(var i=0;i<b.trains.length;i++){
      var train=b.trains[i],front=trainFront(train,r.d),behind=r.d-front,side=Math.abs(train.lane-r.pos);
      if(train.moving&&old<train.z&&r.d>=train.z&&side>=.57&&side<=1.12&&!r.grace&&
          r.shiftFrom===train.lane&&r.tick-r.shiftTick<=26&&feet<train.height-.15){
        r.nearTick=r.tick;r.nearTally++;r.tokens+=level(r.gear.pass,5);notify(r,'near',r.gear.pass);
      }
      if(side>=.55||behind < -train.ramp||behind>train.length+train.down)continue;
      var onRamp=behind<0||behind>train.length,top=train.height;
      if(behind<0)top*=1+behind/train.ramp;
      else if(behind>train.length)top*=1-(behind-train.length)/train.down;
      if(feet<top-.22&&previousFeet<top-.22){
        if(r.protectedTrain!==train.id&&!r.grace){
          if(!r.shield||!r.surge){r.dead='T';notify(r,'crash');return;}
          r.shield=0;r.surge=0;r.grace=30;r.protectedTrain=train.id;notify(r,'rescued');
        }
        continue;
      }
      if(top>=ground){ground=top;surface=onRamp?'ramp':'roof';roofId=onRamp?-1:train.id;}
    }
    if(r.air&&r.air<=23&&feet<=ground+.09&&previousFeet>=ground-.22){
      r.air=0;r.airShift=false;r.deckY=ground;r.fallSpeed=0;
    }else if(!r.air){
      var followingRamp=surface==='ramp'&&(r.surface==='roof'||r.surface==='ramp')&&r.deckY-ground<.42;
      if(r.deckY>ground+.14&&!followingRamp){r.fallSpeed+=25*STEP;r.deckY=Math.max(ground,r.deckY-r.fallSpeed*STEP);}
      else{r.deckY=ground;r.fallSpeed=0;}
    }
    r.surface=r.deckY+height(r)>ground+.19?'air':surface;
    if(r.surface==='roof'&&r.roofId!==roofId){r.roofTick=r.tick;r.roofTally++;notify(r,'roof');}
    if(r.surface==='roof')r.roofId=roofId;
    else if(r.surface!=='air')r.roofId=-1;
  }
  function step(r, c) {
    if (r.dead) return;
    var old = r.d,previousFeet=c.rules>=3?r.deckY+height(r):0;
    r.tick++; r.d += speed(old,c.rules) * STEP * (r.surge>0?1.15:1);
    var drift = r.lane - r.pos;
    r.pos += Math.sign(drift) * Math.min(Math.abs(drift), c.rules===1?.15:.19);
    r.blend += ((r.wave >= 0 ? 1 : 0) - r.blend) * .13;
    if (r.grace) r.grace--;
    if (r.air) r.air--;
    if (r.slide) r.slide--;
    if(r.magnet)r.magnet--;if(r.boost)r.boost--;if(r.surge)r.surge--;else r.shield=0;
    if(c.rules>=3)railContact(r,c,old,previousFeet);
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
    course: course, block: block, fresh: fresh, input: input, step: step, height: height, stride:stride, score: score, trainFront:trainFront,
    encode: encode, decode: decode, playback: playback};
});
