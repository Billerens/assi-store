'use strict';
const assert = require('assert');
const { load, test, done } = require('./support');
const x = load();
const { env, sim, cfg, Core, Big, Rng, now, ctx, fresh, game } = x;
process.on('exit', () => env.close());
const n = v => Big.toNumber(v);
const near = (a, b, text, epsilon = 1e-8) => assert.ok(Math.abs(n(a) - n(b)) <= epsilon * Math.max(1, Math.abs(n(a)), Math.abs(n(b))), `${text}: ${n(a)} / ${n(b)}`);
function plant() {
  const s = fresh();
  sim.RESEARCH.forEach(r => { s.run.research[r.id] = true; });
  sim.BUILDINGS.forEach(b => { s.run.b[b.id] = 1; });
  for (const key of ['ore', 'ice', 'alloy', 'water', 'fuel', 'chip', 'data']) s.run[key] = key === 'ore' ? '100000' : 100000;
  s.run.panels = 20;
  s.run.auto.dispatch = false;
  s.run.auto.smelt = false;
  s.run.eventAt = now + 100 * 86400000;
  return s;
}
function offline(s, hours, conf = cfg) {
  const plan = Core.plan(now, now + hours * 3600000, conf, sim.capBonusHours(s));
  return Core.runOffline(sim, s, game, plan, null, seg => ctx(seg.to, true, conf), conf);
}

test('50 % энергии: каждое здание имеет ровно половину полного потока', () => {
  const full = plant();
  const half = Core.clone(full);
  half.run.panels = 1;
  const conf = Object.assign({}, cfg, { 'panel.power': sim.energyUse(half, cfg) / 2 });
  near(sim.energyShare(half, conf, now, false), 0.5, 'энергия');
  sim.tick(full, 1, ctx(now + 1000));
  sim.tick(half, 1, ctx(now + 1000, false, conf));
  for (const key of ['alloy', 'water', 'fuel', 'chip', 'data']) near(half.run.flow[key], full.run.flow[key] / 2, key);
  assert.strictEqual(sim.chains(half), 5);
  assert.strictEqual(sim.validate(half), null);
});

test('цепочка сохраняет материальный баланс, исчерпанные запасы не уходят в минус', () => {
  const s = plant();
  s.run.research.chips = false;
  Object.assign(s.run, { ore: '13', ice: 3, alloy: 0, water: 0, fuel: 0, chip: 0, data: 0 });
  const oreEquivalent = () => n(s.run.ore) + 10 * n(s.run.alloy) + 50 * n(s.run.chip) + 12.5 * n(s.run.data);
  const iceEquivalent = () => n(s.run.ice) + 2 * n(s.run.water) + 6 * n(s.run.fuel) + 5 * n(s.run.chip) + 1.25 * n(s.run.data);
  for (let i = 1; i <= 100; i++) {
    sim.tick(s, 60, ctx(now + i * 60000));
    near(oreEquivalent(), 13, 'сохранение руды');
    near(iceEquivalent(), 3, 'сохранение льда');
    assert.strictEqual(sim.validate(s), null);
  }
  const empty = plant();
  for (const k of ['ore', 'ice', 'alloy', 'water', 'fuel', 'chip', 'data']) empty.run[k] = 0;
  sim.tick(empty, 60, ctx(now + 60000));
  assert.strictEqual(sim.chains(empty), 0);
  for (const k of ['ore', 'ice', 'alloy', 'water', 'fuel', 'chip', 'data']) near(empty.run[k], 0, k);
});

test('офлайн 8 ч: все ресурсы совпадают с онлайном ×0,5 в пределах 1 %', () => {
  const initial = plant();
  initial.run.drones = [25, 10, 5, 3, 1, 0, 0, 0];
  initial.run.breakers = [25, 10, 3];
  sim.BUILDINGS.forEach(b => { initial.run.b[b.id] = 4; });
  const off = Core.clone(initial);
  const on = Core.clone(initial);
  offline(off, 8);
  for (let i = 1; i <= 8 * 3600; i++) sim.tick(on, 0.5, ctx(now + i * 1000));
  const differences = {};
  for (const key of ['ore', 'ice', 'alloy', 'water', 'fuel', 'chip', 'data']) {
    const a = n(off.run[key]);
    const b = n(on.run[key]);
    const diff = Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b));
    differences[key] = +(diff * 100).toFixed(6);
    assert.ok(diff <= 0.01, `${key}: ${diff * 100}%`);
  }
  assert.strictEqual(sim.validate(off), null);
  console.log('  расхождение офлайн 8 ч, %:', JSON.stringify(differences));
});

test('офлайн: мета поднимает долю 0,5 → 1; потолок 12 ч и 24 ч у чёрной дыры', () => {
  const a = fresh();
  a.run.drones[0] = 1;
  const b = Core.clone(a);
  sim.js(b).meta.offline = 5;
  offline(a, 8);
  offline(b, 8);
  near(n(b.run.ore) - 10, 2 * (n(a.run.ore) - 10), 'ночная смена');
  const c = fresh();
  c.run.drones[0] = 1;
  const d = Core.clone(c);
  offline(c, 30);
  offline(d, 12);
  near(c.run.ore, d.run.ore, 'потолок');
  sim.js(d).star = 9;
  assert.strictEqual(sim.capBonusHours(d), 12);
  assert.strictEqual(sim.timeMult(d, cfg), 2);
});

test('ставка и double-offline: валюты Big от движка можно тратить и производить дальше', () => {
  const s = plant();
  const entries = game.currencies.filter(c => /^run\./.test(c.path)).map((c, i) => ({ id: 'award-' + i, at: now, op: 'add', currency: c.id, amount: '125', from: 'steps' }));
  const result = Core.applyInbox(s, game, sim, entries, ctx());
  assert.strictEqual(result.applied.length, 7);
  const before = JSON.stringify(s.run);
  Core.applyInbox(s, game, sim, entries, ctx());
  assert.strictEqual(JSON.stringify(s.run), before, 'ящик применяется только раз');
  sim.tick(s, 5, ctx(now + 5000));
  assert.strictEqual(sim.validate(s), null);
  for (const r of sim.RESOURCES) assert.ok(Big.valid(s.run[r.id]), r.id);
});

test('все правила звёзд, общий запас и отдельные дроны двойной колонии', () => {
  const s = plant();
  s.run.panels = 1;
  s.run.reactor = 0;
  s.run.drones[0] = 1;
  s.run.breakers[0] = 1;
  const ore = sim.oreRate(s, cfg, now);
  const ice = sim.iceRate(s, cfg, now);
  const power = sim.energyProd(s, cfg, now, false);
  sim.js(s).star = 2;
  near(sim.energyProd(s, cfg, now, false), power * 0.4, 'красный: панели');
  near(sim.iceRate(s, cfg, now), ice * 3, 'красный: лёд');
  sim.js(s).star = 3;
  near(sim.energyProd(s, cfg, now, false), power * 3, 'голубой');
  near(sim.flareFree(s, cfg, now, now + 20000), 0, 'вспышка');
  sim.js(s).star = 4;
  near(sim.oreRate(s, cfg, now), ore * 2, 'белый: руда');
  near(sim.iceRate(s, cfg, now), ice * 0.5, 'белый: лёд');
  sim.js(s).star = 5;
  near(sim.starMult(s, cfg, 'data'), 3, 'туманность');
  sim.js(s).star = 6;
  const first = sim.oreRate(s, cfg, now);
  assert.ok(sim.buyDrone(s, 0, cfg, 1, true));
  assert.strictEqual(s.run.drones2[0], 1);
  assert.ok(sim.oreRate(s, cfg, now) > first);
  sim.js(s).star = 7;
  const peak = now + cfg['star.pulsar.period'] * 250;
  assert.ok(sim.tapPeak(s, cfg, peak), 'касание в пик');
  assert.strictEqual(s.run.buffs.peak, peak + cfg['star.pulsar.tapSec'] * 1000);
  sim.js(s).star = 8;
  s.run.wear = 0.5;
  assert.ok(sim.repair(s, cfg));
  assert.strictEqual(s.run.wear, 0);
  sim.js(s).star = 10;
  sim.js(s).rule = 'red';
  near(sim.starMult(s, cfg, 'panels'), 0.16, 'удвоенное правило');
});

test('15 событий применяются однократно; просроченная карточка не платит', () => {
  assert.strictEqual(sim.EVENTS.length, 15);
  for (const event of sim.EVENTS) {
    const s = plant();
    s.run.drones[0] = 20;
    s.run.dome = 4;
    s.run.event = { id: event.id, until: now + 30000 };
    const result = sim.eventTake(s, cfg, 0, now, Rng.make(7));
    assert.ok(result, event.id);
    assert.strictEqual(s.run.event, null);
    const saved = JSON.stringify(s);
    assert.strictEqual(sim.eventTake(s, cfg, 0, now, Rng.make(7)), null);
    assert.strictEqual(JSON.stringify(s), saved);
    assert.strictEqual(sim.validate(s), null);
  }
  const s = fresh();
  s.run.event = { id: 'clot', until: now - 1 };
  sim.eventTake(s, cfg, 0, now, Rng.make(7));
  near(s.layers.jump.currency, 0, 'просроченная ТМ');
});

test('Попутный грузовик: курс колонии ×2, без ледоколов — базовый, не больше 10 минут руды', () => {
  const take = (s) => {
    s.run.event = { id: 'truck', until: now + 30000 };
    sim.eventTake(s, cfg, 0, now, Rng.make(7));
  };
  // With drones and icebreakers: half of the ice × (ore/s ÷ ice/s) × 2.
  const s = plant();
  s.run.drones[0] = 20;
  s.run.breakers[0] = 5;
  s.run.ice = 100;
  s.run.ore = '0';
  const course = sim.oreRate(s, cfg, now) / sim.iceRate(s, cfg, now) * cfg['event.truck.mult'];
  take(s);
  near(s.run.ice, 50, 'продана половина льда');
  near(s.run.ore, 50 * course, 'руда по курсу колонии ×2');
  // A big income scales the course: the event stays worth taking.
  const rich = plant();
  rich.run.drones[0] = 20;
  rich.run.drones[3] = 1e6;
  rich.run.breakers[0] = 5;
  rich.run.ice = 100;
  rich.run.ore = '0';
  take(rich);
  assert.ok(n(rich.run.ore) > 50 * course * 100, 'большой доход — дорогой лёд');
  // Without icebreakers: event.truck.base ore for one ice, ×2.
  const none = plant();
  none.run.ice = 1000;
  none.run.ore = '0';
  take(none);
  near(none.run.ore, 500 * cfg['event.truck.base'] * cfg['event.truck.mult'], 'без ледоколов — базовый курс');
  // Hoarded ice: at most event.truck.capMin minutes of ore.
  const hoard = plant();
  hoard.run.drones[0] = 20;
  hoard.run.breakers[0] = 5;
  hoard.run.ice = 1e9;
  hoard.run.ore = '0';
  const cap = sim.oreRate(hoard, cfg, now) * 60 * cfg['event.truck.capMin'];
  take(hoard);
  near(hoard.run.ore, cap, 'потолок в минутах руды');
});

test('скидка следующего исследования применяется ровно один раз', () => {
  const s = fresh();
  s.run.ore = '10000';
  s.run.mirror = true;
  near(sim.researchCost(s, 'grab', cfg), 150, 'скидка');
  assert.ok(sim.research(s, 'grab', cfg));
  assert.ok(!s.run.mirror);
  near(sim.researchCost(s, 'smelt', cfg), 600, 'следующий узел без скидки');
});

test('сохранение детерминировано; повреждение ловится; миграция v1 сохраняет состояние', () => {
  const s = plant();
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepStrictEqual(sim.migrate(copy, 1), s);
  sim.tick(s, 60, ctx(now + 60000));
  sim.tick(copy, 60, ctx(now + 60000));
  assert.strictEqual(JSON.stringify(s), JSON.stringify(copy));
  const picked = Core.pick([{ state: s, seq: 1, source: 'test' }], game, sim);
  assert.ok(picked.state, JSON.stringify(picked.broken));
  s.run.ore = 'not-a-number';
  assert.ok(sim.validate(s));
  s.run.ore = '1e100';
  s.run.ice = Infinity;
  assert.ok(sim.validate(s), 'Infinity должен отклоняться');
});

test('колонисты ускоряют цепочки; очередь исследований закрывается офлайн', () => {
  const a = plant();
  const b = Core.clone(a);
  b.run.dome = 5;
  b.run.colonists = 25;
  sim.tick(a, 1, ctx(now+1000));
  sim.tick(b, 1, ctx(now+1000));
  near(b.run.flow.alloy, a.run.flow.alloy * 2, 'колонисты: сплавы');
  near(b.run.flow.data, a.run.flow.data * 2, 'колонисты: данные');
  const queued = fresh();
  queued.run.research.ice = true;
  queued.run.data = 50;
  assert.ok(sim.enqueue(queued, 'purify'));
  offline(queued, 1/60);
  assert.ok(sim.has(queued, 'purify'));
  assert.strictEqual(queued.run.queue.length, 0);
  assert.ok(queued.run.away.research.includes('Водоочистка'));
});

test('режимы покупки ×10 / до вехи / макс списывают геометрическую цену', () => {
  for (const mode of ['ten', 'mile', 'max']) {
    const s = fresh();
    s.run.ore = '10000';
    const count = sim.droneCount(s,0,cfg,mode);
    const price = sim.droneCost(s,0,cfg,count);
    assert.ok(sim.buyDrone(s,0,cfg,count));
    assert.strictEqual(s.run.drones[0],count);
    near(s.run.ore,Big.sub(10000,price),'списание '+mode);
    if(mode==='max') assert.ok(Big.lt(s.run.ore,sim.droneCost(s,0,cfg,1)));
  }
});

test('шаги дают ровно топливо 20-минутного рейса; все семь ресурсов есть в попутном грузе', () => {
  const s = plant();
  const before = n(s.run.fuel);
  sim.stepFuel(s,cfg);
  near(n(s.run.fuel)-before,sim.expFuel(s,1,cfg),'топливо шагов');
  s.run.drones[0]=1;
  s.run.breakers[0]=1;
  sim.tick(s,1,ctx(now+1000));
  const loot=sim.chest(s,Rng.make(3),cfg);
  assert.strictEqual(loot.items.length,7,'семь ресурсов');
  assert.strictEqual(sim.validate(s),null);
});
test('пульсар и автоматика: офлайн шагами 60 с и 1 с совпадает в пределах 1 %', () => {
  for (const star of [1,7]) {
    const base = plant();
    sim.js(base).star=star;
    base.run.drones=[50,25,10,5,2,1,1,1];
    base.run.breakers=[50,20,5];
    base.run.auto.dispatch=true;
    base.run.auto.smelt=true;
    base.run.ore='1e9';
    base.run.panels=1;
    base.run.reactor=0;
    const conf=Object.assign({},cfg,{'panel.power':sim.energyUse(base,cfg)});
    const a=Core.clone(base);
    const b=Core.clone(base);
    offline(a,1,conf);
    offline(b,1,Object.assign({},conf,{'offline.stepSec':1,'offline.maxSteps':100000}));
    for(const k of ['ore','ice','alloy','water','fuel','chip','data']) near(a.run[k],b.run[k],'звезда'+star+' '+k,0.01);
    assert.strictEqual(sim.validate(a),null);
  }
});

test('большие запасы остаются Big-совместимыми после производства и покупок', () => {
  const s=plant();
  for(const k of ['ore','ice','alloy','water','fuel','chip','data'])s.run[k]='1e100';
  sim.tick(s,60,ctx(now+60000));
  assert.ok(sim.buyDrone(s,0,cfg,10));
  assert.ok(sim.buyBuilding(s,'smelter',cfg));
  assert.ok(sim.buildEngine(s,cfg));
  assert.strictEqual(sim.validate(s),null);
  for(const k of ['ore','ice','alloy','water','fuel','chip','data'])assert.ok(Big.valid(s.run[k]),k);
});
test('Тихий час доступен при любом построенном здании, без неполного конфига энергии', () => {
  for (const building of [null].concat(sim.BUILDINGS.map(b=>b.id))) {
    const s=fresh();
    if(building)s.run.b[building]=1;
    s.run.eventAt=now+1;
    let eligible=[];
    const context=ctx(now+1000);
    context.rng={range:()=>120,chance:()=>false,weighted:list=>{eligible=list.map(e=>e.id);return list.find(e=>e.id==='calm')||list[0];}};
    sim.tick(s,1,context);
    assert.strictEqual(eligible.includes('calm'),!!building,'здание '+building);
    assert.strictEqual(sim.validate(s),null);
  }
});
test('ТМ и маяки 1e1000 не превращают нулевой бонус в NaN; престиж сохраняет большой прирост', () => {
  const s=fresh();
  s.run.drones[0]=1;
  s.layers.jump.currency='1e1000';
  s.layers.cluster.currency='1e1000';
  assert.ok(Number.isFinite(sim.oreRate(s,cfg,now)));
  near(sim.bonus(s,'jump','1e1000',cfg),1,'нулевой бонус ТМ');
  near(sim.bonus(s,'cluster','1e1000',cfg),1,'нулевой бонус маяков');
  assert.ok(Big.valid(sim.dm(s)) && Big.valid(sim.beacons(s)));
  assert.ok(sim.buyMeta(s,'mine',cfg));
  s.run.mined='1e1000';
  s.run.engine=true;
  const gain=sim.prestigeGain(s,'jump',cfg);
  assert.ok(Core.prestige(sim,game,s,'jump',ctx()).ok);
  assert.strictEqual(Big.str(sim.js(s).total),Big.str(gain),'прирост сохранён в точности формата Big, независимо от округления кошелька');
  assert.strictEqual(sim.validate(s),null);
  assert.strictEqual(Core.validate(s,game),null);
});
test('мета без потолка: добыча, здания и колонисты растут дальше, цена растёт; разовые упираются в предел', () => {
  const s = fresh();
  s.layers.jump.currency = '1e12';
  for (const id of ['mine', 'build', 'colonists']) {
    assert.strictEqual(sim.metaMax(id, cfg), Infinity, id + ' без предела');
    let last = 0;
    for (let i = 0; i < 25; i++) {
      const cost = sim.metaCost(s, id, cfg);
      assert.ok(cost > last, id + ': цена растёт на уровне ' + i);
      last = cost;
      assert.ok(sim.buyMeta(s, id, cfg), id + ': уровень ' + (i + 1));
    }
    assert.strictEqual(sim.lvl(s, id), 25);
  }
  s.run.drones[0] = 1;
  const rate = sim.oreRate(s, cfg, now);
  assert.ok(Number.isFinite(rate) && rate > 0, 'доход конечен');
  assert.ok(sim.buildingCost(s, 'smelter', cfg) > 0, 'здание не бесплатное');
  // Bounded by what they do: nine tree nodes, an offline share of 1, a floor of the flight time.
  for (const id of ['research', 'offline', 'exp', 'memory']) {
    const max = sim.metaMax(id, cfg);
    assert.ok(Number.isFinite(max), id + ' с пределом');
    while (sim.buyMeta(s, id, cfg)) { /* to the ceiling */ }
    assert.strictEqual(sim.lvl(s, id), max);
  }
  assert.ok(sim.offlineRate(s, cfg) <= 1);
  assert.strictEqual(sim.validate(s), null);
});
test('память дронов: по 10 % за уровень остаётся после прыжка', () => {
  const s = fresh();
  s.run.drones[0] = 200;
  s.run.mined = '1e13';
  s.run.engine = true;
  sim.js(s).meta.memory = 3;
  assert.ok(Core.prestige(sim, game, s, 'jump', ctx()).ok);
  assert.strictEqual(s.run.drones[0], Math.floor(200 * 3 * cfg['meta.memory.share']));
});
test('вехи дронов не кончаются: после списка — каждые drone.milestoneEvery', () => {
  const list = String(cfg['drone.milestones']).split(',').map(Number);
  const last = list[list.length - 1];
  const every = cfg['drone.milestoneEvery'];
  const full = Math.pow(cfg['drone.milestoneMult'], list.length);
  assert.strictEqual(sim.nextMilestone(last, cfg), last + every);
  assert.strictEqual(sim.milestoneMult(last + every - 1, cfg), full);
  assert.strictEqual(sim.milestoneMult(last + every, cfg), full * cfg['drone.milestoneMult']);
  assert.strictEqual(sim.nextMilestone(last + every, cfg), last + 2 * every);
  assert.strictEqual(sim.milestoneMult(last + 3 * every + 5, cfg), full * Math.pow(cfg['drone.milestoneMult'], 3));
  assert.ok(Number.isFinite(sim.milestoneMult(1e9, cfg)), 'множитель конечен при любом числе дронов');
  const off = Object.assign({}, cfg, { 'drone.milestoneEvery': 0 });
  assert.strictEqual(sim.nextMilestone(last, off), null);
  assert.strictEqual(sim.milestoneMult(last * 10, off), full);
});
done('economy asteroid-colony');






