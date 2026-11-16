// The run itself (world.js) under node: one seed — one run, a snapshot goes on from the same
// step, no NaN with a random thumb on every hero, mode and storm, the caps hold, the level-up
// cards follow the rules, auto-aim hits without a touch, bosses, hives and fusions happen.
// node tests/world.test.js
'use strict';
const assert = require('assert');
const L = require('./load.js');
const { test, done } = L.H;
const W = L.World;
const cfg = L.config();

/** A random thumb from its own seed: holds a direction for a while, sometimes lets go. */
function thumb(seed) {
  const rng = L.Rng.make(seed);
  let left = 0;
  let mx = 0;
  let my = 0;
  return function () {
    if (left-- <= 0) {
      left = 10 + Math.floor(rng.next() * 90);
      if (rng.next() < 0.2) {
        mx = 0;
        my = 0;
      } else {
        const a = rng.next() * Math.PI * 2;
        const m = 0.3 + rng.next() * 0.7;
        mx = Math.cos(a) * m;
        my = Math.sin(a) * m;
      }
    }
    return [mx, my, Math.floor(rng.next() * 3)];
  };
}

function play(w, steps, input) {
  for (let i = 0; i < steps && !w.s.over; i++) {
    const m = input();
    if (w.s.choice) W.pick(w, m[2] % w.s.choice.cards.length);
    W.step(w, m[0], m[1]);
  }
}

test('одно зерно и одни касания — один и тот же забег', () => {
  const a = W.create(cfg, { seed: 9, hero: 'wanderer', mode: 'normal' });
  const b = W.create(cfg, { seed: 9, hero: 'wanderer', mode: 'normal' });
  play(a, 60 * 90, thumb(1));
  play(b, 60 * 90, thumb(1));
  assert.strictEqual(W.hash(a), W.hash(b));
  assert.deepStrictEqual(W.result(a), W.result(b));
  const c = W.create(cfg, { seed: 10, hero: 'wanderer', mode: 'normal' });
  play(c, 60 * 90, thumb(1));
  assert.notStrictEqual(W.hash(a), W.hash(c), 'другое зерно — тот же забег');
});

test('снимок продолжается с того же шага: и посреди боя, и на выборе карточек', () => {
  const a = W.create(cfg, { seed: 4, hero: 'keeper', mode: 'normal', storm: 3 });
  const input = thumb(2);
  play(a, 60 * 100, input);
  const json = JSON.stringify(W.save(a));
  const b = W.load(cfg, JSON.parse(json));
  assert.ok(b, 'снимок не читается');
  assert.strictEqual(W.hash(b), W.hash(a));
  const ia = thumb(3);
  const ib = thumb(3);
  play(a, 60 * 40, ia);
  play(b, 60 * 40, ib);
  assert.strictEqual(W.hash(b), W.hash(a), 'разошлись через 40 секунд');
  // At a choice: the same three cards come back.
  const c = W.create(cfg, { seed: 5, hero: 'wanderer', mode: 'normal' });
  for (let n = 0; n < 60 * 120 && !c.s.choice && !c.s.over; n++) W.step(c, 0.5, 0.2);
  assert.ok(c.s.choice, 'выбор не открылся');
  const d = W.load(cfg, JSON.parse(JSON.stringify(W.save(c))));
  assert.deepStrictEqual(d.s.choice, c.s.choice);
  console.log('  снимок ' + Math.round(json.length / 1024) + ' КБ');
});

test('снимок другой версии или с другими пределами не читается', () => {
  const a = W.create(cfg, { seed: 4, hero: 'wanderer', mode: 'normal' });
  const data = W.save(a);
  assert.strictEqual(W.load(cfg, Object.assign({}, data, { v: data.v + 1 })), null);
  assert.strictEqual(W.load(L.config({ 'caps.enemies': 100 }), data), null);
  assert.strictEqual(W.load(cfg, null), null);
});

test('случайный палец: без NaN на всех героях, режимах и ступенях', () => {
  const heroes = L.Sim.HEROES;
  const modes = ['normal', 'sprint', 'endless', 'daily'];
  let runs = 0;
  let steps = 0;
  for (let i = 0; i < 24; i++) {
    const ws = L.workshop(cfg, i % 3 === 0 ? 'empty' : i % 3 === 1 ? 'half' : 'max');
    const rules = modes[i % 4] === 'daily' ? ['swarm', 'many', 'bombers'] : [];
    const w = W.create(cfg, { seed: 500 + i, hero: heroes[i % heroes.length], mode: modes[i % 4], storm: (i * 5) % 16, ws: ws, rules: rules, bonus: i % 2 ? 'revive' : 'reroll' });
    const input = thumb(700 + i);
    let n = 0;
    while (!w.s.over && n < 60 * 330) {
      play(w, 600, input);
      n += 600;
      const bad = W.check(w);
      assert.strictEqual(bad, null, 'забег ' + i + ' на ' + Math.round(w.s.t) + ' с: ' + bad);
      assert.ok(w.s.ecount <= w.c.capE && w.s.pcount <= w.c.capP && w.s.gcount <= w.c.capG, 'сверх предела');
    }
    runs++;
    steps += n;
  }
  console.log('  ' + runs + ' забегов, ' + Math.round(steps / 60) + ' с игры');
});

test('пределы держатся в самом густом забеге (шторм 15, рой, лишний снаряд)', () => {
  const w = W.create(cfg, { seed: 77, hero: 'mechanic', mode: 'daily', storm: 15, ws: L.workshop(cfg, 'max'), rules: ['swarm', 'many', 'elites'] });
  const b = W.brain(77);
  const peak = { e: 0, p: 0, g: 0 };
  for (let i = 0; i < 60 * 300 && !w.s.over; i++) {
    if (w.s.choice) W.botPick(w, b);
    W.botMove(w, b);
    W.step(w, b.mx, b.my);
    peak.e = Math.max(peak.e, w.s.ecount);
    peak.p = Math.max(peak.p, w.s.pcount);
    peak.g = Math.max(peak.g, w.s.gcount);
  }
  console.log('  пики ' + JSON.stringify(peak) + ' при пределах ' + [w.c.capE, w.c.capP, w.c.capG].join('/'));
  assert.ok(peak.e <= w.c.capE && peak.p <= w.c.capP && peak.g <= w.c.capG);
  assert.ok(peak.e >= w.c.capE * 0.5, 'забег не густой: ' + peak.e);
  assert.strictEqual(W.check(w), null);
});

test('карточки: не больше трёх, без повторов, без предмета на максимуме, слоты', () => {
  let choices = 0;
  for (let k = 0; k < 6; k++) {
    const w = W.create(cfg, { seed: 900 + k, hero: 'wanderer', mode: 'normal', ws: L.workshop(cfg, 'max') });
    const b = W.brain(900 + k);
    for (let i = 0; i < 60 * 300 && !w.s.over; i++) {
      if (w.s.choice) {
        choices++;
        const cards = w.s.choice.cards;
        assert.ok(cards.length >= 1 && cards.length <= 3);
        const ids = cards.map((c) => c.k + ':' + c.id);
        assert.strictEqual(new Set(ids).size, ids.length, 'повтор ' + ids);
        cards.forEach((c) => {
          if (c.k === 'w') {
            const wp = W.weaponOf(w, c.id);
            assert.ok(wp ? wp.lvl < w.c.wMax : w.s.wp.length < w.c.slotsW, 'оружие сверх: ' + c.id);
            assert.ok(!w.s.banned[c.id], 'убранное вернулось');
          }
          if (c.k === 'p') assert.ok((w.s.ps[c.id] || 0) < w.c.pMax, 'пассив сверх: ' + c.id);
        });
        if (choices % 7 === 0 && w.s.banishes > 0) {
          const i0 = cards.findIndex((c) => c.k === 'w' || c.k === 'p');
          if (i0 >= 0) {
            const id = cards[i0].id;
            assert.ok(W.banish(w, i0));
            assert.ok(w.s.banned[id]);
            assert.ok(w.s.choice.cards.every((c) => c.id !== id), 'убранное осталось среди карточек');
          }
        }
        W.botPick(w, b);
      }
      W.botMove(w, b);
      W.step(w, b.mx, b.my);
      assert.ok(w.s.wp.length <= w.c.slotsW, 'оружия больше слотов');
    }
  }
  assert.ok(choices > 100, 'выборов ' + choices);
  console.log('  проверено ' + choices + ' выборов');
});

test('перебросить, пропустить: заряды и золото', () => {
  const w = W.create(cfg, { seed: 31, hero: 'wanderer', mode: 'normal', ws: L.workshop(cfg, { reroll: 2 }), bonus: 'reroll' });
  assert.strictEqual(w.s.rerolls, 3);
  for (let n = 0; n < 60 * 120 && !w.s.choice && !w.s.over; n++) W.step(w, 0.4, 0.3);
  assert.ok(W.reroll(w));
  assert.strictEqual(w.s.rerolls, 2);
  assert.ok(w.s.choice.cards.length >= 1);
  const gold = w.s.gold;
  assert.ok(W.skip(w));
  assert.strictEqual(w.s.gold, gold + w.c.skipGold);
  w.s.rerolls = 0;
  while (w.s.choice) W.pick(w, 0);
  for (let n = 0; n < 60 * 120 && !w.s.choice && !w.s.over; n++) W.step(w, 0.4, 0.3);
  assert.ok(!W.reroll(w), 'переброс без зарядов');
});

test('автоприцел: герой стоит, оружие само находит и убивает', () => {
  // Standing still in the crowd is death in a quarter of a minute; the aim does not need the thumb.
  const w = W.create(cfg, { seed: 12, hero: 'wanderer', mode: 'normal' });
  for (let i = 0; i < 60 * 12 && !w.s.over; i++) {
    if (w.s.choice) W.pick(w, 0);
    W.step(w, 0, 0);
  }
  assert.ok(w.s.kills >= 5, 'убито ' + w.s.kills);
});

test('шкала забега: элита, Улей, Жнец, сращения (максимум мастерской)', () => {
  let bosses = 0;
  let hives = 0;
  let elites = 0;
  let fusions = 0;
  let wins = 0;
  const N = 20;
  for (let i = 0; i < N; i++) {
    const r = W.botRun(cfg, { seed: 3000 + i, hero: 'wanderer', mode: 'normal', ws: L.workshop(cfg, 'max') }, { skill: 1, maxSec: 400 });
    bosses += r.bosses;
    hives += r.hives;
    elites += r.elites > 0 ? 1 : 0;
    fusions += r.fusions.length > 0 ? 1 : 0;
    wins += r.won ? 1 : 0;
    assert.ok(!r.won || Math.round(r.T) >= cfg['run.seconds'], 'победа раньше конца');
  }
  console.log('  из ' + N + ': побед ' + wins + ', Жнецов ' + bosses + ', ульев ' + hives + ', с элитой ' + elites + ', со сращением ' + fusions);
  assert.ok(elites >= N * 0.9);
  assert.ok(hives >= N * 0.5);
  assert.ok(bosses >= N * 0.5);
  assert.ok(fusions >= 2, 'сращений почти нет');
});

test('перегон короче, а без конца не кончается победой', () => {
  const s = W.botRun(cfg, { seed: 41, hero: 'wanderer', mode: 'sprint', ws: L.workshop(cfg, 'max') }, { skill: 1, maxSec: 400 });
  assert.ok(s.time <= cfg['run.sprintSeconds'] + 1, 'перегон ' + s.time);
  const e = W.botRun(cfg, { seed: 41, hero: 'wanderer', mode: 'endless', ws: L.workshop(cfg, 'max') }, { skill: 1, maxSec: 900 });
  assert.ok(!e.won, 'без конца закончился победой');
  assert.ok(e.time > cfg['run.seconds'] * 0.5, 'без конца ' + e.time);
});

test('забег дня: правила дня в ходу, общее зерно', () => {
  const a = W.create(cfg, { seed: 55, hero: 'wanderer', mode: 'daily', rules: ['glass', 'rich', 'nonsense'] });
  assert.deepStrictEqual(a.s.rules, ['glass', 'rich']);
  const b = W.create(cfg, { seed: 55, hero: 'wanderer', mode: 'daily', rules: [] });
  assert.ok(a.s.hmax < b.s.hmax, 'стекло не убавило здоровья');
});

done('world wave-survival');
