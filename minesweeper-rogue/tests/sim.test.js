'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {play} = require('./bot.js');
const {load,harness} = require('./helpers.js');
const {test,done} = harness;
const x = load();
function fresh(seed=1) {const s=x.fresh(seed);assert(x.sim.startRun(s,x.cfg,{seed}));return s;}
function field(w=7,h=7,entries={0:'1',4:'2',20:'r',40:'c',48:'1'}) {
  const s=fresh();const f=s.run.field;const m=Array(w*h).fill('.');for(const key of Object.keys(entries)) m[Number(key)]=entries[key];
  Object.assign(f,{w,h,generated:true,m:m.join(''),t:'.'.repeat(w*h),vis:'-'.repeat(w*h),known:{},clocks:{},last:Math.floor(w*h/2),mines:Object.keys(entries).length,doubles:Object.values(entries).filter(v=>v==='2').length});
  return s;
}
function put(str,i,v) {return str.slice(0,i)+v+str.slice(i+1);}
function tool(s,id,i=0) {x.sim.addFind(s,id,x.cfg);return x.sim.useTool(s,id,i,x.cfg,1);}
test('первый ход безопасен, детерминирован, сохраняет поле и генератор',()=>{
  const a=fresh(42),b=fresh(42);x.sim.tap(a,31,x.cfg,1);x.sim.tap(b,31,x.cfg,1);
  assert.deepEqual(a.run,b.run);assert.equal(a.run.hearts,3);assert.equal(a.run.field.m[31],'.');
  assert.equal(x.sim.validate(JSON.parse(JSON.stringify(a))),null);assert(a.meta.stats.cells>0);
});
test('Щуп, Рентген, Лопата и ракета действуют без урона',()=>{
  const s=field();assert(tool(s,'probe',0));assert.equal(s.run.field.known[0],2);assert.equal(s.run.field.vis[0],'-');
  assert(tool(s,'xray',4));assert.equal(s.run.field.vis[4],'F');assert.equal(s.run.hearts,3);
  assert(tool(s,'shovel',1));assert.equal(s.run.field.vis[0],'f');assert.equal(s.run.field.vis[1],'o');
  assert(tool(s,'flare',42));assert.equal(s.run.field.vis[48],'f');assert.equal(s.run.hearts,3);
});
test('Фонарь, Компас, Сейсмограф, Песок, Стоп-кран и Заплатка',()=>{
  const s=field();assert(tool(s,'lantern',2));const r=s.run.field.readings.at(-1);assert.equal(r.tool,'lantern');assert(r.value>=3);
  assert(tool(s,'compass',1));assert.equal(s.run.field.readings.at(-1).target,0);assert.equal(s.run.field.known[0],2);
  assert(tool(s,'seismo'));assert.equal(s.run.field.rowCounts[0],3);assert.equal(s.run.field.rowCounts.length,7);
  assert(tool(s,'sand'));assert(s.run.field.frozen);assert(tool(s,'brake'));assert(s.run.field.stopped);
  s.run.hearts=1;assert(tool(s,'patch'));assert.equal(s.run.hearts,2);
});
test('все заряды расходуются и не становятся отрицательными',()=>{
  const s=field();x.sim.addFind(s,'probe',x.cfg);assert.equal(s.run.tools.probe,2);
  assert(x.sim.useTool(s,'probe',0,x.cfg));assert(x.sim.useTool(s,'probe',4,x.cfg));assert(!x.sim.useTool(s,'probe',4,x.cfg));assert.equal(s.run.tools.probe,0);
  assert(!x.sim.tap(s,undefined,x.cfg));assert(!x.sim.flag(s,undefined,x.cfg));assert.equal(x.sim.validate(s),null);
});
test('дубовый щит, чутьё, двойная мина и запасное сердце',()=>{
  const s=field();x.sim.addFind(s,'oak',x.cfg);x.sim.addFind(s,'sense',x.cfg);x.sim.addFind(s,'spare',x.cfg);
  x.sim.tap(s,4,x.cfg);assert.equal(s.run.field.vis[4],'-');assert.equal(s.run.hearts,3);
  x.sim.tap(s,4,x.cfg);assert.equal(s.run.hearts,3);assert.equal(s.run.field.vis[4],'x');
  s.run.hearts=1;x.sim.tap(s,0,x.cfg);assert.equal(s.run.hearts,2);assert(s.run.spareUsed);
  assert.equal(s.run.heartsLost,1);
});
test('Аккуратист с Двойным зрением: два золота только один раз',()=>{
  const s=field();x.sim.addFind(s,'neat',x.cfg);x.sim.addFind(s,'double-sight',x.cfg);
  s.run.field.vis=put(s.run.field.vis,3,'o');x.sim.flag(s,4,x.cfg);assert.equal(s.run.field.vis[4],'F');assert.equal(s.run.gold,2);
  x.sim.flag(s,4,x.cfg);x.sim.flag(s,4,x.cfg);assert.equal(s.run.gold,2);
});
test('ручной флаг поддерживает двойной вес и снимается третьим нажатием',()=>{
  const s=field();x.sim.flag(s,4,x.cfg);assert.equal(s.run.field.vis[4],'f');x.sim.flag(s,4,x.cfg);assert.equal(s.run.field.vis[4],'F');x.sim.flag(s,4,x.cfg);assert.equal(s.run.field.vis[4],'-');
});
test('заряды пояса, сапоги, тихая лавка и мастерская суммируются',()=>{
  const s=field();x.sim.addFind(s,'belt',x.cfg);x.sim.addFind(s,'probe',x.cfg);assert.equal(s.run.tools.probe,3);
  x.sim.addFind(s,'boots',x.cfg);assert.equal(s.run.maxHearts,4);assert.equal(s.run.hearts,3);
  s.meta.workshop.discount=4;x.sim.addFind(s,'quiet-shop',x.cfg);assert.equal(x.sim.shopPrice(s,'xray',x.cfg),13);
});
test('Свеча открывает глухое число только рядом с флагом',()=>{
  const s=field();s.run.field.t=put(s.run.field.t,1,'d');s.run.field.vis=put(s.run.field.vis,1,'o');x.sim.addFind(s,'candle',x.cfg);
  assert.equal(x.sim.view(s,x.cfg).cells[1].number,null);x.sim.flag(s,0,x.cfg);assert.equal(x.sim.view(s,x.cfg).cells[1].number,1);
});
test('часовая мина заводится с логического вывода и не тикает от флага/офлайна',()=>{
  const s=field(9,9,{0:'c',80:'1'});s.run.field.t='d'.repeat(81);s.run.field.t=put(s.run.field.t,1,'.');
  for(const at of [1,2,9,10,11]) s.run.field.vis=put(s.run.field.vis,at,'o');
  x.sim.flag(s,70,x.cfg);assert.equal(s.run.field.clocks[0],12);x.sim.flag(s,70,x.cfg);assert.equal(s.run.field.clocks[0],12);
  const before=JSON.stringify(s);x.sim.offline(s,43200,x.ctx());x.sim.tick(s,43200,x.ctx());assert.equal(JSON.stringify(s),before);
  for(const at of [20,21,22,23,24,25,26,27,28,29,30,31]) x.sim.tap(s,at,x.cfg,1);
  assert.equal(s.run.field.vis[0],'x');assert.equal(s.run.hearts,2);
});
test('маятник удваивает отсчёт, Стоп-кран полностью замораживает его',()=>{
  const s=field(9,9,{0:'c',80:'1'});s.run.field.t='d'.repeat(81);s.run.field.t=put(s.run.field.t,1,'.');
  for(const at of [1,2,9,10,11]) s.run.field.vis=put(s.run.field.vis,at,'o');
  x.sim.addFind(s,'pendulum',x.cfg);x.sim.flag(s,70,x.cfg);assert.equal(s.run.field.clocks[0],24);
  assert(tool(s,'brake'));x.sim.tap(s,20,x.cfg);assert.equal(s.run.field.clocks[0],24);
});
test('Золотая жила умножает тайник, ложный тайник пуст',()=>{
  const s=field();s.run.field.t='d'.repeat(49);s.run.field.t=put(s.run.field.t,1,'g');s.run.field.t=put(s.run.field.t,3,'z');x.sim.addFind(s,'vein',x.cfg);
  x.sim.tap(s,1,x.cfg);assert.equal(s.run.gold,9);x.sim.tap(s,3,x.cfg);assert.equal(s.run.gold,9);
});
test('руда начисляется один раз, учитывает глубину, пассажира и Чистюлю',()=>{
  const s=fresh();s.run.completed=2;s.run.noLossFields=1;s.run.gold=20;s.run.depth=2;s.run.sapper='tidy';
  assert(x.sim.endRun(s,x.cfg,2));assert.equal(x.Big.toNumber(s.meta.ore),72);assert(!x.sim.endRun(s,x.cfg,2));assert.equal(x.Big.toNumber(s.meta.ore),72);
});
test('мастерская использует Big даже для огромной руды и строго ограничена',()=>{
  const s=fresh();s.meta.ore='1e100';assert(x.sim.buyWorkshop(s,'heart',x.cfg));assert(x.sim.buyWorkshop(s,'heart',x.cfg));assert(!x.sim.buyWorkshop(s,'heart',x.cfg));assert(x.Big.valid(s.meta.ore));
  assert.equal(x.Big.toNumber(x.sim.workshopCost(s,'pouch',x.cfg)),10);
});
test('шаги выдаются единожды на старте, Чистый сапёр не получает инструменты',()=>{
  const s=x.fresh();x.sim.applyStepProbe(s,x.cfg);x.sim.startRun(s,x.cfg,{seed:11});assert.equal(s.run.tools.probe,2);assert(!s.meta.nextProbe);
  x.sim.endRun(s,x.cfg);x.sim.startRun(s,x.cfg,{mode:'pure',seed:11});assert.deepEqual(s.run.tools,{});const spec=x.sim.fieldSpec(s,x.cfg);assert.equal(spec.doubles,0);assert.equal(spec.caches,0);
});
test('запас Worker даёт то же поле, неправильный ключ не принимается',()=>{
  const s=fresh(77);const jobs=x.sim.prepareRequests(s,x.cfg);const job=jobs[0];const B=x.env.require('modules/games/minesweeper-rogue/logic/board.js');const made=B.generate(job.spec,job.seed,31,job.options);
  x.sim.acceptPrepared(s,[{key:job.key,start:31,field:made},{key:'stale',start:31,field:made}],x.cfg);assert.equal(s.run.pregen.length,1);
  x.sim.tap(s,31,x.cfg);assert.equal(s.run.field.m,made.m);assert.equal(s.run.pregen.length,0);
});
test('проверка контента отвергает ложные сертификаты и неизвестные кирпичики',()=>{
  assert(x.sim.validateStock('rules',{title:'Ложь',bricks:[{brick:'fog'}],checked:true}));
  assert(x.sim.validateStock('rules',{title:'Ошибка',bricks:[{brick:'arbitrary-code'}]}));
  assert(x.sim.validateStock('finds',{title:'Ошибка',bricks:[{brick:'inverse'}]}));
  assert.equal(x.sim.validateStock('daily',{title:'День',seed:42,rule:'fog'}),null);
});
test('повторный осмотр завершённого числа в тумане сохраняется и не тикает',()=>{
  const s=field(7,7,{0:'1',48:'c'});s.run.field.fog=true;
  for(const at of [8,9,10,15,16,17,22,23,24]) s.run.field.vis=put(s.run.field.vis,at,'o');
  s.run.field.last=40;s.run.field.clocks[48]=5;
  assert(x.sim.tap(s,16,x.cfg));assert.equal(s.run.field.last,16);assert.equal(s.run.field.openings,0);assert.equal(s.run.field.clocks[48],5);
});
test('поле дня воспроизводится между устройствами и меняется с UTC датой',()=>{
  const now=1794657600000;const day=x.sim.dailyFor(now);
  assert.deepEqual(day,x.sim.dailyFor(now+1000));assert.notEqual(day.seed,x.sim.dailyFor(now+86400000).seed);
  const a=x.fresh(1),b=x.fresh(999);x.sim.startRun(a,x.cfg,{mode:'daily'},x.ctx(1));x.sim.startRun(b,x.cfg,{mode:'daily'},x.ctx(999));
  assert.equal(a.run.seed,b.run.seed);assert.deepEqual(a.run.bosses,b.run.bosses);
});
test('установленное поле дня используется сегодня и истекает на следующий день',()=>{
  const s=x.fresh();const now=x.ctx().now;const daily={title:'Каменная среда',seed:1234,rule:'inverse'};
  assert(x.sim.installStock(s,'daily',daily,x.cfg,now));assert(x.sim.startRun(s,x.cfg,{mode:'daily'},x.ctx()));
  assert.equal(s.run.seed,1234);assert.deepEqual(s.run.bosses,['inverse']);x.sim.endRun(s,x.cfg);
  assert(x.sim.startRun(s,x.cfg,{mode:'daily'},{...x.ctx(),now:now+86400000}));
  assert.equal(s.run.seed,x.sim.dailyFor(now+86400000).seed);
});
test('Глубже сохраняет первые шесть полей и доступно в лавке после Скалы',()=>{
  const normal=fresh(),deep=x.fresh();assert(x.sim.startRun(deep,x.cfg,{mode:'deep',seed:1}));
  for(let i=0;i<6;i++) assert.deepEqual(x.sim.fieldSpec(deep,x.cfg,i),x.sim.fieldSpec(normal,x.cfg,i));
  normal.run.status='shop';normal.run.completed=6;normal.run.fieldIndex=5;
  assert(x.sim.continueDeeper(normal,x.cfg));assert.equal(normal.run.mode,'deep');assert.equal(normal.run.fieldIndex,6);
  assert(!x.sim.continueDeeper(normal,x.cfg));assert.equal(x.sim.fieldSpec(normal,x.cfg,6).mines,30);
  assert(x.sim.fieldSpec(normal,x.cfg,10).mines>x.sim.fieldSpec(normal,x.cfg,6).mines);
  assert.equal(x.sim.fieldSpec(normal,x.cfg,6).inverse,false);assert.equal(x.sim.fieldSpec(normal,x.cfg,6).fog,false);
});
test('все шесть улучшений работают: пять останавливаются на максимуме, мешочек растёт без предела',()=>{
  const s=x.fresh();s.meta.ore='1e100';
  const caps={heart:2,supplies:3,choice:1,discount:4,luck:5};
  for(const [id,max] of Object.entries(caps)) {for(let i=0;i<max;i++) assert(x.sim.buyWorkshop(s,id,x.cfg));assert(!x.sim.buyWorkshop(s,id,x.cfg));}
  for(let i=0;i<5;i++) assert(x.sim.buyWorkshop(s,'pouch',x.cfg));
  assert.equal(x.sim.workshopMax('pouch',x.cfg),Infinity);
  const richer=JSON.parse(JSON.stringify(s));for(let i=0;i<25;i++) assert(x.sim.buyWorkshop(richer,'pouch',x.cfg));assert.equal(richer.meta.workshop.pouch,30);
  assert(!x.sim.buyWorkshop(s,'pouch',Object.assign({},x.cfg,{'workshop.pouch.max':5})),'с пределом 5 в настройках шестого уровня нет');
  assert(x.sim.startRun(s,x.cfg,{seed:10}));assert.equal(s.run.hearts,5);assert.equal(s.run.gold,75);
  assert.equal(s.run.tools.probe,2);assert.equal(s.run.tools.lantern,2);assert.equal(x.sim.shopPrice(s,'xray',x.cfg),16);
  assert([4,5].includes(x.sim.fieldSpec(s,x.cfg).caches));
  const f=field(3,3,{0:'1'});f.meta.workshop=s.meta.workshop;f.run.field.vis='--ooooooo';x.sim.tap(f,1,x.cfg);
  assert.equal(f.run.status,'choice');assert.equal(f.run.choices.length,4);assert.equal(x.sim.validate(f),null);
  x.sim.endRun(s,x.cfg);s.meta.unlocked.tidy=true;assert(x.sim.startRun(s,x.cfg,{sapper:'tidy',seed:10}));assert.equal(s.run.hearts,4);
});
test('Подмастерье помечает выводимую мину, Кирка возвращает заряд, Карта раскрывает хозяина',()=>{
  const s=field(9,9,{0:'1',80:'1'});s.run.field.t='d'.repeat(81);s.run.field.t=put(s.run.field.t,1,'.');
  for(const at of [1,2,9,10,11]) s.run.field.vis=put(s.run.field.vis,at,'o');
  x.sim.addFind(s,'apprentice',x.cfg);x.sim.flag(s,70,x.cfg);assert.equal(s.run.field.vis[0],'f');
  const f=field(3,3,{0:'1'});f.run.field.vis='--ooooooo';f.run.tools.probe=0;x.sim.addFind(f,'greedy-pick',x.cfg);
  x.sim.tap(f,1,x.cfg);assert.equal(f.run.tools.probe,1);assert.equal(f.run.noLossFields,1);
  x.sim.addFind(f,'old-map',x.cfg);f.run.fieldIndex=2;assert.equal(x.sim.view(f,x.cfg).bossText,'');
  f.run.fieldIndex=4;assert(x.sim.view(f,x.cfg).bossText.length>0);
});
test('нечисловые индексы, глубина и значения контента не повреждают состояние',()=>{
  const s=field();x.sim.addFind(s,'probe',x.cfg);const before=JSON.stringify(s);
  for(const bad of [NaN,Infinity,-Infinity,0.5,'0',null,undefined]) {
    assert(!x.sim.tap(s,bad,x.cfg));assert(!x.sim.flag(s,bad,x.cfg));assert(!x.sim.useTool(s,'probe',bad,x.cfg));
  }
  assert.equal(JSON.stringify(s),before);
  assert(!x.sim.startRun(x.fresh(),x.cfg,{depth:NaN}));
  for(const bad of [NaN,Infinity,-Infinity]) {
    assert(x.sim.validateStock('daily',{title:'Ошибка',seed:bad,rule:'fog'}));
    assert(x.sim.validateStock('finds',{title:'Ошибка',bricks:[{brick:'hearts',value:bad}]}));
  }
  assert(x.sim.tap(s,1,x.cfg,NaN));assert.equal(x.sim.validate(s),null);
});
test('проверка сохранения отвергает NaN, бесконечности и повреждённые структуры',()=>{
  const base=field();const badCases=[
    s=>{s.run.tools.probe=NaN;},s=>{s.run.tools.boots=1;},s=>{s.run.rng=Infinity;},
    s=>{s.run.lastMult=NaN;},s=>{s.meta.workshop.heart=NaN;},s=>{s.meta.workshop.heart=-1;},
    s=>{s.meta.stats.cells=Infinity;},s=>{s.run.field.clocks[40]=NaN;},s=>{s.run.field.known[0]=8;},
    s=>{s.run.field.w=NaN;},s=>{s.run.field.vis=null;},s=>{s.run.field.clocks=null;},s=>{s.meta.workshop=null;}
  ];
  for(const change of badCases) {const s=JSON.parse(JSON.stringify(base));change(s);assert.doesNotThrow(()=>x.sim.validate(s));assert(x.sim.validate(s));}
  assert.equal(x.sim.validate(base),null);
});
test('браузер проверяет сохранение до init и загрузки конфига',()=>{
  const context={Big:x.Big,Rng:x.Rng,MineBoard:x.env.require('modules/games/minesweeper-rogue/logic/board.js')};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sim.js'),'utf8'),context);
  context.GameSim.configure(x.sim.content());
  const s=field(9,16,{0:'1',143:'2'});s.meta.workshop={heart:2,supplies:3};s.meta.depthUnlocked=12;s.run.depth=12;
  x.sim.addFind(s,'boots',x.cfg);x.sim.addFind(s,'probe',x.cfg);
  assert.equal(context.GameSim.validate(JSON.parse(JSON.stringify(s))),null);
  assert.equal(context.GameSim.validate(x.fresh()),null);
});
test('статистика подсказок учитывает все созданные поля, в том числе незавершённые',()=>{
  const s=fresh(42);x.sim.tap(s,31,x.cfg);assert.equal(s.meta.stats.generated,1);assert.equal(s.meta.stats.fields,0);
  x.sim.endRun(s,x.cfg);x.sim.startRun(s,x.cfg,{seed:43});x.sim.tap(s,31,x.cfg);assert.equal(s.meta.stats.generated,2);
  const old=JSON.parse(JSON.stringify(s));delete old.meta.stats.generated;old.meta.stats.fields=4;
  assert.equal(x.sim.validate(old),null);x.sim.migrate(old,1);assert.equal(old.meta.stats.generated,5);
  old.run.completed=1;delete old.meta.stats.generated;x.sim.migrate(old,1);assert.equal(old.meta.stats.generated,4);
});
test('каждый уровень Удачи клада даёт ожидаемые 10% тайников без сдвига генератора',()=>{
  const s=fresh();const before=s.run.rng;const sums=[0,0,0,0,0,0];
  for(let seed=0;seed<2000;seed++) {
    s.run.seed=seed;let previous=0;
    for(let level=0;level<=5;level++) {
      s.meta.workshop.luck=level;const count=x.sim.fieldSpec(s,x.cfg,2).caches;
      assert(count>=previous);assert.equal(count,x.sim.fieldSpec(s,x.cfg,2).caches);sums[level]+=count;previous=count;
    }
  }
  sums.forEach((sum,level)=>assert(Math.abs(sum/2000-3*(1+level*0.1))<0.05,'cache expectation level '+level));
  assert.equal(s.run.rng,before);
});
test('подсказка земли снимает тупик после хода, сохраняет тайник и переживает загрузку',()=>{
  const s=field(3,3,{0:'1',8:'2'});s.run.field.t='dddddddgd';
  assert(x.sim.tap(s,4,x.cfg));const f=s.run.field;
  assert.equal(f.earthHints[7],true);assert.equal(f.known[7],1);assert.equal(f.vis[7],'-');assert.equal(f.t[7],'g');
  assert.equal(s.run.gold,0);assert.equal(s.meta.stats.hints,1);assert.equal(s.meta.stats.runtimeHints,1);assert.equal(s.meta.stats.runtimeHintFields,1);
  assert.equal(x.sim.view(s,x.cfg).cells[7].earth,true);
  const saved=x.Core.pick([{json:JSON.stringify(s),seq:s.seq,source:'earth-test'}],x.game,x.sim);
  assert(saved.state);assert.equal(saved.state.run.field.earthHints[7],true);assert.equal(x.sim.validate(saved.state),null);
  x.sim.flag(s,0,x.cfg);assert.equal(s.meta.stats.hints,1);assert.equal(s.meta.stats.runtimeHintFields,1);
  x.sim.tap(s,7,x.cfg);assert.equal(s.run.gold,x.cfg['cache.gold']);assert.equal(s.meta.stats.hints,1);
  assert(s.meta.stats.runtimeHints>=2);assert.equal(s.meta.stats.runtimeHintFields,1);
});
test('ошибки человека и альтернативный порядок открытий не блокируют seed1065',()=>{
  const variants=[{}, {heart:1,supplies:2,pouch:2,discount:2,luck:2}, {heart:2,supplies:3,pouch:5,choice:1,discount:4,luck:5}];
  for(let i=0;i<4;i++) {
    const s=x.fresh(1065);s.meta.workshop={...variants[Math.min(i,2)]};s.meta.depthUnlocked=i===3 ? 12:0;
    const result=play(x,s,{seed:1065,depth:s.meta.depthUnlocked,missRate:0.02,roundTrip:true});
    assert(!result.stalled,'seed1065 variant '+i);assert(['won','lost'].includes(s.run.status));assert.equal(x.sim.validate(s),null);
  }
});
test('очень глубокое поле оставляет место первому безопасному квадрату и Широкому шагу',()=>{
  const s=fresh();assert.deepEqual(Array.from({length:7},(_,i)=>x.sim.fieldSpec(s,x.cfg,i).mines),[10,14,18,22,26,30,28]);
  const cfg={...x.cfg,'deep.maxDensity':1,'pure.maxDensity':1,'pure.densityStep':1};
  s.run.mode='deep';s.run.depth=12;x.sim.addFind(s,'stride',cfg);
  const deep=x.sim.fieldSpec(s,cfg,1000);assert.equal(deep.mines,116);assert(deep.doubles<=deep.mines);
  assert(x.sim.fieldSpec(s,x.cfg,30).mines>x.sim.fieldSpec(s,x.cfg,20).mines,'рост плотности продолжается после первых двадцати полей');
  s.run.mode='pure';const pure=x.sim.fieldSpec(s,cfg,1000);assert.equal(pure.mines,pure.w*pure.h-9);assert.equal(pure.doubles,0);
});
test('новый кирпичик действительно проверяет 500 полей, затем использует кеш',()=>{
  const board=x.env.require('modules/games/minesweeper-rogue/logic/board.js');const generate=board.generate;let calls=0;
  board.generate=function(){calls++;return generate.apply(board,arguments);};
  try {
    const value={title:'Тихая геометрия',bricks:[{brick:'visibility',value:1},{brick:'flags',value:1}]};
    assert.equal(x.sim.validateStock('rules',value),null);assert.equal(calls,500);
    assert.equal(x.sim.validateStock('rules',value),null);assert.equal(calls,500);
  } finally {board.generate=generate;}
});
(async()=>{try {await done('sim minesweeper-rogue');} finally {x.env.close();}})();
