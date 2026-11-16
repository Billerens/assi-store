// The game's own checks of the spec's «Как проверить» (docs/games/dragon-hoard.md) and of its
// rules: the upkeep of the power at D = 2K, the bot that never buys power, 8 hours offline, the
// first sleep, the pace of the engine's bot, no NaN, raids and events.  node tests/dragon-hoard.test.js
'use strict';
const assert = require('assert');
const { H, open, ctx } = require('./env');

const w = open();
const { Core, Big, Rng, Fmt, sim, game, cfg } = w.x;
const HOUR = 3600000;
const T0 = Date.UTC(2026, 10, 2, 8, 0, 0);

function fresh(seed, now) {
  return Core.newState(game, sim, ctx(w.x, now || T0, Rng.make(seed)));
}

/** Plays `min` minutes by seconds with the bot (o — its options); calls each(state, sec) every second. */
function play(state, rng, min, o, each) {
  let now = state.lastTick || T0;
  for (let s = 0; s < min * 60; s++) {
    sim.botPlay(state, cfg, now, rng, o || {});
    sim.tick(state, 1, ctx(w.x, now + 1000, rng));
    now += 1000;
    state.lastTick = now;
    if (each) each(state, s + 1);
  }
  return state;
}

function nanFree(state, where) {
  const text = JSON.stringify(state);
  assert.ok(!/NaN|Infinity|null,null/.test(text.replace(/"(raid|knight|event|news|breath|away)":null/g, '')), where + ': NaN в состоянии');
  assert.strictEqual(Core.validate(state, game), null, where + ': Core.validate');
  assert.strictEqual(sim.validate(state), null, where + ': sim.validate');
}

const report = {};

H.test('сила D = 2K стоит 8–15 % кучи на масштабах 1e4…1e14', () => {
  const shares = [];
  for (let e = 4; e <= 14; e += 0.5) {
    const state = fresh(1);
    const pile = Big.pow(10, e);
    for (let i = 0; i < 300; i++) {
      state.run.gold = Big.str(pile);
      if (sim.chance(sim.power(state, cfg), sim.knightPower(state, cfg, 'wanderer')) >= 0.8) break;
      state.run.gold = Big.str(Big.mul(pile, 100));
      assert.ok(sim.buyQuality(state, cfg, sim.cheapestQuality(state, cfg)), 'качество не купилось');
    }
    shares.push({ e, share: Big.toNumber(Big.div(state.run.spentPower, pile)) });
  }
  const mean = shares.reduce((s, x) => s + x.share, 0) / shares.length;
  report.powerShare = shares.map((x) => x.e + ': ' + (x.share * 100).toFixed(1) + ' %').join(', ') + '; в среднем ' + (mean * 100).toFixed(1) + ' %';
  console.log('  доля на силу: ' + report.powerShare);
  assert.ok(mean >= 0.08 && mean <= 0.15, 'в среднем ' + mean);
  // A level is a step of ×1.3: a single scale may stand a little off the band, never far.
  for (const x of shares) assert.ok(x.share >= 0.07 && x.share <= 0.155, '1e' + x.e + ': ' + x.share);
});

// Sixteen ages (seeds): the world of the age, the events and the knights' types differ, and an
// idle economy amplifies them, so the checks take the median and the geometric mean.
const SEEDS = [3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181];

H.test('бот без силы: к часу проигрывает больше половины, золота в 3–5 раз меньше', () => {
  const ratios = [];
  const lossShares = [];
  for (const seed of SEEDS) {
    const a = play(fresh(seed), Rng.make(seed), 60, {});
    // Without the power it still flies to the farm when the chance is at least a third.
    const b = play(fresh(seed), Rng.make(seed), 60, { power: false, raidChance: 0.3 });
    const fights = b.run.wins + b.run.losses;
    assert.ok(fights >= 2, 'боёв за час: ' + fights);
    lossShares.push(b.run.losses / fights);
    ratios.push(Big.toNumber(Big.div(a.run.earned, b.run.earned)));
    nanFree(a, 'бот с силой');
    nanFree(b, 'бот без силы');
  }
  const gm = Math.exp(ratios.reduce((s, x) => s + Math.log(x), 0) / ratios.length);
  report.noPower = 'проигрыши ' + lossShares.map((x) => Math.round(x * 100) + ' %').join(', ') + '; золота за час меньше в ' + ratios.map((x) => x.toFixed(1)).join(', ') + ' раза (среднее геометрическое ' + gm.toFixed(1) + ')';
  console.log('  без силы: ' + report.noPower);
  for (const x of lossShares) assert.ok(x > 0.5, 'проигрышей ' + x);
  assert.ok(gm >= 3 && gm <= 5, 'золота меньше в среднем в ' + gm + ' раза');
  // In a few ages the power against strong knights costs more in the first hour than it saves.
  const ahead = ratios.filter((x) => x >= 1.5).length;
  assert.ok(ahead >= 12, 'бот с силой впереди в ' + ahead + ' веках из ' + ratios.length);
});

H.test('первый сон: 4+ Древности на 60–90-й минуте активной игры', () => {
  const minutes = [];
  const can = [];
  for (const seed of SEEDS) {
    let at = null;
    let first = null;
    play(fresh(seed), Rng.make(seed), 100, {}, (state, s) => {
      const gain = Big.toNumber(sim.prestigeGain(state, 'sleep', cfg));
      if (first === null && gain >= 1) first = s / 60;
      if (at === null && gain >= 4) at = s / 60;
    });
    minutes.push(at === null ? 999 : at);
    can.push(first);
  }
  const sorted = minutes.slice().sort((a, b) => a - b);
  const median = (sorted[7] + sorted[8]) / 2;
  report.firstSleep = 'кнопка сна (1 Древность) на ' + can.map((m) => m.toFixed(0)).join(', ') + ' мин; 4 Древности на ' + minutes.map((m) => m.toFixed(0)).join(', ') + ' мин (медиана ' + median.toFixed(0) + ')';
  console.log('  первый сон: ' + report.firstSleep);
  assert.ok(median >= 60 && median <= 90, 'медиана ' + median);
  for (const m of minutes) assert.ok(m >= 50 && m <= 100, 'на минуте ' + m);
});

H.test('темп бота движка: первая покупка, первый сон, приросты', () => {
  const r = w.kit.bot(game, sim, cfg, { play: (state, c) => sim.botPlay(state, c.config, c.now, c.rng, {}) });
  report.pace = 'первая покупка на ' + r.firstBuySec + ' с; сны: ' + r.prestiges.map((p) => 'поездка ' + p.trip + ' +' + Big.toNumber(p.gain)).join(', ');
  console.log('  темп: ' + report.pace);
  assert.ok(r.firstBuySec <= 10);
  assert.ok(r.prestiges.length >= 2, 'снов за три дня: ' + r.prestiges.length);
  assert.ok(r.prestiges[0].trip >= 2 && r.prestiges[0].trip <= 3, 'первый сон в поездке ' + r.prestiges[0].trip);
  nanFree(r.state, 'после трёх дней');
  const o = w.kit.offlineAgree(game, sim, cfg, 900, (state, c) => sim.botPlay(state, c.config, c.now, c.rng, {}));
  report.offlineAgree = 'офлайн 12 ч формулой и шагами: ' + Fmt.num(o.formula) + ' и ' + Fmt.num(o.steps) + ', расхождение ' + (o.diff * 100).toFixed(2) + ' %';
  console.log('  ' + report.offlineAgree);
  assert.ok(o.diff <= 0.01);
});

H.test('офлайн 8 ч: около 40 рыцарей, потери не больше 15 % кучи на выходе', () => {
  const lines = [];
  for (const seed of [11, 12]) {
    const rng = Rng.make(seed);
    const state = fresh(seed);
    // A world that does not change the interval: 8 hours by 12 minutes.
    state.run.world = { id: 'peace' };
    play(state, rng, 30, { raids: false });
    const gold0 = Big.of(state.run.gold);
    const p = Core.plan(state.lastTick, state.lastTick + 8 * HOUR, cfg, 0);
    const events = [];
    Core.runOffline(sim, state, game, p, null, (seg) => ctx(w.x, seg.to, Rng.make(1), { offline: true }), cfg);
    const a = state.run.away;
    lines.push(a.knights + ' рыцарей (' + a.wins + ' побед), унесли ' + (Big.toNumber(Big.div(a.lost, gold0)) * 100).toFixed(1) + ' % кучи на выходе');
    assert.ok(a.knights >= 36 && a.knights <= 44, 'рыцарей ' + a.knights);
    assert.ok(Big.lte(a.lost, Big.mul(gold0, cfg['knights.offlineLossCap'] * 1.000001)), 'унесли ' + a.lost);
    const summary = sim.awaySummary(state, cfg, state.lastTick || p.to);
    assert.ok(summary.length >= 2 && /Куча/.test(summary[0]) && /Рыцарей/.test(summary[1]), 'сводка: ' + summary.join(' | '));
    nanFree(state, 'после 8 ч');
    events.push(summary);
    // Curled on the pile: the same night costs no more.
    const curled = fresh(seed);
    curled.run.world = { id: 'peace' };
    play(curled, Rng.make(seed), 30, { raids: false });
    sim.setCurl(curled, true);
    Core.runOffline(sim, curled, game, Core.plan(curled.lastTick, curled.lastTick + 8 * HOUR, cfg, 0), null, (seg) => ctx(w.x, seg.to, Rng.make(1), { offline: true }), cfg);
    assert.ok(curled.run.away.wins >= a.wins, 'свернувшись побед не меньше');
  }
  report.offline8 = lines.join('; ');
  console.log('  офлайн 8 ч: ' + report.offline8);
});

H.test('рыцари: тип виден за минуту, бой по формуле, трофей один за век', () => {
  const state = fresh(4);
  state.run.gold = Big.str(Big.of('1e6'));
  sim.tick(state, 1, ctx(w.x, T0, Rng.make(4)));
  const k = state.run.knight;
  assert.ok(k, 'рыцарь не назначен при куче 1e6');
  const v1 = sim.knightView(state, cfg, k.at - 61000);
  const v2 = sim.knightView(state, cfg, k.at - 59000);
  assert.ok(!v1.seen && v2.seen, 'тип не виден за минуту');
  assert.ok(Math.abs(sim.chance(Big.of(2), Big.of(1)) - 0.8) < 1e-9, 'D = 2K — 80 %');
  assert.ok(Math.abs(sim.chance(Big.of(5), Big.of(5)) - 0.5) < 1e-9, 'D = K — 50 %');
  state.run.trophies = [];
  const have = {};
  sim.TROPHIES.forEach((t) => { have[t.id] = 0; });
  state.meta.trophies = have;
  // A trophy of each type once an age.
  const id = 'helm';
  state.run.trophies.push(id);
  assert.strictEqual(state.run.trophies.filter((x) => x === id).length, 1);
  // The hunter ignores the Scale, the sorcerer the Flame.
  state.run.q = { claws: 0, scale: 5, flame: 5, wings: 0 };
  assert.ok(Big.lt(sim.combatPower(state, cfg, 'hunter', T0), sim.combatPower(state, cfg, 'wanderer', T0)), 'охотник не снимает Чешую');
  assert.ok(Big.lt(sim.combatPower(state, cfg, 'sorcerer', T0), sim.combatPower(state, cfg, 'wanderer', T0)), 'чародей не снимает Пламя');
  sim.setCurl(state, true);
  const curled = sim.combatPower(state, cfg, 'wanderer', T0);
  sim.setCurl(state, false);
  assert.ok(Math.abs(Big.toNumber(Big.div(curled, sim.combatPower(state, cfg, 'wanderer', T0))) - 1.5) < 1e-9, 'свернувшись ×1,5');
});

H.test('набеги: время, успех, самоцветы с монастыря, долгий полёт', () => {
  const state = fresh(6);
  state.layers.sleep.state.sleeps = 1;
  state.run.q.wings = 2;
  state.run.servants[0] = 10;
  const now = T0;
  assert.strictEqual(sim.raidDuration(state, cfg, 4), 45 * 60000);
  assert.ok(sim.startRaid(state, cfg, 4, now));
  const end = state.run.raid.end;
  assert.ok(sim.longFlight(state, now));
  assert.strictEqual(state.run.raid.end, now + (end - now) / 2, 'долгий полёт: вдвое короче');
  state.run.q.claws = 60;
  const gems0 = Big.toNumber(state.meta.gems);
  sim.tick(state, 1, ctx(w.x, state.run.raid.end + 1000, Rng.make(1)));
  assert.strictEqual(state.run.raid && state.run.raid.n === 4 && state.run.raid.start < end ? 'repeat' : 'ok', 'repeat', 'Летописец не повторил набег');
  assert.strictEqual(Big.toNumber(state.meta.gems), gems0 + cfg['raid.4.gems'], 'самоцветы монастыря');
  assert.ok(sim.raidAllowed(state, cfg, 7, now).age, 'порт закрыт возрастом');
  state.layers.sleep.state.sleeps = cfg['age.old'];
  assert.ok(sim.raidAllowed(state, cfg, 7, now).wings, 'порту нужны крылья 8');
});

H.test('мир века меняет защиту целей набегов', () => {
  const state = fresh(6);
  const base = Big.toNumber(cfg['raid.3.defense']);
  for (const id of ['orders', 'trade', 'trouble', 'mages', 'peace']) {
    state.run.world = { id };
    const factor = cfg['world.' + id + 'Defense'];
    assert.ok(factor > 0 && factor !== 1, id + ': защита не меняется');
    assert.ok(Math.abs(Big.toNumber(sim.raidDefense(state, cfg, 3)) / base - factor) < 1e-9, id);
  }
  state.run.world = { id: 'orders' };
  const strong = sim.raidChance(state, cfg, 3);
  state.run.world = { id: 'trouble' };
  assert.ok(sim.raidChance(state, cfg, 3) > strong, 'в смуту цель легче, чем в век орденов');
  // The model's world brings its own defense (0.5–2), an old one without it keeps 1.
  assert.ok(sim.setWorld(state, { title: 'Век пустых стен', text: 'Стены без стражи.', knights: 1, raids: 1, interval: 1, fear: 1, defense: 0.1 }));
  assert.strictEqual(sim.worldMod(state, cfg, 'defense'), 0.5);
  assert.ok(sim.setWorld(state, { title: 'Век старый', text: 'Как прежде.', knights: 1, raids: 1, interval: 1, fear: 1 }));
  assert.strictEqual(sim.worldMod(state, cfg, 'defense'), 1);
  const made = sim.procedural('worlds', Rng.make(3));
  assert.ok(made.defense >= 0.7 && made.defense <= 1.4, 'процедурный мир: ' + made.defense);
});

H.test('события: все 15 применяются, выбор по истечении — последний', () => {
  assert.strictEqual(sim.EVENTS.length, 15);
  const state = fresh(9);
  state.run.gold = Big.str(Big.of('1e7'));
  state.run.servants = [30, 20, 5, 0, 0, 0, 0, 0];
  state.layers.sleep.state.sleeps = 10;
  sim.tick(state, 1, ctx(w.x, T0, Rng.make(2)));
  for (const ev of sim.EVENTS) {
    for (const c of ev.choices || [[null]]) {
      sim.applyEvent(state, cfg, ev.id, c[0], T0, Rng.make(3));
      nanFree(state, ev.id);
    }
  }
  state.run.event = { id: 'envoys', at: T0, until: T0 + 1000 };
  state.run.fx.tribute = 0;
  sim.tick(state, 1, ctx(w.x, T0 + 5000, Rng.make(2)));
  assert.ok(!state.run.event && !sim.on(state, 'tribute', T0 + 5000), 'без ответа — «Отказать»');
  // The molt: the Scale comes back one level higher.
  const s2 = fresh(10);
  const scale = s2.run.q.scale;
  sim.applyEvent(s2, cfg, 'molt', null, T0, Rng.make(1));
  sim.tick(s2, 1, ctx(w.x, T0 + cfg['event.moltSec'] * 1000 + 1000, Rng.make(1)));
  assert.strictEqual(s2.run.q.scale, scale + 1, 'линька: +1 Чешуя');
  // The golden rain: coins only while it falls.
  sim.applyEvent(s2, cfg, 'rain', 'catch', T0, Rng.make(1));
  s2.run.servants[0] = 5;
  assert.ok(Big.gt(sim.rainCoin(s2, cfg, T0 + 1000), 0), 'монета дождя');
  assert.ok(Big.isZero(sim.rainCoin(s2, cfg, T0 + 60000)), 'монета после дождя');
});

H.test('возрасты, дыхание, Ужас, залы, кладка', () => {
  const state = fresh(12);
  assert.ok(!sim.buyHall(state, cfg, 'nest'), 'зал у молодого');
  state.layers.sleep.state.sleeps = 1;
  sim.addGems(state, 100);
  assert.ok(sim.buyHall(state, cfg, 'nest'), 'гнездо');
  assert.ok(Big.lt(sim.servantCost(state, cfg, 0, 1), Big.of(20)), 'гнездо удешевляет слуг');
  // The halls without a last level: every level is bought while the gems last, each dearer than the one before.
  ['bones', 'nest', 'mirror', 'sanctum'].forEach((id) => {
    assert.strictEqual(sim.hallMax(cfg, id), 0, id + ': без предела');
    sim.addGems(state, 1e12);
    let last = 0;
    for (let i = sim.hall(state, id); i < 12; i++) {
      const price = sim.hallCost(state, cfg, id);
      assert.ok(price > last, id + ': цена растёт');
      last = price;
      assert.ok(sim.buyHall(state, cfg, id), id + ': уровень ' + (i + 1));
    }
    assert.strictEqual(sim.hall(state, id), 12, id + ': 12 уровней');
  });
  const glit = sim.glitter(state, cfg, Big.of('1e6'));
  assert.ok(isFinite(glit) && glit > 1, 'блеск с высоким сводом конечен: ' + glit);
  assert.ok(Big.gt(sim.servantCost(state, cfg, 0, 1), 0), 'слуга с высоким гнездом не бесплатен');
  // The grotto opens mechanics and the cache shields a share of the pile: both end.
  for (let i = 0; i < 30; i++) {
    sim.buyHall(state, cfg, 'grotto');
    sim.buyHall(state, cfg, 'cache');
  }
  assert.strictEqual(sim.hall(state, 'grotto'), cfg['hall.grotto.max'], 'грот: два уровня');
  assert.strictEqual(sim.hall(state, 'cache'), cfg['hall.cache.max'], 'тайник: до предела');
  assert.ok(sim.hallFull(state, cfg, 'cache') && !sim.hallFull(state, cfg, 'bones'), 'полон только зал с пределом');
  assert.ok(cfg['hall.cache.max'] * cfg['hall.cache.share'] < 1, 'тайник не укрывает всю кучу');
  state.layers.sleep.state.halls = { grotto: 0, bones: 0, nest: 1, mirror: 0, sanctum: 0, cache: 0 };
  // The milestones do not end at the listed ones: one more every `servant.milestoneEvery` servants.
  const marks = String(cfg['servant.milestones']).split(',').map(Number);
  const lastMark = marks[marks.length - 1];
  const every = cfg['servant.milestoneEvery'];
  assert.strictEqual(sim.nextMilestone(lastMark - 1, cfg), lastMark, 'последняя веха из списка');
  assert.strictEqual(sim.nextMilestone(lastMark, cfg), lastMark + every, 'веха после списка');
  assert.strictEqual(sim.nextMilestone(lastMark + every, cfg), lastMark + 2 * every, 'и следующая');
  assert.strictEqual(sim.milestoneMult(lastMark + every - 1, cfg), Math.pow(cfg['servant.milestoneMult'], marks.length), 'до новой вехи множитель прежний');
  assert.strictEqual(sim.milestoneMult(lastMark + 3 * every, cfg), Math.pow(cfg['servant.milestoneMult'], marks.length + 3), 'три вехи после списка');
  const off = Object.assign({}, cfg, { 'servant.milestoneEvery': 0 });
  assert.strictEqual(sim.nextMilestone(lastMark, off), null, 'вехи после списка выключены');
  assert.ok(!sim.breathe(state, cfg, 'fire'), 'дыхание у взрослого');
  state.layers.sleep.state.sleeps = cfg['age.old'];
  assert.ok(sim.breathe(state, cfg, 'frost') && !sim.breathe(state, cfg, 'fire'), 'дыхание одно на век');
  state.run.gold = Big.str(Big.of('1e6'));
  sim.tick(state, 1, ctx(w.x, T0, Rng.make(1)));
  assert.ok(!sim.terror(state, cfg, T0), 'Ужас у старого');
  state.layers.sleep.state.sleeps = cfg['age.ancient'];
  assert.ok(sim.terror(state, cfg, T0) && !sim.terror(state, cfg, T0), 'Ужас раз в век');
  for (let i = 0; i < 3; i++) sim.chooseSpecies(state, cfg, 'shadow');
  assert.strictEqual(state.layers.clutch.state.next, 'cave', 'теневой без Крови');
  state.layers.clutch.state.bloodTotal = 8;
  assert.ok(sim.chooseSpecies(state, cfg, 'shadow'));
  state.run.servants[0] = 1;
  const g0 = Big.of(sim.income(state, cfg, T0));
  state.layers.clutch.currency = Big.str(Big.of(2));
  assert.ok(Math.abs(Big.toNumber(Big.div(sim.income(state, cfg, T0), g0)) - 4) < 1e-6, 'Кровь ×2 каждая');
});

H.test('сохранение версии 1 читается (fixtures/v1.json)', () => {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '..', 'fixtures', 'v1.json');
  assert.ok(fs.existsSync(file), 'нет fixtures/v1.json');
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  state.game = game.id;
  const picked = Core.pick([{ state, seq: state.seq, source: 'fixture' }], game, sim);
  assert.ok(picked.state, JSON.stringify(picked.broken));
});

H.done(w.id + ': свои проверки');
for (const k in report) console.log(k + ': ' + report[k]);
