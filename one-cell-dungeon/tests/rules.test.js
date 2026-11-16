// The rules of «Подземелье в одну клетку»: every card, enemy, gift, seal, the boss, the floors, the
// workshop, the depths, the links and the stock — each on a small board made by hand.
const assert = require('assert');
const E = require('./env.js');
const { sim, cfg, Core, game, Rng } = E.setup();
const { test, done } = E;

const C = (o) => Object.assign({}, cfg, { 'fair.runs': 0 }, o || {});
let uid = 1000;
function fresh() { return { run: { phase: 'hub' }, layers: {}, meta: sim.freshMeta() }; }
function card(k, v, x) {
  const c = Object.assign({ k }, x || {});
  if (v !== undefined) c.v = v;
  c.u = ++uid;
  return c;
}
const foe = (e, v) => card('foe', v, { e, v0: v });
const gold = (v) => card('gold', v);
const deckOf = (n, make) => Array.from({ length: n }, () => { const c = make(); delete c.u; return c; });

/** A run on floor o.floor with the grid given ('@' — the hero). */
function board(grid, o) {
  o = o || {};
  const c = C(o.cfg);
  const s = fresh();
  if (o.meta) o.meta(s.meta);
  sim.startRun(s, c, { seed: o.seed || 7 });
  const run = s.run;
  run.grid = grid.map((x) => (x === '@' ? null : x));
  run.pos = grid.indexOf('@');
  run.deck = o.deck || deckOf(10, () => gold(1));
  run.hp = o.hp === undefined ? 12 : o.hp;
  run.maxHp = o.maxHp || 12;
  run.shield = o.shield || 0;
  run.wpn = o.wpn ? Object.assign({ n: ++run.blades }, o.wpn) : null;
  run.gold = o.gold || 0;
  run.keys = o.keys || 0;
  run.seals = o.seals || [];
  run.hand = (o.hand || []).map((id) => ({ id, lvl: o.lvl || 0, used: 0 }));
  run.bossFloor = !!o.boss;
  run.stairsOut = false;
  run.under = null;
  run.delayed = -1;
  if (o.floor) run.floor = o.floor;
  return { s, c, run };
}
const G = () => gold(1);

// ---- the grid ----------------------------------------------------------------------------------------

test('шаг только к соседу по стороне, покинутая клетка берёт верх колоды', () => {
  const { s, c, run } = board([G(), G(), G(), G(), '@', G(), G(), G(), G()], { deck: deckOf(3, () => card('potion', 3)) });
  assert.strictEqual(sim.move(s, c, 0).ok, false, 'по диагонали нельзя');
  const r = sim.move(s, c, 1);
  assert.ok(r.ok);
  assert.strictEqual(run.pos, 1);
  assert.strictEqual(run.gold, 1);
  assert.strictEqual(run.grid[4].k, 'potion', 'за спиной — верх колоды');
  assert.strictEqual(run.deck.length, 2);
  assert.strictEqual(run.grid[1], null, 'в клетке героя пусто');
});

test('новая карта в случайной пустой клетке (deal.place = random)', () => {
  const { s, c, run } = board([null, G(), null, G(), '@', G(), null, G(), null], { cfg: { 'deal.place': 'random' }, deck: deckOf(3, () => card('potion', 3)) });
  sim.move(s, c, 1);
  const potions = run.grid.filter((x) => x && x.k === 'potion').length;
  assert.strictEqual(potions, 1, 'одна новая карта');
});

test('бой: урон max(0, V − оружие), сначала в щит; оружие теряет заряд и ломается', () => {
  const { s, c, run } = board([foe('mold', 2), foe('mold', 5), G(), G(), '@', G(), G(), G(), G()], { wpn: { s: 3, c: 2 }, shield: 1 });
  sim.move(s, c, 1);
  assert.strictEqual(run.shield, 0);
  assert.strictEqual(run.hp, 11);
  assert.strictEqual(run.wpn.c, 1);
  sim.move(s, c, 0);
  assert.strictEqual(run.hp, 11, 'враг 2 против силы 3 — без урона');
  assert.strictEqual(run.wpn, null, 'последний заряд — оружие сломалось');
  assert.strictEqual(run.st.broke, 1);
  assert.strictEqual(run.st.kills, 2);
});

test('без оружия урон равен силе врага; пустая клетка ничего не делает', () => {
  const { s, c, run } = board([null, foe('mold', 4), G(), null, '@', G(), G(), G(), G()]);
  sim.move(s, c, 3);
  assert.strictEqual(run.hp, 12);
  sim.move(s, c, 0);
  sim.move(s, c, 1);
  assert.strictEqual(run.hp, 8);
});

test('хищники кусают на 1 после хода, каждый рядом', () => {
  const { s, c, run } = board([foe('rat', 2), G(), foe('rat', 3), G(), '@', G(), G(), G(), G()]);
  sim.move(s, c, 1);
  assert.strictEqual(run.hp, 10);
  assert.strictEqual(run.st.bitten, 2);
});

test('зелье, оружие, щит (до 10), золото, ловушка мимо щита, ключ', () => {
  const { s, c, run } = board([card('key'), card('potion', 5), card('weapon', 5, { c: 2 }), card('shield', 3), '@', card('trap', 2), G(), G(), G()], { hp: 9, shield: 9, wpn: { s: 3, c: 1 } });
  sim.move(s, c, 1);
  assert.strictEqual(run.hp, 12, 'зелье не выше наибольшего');
  sim.move(s, c, 2);
  assert.deepStrictEqual([run.wpn.s, run.wpn.c], [5, 2], 'оружие заменилось');
  sim.move(s, c, 5);
  assert.strictEqual(run.hp, 10, 'ловушка −2');
  assert.strictEqual(run.shield, 9, 'щит не помогает от ловушки');
  sim.move(s, c, 4);
  sim.move(s, c, 3);
  assert.strictEqual(run.shield, 10, 'щит не больше 10');
  sim.move(s, c, 0);
  assert.strictEqual(run.keys, 1);
});

test('сундук: без ключа пустеет; с ключом — 2 печати или 15 золота', () => {
  let b = board([G(), card('chest'), G(), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.phase, 'play');
  b = board([G(), card('chest'), G(), G(), '@', G(), G(), G(), G()], { keys: 1 });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.phase, 'choice');
  assert.strictEqual(b.run.pending.seals.length, 2);
  sim.choose(b.s, b.c, 2);
  assert.strictEqual(b.run.gold, 15);
  assert.strictEqual(b.run.keys, 0);
  b = board([G(), card('chest'), G(), G(), '@', G(), G(), G(), G()], { keys: 1 });
  sim.move(b.s, b.c, 1);
  const id = b.run.pending.seals[0];
  sim.choose(b.s, b.c, 0);
  assert.ok(b.run.seals.indexOf(id) >= 0, 'печать взята');
  assert.strictEqual(b.s.meta.album.seals[id], 1, 'печать в альбоме');
});

test('алтарь: 3 здоровья за +1 к силе и +1 заряд; можно пройти мимо', () => {
  let b = board([G(), card('altar'), G(), G(), '@', G(), G(), G(), G()], { wpn: { s: 3, c: 2 } });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.phase, 'choice');
  sim.choose(b.s, b.c, 0);
  assert.deepStrictEqual([b.run.hp, b.run.wpn.s, b.run.wpn.c], [9, 4, 3]);
  b = board([G(), card('altar'), G(), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  sim.choose(b.s, b.c, 1);
  assert.deepStrictEqual([b.run.hp, b.run.wpn], [12, null]);
});

test('колода кончилась — лестница на первой покинутой клетке; дальше печать и привал', () => {
  const { s, c, run } = board([G(), G(), G(), G(), '@', G(), G(), G(), G()], { deck: [] });
  sim.move(s, c, 1);
  assert.strictEqual(run.grid[4].k, 'stairs');
  sim.move(s, c, 0);
  assert.strictEqual(run.grid[1], null, 'вторая покинутая клетка пустая');
  sim.move(s, c, 3);
  sim.move(s, c, 4);
  assert.strictEqual(run.phase, 'seal');
  assert.strictEqual(run.pending.seals.length, 3, 'печать из трёх');
  sim.pickSeal(s, c, 1);
  assert.strictEqual(run.seals.length, 1);
  assert.strictEqual(run.phase, 'rest');
  run.hp = 5;
  sim.rest(s, c, 'heal');
  assert.strictEqual(run.hp, 8, 'привал +3');
  assert.strictEqual(run.floor, 2);
  assert.strictEqual(run.phase, 'play');
});

test('лавка: зелья, оружие, точильный камень, обмен дара', () => {
  const { s, c, run } = board([G(), G(), G(), G(), '@', G(), G(), G(), G()], {
    deck: [], gold: 60, hp: 3, hand: ['sip'], meta: (m) => { m.shop.gifts = ['sip', 'whet']; }
  });
  run.phase = 'rest';
  sim.rest(s, c, 'shop');
  assert.strictEqual(run.phase, 'shop');
  const items = run.shop.items;
  assert.deepStrictEqual(items.map((x) => x.t), ['potion', 'potion', 'weapon', 'whet', 'swap']);
  assert.ok(sim.shopBuy(s, c, 0).ok);
  assert.strictEqual(run.hp, 3 + c['shop.potion.v']);
  assert.strictEqual(sim.shopBuy(s, c, 0).ok, false, 'продано');
  assert.ok(sim.shopBuy(s, c, 2).ok);
  assert.strictEqual(run.wpn.s, c['shop.weapon.s'] + run.floor);
  assert.ok(sim.shopBuy(s, c, 3).ok);
  assert.strictEqual(run.wpn.c, c['shop.weapon.c'] + c['shop.whet.v']);
  assert.strictEqual(sim.shopBuy(s, c, 4, { hand: 0, gift: 'sip' }).ok, false, 'такой дар уже в руке');
  assert.ok(sim.shopBuy(s, c, 4, { hand: 0, gift: 'whet' }).ok);
  assert.strictEqual(run.hand[0].id, 'whet');
  const spent = items.filter((x) => x.sold).reduce((a, x) => a + x.price, 0);
  assert.strictEqual(run.gold, 60 - spent);
  sim.shopLeave(s, c);
  assert.strictEqual(run.floor, 2);
});

// ---- enemies ------------------------------------------------------------------------------------------

test('костяной пёс +2, когда рядом с ним второй хищник', () => {
  const { c, run } = board([foe('dog', 3), foe('rat', 2), G(), G(), '@', G(), G(), G(), G()]);
  assert.strictEqual(sim.shown(run, c, 0), 5);
  run.grid[1] = G();
  assert.strictEqual(sim.shown(run, c, 0), 3);
});

test('слепень оставляет ловушку 1', () => {
  const { s, c, run } = board([G(), foe('fly', 2), G(), G(), '@', G(), G(), G(), G()], { wpn: { s: 5, c: 3 } });
  sim.move(s, c, 1);
  sim.move(s, c, 2);
  assert.deepStrictEqual([run.grid[1].k, run.grid[1].v], ['trap', 1]);
});

test('медный жук: оружие слабее V/2 бьёт вполсилы', () => {
  let b = board([G(), foe('beetle', 8), G(), G(), '@', G(), G(), G(), G()], { wpn: { s: 3, c: 3 } });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.hp, 12 - (8 - 1));
  b = board([G(), foe('beetle', 8), G(), G(), '@', G(), G(), G(), G()], { wpn: { s: 4, c: 3 } });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.hp, 12 - 4);
});

test('вор-тень уносит 5 золота, если пройти рядом и не убить', () => {
  const { s, c, run } = board([G(), foe('thief', 3), G(), G(), '@', G(), G(), G(), G()], { gold: 10 });
  sim.move(s, c, 3);
  assert.strictEqual(run.gold, 6);
  assert.ok(!(run.grid[1] && run.grid[1].e === 'thief'), 'вор ушёл');
});

test('корневик растёт после каждого хода; двойник = оружие + 1; колдунья ослабляет зелья', () => {
  const { s, c, run } = board([foe('root', 4), card('potion', 4), foe('witch', 3), G(), '@', foe('twin', 1), G(), G(), G()], { hp: 4, wpn: { s: 4, c: 3 } });
  assert.strictEqual(sim.shown(run, c, 5), 5);
  sim.move(s, c, 1);
  assert.strictEqual(run.grid[0].v, 5);
  assert.strictEqual(run.hp, 6, 'зелье 4 при колдунье — +2');
  run.wpn = null;
  assert.strictEqual(sim.shown(run, c, 5), 1);
});

// ---- the boss -----------------------------------------------------------------------------------------

test('этаж 5: хозяин в углу, 30 здоровья', () => {
  const s = fresh();
  const c = C();
  sim.startRun(s, c, { seed: 3 });
  s.run.floor = 5;
  sim.makeFloor(s.run, c);
  const cells = s.run.grid.map((x, i) => (x && x.k === 'boss' ? i : -1)).filter((i) => i >= 0);
  assert.strictEqual(cells.length, 1);
  assert.ok([0, 2, 6, 8].indexOf(cells[0]) >= 0);
  assert.strictEqual(s.run.grid[cells[0]].hp, 30);
  assert.ok(!s.run.deck.some((x) => x.k === 'stairs'), 'на этаже хозяина нет лестницы');
});

test('хозяин: бой снимает силу оружия, бьёт на 6 − оружие, на 15 зовёт двух крыс, убит — победа', () => {
  const { s, c, run } = board([G(), card('boss', undefined, { hp: 30, hp0: 30 }), G(), G(), '@', G(), G(), G(), G()], { floor: 5, boss: true, wpn: { s: 5, c: 9 }, hp: 30, maxHp: 30 });
  sim.move(s, c, 1);
  assert.strictEqual(run.grid[1].hp, 25);
  assert.strictEqual(run.hp, 29);
  assert.strictEqual(run.pos, 4, 'хозяин не исчезает: герой остаётся на месте');
  sim.move(s, c, 1);
  sim.move(s, c, 1);
  assert.strictEqual(run.grid[1].hp, 15);
  assert.strictEqual(run.grid.filter((x) => x && x.e === 'rat').length, 2, 'две крысы');
  sim.move(s, c, 1);
  sim.move(s, c, 1);
  sim.move(s, c, 1);
  assert.strictEqual(run.phase, 'won');
  assert.strictEqual(s.meta.rec.wins, 1);
  assert.ok(s.meta.unlocked.madman, 'победа открывает Безумца');
  sim.wonChoice(s, c, 'finish', 1);
  assert.strictEqual(run.phase, 'over');
  assert.strictEqual(run.result.won, true);
  assert.strictEqual(run.result.embers.boss, 20);
});

test('хозяин меняется местами с соседней картой после хода героя', () => {
  const { s, c, run } = board([card('boss', undefined, { hp: 30, hp0: 30 }), G(), G(), G(), '@', G(), G(), G(), G()], { floor: 5, boss: true });
  sim.move(s, c, 5);
  const b = run.grid.findIndex((x) => x && x.k === 'boss');
  assert.ok(b === 1 || b === 3, 'хозяин переместился: ' + b);
});

// ---- gifts --------------------------------------------------------------------------------------------

test('Обмен — две карты поля местами, раз за этаж', () => {
  const { s, c, run } = board([card('potion', 3), G(), G(), G(), '@', G(), G(), G(), foe('mold', 4)], { hand: ['swap'] });
  assert.ok(sim.useGift(s, c, 0, [0, 8]).ok);
  assert.strictEqual(run.grid[0].k, 'foe');
  assert.strictEqual(run.grid[8].k, 'potion');
  assert.strictEqual(sim.useGift(s, c, 0, [0, 8]).ok, false, 'раз за этаж');
});

test('Подкова — враг становится золотом той же величины', () => {
  const { s, c, run } = board([foe('mold', 5), G(), G(), G(), '@', G(), G(), G(), G()], { hand: ['horseshoe'] });
  sim.useGift(s, c, 0, [0]);
  assert.deepStrictEqual([run.grid[0].k, run.grid[0].v], ['gold', 5]);
});

test('Пустой шаг — карта не срабатывает и остаётся', () => {
  const { s, c, run } = board([G(), foe('mold', 9), G(), G(), '@', G(), G(), G(), G()], { hand: ['empty'] });
  sim.useGift(s, c, 0, [1]);
  assert.strictEqual(run.pos, 1);
  assert.strictEqual(run.hp, 12);
  sim.move(s, c, 0);
  assert.deepStrictEqual([run.grid[1].k, run.grid[1].v], ['foe', 9], 'враг на месте');
});

test('Глоток +3 (уровень 2: +5), Точило +2, Взгляд — 3 карты колоды', () => {
  let b = board([G(), G(), G(), G(), '@', G(), G(), G(), G()], { hp: 4, hand: ['sip', 'whet', 'glance'], wpn: { s: 3, c: 1 } });
  sim.useGift(b.s, b.c, 0, []);
  assert.strictEqual(b.run.hp, 7);
  sim.useGift(b.s, b.c, 1, []);
  assert.strictEqual(b.run.wpn.c, 3);
  assert.strictEqual(sim.seen(b.run).length, 0);
  sim.useGift(b.s, b.c, 2, []);
  assert.strictEqual(sim.seen(b.run).length, 3);
  b = board([G(), G(), G(), G(), '@', G(), G(), G(), G()], { hp: 4, hand: ['sip'], lvl: 2 });
  sim.useGift(b.s, b.c, 0, []);
  assert.strictEqual(b.run.hp, 9);
  b = board([G(), G(), G(), G(), '@', G(), G(), G(), G()], { hand: ['whet'] });
  assert.strictEqual(sim.useGift(b.s, b.c, 0, []).ok, false, 'Точило без оружия — нельзя');
});

test('Удар издали — убить врага на любой клетке, сильного — ранить', () => {
  const { s, c, run } = board([G(), G(), G(), G(), '@', G(), foe('mold', 9), G(), foe('mold', 4)], { hand: ['shot'], lvl: 1, wpn: { s: 4, c: 3 } });
  sim.useGift(s, c, 0, [8]);
  assert.ok(!(run.grid[8] && run.grid[8].k === 'foe'), 'убит');
  assert.strictEqual(run.wpn.c, 2);
  run.hand[0].used = 0;
  sim.useGift(s, c, 0, [6]);
  assert.strictEqual(run.grid[6].v, 4, 'ранен на 4 + 1');
  assert.strictEqual(run.pos, 4);
});

test('Тишина — хищники не кусают 3 хода', () => {
  const { s, c, run } = board([G(), G(), G(), foe('rat', 9), '@', foe('rat', 9), G(), G(), G()], { hand: ['silence'] });
  sim.useGift(s, c, 0, []);
  sim.move(s, c, 1);
  sim.move(s, c, 4);
  sim.move(s, c, 7);
  assert.strictEqual(run.hp, 12);
  sim.move(s, c, 4);
  assert.strictEqual(run.hp, 10);
});

test('Сжатие — карта уходит в низ колоды, клетка берёт верх', () => {
  const { s, c, run } = board([foe('mold', 7), G(), G(), G(), '@', G(), G(), G(), G()], { hand: ['squeeze'], deck: deckOf(3, () => card('potion', 2)) });
  sim.useGift(s, c, 0, [0]);
  assert.strictEqual(run.grid[0].k, 'potion');
  assert.deepStrictEqual([run.deck[run.deck.length - 1].k, run.deck[run.deck.length - 1].v], ['foe', 7]);
});

test('Двойной шаг — хищники кусают только после второго хода', () => {
  const { s, c, run } = board([foe('rat', 9), G(), foe('rat', 9), G(), '@', G(), G(), G(), G()], { hand: ['double'] });
  sim.useGift(s, c, 0, []);
  sim.move(s, c, 1);
  assert.strictEqual(run.hp, 12);
  sim.move(s, c, 4);
  sim.move(s, c, 1);
  assert.strictEqual(run.hp, 10);
});

test('дар раз за этаж, Отзвук — дважды; новый этаж возвращает дары', () => {
  const { s, c, run } = board([G(), G(), G(), G(), '@', G(), G(), G(), G()], { hp: 2, hand: ['sip'], seals: ['echo'] });
  assert.ok(sim.useGift(s, c, 0, []).ok);
  assert.ok(sim.useGift(s, c, 0, []).ok);
  assert.strictEqual(sim.useGift(s, c, 0, []).ok, false);
  sim.makeFloor(run, c);
  assert.strictEqual(run.hand[0].used, 0);
});

// ---- seals --------------------------------------------------------------------------------------------

function sealBoard(seal, grid, o) { return board(grid, Object.assign({ seals: [seal] }, o || {})); }

test('печати: ремень, рукоять, котёл, копилка, засов', () => {
  let b = board([G(), G(), G(), G(), '@', G(), G(), G(), G()]);
  b.run.phase = 'seal';
  b.run.pending = { type: 'seal', seals: ['belt', 'grip', 'piggy'] };
  sim.pickSeal(b.s, b.c, 0);
  assert.deepStrictEqual([b.run.hp, b.run.maxHp], [15, 15]);
  b = sealBoard('grip', [G(), card('weapon', 3, { c: 2 }), G(), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.wpn.c, 3);
  b = sealBoard('cauldron', [G(), card('potion', 3), G(), G(), '@', G(), G(), G(), G()], { hp: 2 });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.hp, 6);
  b = sealBoard('piggy', [G(), gold(2), G(), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.gold, 3);
  b = sealBoard('bolt', [G(), card('shield', 2), G(), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.shield, 3);
});

test('печати: чуткий сон, отмычка, кровопийца, встречный удар', () => {
  let b = sealBoard('sleep', [G(), card('trap', 3), card('trap', 3), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.hp, 12);
  sim.move(b.s, b.c, 2);
  assert.strictEqual(b.run.hp, 9);
  b = sealBoard('lockpick', [card('chest'), card('chest'), G(), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.phase, 'choice');
  sim.choose(b.s, b.c, 9);
  sim.move(b.s, b.c, 0);
  assert.strictEqual(b.run.phase, 'play', 'второй сундук этажа без ключа пуст');
  b = sealBoard('leech', [G(), foe('mold', 2), G(), G(), '@', G(), G(), G(), G()], { hp: 5, wpn: { s: 3, c: 3 } });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.hp, 6);
  b = sealBoard('counter', [foe('rat', 2), G(), G(), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.hp, 11);
  assert.deepStrictEqual([b.run.grid[0].k, b.run.grid[0].v], ['gold', 2], 'крыса стала золотом');
});

test('печати: вторая рука, счётная доска, тихий шаг', () => {
  let b = board([G(), G(), G(), G(), '@', G(), G(), G(), G()], { hand: ['sip', 'whet'], meta: (m) => { m.shop.gifts = ['sip', 'whet', 'shot']; } });
  b.run.phase = 'seal';
  b.run.pending = { type: 'seal', seals: ['hand'] };
  sim.pickSeal(b.s, b.c, 0);
  assert.strictEqual(b.run.phase, 'gift');
  sim.pickGift(b.s, b.c, 0);
  assert.deepStrictEqual(b.run.hand.map((h) => h.id), ['sip', 'whet', 'shot']);
  assert.strictEqual(b.run.phase, 'rest');
  b = sealBoard('abacus', [G(), G(), G(), G(), '@', G(), G(), G(), G()]);
  assert.strictEqual(sim.seen(b.run).length, 1);
  b = sealBoard('quiet', [foe('rat', 3), G(), G(), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.hp, 12, 'один хищник рядом — не кусает');
  b = sealBoard('quiet', [foe('rat', 3), G(), foe('rat', 3), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.hp, 10);
});

test('печати: зеркальный клинок, запасной клинок, голод, каменная кожа, мастер клинка', () => {
  let b = sealBoard('mirror', [G(), foe('mold', 2), G(), G(), '@', G(), G(), G(), G()], { wpn: { s: 4, c: 1 } });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.shield, 4);
  b = sealBoard('spare', [G(), card('weapon', 3, { c: 3 }), G(), G(), '@', G(), G(), G(), G()], { wpn: { s: 5, c: 2 } });
  sim.move(b.s, b.c, 1);
  assert.deepStrictEqual([b.run.wpn.s, b.run.wpn.c], [5, 3]);
  b = sealBoard('hunger', [G(), card('potion', 5), G(), G(), '@', G(), G(), G(), G()], { hp: 4 });
  sim.move(b.s, b.c, 1);
  assert.deepStrictEqual([b.run.hp, b.run.maxHp], [4, 13]);
  b = sealBoard('stone', [G(), foe('mold', 11), G(), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.hp, 7);
  b = sealBoard('master', [G(), foe('mold', 4), G(), G(), '@', G(), G(), G(), G()], { wpn: { s: 5, c: 1 } });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.wpn.c, 1);
});

test('печати: алчность, тень героя, последний вдох, дыхание глубины', () => {
  let b = sealBoard('greed', [foe('mold', 3), G(), G(), G(), '@', G(), G(), G(), G()]);
  assert.strictEqual(sim.shown(b.run, b.c, 0), 4);
  assert.strictEqual(sim.price(b.run, b.c, 10), Math.round((10 + b.run.floor) * 0.8));
  b = sealBoard('shadow', [G(), G(), G(), G(), '@', G(), G(), G(), G()]);
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.grid[4], null, 'за спиной пусто один ход');
  sim.move(b.s, b.c, 2);
  assert.ok(b.run.grid[4], 'потом клетка заполняется');
  assert.strictEqual(b.run.grid[1], null);
  b = sealBoard('last', [foe('mold', 9), foe('mold', 9), G(), G(), '@', G(), G(), G(), G()], { hp: 2 });
  sim.move(b.s, b.c, 1);
  assert.deepStrictEqual([b.run.hp, b.run.shield, b.run.phase], [1, 5, 'play']);
  sim.move(b.s, b.c, 0);
  assert.strictEqual(b.run.phase, 'over', 'второй раз — смерть');
  const c = C();
  let early = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = fresh();
    sim.startRun(s, c, { seed });
    s.run.seals = ['breath'];
    s.run.floor = 2;
    sim.makeFloor(s.run, c);
    const at = s.run.deck.findIndex((x) => x.k === 'stairs');
    assert.ok(at >= 0, 'лестница всегда в колоде');
    if (at <= Math.floor((s.run.deck.length - 1) * 0.7)) early++;
  }
  assert.strictEqual(early, 20, 'и выпадает раньше');
});

// ---- floors -------------------------------------------------------------------------------------------

test('этажи: размер колоды, состав, сила врагов [1 + этаж, 4 + 2·этаж], что с какого этажа', () => {
  const c = C();
  for (let f = 1; f <= 5; f++) {
    for (let seed = 1; seed <= 40; seed++) {
      const s = fresh();
      s.meta.pref.kinds = [];
      sim.startRun(s, c, { seed });
      s.run.floor = f;
      sim.makeFloor(s.run, c);
      const cards = s.run.grid.filter((x) => x).concat(s.run.deck).filter((x) => x.k !== 'stairs' && x.k !== 'boss');
      const field = f === 5 ? 7 : 8;
      const total = c['floor.' + f + '.size'] + field;
      assert.strictEqual(cards.length, total, 'этаж ' + f + ': карт ' + cards.length);
      const foes = cards.filter((x) => x.k === 'foe');
      assert.strictEqual(foes.length, Math.round(total * c['floor.' + f + '.enemies'] / 100));
      foes.forEach((x) => {
        assert.ok(x.v >= 1 + f && x.v <= 4 + 2 * f, 'сила ' + x.v + ' на этаже ' + f);
        const d = sim.enemyDef(s.run, x.e);
        assert.ok(f >= d.floors[0] && f <= d.floors[1], d.id + ' на этаже ' + f);
        if (d.predator) assert.ok(f >= c['predators.from']);
        if (d.armour) assert.ok(f >= c['armour.from']);
      });
      if (f < c['traps.from']) assert.ok(!cards.some((x) => ['trap', 'key', 'chest'].indexOf(x.k) >= 0));
      const stairs = s.run.deck.filter((x) => x.k === 'stairs').length;
      assert.ok(stairs <= (f === 5 ? 0 : 1));
      if (stairs) assert.ok(s.run.deck.findIndex((x) => x.k === 'stairs') >= Math.ceil((s.run.deck.length - 1) * 2 / 3), 'лестница в последней трети');
    }
  }
});

test('сокровищница замешивает добрые карты в колоду каждого этажа', () => {
  const c = C();
  const s = fresh();
  s.meta.pref.kinds = ['smith', 'hearth'];
  sim.startRun(s, c, { seed: 5 });
  const all = s.run.grid.filter((x) => x).concat(s.run.deck);
  assert.ok(all.some((x) => x.kind === 'smith' && x.v === 4 && x.c === 3), 'Знакомый кузнец 4×3');
  assert.ok(all.some((x) => x.kind === 'hearth' && x.v === 5), 'Тёплый очаг 5');
});

test('честность раздачи: безнадёжный этаж смягчается зельями, проверка повторяется', () => {
  const c = C({ 'fair.runs': 60 });
  const s = fresh();
  sim.startRun(s, c, { seed: 11 });
  const run = s.run;
  run.hp = 3;
  run.maxHp = 3;
  run.floor = 4;
  const t0 = Date.now();
  sim.makeFloor(run, c);
  const ms = Date.now() - t0;
  assert.ok(run.fair && run.fair.fixed > 0, 'заменены враги: ' + JSON.stringify(run.fair));
  assert.ok(run.fair.rate >= c['fair.min'] || run.fair.fixed === c['fair.maxFix'], JSON.stringify(run.fair));
  console.log('  честность: ' + JSON.stringify(run.fair) + ', ' + ms + ' мс на 60 прогонов с заменами');
});

test('«Ниже дна»: этажи после победы, враги сильнее, хозяин каждые 5', () => {
  const { s, c, run } = board([G(), card('boss', undefined, { hp: 1, hp0: 30 }), G(), G(), '@', G(), G(), G(), G()], { floor: 5, boss: true, wpn: { s: 5, c: 9 } });
  sim.move(s, c, 1);
  assert.strictEqual(run.phase, 'won');
  sim.wonChoice(s, c, 'deeper', 1);
  assert.strictEqual(run.phase, 'seal');
  sim.pickSeal(s, c, 0);
  sim.rest(s, c, 'heal');
  assert.strictEqual(run.floor, 6);
  assert.strictEqual(sim.floorTitle(c, 6), 'Ниже дна, 1');
  const foes = run.grid.filter((x) => x && x.k === 'foe').concat(run.deck.filter((x) => x.k === 'foe'));
  assert.ok(foes.every((x) => x.v >= 7 && x.v <= 16));
  run.floor = 10;
  sim.makeFloor(run, c);
  const boss = run.grid.find((x) => x && x.k === 'boss');
  assert.ok(boss, 'хозяин на 10-м');
  assert.strictEqual(boss.hp, c['boss.hp'] + c['boss.hpPerCycle']);
});

// ---- heroes, embers, workshop, depths ------------------------------------------------------------------

test('герои: Воровка, Жрица, Кузнец, Безумец', () => {
  const pick = (hero) => (m) => { m.unlocked[hero] = true; m.pref.hero = hero; };
  let b = board([G(), gold(2), G(), G(), '@', G(), G(), G(), G()], { meta: pick('thief') });
  assert.strictEqual(b.s.run.hero, 'thief');
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.gold, 3, 'золото ×1,5');
  const s = fresh();
  pick('thief')(s.meta);
  sim.startRun(s, C(), { seed: 1 });
  assert.deepStrictEqual([s.run.hp, s.run.keys], [10, 1]);
  b = board([G(), card('potion', 4), card('weapon', 3, { c: 3 }), G(), '@', G(), G(), G(), G()], { hp: 2, meta: pick('priestess') });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.hp, 8, 'зелья ×1,5');
  sim.move(b.s, b.c, 2);
  assert.strictEqual(b.run.wpn.c, 2, 'заряд меньше');
  b = board([G(), card('weapon', 3, { c: 3 }), G(), G(), '@', G(), G(), G(), G()], { meta: pick('smith') });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.wpn.c, 4);
  b = board([G(), card('shield', 3), foe('mold', 6), G(), '@', G(), G(), G(), G()], { wpn: { s: 3, c: 3 }, meta: pick('madman') });
  sim.move(b.s, b.c, 1);
  assert.strictEqual(b.run.shield, 0, 'щит недоступен');
  sim.move(b.s, b.c, 2);
  assert.strictEqual(b.run.hp, 11, 'сила +2');
});

test('открытие героев: Склеп, Корни, 30 сломанных оружий', () => {
  const { s, c, run } = board([G(), G(), G(), G(), '@', G(), G(), G(), G()]);
  run.st.floors = 2;
  s.meta.rec.broke = 29;
  run.st.broke = 1;
  sim.abandon(s, c, 1);
  assert.ok(s.meta.unlocked.thief && s.meta.unlocked.smith && !s.meta.unlocked.priestess);
  assert.deepStrictEqual(run.result.news.sort(), ['smith', 'thief']);
});

test('угли: золото / 5 + 3 за этаж + 20 за хозяина, ×глубина, ×поездка', () => {
  const c = C();
  const run = { gold: 23, depth: 2, st: { floors: 3, bosses: 1, gold: 40 } };
  const e = sim.embersOf(run, c, 2);
  assert.deepStrictEqual([e.gold, e.floors, e.boss, e.base], [4, 9, 20, 33]);
  assert.strictEqual(e.total, Math.floor(33 * 1.2 * 2));
  assert.strictEqual(sim.embersOf(run, C({ 'embers.goldFrom': 'earned' }), 1).gold, 8);
});

test('мастерская: цены по формулам, пределы, рука из двух', () => {
  const c = C();
  const s = fresh();
  s.meta.embers = 10000;
  let k = sim.costs(s, c);
  assert.deepStrictEqual([k.gift, k.slot, k.fort, k.blade], [30, 50, 15, 80]);
  ['sip', 'whet', 'shot'].forEach((id) => assert.ok(sim.buy(s, c, 'gift', id).ok));
  assert.strictEqual(sim.costs(s, c).gift, Math.round(30 * Math.pow(1.3, 3)));
  assert.deepStrictEqual(s.meta.pref.hand, ['sip', 'whet'], 'в руке два');
  assert.strictEqual(sim.levelCost(s, c, 'sip'), 40);
  sim.buy(s, c, 'level', 'sip');
  assert.strictEqual(sim.levelCost(s, c, 'sip'), 80);
  sim.buy(s, c, 'level', 'sip');
  assert.strictEqual(sim.levelCost(s, c, 'sip'), 160, 'уровни без предела: цена растёт дальше');
  assert.strictEqual(sim.levelCost(s, C({ 'gift.maxLevel': 2 }), 'sip'), null, 'с пределом 2 в настройках третьего уровня нет');
  assert.strictEqual(sim.costs(s, C({ 'shop.fort.max': 0 })).fort, null, 'крепость с пределом 0 не продаётся');
  s.meta.shop.fort = 30;
  assert.strictEqual(sim.costs(s, c).fort, Math.round(15 * Math.pow(1.4, 30)), 'крепость без предела');
  s.meta.shop.fort = 0;
  for (let i = 0; i < 4; i++) assert.ok(sim.buy(s, c, 'slot').ok);
  assert.strictEqual(sim.buy(s, c, 'slot').ok, false, 'слотов до 6');
  assert.strictEqual(sim.slots(s, c), 6);
  assert.strictEqual(s.meta.pref.kinds.length, 6);
  for (let i = 0; i < 5; i++) assert.ok(sim.buy(s, c, 'fort').ok);
  assert.strictEqual(sim.buy(s, C({ 'shop.fort.max': 5 }), 'fort').ok, false, 'с пределом 5 шестой крепости нет');
  assert.ok(sim.buy(s, c, 'blade').ok);
  sim.startRun(s, c, { seed: 1 });
  assert.deepStrictEqual([s.run.hp, s.run.wpn.s, s.run.wpn.c, s.run.hand.length], [17, 2, 2, 2]);
  assert.strictEqual(sim.buy(s, c, 'fort').ok, false, 'во время спуска закрыто');
  k = 10000 - 30 - 39 - 51 - 40 - 80 - 50 - 80 - 128 - 205 - 15 - 21 - 29 - 41 - 58 - 80;
  assert.strictEqual(sim.embers(s), k);
});

test('глубины: престиж после победы на самой глубокой, +10 % углей, правила 1–10', () => {
  const c = C();
  const s = Core.newState(game, sim, { now: 1, seed: 1, config: c });
  assert.strictEqual(Number(sim.prestigeGain(s, 'depth', c).m || 0), 0);
  s.meta.ascend = true;
  s.run = { phase: 'over' };
  assert.ok(Core.prestigeInfo(sim, game, s, 'depth', c).can);
  assert.ok(Core.prestige(sim, game, s, 'depth', { now: 2, config: c }).ok);
  assert.strictEqual(sim.unlockedDepth(s), 1);
  assert.strictEqual(s.meta.pref.depth, 1);
  assert.strictEqual(s.meta.ascend, false);
  assert.ok(Math.abs(sim.bonus(s, 'depth', 3, c) - 1.3) < 1e-9);
  const at = (d) => {
    const t = fresh();
    t.layers.depth = { currency: d };
    t.meta.pref.depth = d;
    t.meta.pref.kinds = [];
    sim.startRun(t, c, { seed: 4 });
    return t.run;
  };
  assert.strictEqual(at(5).hp, 10);
  const r4 = at(4);
  r4.floor = 5;
  sim.makeFloor(r4, c);
  assert.strictEqual(r4.grid.find((x) => x && x.k === 'boss').hp, 40);
  const r10 = at(10);
  r10.floor = 5;
  assert.strictEqual(sim.bossHit(r10, c), 8);
  const r1 = at(1);
  r1.grid.concat(r1.deck).filter((x) => x && x.k === 'foe').forEach((x) => assert.ok(x.v >= 3 && x.v <= 7));
  assert.strictEqual(sim.price(at(6), c, 10), Math.round(11 * c['depth.shopMult']));
  let preds = 0;
  let traps = 0;
  for (let seed = 1; seed < 30; seed++) {
    const t = fresh();
    t.layers.depth = { currency: 7 };
    t.meta.pref.depth = 7;
    sim.startRun(t, c, { seed });
    t.run.grid.concat(t.run.deck).forEach((x) => {
      if (x && sim.isPredator(t.run, x)) preds++;
      if (x && x.k === 'trap') traps++;
    });
  }
  assert.ok(preds > 0, 'хищники с первого этажа (глубина 3+)');
  assert.ok(traps > 0, 'ловушки с первого этажа (глубина 7+)');
});

test('ачивки и сводка карточки', () => {
  const c = C();
  const s = fresh();
  s.meta.rec.wins = 1;
  s.meta.rec.noPotion = 1;
  s.meta.rec.floors = 100;
  const a = sim.achievements(s, c);
  ['first-win', 'no-potion', 'floors-100'].forEach((id) => assert.ok(a.indexOf(id) >= 0, id));
  game.achievements.forEach((x) => assert.ok(['first-win', 'no-potion', 'one-blade', 'depth-10', 'floors-100', 'below', 'heroes'].indexOf(x.id) >= 0));
  assert.ok(/угли/.test(sim.summary(s, c).line));
});

// ---- links, the day, the stock, the save -----------------------------------------------------------

test('заряд от шагов: зелье 5 первой картой колоды первого этажа', () => {
  const c = C();
  const s = fresh();
  sim.startRun(s, c, { seed: 9, charge: true });
  assert.deepStrictEqual([s.run.deck[0].k, s.run.deck[0].v], ['potion', 5]);
  const to = sim.NB[s.run.pos][0];
  sim.move(s, c, to);
  assert.strictEqual(s.run.grid[4].v, 5);
  assert.ok(s.run.grid[4].charge);
});

test('спуск дня: одна колода для всех попыток дня, личный рекорд', () => {
  const c = C();
  const a = fresh();
  const b = fresh();
  sim.startRun(a, c, { day: '2026-11-14' });
  sim.startRun(b, c, { day: '2026-11-14' });
  assert.strictEqual(JSON.stringify(a.run.grid), JSON.stringify(b.run.grid));
  assert.strictEqual(JSON.stringify(a.run.deck), JSON.stringify(b.run.deck));
  const d = fresh();
  sim.startRun(d, c, { day: '2026-11-15' });
  assert.notStrictEqual(JSON.stringify(a.run.deck), JSON.stringify(d.run.deck));
  a.run.st.floors = 2;
  sim.abandon(a, c, 1);
  assert.deepStrictEqual([a.meta.daily.day, a.meta.daily.best, a.meta.daily.tries], ['2026-11-14', 2, 1]);
  assert.strictEqual(a.run.depth, 0, 'спуск дня — без глубины');
});

test('запас: враги и печати из кирпичиков проверяются схемой и ботом', () => {
  const good = { type: 'enemy', title: 'Ржавый червь', text: 'Сила +1, и только', brick: 'power', value: 1 };
  assert.strictEqual(sim.validateStock('rules', good), null);
  assert.ok(sim.validateStock('rules', Object.assign({}, good, { brick: 'heal' })), 'кирпичик печати у врага');
  assert.ok(sim.validateStock('rules', Object.assign({}, good, { value: 4 })));
  assert.ok(sim.validateStock('rules', Object.assign({}, good, { title: 'x' })));
  assert.ok(sim.validateStock('rules', Object.assign({}, good, { text: 'см. ' + ['http', 's:', '//x'].join('') })), 'ссылка');
  const strict = Object.assign({}, cfg, { 'rule.minSurvive': 1.01 });
  assert.ok(/выживает/.test(sim.validateRule(good, strict)), 'прогон бота отсекает слишком злое');
  const seal = { type: 'seal', title: 'Тёплый пояс', text: '+2 к наибольшему здоровью', brick: 'maxhp', value: 2 };
  assert.strictEqual(sim.validateStock('rules', seal), null);
  const r = sim.procedural('rules', Rng.make(5));
  assert.strictEqual(sim.validateRule(r, null), null, 'замена без модели проходит схему');
  const c = C();
  let seen = 0;
  for (let seed = 1; seed < 20; seed++) {
    const s = fresh();
    sim.startRun(s, c, { seed, rule: good });
    s.run.floor = 2;
    sim.makeFloor(s.run, c);
    seen += s.run.deck.filter((x) => x.e === 'rule').length;
  }
  assert.ok(seen > 0, 'враг из запаса в колодах со 2-го этажа');
  const s = fresh();
  sim.startRun(s, c, { seed: 1, rule: seal });
  s.run.phase = 'seal';
  s.run.pending = { type: 'seal', seals: ['rule'] };
  sim.pickSeal(s, c, 0);
  assert.strictEqual(s.run.maxHp, 14);
  assert.strictEqual(sim.sealTitle(s.run, 'rule'), 'Тёплый пояс');
});

test('сохранение посреди этажа: тот же ход после перезапуска', () => {
  const c = C({ 'fair.runs': 20 });
  const s = fresh();
  sim.startRun(s, c, { seed: 42 });
  for (let i = 0; i < 5 && s.run.phase === 'play'; i++) sim.move(s, c, sim.think(s.run, c));
  const copy = JSON.parse(JSON.stringify(s));
  const to = sim.think(s.run, c);
  sim.move(s, c, to);
  sim.move(copy, c, to);
  assert.strictEqual(JSON.stringify(copy), JSON.stringify(s));
  assert.strictEqual(sim.validate(s), null);
  const broken = JSON.parse(JSON.stringify(s));
  broken.run.grid.pop();
  assert.ok(sim.validate(broken));
});

test('предпросмотр хода и описание карты не меняют забег', () => {
  const { c, run } = board([G(), foe('mold', 5), G(), G(), '@', G(), G(), G(), G()], { wpn: { s: 3, c: 1 } });
  const before = JSON.stringify(run);
  const p = sim.preview(run, c, 1);
  assert.ok(/−2 здоровья/.test(p.text) && /сломается/.test(p.text), p.text);
  assert.strictEqual(sim.preview(run, c, 0), null);
  const d = sim.describe(run, c, run.grid[1], 1);
  assert.ok(/Плесень 5/.test(d.title));
  assert.strictEqual(JSON.stringify(run), before);
  sim.list('enemies').concat(sim.list('seals'), sim.list('gifts'), sim.list('heroes'), sim.list('kind'), sim.list('depths')).forEach((x) => {
    const t = sim.fill((x.title || '') + ' ' + (x.text || '') + ' ' + (x.unlock || ''), c);
    assert.ok(!/\{/.test(t), 'подстановка: ' + t);
  });
});

done('Правила подземелья');
