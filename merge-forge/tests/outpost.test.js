'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { open, ctxOf, test, done, GAME } = require('./env');
const x = open();
const O = x.env.require('modules/games/merge-forge/outpost.js');
const cfg = Object.assign({}, x.cfg, O.defaults);
const NOW = Date.UTC(2026, 10, 16, 12);
const json = value => JSON.parse(JSON.stringify(value));
function fresh(wave = 1) {
  const state = x.Core.newState(x.game, x.sim, ctxOf(x, NOW, x.Rng.make(92)));
  state.run.maxWave = wave;
  O.ensure(state);
  return state;
}
const cells = state => x.sim.openCells(state, cfg);
function equalBig(a, b) { assert.equal(x.Big.str(x.Big.of(a)), x.Big.str(x.Big.of(b))); }
function inventory(state) {
  return state.run.grid.concat(state.run.pending).filter(Boolean)
    .concat(state.run.outpost.rack.map(g => g.level))
    .concat(Object.values(state.run.outpost.equipment).filter(Boolean).map(g => g.level))
    .concat(state.run.outpost.dragon.queue.map(g => g.level)).sort((a,b) => a-b);
}
function readyHero(state, id, level, cell = 0) {
  assert.ok(O.recruit(state, cfg, id).ok);
  state.run.grid[cell] = level;
  assert.ok(O.equip(state, cfg, cell, id, cells(state)).ok);
}

test('новая схема добавляется без потери старого поля, очереди, валют и неизвестных данных', () => {
  const state = fresh(35);
  delete state.run.outpost;delete state.meta.outpost;
  state.run.grid[34] = 67;state.run.pending = [4, 9];state.meta.custom = { preserve: true };
  const before = json(state);
  O.migrate(state);
  assert.deepStrictEqual(json(state.run.grid), before.run.grid);
  assert.deepStrictEqual(json(state.run.pending), before.run.pending);
  assert.deepStrictEqual(json(state.layers), before.layers);
  assert.equal(state.run.gold, before.run.gold);
  assert.deepStrictEqual(json(state.meta.custom), before.meta.custom);
  const once = JSON.stringify(state);O.migrate(state);assert.equal(JSON.stringify(state), once);
  assert.equal(state.run.outpost.dragon.anchorLevel, 67);
  assert.equal(O.validate(state), null);
  equalBig(O.passivePower(state, cfg), 0);
});

test('открытия и выбор героя не дают силу до экипировки', () => {
  const state = fresh();
  assert.equal(O.recruit(state, cfg, 'bran').ok, false);
  assert.equal(O.choosePet(state, cfg, 'fox').ok, false);
  assert.equal(O.feed(state, cfg, 0, cells(state)).ok, false);
  state.run.maxWave = 10;
  assert.equal(O.recruit(state, cfg, 'bran').ok, false);
  state.run.maxWave = 11;
  assert.ok(O.recruit(state, cfg, 'bran').ok);
  assert.equal(O.recruit(state, cfg, 'bran').ok, false);
  assert.equal(O.selectHero(state, cfg, 'veya').ok, false);
  equalBig(O.passivePower(state, cfg), 0);
  assert.equal(O.active(state, cfg, 'bran').ok, false);
  assert.equal(O.model(state, cfg).nextUnlock.wave, 20);
});

test('экипировка перемещает настоящий клинок и резерв не удваивает урон', () => {
  const state = fresh(30);state.run.grid[0] = 7;state.run.grid[1] = 8;
  const before = inventory(state);
  assert.ok(O.recruit(state, cfg, 'bran').ok);assert.ok(O.recruit(state, cfg, 'veya').ok);
  assert.ok(O.equip(state, cfg, 0, 'bran', cells(state)).ok);
  assert.equal(state.run.grid[0], 0);
  assert.ok(O.equip(state, cfg, 1, 'veya', cells(state)).ok);
  equalBig(O.passivePower(state, cfg), O.heroPower(state, cfg, 'bran'));
  assert.ok(O.selectHero(state, cfg, 'veya').ok);
  equalBig(O.passivePower(state, cfg), O.heroPower(state, cfg, 'veya'));
  assert.deepStrictEqual(inventory(state), before);
  assert.ok(O.unequip(state, cfg, 'bran', cells(state)).ok);
  assert.deepStrictEqual(inventory(state), before);
  assert.equal(O.validate(state), null);
});

test('закалённое оружие сохраняется на стойке, переполнение отменяет замену целиком', () => {
  const state = fresh(30);readyHero(state, 'bran', 3);
  state.run.gold = '1e12';
  const cost = O.temperCost(state, cfg, 'bran');const gold = state.run.gold;
  assert.ok(O.temper(state, cfg, 'bran', 'fire').ok);equalBig(state.run.gold, x.Big.sub(gold, cost));
  state.run.grid[1] = 5;const before = inventory(state);
  assert.ok(O.equip(state, cfg, 1, 'bran', cells(state)).ok);
  assert.deepStrictEqual(json(state.run.outpost.rack[0]), { level: 3, temper: 'fire' });
  assert.ok(O.equipRack(state, cfg, 0, 'bran').ok);
  assert.equal(state.run.outpost.equipment.bran.temper, 'fire');
  assert.deepStrictEqual(inventory(state), before);
  while (state.run.outpost.rack.length < cfg['outpost.rack.size']) state.run.outpost.rack.push({ level: 2, temper: 'ice' });
  state.run.grid[2] = 8;
  const snapshot = JSON.stringify(state);
  assert.equal(O.equip(state, cfg, 2, 'bran', cells(state)).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(O.unequip(state, cfg, 'bran', cells(state)).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
});

test('экипировка сохраняет купленную закалку и средний крит без глобального умножения', () => {
  const state=fresh(30);state.run.grid.fill(0);state.run.grid[0]=15;
  state.run.up.temper=6;state.run.up.eye=3;state.run.up.hand=2;
  const crit=1+x.sim.critChance(state,cfg)*(x.sim.critMult(state,cfg)-1);
  const expected=x.Big.mul(x.sim.cellDmg(state,cfg,0),crit);
  readyHero(state,'bran',15);
  equalBig(O.heroPower(state,cfg,'bran'),expected);
  const power=O.heroPower(state,cfg,'bran');
  // Угли и Острота — общий множитель боя, он не входит в силу оружия; только особое свойство
  // 50-го уровня Остроты (шанс крита) меняет средний крит, как у клинка на поле.
  x.sim.forgeLayer(state).currency='1e6';state.run.up.sharp=49;
  equalBig(O.heroPower(state,cfg,'bran'),power);
  state.run.up.sharp=100;
  equalBig(O.heroPower(state,cfg,'bran'),x.Big.mul(x.Big.div(expected,crit),1+x.sim.critChance(state,cfg)*(x.sim.critMult(state,cfg)-1)));
});

test('недостаток золота и неверные адреса не расходуют предметы', () => {
  const state = fresh(30);readyHero(state, 'bran', 6);state.run.gold = '0e0';
  const before = JSON.stringify(state);
  assert.equal(O.temper(state, cfg, 'bran', 'ice').ok, false);
  assert.equal(O.equipRack(state, cfg, -1, 'bran').ok, false);
  assert.equal(O.equip(state, cfg, 34, 'bran', cells(state)).ok, false);
  assert.equal(O.feed(state, cfg, 34, cells(state)).ok, false);
  assert.equal(JSON.stringify(state), before);
});

test('стойка освобождается явным снятием закалки без потери уровня', () => {
  const state=fresh(30);state.run.outpost.rack=[{level:18,temper:'fire'}];
  cells(state).forEach(cell=>state.run.grid[cell]=2);
  const before=JSON.stringify(state);
  assert.equal(O.releaseRack(state,cfg,0,cells(state)).ok,false);
  assert.equal(JSON.stringify(state),before);
  state.run.grid[0]=0;const inventoryBefore=inventory(state);
  const result=O.releaseRack(state,cfg,0,cells(state));
  assert.ok(result.ok);assert.equal(result.removedTemper,'fire');
  assert.equal(state.run.grid[0],18);assert.equal(state.run.outpost.rack.length,0);
  assert.deepStrictEqual(inventory(state),inventoryBefore);
  assert.equal(O.releaseRack(state,cfg,0,cells(state)).ok,false);
});

test('перезарядку нельзя сбросить переключением героя или оружия; стихии только активные', () => {
  const state = fresh(30);readyHero(state, 'bran', 4);readyHero(state, 'veya', 5, 1);
  state.run.gold = '1e12';O.temper(state, cfg, 'bran', 'fire');O.temper(state, cfg, 'veya', 'ice');
  assert.deepStrictEqual(json(O.elements(state, cfg)), { fire: true, ice: false, resonant: false });
  assert.ok(O.active(state, cfg, 'bran').ok);
  assert.equal(O.active(state, cfg, 'bran').ok, false);
  const cd = state.run.outpost.cooldowns.bran;
  O.selectHero(state, cfg, 'veya');O.selectHero(state, cfg, 'bran');
  assert.equal(state.run.outpost.cooldowns.bran, cd);
  state.run.grid[2] = 6;assert.ok(O.equip(state, cfg, 2, 'bran', cells(state)).ok);
  assert.equal(O.active(state, cfg, 'bran').ok, false);
  x.sim.forgeLayer(state).state.mf.team = 1;
  assert.ok(O.selectHero(state,cfg,'veya').ok);
  assert.ok(O.model(state,cfg).heroes.filter(h=>h.id==='bran'||h.id==='veya').every(h=>h.active));
  assert.ok(O.model(state,cfg).heroes.filter(h=>h.id==='eira'||h.id==='corvin').every(h=>!h.active&&!h.unlocked));
  assert.deepStrictEqual(json(O.elements(state, cfg)), { fire: false, ice: true, resonant: false });
  O.tick(state, cd, cfg, { offline: true });assert.ok(O.active(state, cfg, 'bran').ok);
});

test('дракон съедает только выбранные клинки и начисляет исходную долю один раз', () => {
  const state = fresh(30);state.run.grid[0] = 5;state.run.grid[1] = 6;state.run.grid[2] = 7;
  O.noteForged(state, 10);
  const before = inventory(state);const previews = [];
  for (let cell=0;cell<3;cell++) { previews.push(O.feedPreview(state,cfg,cell,cells(state)));assert.ok(O.feed(state,cfg,cell,cells(state)).ok); }
  assert.deepStrictEqual(inventory(state), before);
  assert.equal(O.feed(state,cfg,0,cells(state)).ok,false);
  state.run.grid[3] = 4;assert.equal(O.feed(state,cfg,3,cells(state)).ok,false);
  equalBig(state.meta.outpost.dragon.absorbed,0);
  const result=O.tick(state,60,cfg,{offline:true});assert.equal(result.fed,3);
  let sum=x.Big.ZERO;previews.forEach(p=>sum=x.Big.add(sum,p.absorbed));equalBig(state.meta.outpost.dragon.absorbed,sum);
  assert.equal(O.model(state,cfg).dragon.stage,'young');assert.equal(state.run.grid[3],4);
  const unchanged=state.meta.outpost.dragon.absorbed;O.tick(state,100000,cfg,{offline:true});equalBig(state.meta.outpost.dragon.absorbed,unchanged);
  assert.equal(O.validate(state),null);
});

test('дракон берёт клинки не выше лучшего в забеге минус отступ', () => {
  const state = fresh(30);O.noteForged(state, 10);
  state.run.grid[0] = 8;state.run.grid[1] = 7;
  const strong = O.feedPreview(state, cfg, 0, cells(state));
  assert.equal(strong.ok, false);assert.equal(strong.reason, 'Выберите клинок слабее');
  assert.ok(O.feed(state, cfg, 1, cells(state)).ok);
  assert.equal(O.model(state, cfg).dragon.feedMaxLevel, 7);
  const wide = Object.assign({}, cfg, { 'outpost.dragon.gap': 0 });
  assert.ok(O.feed(state, wide, 0, cells(state)).ok);
});

test('кормлений за забег не больше предела; перековка начинает счёт заново, реликвия добавляет', () => {
  const state = fresh(30);O.noteForged(state, 20);
  const limit = cfg['outpost.dragon.perRun'];
  assert.equal(O.feedLimit(state, cfg), limit);
  for (let i = 0; i < limit; i++) {
    state.run.grid[0] = 5;assert.ok(O.feed(state, cfg, 0, cells(state)).ok, 'кормление ' + (i + 1));
    O.tick(state, 1000, cfg, { offline: true });
  }
  state.run.grid[0] = 5;
  const sated = O.feed(state, cfg, 0, cells(state));
  assert.equal(sated.ok, false);assert.equal(sated.reason, 'Дракон сыт до перековки');
  assert.equal(state.run.grid[0], 5);
  assert.deepStrictEqual([O.model(state, cfg).dragon.eaten, O.model(state, cfg).dragon.feedLimit], [limit, limit]);
  state.meta.artifacts = { version: 1, items: { hungryCrop: { level: 1, enabled: true, cooldown: 0 } } };
  assert.equal(O.feedLimit(state, cfg), limit + 1);
  assert.ok(O.feed(state, cfg, 0, cells(state)).ok);
  state.meta.artifacts.items.hungryCrop.level = 1000;
  assert.ok(O.feedLimit(state, cfg) <= limit + 5);
  O.onPrestige(state);
  assert.equal(state.run.outpost.dragon.eaten, 0);
  assert.equal(O.validate(state), null);
});

test('старое сохранение без счёта кормлений читается, испорченный счёт — нет', () => {
  const state = fresh(30);
  delete state.run.outpost.dragon.eaten;
  O.ensure(state);assert.equal(state.run.outpost.dragon.eaten, 0);assert.equal(O.validate(state), null);
  state.run.outpost.dragon.eaten = -1;assert.equal(O.validate(state), 'кормление повреждено');
  state.run.outpost.dragon.eaten = 1.5;assert.equal(O.validate(state), 'кормление повреждено');
});

test('подготовленное умение фиксирует владельца и оружие до настоящего залпа', () => {
  const state=fresh(30);readyHero(state,'bran',9);readyHero(state,'veya',5,1);
  state.run.gold='1e10';state.run.grid[2]=10;
  state.run.outpost.rack=[{level:12,temper:'ice'}];
  const skill=O.active(state,cfg,'bran');assert.ok(skill.ok);
  state.run.encounter={pending:[skill]};
  const before=JSON.stringify(state);
  assert.equal(O.equip(state,cfg,2,'bran',cells(state)).ok,false);
  assert.equal(O.unequip(state,cfg,'bran',cells(state)).ok,false);
  assert.equal(O.equipRack(state,cfg,0,'bran').ok,false);
  assert.equal(O.temper(state,cfg,'bran','fire').ok,false);
  assert.equal(O.selectHero(state,cfg,'veya').ok,false);
  assert.equal(JSON.stringify(state),before);
  state.run.encounter.pending=[];
  assert.ok(O.equipRack(state,cfg,0,'bran').ok);
  assert.ok(O.selectHero(state,cfg,'veya').ok);
});

test('переваривание совпадает длинным и короткими шагами, включая улучшение ухода', () => {
  const state=fresh(30);O.noteForged(state,8);for(let c=0;c<3;c++){state.run.grid[c]=c+3;assert.ok(O.feed(state,cfg,c,cells(state)).ok);}
  x.sim.forgeLayer(state).state.mf.dragonCare=7;
  const split=json(state),whole=json(state);
  O.tick(whole,35.5,cfg,{offline:true});for(let i=0;i<355;i++)O.tick(split,.1,cfg,{offline:true});
  equalBig(whole.meta.outpost.dragon.absorbed,split.meta.outpost.dragon.absorbed);
  assert.equal(whole.meta.outpost.dragon.fed,split.meta.outpost.dragon.fed);
  assert.equal(whole.run.outpost.dragon.queue.length,split.run.outpost.dragon.queue.length);
  if(whole.run.outpost.dragon.queue.length)assert.ok(Math.abs(whole.run.outpost.dragon.queue[0].left-split.run.outpost.dragon.queue[0].left)<1e-7);
});

test('сила дракона ограничена текущим горном и не использует глобальные множители', () => {
  const state=fresh(40);state.meta.bestLevel=900;state.meta.outpost.dragon.fed=20;state.meta.outpost.dragon.absorbed='1e700';
  O.noteForged(state,900);const cap=O.basePower(cfg,900);const power=O.dragonPower(state,cfg);
  assert.ok(x.Big.valid(power)&&x.Big.gt(power,0)&&x.Big.lte(power,cap));
  x.sim.forgeLayer(state).currency='1e100';state.layers.star={currency:'1e4',count:5,state:{}};
  equalBig(O.dragonPower(state,cfg),power);
  const persistent=json(state.meta.outpost);state.run=x.sim.init({config:cfg,rng:x.Rng.make(10)}).run;
  O.onPrestige(state);
  assert.deepStrictEqual(json(state.meta.outpost),persistent);
  assert.equal(state.run.outpost.dragon.anchorLevel,1);
  assert.ok(x.Big.lte(O.dragonPower(state,cfg),O.basePower(cfg,1)));
  assert.equal(state.run.outpost.dragon.queue.length,0);
});

test('дыхание тратит заряд один раз, опыт получают только вооружённые активные герои', () => {
  const state=fresh(30);readyHero(state,'bran',3);readyHero(state,'veya',4,1);
  O.onKill(state,cfg,true);assert.equal(state.meta.outpost.heroes.bran.xp,3);assert.equal(state.meta.outpost.heroes.veya.xp,0);
  state.meta.outpost.dragon.fed=3;state.meta.outpost.dragon.absorbed='1e3';state.run.outpost.dragon.charge=100;
  const result=O.active(state,cfg,'dragon');assert.ok(result.ok);assert.ok(x.Big.gt(result.damage,0));
  assert.equal(state.run.outpost.dragon.charge,0);assert.equal(O.active(state,cfg,'dragon').ok,false);
  state.meta.outpost.heroes.bran.xp=1e15;
  const crit=1+x.sim.critChance(state,cfg)*(x.sim.critMult(state,cfg)-1);
  assert.ok(x.Big.lte(O.heroPower(state,cfg,'bran'),x.Big.mul(O.basePower(cfg,3),(1+cfg['outpost.hero.masteryMax'])*crit)));
});

test('питомцы дают ограниченную помощь по событиям и не меняют сами ковку или предметы', () => {
  const state=fresh(20);assert.ok(O.choosePet(state,cfg,'salamander').ok);
  const grid=JSON.stringify(state.run.grid),clock=state.run.forgeT;
  let bonus=0;for(let i=0;i<12;i++)bonus+=O.onTap(state,cfg);assert.equal(bonus,.5);
  assert.equal(JSON.stringify(state.run.grid),grid);assert.equal(state.run.forgeT,clock);
  assert.equal(O.onMerge(state,cfg),0);
  O.choosePet(state,cfg,'fox');bonus=0;for(let i=0;i<3;i++)bonus+=O.onMerge(state,cfg);assert.equal(bonus,.75);
  assert.equal(O.onTap(state,cfg),0);
  x.sim.forgeLayer(state).state.mf.rhythm=6;bonus=0;for(let i=0;i<30;i++)bonus+=O.onMerge(state,cfg);assert.ok(bonus>7.5&&bonus<15);
  assert.equal(JSON.stringify(state.run.grid),grid);
});

test('сохранение переносится через JSON и валидатор ловит повреждённое оружие', () => {
  const state=fresh(30);readyHero(state,'bran',9);state.run.gold='1e12';O.temper(state,cfg,'bran','resonant');
  const loaded=json(state);O.ensure(loaded);assert.equal(O.validate(loaded),null);
  assert.deepStrictEqual(json(O.model(loaded,cfg)),json(O.model(state,cfg)));
  loaded.run.outpost.equipment.bran.level=Infinity;assert.ok(O.validate(loaded));
});

test('core соответствует ES5 и конфигурация содержит все параметры', () => {
  const source=fs.readFileSync(path.join(GAME,'outpost.js'),'utf8');
  assert.deepStrictEqual(json(x.Core.lint(source,true)),[]);
  const declarations=JSON.parse(fs.readFileSync(path.join(GAME,'config.json'),'utf8'));
  for(const [key,value] of Object.entries(O.defaults))assert.equal(declarations[key].value,value,key);
});

done('outpost');
