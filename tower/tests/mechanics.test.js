'use strict';
const assert = require('assert');
const { H, open, ctx } = require('./env');
const Bot = require('./bot');

const w = open();
const x = w.x;
const context = () => ctx(x, Bot.T0, x.Rng.make(41));
function act(s, a, extra) { return x.sim.act(s, a, ctx(x, Bot.T0, x.Rng.make(41), extra)); }
function fresh(seed) {
  const s = Bot.fresh(x, seed || 1);
  assert.ok(act(s, { type: 'start', seed: seed || 1, classId: 'guardian', height: 1 }).ok);
  return s;
}
function combat(id, relics) {
  const s = fresh(21);
  x.sim.beginCombat(s, false, false, context(), x.Rng.make(21));
  const h = s.run.hero;
  Object.assign(h, { hp: 100, maxHp: 100, baseHp: 100, strength: 10, baseStrength: 10,
    defense: 8, baseDefense: 8, agility: 0, baseAgility: 0, dodge: 0, will: 10, maxWill: 10, baseWill: 10 });
  s.run.moves = { strike: 0, block: 0, lunge: 0, reflect: 0, sweep: 0, dash: 0, read: 0, flame: 0, breathe: 0, execute: 0 };
  s.run.hand = [id || 'strike'];
  s.run.relics = relics || [];
  Object.assign(s.run.enemy, { id: 'piper', template: 'piper', hp: 100, maxHp: 100, attack: 5, defense: 0,
    turn: 1, attacks: 0, power: 1, attackPower: 1, shield: 0, plates: 0, burn: 0, heroBurn: 0, modifier: null, elite: false, boss: false,
    read: false, locked: [], intent: { type: 'attack', amount: 5, hits: 1, hidden: false, charged: false } });
  return s;
}
function play(s, id) {
  s.run.hand = [id];
  const result = act(s, { type: 'play', id });
  assert.ok(result && result.ok, JSON.stringify(result));
  return result;
}
function close(actual, expected, message) { assert.ok(Math.abs(actual - expected) < 1e-8, (message || '') + ': ' + actual + ' != ' + expected); }

H.test('этажи: формула силы, пятый — лавка/отдых, девятый — отдых, десятый — босс', () => {
  const s = fresh();
  for (const floor of [1, 5, 10, 30, 31, 100]) close(x.sim.power(floor, x.cfg), 1 + 0.09 * floor + 0.002 * floor * floor);
  for (const first of [0, 10, 20, 30]) {
    assert.deepStrictEqual(x.sim.doorsAt(s, first + 5, x.cfg).map((d) => d.type), ['shop', 'rest']);
    assert.deepStrictEqual(x.sim.doorsAt(s, first + 9, x.cfg).map((d) => d.type), ['rest']);
    assert.deepStrictEqual(x.sim.doorsAt(s, first + 10, x.cfg).map((d) => d.type), ['boss']);
  }
  for (let seed = 1; seed <= 200; seed++) {
    s.run.seed = seed;
    for (const floor of [1, 2, 11, 12, 21, 22]) assert.ok(!x.sim.doorsAt(s, floor, x.cfg).some((d) => d.type === 'elite'));
    const doors = x.sim.doorsAt(s, 3, x.cfg);
    assert.ok(doors.length >= 2 && doors.length <= 3);
    assert.strictEqual(new Set(doors.map((d) => d.type)).size, doors.length);
  }
  s.run.relics = ['lamp'];
  assert.ok(x.sim.doorsAt(s, 3, x.cfg).length >= 3);
  s.meta.tower.workshop.doors = 2;
  assert.ok(x.sim.doorsAt(s, 1, x.cfg).length >= 4);
});

H.test('осколки: точная формула, гибель 60/70/80%, высота и двойная выплата запрещена', () => {
  const s = fresh();
  Object.assign(s.run, { floor: 20, bosses: 2, elites: 3 });
  assert.strictEqual(x.Big.toNumber(x.sim.shardReward(s, x.cfg, false)), 85);
  assert.strictEqual(x.Big.toNumber(x.sim.shardReward(s, x.cfg, true)), 51);
  s.meta.tower.workshop.memory = 1;
  assert.strictEqual(x.Big.toNumber(x.sim.shardReward(s, x.cfg, true)), 59);
  s.meta.tower.workshop.memory = 2;
  assert.strictEqual(x.Big.toNumber(x.sim.shardReward(s, x.cfg, true)), 68);
  s.run.height = 12;
  assert.strictEqual(x.Big.toNumber(x.sim.shardReward(s, x.cfg, false)), Math.floor(85 * 2.1));
  s.run.phase = 'fork';
  assert.ok(act(s, { type: 'descend' }).ok);
  const shards = x.Big.str(s.meta.tower.shards);
  assert.ok(!act(s, { type: 'descend' }).ok);
  assert.strictEqual(x.Big.str(s.meta.tower.shards), shards);
});

H.test('удар и выпад: одновременно с намерением, сила и множитель', () => {
  const strike = combat('strike');
  play(strike, 'strike');
  close(strike.run.enemy.hp, 90);
  close(strike.run.hero.hp, 95);
  const lunge = combat('lunge');
  play(lunge, 'lunge');
  close(lunge.run.enemy.hp, 100 - 10 * x.cfg['move.lunge']);
  close(lunge.run.hero.hp, 95);
});

H.test('блок и отражение: поглощают удар, только излишек возвращается', () => {
  const block = combat('block');
  play(block, 'block');
  close(block.run.hero.hp, 100);
  close(block.run.enemy.hp, 100);
  const reflect = combat('reflect');
  play(reflect, 'reflect');
  close(reflect.run.hero.hp, 100);
  close(reflect.run.enemy.hp, 97);
});

H.test('подсечка: половина урона, следующее намерение вполовину слабее', () => {
  const s = combat('sweep');
  play(s, 'sweep');
  close(s.run.enemy.hp, 95);
  assert.strictEqual(s.run.enemy.intent.amount, Math.round(5 * 0.5));
});

H.test('рывок: смертельный удар отменяет действие врага; обычный удар — нет', () => {
  const dash = combat('dash');
  dash.run.enemy.hp = 5;
  play(dash, 'dash');
  close(dash.run.hero.hp, 100);
  assert.ok(dash.run.phase !== 'combat');
  const strike = combat('strike');
  strike.run.enemy.hp = 5;
  play(strike, 'strike');
  close(strike.run.hero.hp, 95);
});

H.test('чтение, пламя, передышка, казнь и нехватка воли', () => {
  const read = combat('read');
  play(read, 'read');
  assert.ok(read.run.enemy.read);
  const flame = combat('flame');
  play(flame, 'flame');
  close(flame.run.enemy.burn, x.cfg['move.flame']);
  close(flame.run.enemy.hp, 100 - x.cfg['move.flame']);
  play(flame, 'flame');
  close(flame.run.enemy.burn, x.cfg['move.flame'] * 2);
  close(flame.run.enemy.hp, 100 - x.cfg['move.flame'] * 3);
  const breathe = combat('breathe');
  breathe.run.hero.hp = 50;
  play(breathe, 'breathe');
  close(breathe.run.hero.hp, 50 + 100 * x.cfg['move.breathe'] - 5);
  assert.strictEqual(breathe.run.hero.will, 9);
  const cannot = combat('breathe');
  cannot.run.hero.will = 0;
  const before = JSON.stringify(cannot.run);
  assert.ok(!act(cannot, { type: 'play', id: 'breathe' }).ok);
  assert.strictEqual(JSON.stringify(cannot.run), before);
  const execute = combat('execute');
  execute.run.enemy.hp = 24;
  play(execute, 'execute');
  assert.ok(execute.run.phase !== 'combat');
  const boundary = combat('execute');
  boundary.run.enemy.hp = 25;
  play(boundary, 'execute');
  assert.strictEqual(boundary.run.enemy.hp, 25, 'при ровно 25% казнь не срабатывает');
});

H.test('оборонительная сборка: Отражение + Зеркало + Вторая тень', () => {
  const s = combat('reflect', ['mirror', 'shadow']);
  play(s, 'reflect');
  const defense = 8 * (1 + x.cfg['relic.shadow.power']);
  close(s.run.hero.hp, 100);
  close(s.run.enemy.hp, 100 - (defense - 5) * x.cfg['relic.mirror.mult']);
});

H.test('Двойная тетива, Вторая тень, Спящая змея и Обет тишины', () => {
  const bow = combat('strike', ['bow', 'shadow']);
  play(bow, 'strike');
  close(bow.run.enemy.hp, 100 - 10 * 2 * 0.6 * 1.4);
  const snake = combat('strike', ['snake']);
  play(snake, 'strike');
  close(snake.run.enemy.burn, 2);
  close(snake.run.enemy.hp, 88);
  const vow = combat('strike', ['vow']);
  play(vow, 'strike');
  close(vow.run.enemy.hp, 80);
  vow.run.hand = ['block'];
  assert.ok(!act(vow, { type: 'play', id: 'block' }).ok);
});

H.test('Сердце башни спасает один раз за забег', () => {
  const s = combat('strike', ['heart']);
  s.run.hero.hp = 1;
  play(s, 'strike');
  assert.strictEqual(s.run.phase, 'combat');
  assert.ok(s.run.heartUsed);
  close(s.run.hero.hp, 100 * x.cfg['relic.heart.heal']);
  s.run.hero.hp = 1;
  play(s, 'strike');
  assert.strictEqual(s.run.phase, 'ended');
  assert.strictEqual(s.run.hero.hp, 0);
});

H.test('Привратник: три пластины снимаются только блоком в ход удара', () => {
  const s = combat('strike');
  s.run.enemy.template = 'gatekeeper';
  s.run.enemy.plates = 3;
  play(s, 'strike');
  assert.strictEqual(s.run.enemy.hp, 100);
  assert.strictEqual(s.run.enemy.plates, 3);
  for (let plates = 2; plates >= 0; plates--) {
    play(s, 'block');
    assert.strictEqual(s.run.enemy.plates, plates);
  }
  play(s, 'strike');
  close(s.run.enemy.hp, 90);
});

H.test('Сторож: своевременный блок полностью отменяет заряженный удар', () => {
  const s = combat('block');
  s.run.enemy.template = 'lantern';
  s.run.enemy.intent = { type: 'attack', amount: 100, hits: 1, charged: true };
  play(s, 'block');
  close(s.run.hero.hp, 100);
});

H.test('реликвии характеристик: Пряжка, Точильный камень, Подкова и Корона', () => {
  const s = fresh();
  const before = Object.assign({}, s.run.hero);
  x.sim.addRelic(s, 'buckle', x.cfg);
  close(s.run.hero.maxHp, before.maxHp + 5);
  close(s.run.hero.defense, before.defense + 1);
  x.sim.addRelic(s, 'whetstone', x.cfg);
  close(s.run.hero.strength, before.strength + 2);
  x.sim.addRelic(s, 'horseshoe', x.cfg);
  close(s.run.hero.agility, before.agility);
  close(s.run.hero.dodge, before.dodge + 0.05);
  x.sim.addRelic(s, 'crown', x.cfg);
  close(s.run.hero.maxHp, Math.round((before.maxHp + 5) * 0.9));
  assert.ok(s.run.hero.hp <= s.run.hero.maxHp);
  assert.strictEqual(s.meta.tower.album.relics.length, 4);
});

H.test('сундук с Ржавым ключом предлагает две разные реликвии и берёт одну', () => {
  const s = fresh();
  s.run.relics = ['key'];
  s.run.doors = [{ type: 'chest', id: 'chest' }];
  assert.ok(act(s, { type: 'door', index: 0 }).ok);
  assert.strictEqual(s.run.phase, 'reward');
  assert.strictEqual(s.run.rewards.length, 2);
  assert.notStrictEqual(s.run.rewards[0].id, s.run.rewards[1].id);
  const picked = s.run.rewards[1].id;
  const left = s.run.rewards[0].id;
  assert.ok(act(s, { type: 'reward', index: 1 }).ok);
  assert.ok(s.run.relics.includes(picked));
  assert.ok(!s.run.relics.includes(left));
});

H.test('Колода судьбы даёт четыре приёма, Песочные часы пропускают только первый ход', () => {
  const s = fresh();
  s.run.relics = ['deck', 'hourglass', 'eye'];
  s.run.moves = { strike: 0, block: 0, reflect: 0, flame: 0, read: 0 };
  x.sim.beginCombat(s, false, false, context(), x.Rng.make(21));
  assert.strictEqual(s.run.hand.length, 4);
  assert.strictEqual(s.run.enemy.intent.type, 'skip');
  assert.ok(s.run.enemy.read);
  const hp = s.run.hero.hp;
  play(s, 'block');
  assert.strictEqual(s.run.hero.hp, hp);
  assert.notStrictEqual(s.run.enemy.intent.type, 'skip');
});

H.test('Кровавая монета: здоровье вместо золота, Сердце возвращает жизнь, повторная покупка запрещена', () => {
  const s = fresh();
  s.run.relics = ['bloodCoin', 'heart'];
  s.run.phase = 'shop';
  s.run.hero.hp = 3;
  s.run.gold = '0';
  s.run.offers = [{ type: 'move', id: 'lunge', price: 12, sold: false }];
  assert.ok(act(s, { type: 'buy', index: 0, payment: 'health' }).ok);
  assert.ok(s.run.heartUsed);
  assert.ok(s.run.hero.hp > 0);
  assert.strictEqual(x.Big.toNumber(s.run.gold), 0);
  assert.strictEqual(s.run.offers[0].sold, true);
  assert.ok(Object.prototype.hasOwnProperty.call(s.run.moves, 'lunge'));
  assert.ok(!act(s, { type: 'buy', index: 0, payment: 'health' }).ok);
});

H.test('Сухари усиливают отдых, Свежие ноги полностью лечат только первый отдых пролёта', () => {
  const s = fresh();
  s.run.relics = ['rations'];
  s.run.hero.hp = 1;
  const maximum = s.run.hero.maxHp;
  s.run.doors = [{ type: 'rest', id: 'rest' }];
  assert.ok(act(s, { type: 'door', index: 0 }).ok);
  assert.strictEqual(s.run.hero.hp, Math.min(maximum, 1 + Math.round(maximum * (x.cfg['rest.heal'] + 0.1))));
  const legs = fresh();
  legs.run.hero.hp = 1;
  assert.ok(act(legs, { type: 'freshLegs' }).ok);
  legs.run.doors = [{ type: 'rest', id: 'rest' }];
  assert.ok(act(legs, { type: 'door', index: 0 }).ok);
  assert.strictEqual(legs.run.hero.hp, legs.run.hero.maxHp);
  assert.ok(!legs.run.freshLegs);
  assert.ok(!act(legs, { type: 'freshLegs' }).ok, 'после первого отдыха заряд неприменим');
});

H.test('Пустой фонарь сохраняет награду элиты, снимает множитель здоровья и свойство', () => {
  const normal = fresh(18);
  const elite = x.Core.clone(normal);
  const lantern = x.Core.clone(normal);
  lantern.run.relics = ['emptyLantern'];
  x.sim.beginCombat(normal, false, false, context(), x.Rng.make(18));
  x.sim.beginCombat(elite, true, false, context(), x.Rng.make(18));
  x.sim.beginCombat(lantern, true, false, context(), x.Rng.make(18));
  assert.ok(elite.run.enemy.maxHp > normal.run.enemy.maxHp * 2);
  assert.strictEqual(lantern.run.enemy.maxHp, normal.run.enemy.maxHp);
  assert.strictEqual(lantern.run.enemy.modifier, null);
  assert.ok(lantern.run.enemy.elite, 'награда элиты сохраняется');
});

H.test('Флюгер: одно изменение двери за пролёт; обязательные этажи не меняются', () => {
  const s = fresh();
  s.run.relics = ['vane'];
  const before = s.run.doors[0].type;
  assert.ok(act(s, { type: 'reroll', index: 0 }).ok);
  assert.notStrictEqual(s.run.doors[0].type, before);
  assert.ok(!act(s, { type: 'reroll', index: 0 }).ok);
  s.run.vaneUsed = false;
  s.run.floor = 5;
  s.run.doors = x.sim.doorsAt(s, 5, x.cfg);
  assert.ok(!act(s, { type: 'reroll', index: 0 }).ok);
});

H.test('классы, этаж31 и высота: реальные победы открывают прогресс, Core.prestige сохраняет мастерскую', () => {
  const s = fresh();
  s.meta.tower.workshop.health = 2;
  s.meta.tower.album.relics = ['buckle'];
  for (const floor of [10, 20, 30]) {
    s.run.floor = floor;
    x.sim.beginCombat(s, false, true, context(), x.Rng.make(floor));
    s.run.hero.hp = s.run.hero.maxHp;
    s.run.hero.strength = 10000;
    s.run.hero.agility = 0;
    s.run.enemy.hp = 1;
    s.run.enemy.plates = 0;
    s.run.moves.dash = 0;
    s.run.hand = ['dash'];
    s.run.enemy.locked = [];
    play(s, 'dash');
    while (s.run.phase === 'reward') assert.ok(act(s, { type: 'reward', index: 0 }).ok);
    assert.strictEqual(s.run.phase, 'fork');
  }
  for (const id of ['archer', 'scholar', 'nameless']) assert.ok(s.meta.tower.classes.includes(id), id);
  assert.strictEqual(s.meta.tower.heights, 2);
  const infinity = x.Core.clone(s);
  assert.ok(act(infinity, { type: 'continue' }).ok);
  assert.strictEqual(infinity.run.floor, 31);
  assert.ok(infinity.meta.tower.achievements['clouds']);
  const shards = x.Big.toNumber(s.meta.tower.shards);
  const expectedPayout = x.Big.toNumber(x.sim.shardReward(s, x.cfg, false));
  const reset = x.Core.prestige(x.sim, x.game, s, 'height', context());
  assert.ok(reset.ok);
  assert.strictEqual(x.Big.toNumber(reset.gain), 1);
  assert.strictEqual(s.run.floor, 1);
  assert.strictEqual(s.run.height, 2);
  assert.strictEqual(s.meta.tower.workshop.health, 2);
  assert.ok(s.meta.tower.album.relics.includes('buckle'));
  assert.strictEqual(x.Big.toNumber(s.meta.tower.shards), shards + expectedPayout);
  assert.strictEqual(x.Big.toNumber(x.sim.prestigeGain(s, 'height', x.cfg)), 0);
  assert.strictEqual(x.sim.validate(s), null);
});

H.test('Поджигатель открывается ровно после сотого убийства огнём', () => {
  const s = combat('flame');
  s.meta.tower.stats.flameKills = 99;
  s.run.enemy.hp = 1;
  play(s, 'flame');
  assert.strictEqual(s.meta.tower.stats.flameKills, 100);
  assert.ok(s.meta.tower.classes.includes('firestarter'));
});

H.test('намерения: циклы, двойной удар, скрытое заклятие, копия и побег', () => {
  const s = combat('strike');
  s.run.enemy.template = 'piper';
  assert.deepStrictEqual([1, 2, 3, 4].map((turn) => x.sim.makeIntent(s, turn, x.cfg).type), ['attack', 'attack', 'defend', 'attack']);
  s.run.enemy.template = 'mold';
  close(x.sim.makeIntent(s, 3, x.cfg).amount - x.sim.makeIntent(s, 1, x.cfg).amount, 4);
  s.run.enemy.template = 'dog';
  assert.strictEqual(x.sim.makeIntent(s, 1, x.cfg).hits, 2);
  s.run.enemy.template = 'weaver';
  assert.strictEqual(x.sim.makeIntent(s, 1, x.cfg).type, 'curse');
  assert.ok(x.sim.makeIntent(s, 2, x.cfg).hidden);
  s.run.enemy.template = 'echo';
  s.run.lastMove = 'strike';
  close(x.sim.makeIntent(s, 2, x.cfg).amount, 7);
  s.run.lastMove = 'block';
  assert.strictEqual(x.sim.makeIntent(s, 2, x.cfg).type, 'defend');
  s.run.enemy.template = 'thief';
  assert.strictEqual(x.sim.makeIntent(s, 4, x.cfg).type, 'flee');
});

H.test('двенадцатая высота: достижение сразу после победы на одиннадцатой', () => {
  const s = fresh(1211);
  s.meta.tower.heights = 11;
  s.run.height = 11;
  s.run.floor = 30;
  x.sim.beginCombat(s, false, true, context(), x.Rng.make(1211));
  s.run.hero.strength = 10000;
  s.run.hero.agility = 0;
  s.run.enemy.hp = 1;
  s.run.enemy.plates = 0;
  s.run.enemy.locked = [];
  s.run.moves.dash = 0;
  for (let phase = 0; phase < 2 && s.run.phase === 'combat'; phase++) {
    s.run.enemy.locked = [];
    play(s, 'dash');
  }
  while (s.run.phase === 'reward') assert.ok(act(s, { type: 'reward', index: 0 }).ok);
  assert.strictEqual(s.run.phase, 'fork');
  assert.strictEqual(s.meta.tower.heights, 12);
  assert.ok(s.meta.tower.achievements['height-12']);
});
H.done('tower: механики');



