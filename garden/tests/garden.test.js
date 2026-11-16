// The rules and the balance of «Сад» in node: genetics, mutations, reachability, the album,
// growth by the wall clock (water, night hours), pods, viability, prestige, offline, the pace.
// node tests/garden.test.js
'use strict';
const assert = require('assert');
const { open, ctxOf, test, done } = require('./env');

const x = open();
const { Core, Big, Rng, sim, game, cfg, kit } = x;
const HOUR = 3600000;
const MIN = 60000;
const T0 = Date.UTC(2026, 10, 2, 9, 0, 0);

function fresh(now, seed) {
  return Core.newState(game, sim, ctxOf(x, now || T0, Rng.make(seed || 1)));
}
function moonG(color, shape, pattern, rest) { return color + shape + pattern + (rest || '+-+---nn12'); }
function plantG(state, i, fam, g, m) {
  state.run.beds[i].p = { id: 't' + i, f: fam, g: g, m: m || '', ch: '', gr: 0, bl: 0, win: 0, seen: true, pod: null, at: T0, par: 'a|b', known: false };
  return state.run.beds[i].p;
}
function near(a, b, tol, what) { assert.ok(Math.abs(a - b) <= tol, what + ': ' + a + ' не около ' + b + ' (±' + tol + ')'); }

// ---- genetics -------------------------------------------------------------------------------

test('RY × RY: 10 000 потомков дают RR:RY:YY около 1:2:1', () => {
  const rng = Rng.make(42);
  const g = moonG('RY', 'sb', 'pq');
  const c = { RR: 0, RY: 0, YY: 0 };
  for (let i = 0; i < 10000; i++) {
    const p = sim.crossGenes('moon', g, g, rng, 0, cfg).g.substr(0, 2).split('').sort().join('');
    c[p === 'RY' ? 'RY' : p]++;
  }
  console.log('  RR ' + c.RR + ', RY ' + c.RY + ', YY ' + c.YY);
  near(c.RR / 10000, 0.25, 0.02, 'RR');
  near(c.RY / 10000, 0.5, 0.02, 'RY');
  near(c.YY / 10000, 0.25, 0.02, 'YY');
});

test('гены наследуются независимо: sr × br по форме 1:1:2 (звезда, колокол, круг из 4)', () => {
  const rng = Rng.make(5);
  const a = moonG('RW', 'sr', 'pq');
  const b = moonG('RW', 'br', 'pq');
  const c = { star: 0, bell: 0, round: 0 };
  const both = { 'white:round': 0 };
  for (let i = 0; i < 20000; i++) {
    const g = sim.crossGenes('moon', a, b, rng, 0, cfg).g;
    const ph = sim.phenotype('moon', g);
    c[ph.shape]++;
    if (ph.color === 'white' && ph.shape === 'round') both['white:round']++;
  }
  near(c.star / 20000, 0.5, 0.02, 'звезда');
  near(c.bell / 20000, 0.25, 0.02, 'колокол');
  near(c.round / 20000, 0.25, 0.02, 'круг');
  near(both['white:round'] / 20000, 0.25 * 0.25, 0.01, 'белый круг (независимость)');
});

test('облик: таблица цвета, формы и узора из спеки', () => {
  const C = { RR: 'red', YY: 'yellow', BB: 'blue', RY: 'orange', YR: 'orange', RB: 'purple', YB: 'green', RW: 'red', WY: 'yellow', BW: 'blue', WW: 'white',
    LL: 'glow', NN: 'black', LR: 'red', NB: 'blue', LW: 'white', LN: 'white', NW: 'white', TT: 'clear', TR: 'red', TW: 'white' };
  for (const p in C) assert.strictEqual(sim.colorOf(p), C[p], 'цвет ' + p);
  const S = { ss: 'star', sb: 'star', sr: 'star', bb: 'bell', br: 'bell', rr: 'round', sk: 'star', bk: 'bell', rk: 'round', kk: 'crystal' };
  for (const p in S) assert.strictEqual(sim.shapeOf(p), S[p], 'форма ' + p);
  const P = { pp: 'solid', pq: 'solid', pd: 'solid', pg: 'solid', qq: 'stripes', dd: 'dots', qd: 'net', dq: 'net', gg: 'gold', qg: 'stripes', dg: 'dots' };
  for (const p in P) assert.strictEqual(sim.patternOf(p), P[p], 'узор ' + p);
  assert.strictEqual(sim.phenotype('moon', moonG('RW', 'sr', 'pq', '++++++nn12')).size, 6, 'размер 6');
  assert.strictEqual(sim.phenotype('moon', moonG('RW', 'sr', 'pq', '------nn12'), 'G').size, 7, 'гигант 7');
  // Солнечник и Веерник.
  assert.strictEqual(sim.berryOf('oe'), 'round');
  assert.strictEqual(sim.berryOf('ez'), 'long');
  assert.strictEqual(sim.berryOf('zz'), 'star');
  assert.strictEqual(sim.thornsOf('Ss'), 'thorny');
  assert.strictEqual(sim.thornsOf('ss'), 'smooth');
  assert.strictEqual(sim.leafOf('ce'), 'c');
  assert.strictEqual(sim.leafOf('eb'), 'b');
  assert.strictEqual(sim.variegOf('VV'), 'varieg');
  assert.strictEqual(sim.variegOf('Vv'), 'rim');
  assert.strictEqual(sim.variegOf('vv'), 'green');
  assert.strictEqual(sim.veinsOf('Kk'), 'red');
  assert.strictEqual(sim.veinsOf('kk'), 'green');
});

test('мутации: точечная около μ на ген, редкие аллели с весом 0,1, мутации растения по частотам', () => {
  const rng = Rng.make(7);
  const g = moonG('RW', 'sr', 'pq');
  let genes = 0;
  let hit = 0;
  const colorAlleles = {};
  for (let i = 0; i < 50000; i++) {
    const r = sim.crossGenes('moon', g, g, rng, 0.004, cfg);
    genes += 8;
    hit += r.mutated.length;
  }
  for (let i = 0; i < 100000; i++) {
    const a = sim.FAMILIES.moon.genes[0];
    const v = rng.weighted(a.alleles.split(''), (q) => (a.rare.indexOf(q) >= 0 ? cfg['mut.rareWeight'] : 1));
    colorAlleles[v] = (colorAlleles[v] || 0) + 1;
  }
  const rate = hit / genes;
  console.log('  точечных: ' + hit + ' на ' + genes + ' генов = ' + (rate * 100).toFixed(3) + ' % (μ = 0,4 %)');
  near(rate, 0.004, 0.0004, 'μ');
  near(colorAlleles.L / 100000, 0.1 / 4.2, 0.003, 'доля L при мутации цвета');
  // Whole-plant mutations through childSeed: the counted flags.
  const state = fresh();
  let G = 0;
  let C = 0;
  let N = 0;
  const total = 200000;
  for (let i = 0; i < total; i++) {
    const s = sim.childSeed(state, 'moon', g, g, '', '', rng, cfg, T0, 99);
    if (s.m.indexOf('G') >= 0) G++;
    if (s.m.indexOf('C') >= 0) C++;
    if (s.m.indexOf('N') >= 0) N++;
  }
  console.log('  на ' + total + ' семян: Гигант ' + G + ', Химера ' + C + ', Ночной ' + N);
  near(G / total, 0.001, 0.0003, 'Гигант 0,1 %');
  near(C / total, 0.0005, 0.0002, 'Химера 0,05 %');
  near(N / total, 0.002, 0.0004, 'Ночной 0,2 %');
});

test('достижимость: из стартовых семян без мутаций все 7 цветов, 3 формы, 4 узора, 84 записи Луноцвета', () => {
  const start = sim.startSeeds(cfg, 'moon').map((g) => g.substr(0, 6));
  const seen = new Set(start);
  const list = Array.from(seen);
  for (let a = 0; a < list.length; a++) {
    for (let b = 0; b <= a; b++) {
      for (let m = 0; m < 64; m++) {
        let child = '';
        for (let gi = 0; gi < 3; gi++) {
          const bits = (m >> (gi * 2)) & 3;
          child += list[a].charAt(gi * 2 + (bits & 1)) + list[b].charAt(gi * 2 + (bits >> 1));
        }
        if (!seen.has(child)) {
          seen.add(child);
          list.push(child);
        }
      }
    }
  }
  const colors = new Set(list.map((g) => sim.colorOf(g.substr(0, 2))));
  const shapes = new Set(list.map((g) => sim.shapeOf(g.substr(2, 2))));
  const patterns = new Set(list.map((g) => sim.patternOf(g.substr(4, 2))));
  const keys = new Set(list.map((g) => sim.phenotype('moon', g + '+-+---nn12').key));
  console.log('  генотипов по трём генам: ' + list.length + '; цвета ' + Array.from(colors).join(', ') + '; записей ' + keys.size);
  assert.deepStrictEqual(Array.from(colors).sort(), ['blue', 'green', 'orange', 'purple', 'red', 'white', 'yellow']);
  assert.deepStrictEqual(Array.from(shapes).sort(), ['bell', 'round', 'star']);
  assert.deepStrictEqual(Array.from(patterns).sort(), ['dots', 'net', 'solid', 'stripes']);
  assert.strictEqual(keys.size, 84);
});

test('альбом: 180 + 48 + 30 = 258, страница Химер и Ночных, у всех есть облик словами', () => {
  const all = sim.albumKeys('moon').concat(sim.albumKeys('sun'), sim.albumKeys('fan'));
  assert.strictEqual(sim.albumKeys('moon').length, 180);
  assert.strictEqual(sim.albumKeys('sun').length, 48);
  assert.strictEqual(sim.albumKeys('fan').length, 30);
  assert.strictEqual(new Set(all).size, 258);
  const special = sim.specialKeys();
  assert.strictEqual(special.length, 36 + 9 + 8);
  const texts = new Set();
  all.concat(special).forEach((k) => {
    const t = sim.lookOfKey(k);
    assert.ok(t && !/undefined/.test(t), 'облик ' + k + ': ' + t);
    texts.add(t);
  });
  assert.strictEqual(texts.size, all.length + special.length, 'облики словами не повторяются');
  console.log('  например: ' + ['moon/purple/star/dots', 'sun/blue/smooth/long', 'fan/c/rim/red', 'chimera/red+blue'].map(sim.lookOfKey).join('; '));
});

test('Тетрадь: вероятности потомства по генам и записям', () => {
  const off = sim.offspring('moon', moonG('RW', 'sr', 'pq'), moonG('YW', 'br', 'pd'));
  const sum = off.keys.reduce((s, k) => s + k.p, 0);
  near(sum, 1, 1e-9, 'сумма');
  near(off.per.color.orange, 0.25, 1e-9, 'оранжевый');
  near(off.per.color.white, 0.25, 1e-9, 'белый');
  near(off.per.shape.round, 0.25, 1e-9, 'круг');
  near(off.per.pattern.net, 0.25, 1e-9, 'сетка');
});

// ---- time ----------------------------------------------------------------------------------------

test('рост по часам: 20 + 40 минут, полив ×0,67 (и ровно на ту часть шага, что полита)', () => {
  const state = fresh();
  const p = plantG(state, 0, 'moon', moonG('RW', 'sr', 'pq'));
  const q = plantG(state, 1, 'moon', moonG('RW', 'sr', 'pq'));
  state.run.beds[1].w = T0 + 10 * MIN;
  sim.step(state, 30 * 60, ctxOf(x, T0 + 30 * MIN, Rng.make(1)));
  near(p.gr, 30 * 60, 1e-6, 'без полива');
  near(q.gr, 10 * 60 / 0.67 + 20 * 60, 1e-6, '10 минут полито');
  // A whole hour unwatered: in bloom.
  sim.step(state, 30 * 60, ctxOf(x, T0 + 60 * MIN, Rng.make(1)));
  assert.strictEqual(sim.stageOf(p, cfg), 3, 'цветёт через час');
  // Watered all the way: in bloom after 40 minutes.
  const s2 = fresh();
  const w = plantG(s2, 0, 'moon', moonG('RW', 'sr', 'pq'));
  sim.water(s2, 0, cfg, T0);
  sim.step(s2, 40.3 * 60, ctxOf(x, T0 + 40.3 * MIN, Rng.make(1)));
  assert.strictEqual(sim.stageOf(w, cfg), 3, 'политое цветёт через 40 минут');
  // The speed gene: ll is 20 % slower.
  const slow = moonG('RW', 'sr', 'pq', '+-+---ll12');
  near(sim.speedOf(slow, 'moon', cfg), 1.2, 1e-9, 'll');
});

test('ночной цветок растёт только с 22:00 до 06:00 по местному времени (или в Тёплую ночь)', () => {
  const noon = new Date(2026, 10, 3, 12, 0, 0).getTime();
  near(sim.nightSec(noon, noon + 24 * HOUR, cfg), 8 * 3600, 1, 'ночных секунд в сутках');
  near(sim.nightSec(noon, noon + 6 * HOUR, cfg), 0, 1, 'днём');
  const state = fresh(noon);
  const p = plantG(state, 0, 'moon', moonG('RW', 'sr', 'pq'), 'N');
  sim.step(state, 6 * 3600, ctxOf(x, noon + 6 * HOUR, Rng.make(1)));
  near(p.gr, 0, 1e-9, 'днём не растёт');
  sim.step(state, 4.5 * 3600, ctxOf(x, noon + 10.5 * HOUR, Rng.make(1)));
  near(p.gr, 1800, 1, 'с 22:00 до 22:30 растёт');
  const s2 = fresh(noon);
  const q = plantG(s2, 0, 'moon', moonG('RW', 'sr', 'pq'), 'N');
  s2.run.ev.warm = noon + 2 * HOUR;
  sim.step(s2, 3600, ctxOf(x, noon + HOUR, Rng.make(1)));
  near(q.gr, 3600, 1, 'в Тёплую ночь растёт и днём');
});

test('цветение: окно 6 ч, увядание, Сушилка даёт семя, Компост — 30 % цены; распустившийся без вас ждёт', () => {
  const state = fresh();
  const p = plantG(state, 0, 'moon', moonG('RW', 'sr', 'pq'));
  p.gr = 3600;
  sim.step(state, 1, ctxOf(x, T0 + 1000, Rng.make(1)));
  assert.strictEqual(sim.stageOf(p, cfg), 3);
  near(p.bl, 6 * 3600, 1, 'окно');
  state.run.up.dryer = 1;
  state.run.up.compost = 1;
  const coins = Big.toNumber(state.run.coins);
  const bank = state.run.bank.length;
  sim.step(state, 6 * 3600, ctxOf(x, T0 + 6 * HOUR + 2000, Rng.make(1)));
  assert.ok(p.dead, 'увял');
  assert.strictEqual(state.run.bank.length, bank + 1, 'семя самоопыления');
  near(Big.toNumber(state.run.coins) - coins, sim.priceOf(state, p, cfg) * 0.3, 1e-6, 'компост');
  // Offline bloom waits unseen.
  const s2 = fresh();
  const q = plantG(s2, 0, 'moon', moonG('RW', 'sr', 'pq'));
  sim.offline(s2, 24 * 3600, ctxOf(x, T0 + 24 * HOUR, Rng.make(1)));
  assert.strictEqual(sim.stageOf(q, cfg), 3, 'зацвёл без вас и ждёт');
  assert.ok(!q.seen && q.bl > 0, 'окно не тратилось');
});

test('улучшения без предела: Лейка, Сторож, Семенной банк и Витрина растут дальше прежних потолков, разовые остаются разовыми', () => {
  ['can', 'guard', 'bank', 'vitrine'].forEach((id) => {
    const s = fresh();
    s.run.up[id] = 50;
    const info0 = sim.upInfo(s, id, cfg);
    assert.strictEqual(info0.max, Infinity, id + ': предела нет');
    assert.ok(info0.short && !info0.ok, id + ': без монет не купить');
    near(Big.toNumber(info0.cost) / (cfg['up.' + id + '.base'] * Math.pow(cfg['up.' + id + '.growth'], 50)), 1, 1e-9, id + ': цена по росту');
    s.run.coins = Big.str(Big.mul(info0.cost, 1.01));
    assert.ok(sim.upgrade(s, id, cfg, T0).ok, id + ': 51-й уровень');
    assert.strictEqual(sim.lv(s, id), 51);
  });
  const s = fresh();
  s.run.up.bank = 30;
  assert.strictEqual(sim.bankCap(s, cfg), cfg['bank.start'] + 30 * cfg['bank.step'], 'банк растёт');
  s.run.coins = Big.str(Big.of(1e12));
  assert.ok(sim.upgrade(s, 'dryer', cfg, T0).ok);
  assert.strictEqual(sim.upInfo(s, 'dryer', cfg).why, 'максимум', 'Сушилка — разовая');
  s.run.up.fert = cfg['up.fert.max'];
  assert.strictEqual(sim.upInfo(s, 'fert', cfg).why, 'максимум', 'Удобрение — до своего уровня');
});

test('коробочка: 2 + round(fert / 2) семян (+ Удобрение), семена идут в банк до его вместимости', () => {
  const state = fresh();
  state.run.bank = [];
  const a = plantG(state, 0, 'moon', moonG('RW', 'sr', 'pq', '+-+---nn33'));
  const b = plantG(state, 1, 'moon', moonG('YW', 'br', 'pd'));
  a.gr = b.gr = 3600;
  sim.step(state, 1, ctxOf(x, T0 + 1000, Rng.make(1)));
  assert.ok(sim.pollinate(state, 1, 0, cfg, T0 + 1000).ok, 'опыление');
  assert.ok(!sim.pollinate(state, 1, 0, cfg, T0 + 1000).ok, 'второй раз нельзя');
  assert.strictEqual(sim.podSeeds(state, a, cfg), 2 + 3);
  const r = sim.cut(state, 0, Rng.make(2), cfg, T0 + 2000);
  assert.ok(r.ok && r.seeds === 5, 'семян ' + r.seeds);
  assert.ok(state.run.bank.every((s) => s.par === 'moon/red/star/solid|moon/yellow/bell/solid'), 'родители записаны');
  state.run.up.fert = 2;
  assert.strictEqual(sim.podSeeds(state, b, cfg), 2 + 2 + 2);
});

test('всхожесть: −5 % в сутки, не ниже 50 %, Холодильник останавливает', () => {
  const state = fresh();
  const s = state.run.bank[0];
  near(sim.viability(state, s, cfg, s.at + 2 * 86400000), 0.9, 1e-9, 'двое суток');
  near(sim.viability(state, s, cfg, s.at + 30 * 86400000), 0.5, 1e-9, 'месяц');
  state.run.coins = '1e9';
  sim.upgrade(state, 'fridge', cfg, s.at + 4 * 86400000);
  near(sim.viability(state, s, cfg, s.at + 40 * 86400000), 0.8, 1e-9, 'в холодильнике');
});

test('цена и редкость по формуле спеки, запись альбома 50 × 2^редкость', () => {
  const state = fresh();
  const ph = sim.phenotype('moon', moonG('WW', 'rr', 'dd', '++++--nn12'));
  assert.strictEqual(sim.rarity(ph, cfg), 3);
  near(sim.priceOfLook(state, ph, cfg), 5 * 4 * (0.6 + 0.4), 1e-9, 'белый круг с крапом, размер 4');
  near(sim.albumReward('moon/purple/star/net', cfg), 50 * Math.pow(2, 3), 1e-9, 'фиолетовая звезда с сеткой');
  near(sim.albumReward('moon/glow/crystal/gold', cfg), 50 * Math.pow(2, cfg['album.capPow']), 1e-9, 'потолок степени');
  const night = sim.phenotype('moon', moonG('RW', 'sr', 'pq', '+-+---nn12'), 'N');
  near(sim.priceOfLook(state, night, cfg), 5 * 1 * 0.8 * 3, 1e-9, 'ночной ×3');
});

test('заказ подбирается из достижимого одним скрещиванием и выполняется срезкой', () => {
  const state = fresh();
  const rng = Rng.make(11);
  for (let i = 0; i < 200; i++) {
    const o = sim.makeOrder(state, rng, cfg);
    assert.ok(o && sim.orderText(o).length > 3, 'текст заказа');
    const owned = state.run.bank.map((s) => s.g);
    let ok = false;
    for (const a of owned) for (const b of owned) {
      if (ok) break;
      sim.offspring('moon', a, b).keys.forEach((k) => {
        const p = k.key.split('/');
        const fits = (!o.c || o.c === p[1]) && (!o.s || o.s === p[2]) && (!o.p || o.p === p[3]);
        if (fits) ok = true;
      });
    }
    assert.ok(ok, 'недостижимый заказ ' + JSON.stringify(o));
  }
  const p = plantG(state, 0, 'moon', moonG('RY', 'sr', 'pq'));
  p.gr = 3600;
  sim.step(state, 1, ctxOf(x, T0 + 1000, Rng.make(1)));
  state.run.orders[0].o = { id: 'x', f: 'moon', c: 'orange', s: 'star', p: '', z: 0 };
  const r = sim.cut(state, 0, Rng.make(1), cfg, T0 + 2000);
  assert.ok(r.order, 'заказ выполнен');
  near(r.coins, sim.priceOfLook(state, sim.phenotype('moon', p.g), cfg) * 3, 1e-9, 'награда ×3');
  assert.ok(state.run.orders[0].at === T0 + 2000 + 30 * MIN, 'новый через 30 минут');
});

// ---- the engine's hooks ------------------------------------------------------------------------------

test('сохранение туда и обратно, без NaN после пяти дней, перевод часов назад', () => {
  const r = kit.bot(game, sim, cfg, { play: (s, c, m, t) => sim.botPlay(s, c, m, t), days: 2 });
  const json = JSON.stringify(r.state);
  assert.ok(!/NaN|Infinity|undefined/.test(json), 'NaN в сохранении');
  const picked = Core.pick([{ json, seq: 1, source: 't' }], game, sim);
  assert.ok(picked.state, 'читается');
  assert.strictEqual(JSON.stringify(picked.state.run), JSON.stringify(JSON.parse(json).run));
  assert.strictEqual(sim.validate(r.state), null);
  const p = Core.plan(r.state.lastTick, r.state.lastTick - 5 * HOUR, cfg, 0);
  assert.ok(p.clockBack && p.creditedMs === 0, 'часы назад: ноль');
  const before = JSON.stringify(r.state.run.beds);
  sim.offline(r.state, 0, ctxOf(x, r.state.lastTick, Rng.make(1)));
  assert.strictEqual(JSON.stringify(r.state.run.beds), before, 'ноль секунд ничего не меняет');
});

test('офлайн 12 ч: формула (кусками) и шаги совпадают; сводка «Пока вас не было»', () => {
  const r = kit.offlineAgree(game, sim, cfg, 300, (s, c, m, t) => sim.botPlay(s, c, m, t));
  console.log('  формула ' + r.formula + ', шаги ' + r.steps + ', расхождение ' + (r.diff * 100).toFixed(2) + ' %');
  assert.ok(r.diff <= 0.01, 'расхождение ' + r.diff);
  assert.ok(!Big.isZero(Big.of(r.steps)), 'офлайн дал монеты (записи альбома)');
  const state = fresh();
  sim.botPlay(state, ctxOf(x, T0, Rng.make(1)), sim, 3);
  state.lastTick = T0;
  const plan = Core.plan(T0, T0 + 12 * HOUR, cfg, 0);
  const rep = Core.runOffline(sim, state, game, plan, null, (seg) => ctxOf(x, seg.to, Rng.make(1)), cfg);
  console.log('  сводка: ' + rep.events.join(' / '));
  assert.ok(rep.events.some((e) => /^Зацвело/.test(e)), 'в сводке есть «Зацвело»');
  assert.ok(Big.gt(rep.gains.coins || 0, 0), 'монеты за записи альбома');
});

test('переезд: перегной = floor(sqrt(монет / 10 000)), альбом и 10 семян остаются, климат', () => {
  const state = fresh();
  const keys = sim.albumKeys('moon').slice(0, 60);
  keys.forEach((k) => { state.meta.album[k] = T0; });
  state.run.earned = '90000e0';
  for (let i = 0; i < 20; i++) state.run.bank.push({ id: 'k' + i, f: 'moon', g: moonG('RW', 'sr', 'pq'), m: '', ch: '', v: 1, at: T0, par: 'start', known: false });
  assert.strictEqual(Big.str(sim.prestigeGain(state, 'move', cfg)), Big.str(Big.of(3)));
  state.meta.movePlan = { climate: 'rocky', seeds: ['k1', 'k2', 'k3'] };
  const ctx = ctxOf(x, T0 + HOUR, Rng.make(1));
  const res = Core.prestige(sim, game, state, 'move', ctx);
  assert.ok(res.ok, 'переезд');
  assert.strictEqual(sim.albumCount(state), 60, 'альбом остался');
  assert.ok(state.run.bank.some((s) => s.id === 'k1') && state.run.bank.length <= 3 + 6, 'семена с собой');
  assert.strictEqual(state.run.climate, 'rocky');
  assert.strictEqual(sim.bedsMax(state, cfg), 16, 'Каменистый склон: 16 грядок');
  assert.strictEqual(Big.toNumber(state.layers.move.currency), 3);
  assert.ok(/рост ×1,09, цена ×1,15/.test(sim.bonus(state, 'move', 3, cfg)), sim.bonus(state, 'move', 3, cfg));
  const fewer = fresh();
  keys.slice(0, 59).forEach((k) => { fewer.meta.album[k] = T0; });
  fewer.run.earned = '1e9';
  assert.ok(Big.isZero(sim.prestigeGain(fewer, 'move', cfg)), 'до 60 записей нельзя');
});

test('сундук «Пассажира»: семя записи альбома, которой ещё нет, облик открыт', () => {
  const state = fresh();
  sim.albumKeys('moon').slice(0, 170).forEach((k) => { state.meta.album[k] = T0; });
  const loot = sim.chest(state, Rng.make(4), cfg);
  const seed = state.run.bank[state.run.bank.length - 1];
  assert.ok(seed.known && seed.src === 'chest');
  const key = sim.phenotype(seed.f, seed.g).key;
  assert.ok(!state.meta.album[key], 'запись новая: ' + key);
  assert.ok(/Семя: /.test(loot.items[0].title), loot.items[0].title);
});

test('запас: проверка имён сортов и сезонных заказов', () => {
  assert.strictEqual(sim.validateStock('names', { key: 'moon/red/star/solid', name: 'Алая заря', text: 'Ранний сорт' }), null);
  assert.ok(sim.validateStock('names', { key: 'moon/pink/star/solid', name: 'x' }));
  assert.strictEqual(sim.validateStock('seasonal', { title: 'К Новому году', color: 'white', shape: 'star' }), null);
  assert.ok(sim.validateStock('seasonal', { title: 'Пусто' }));
  assert.ok(/[А-ЯЁ]/.test(sim.varietyName('moon/blue/bell/solid', { adj: ['Тихой'], place: ['поймы'] })));
});

// ---- the pace --------------------------------------------------------------------------------------

test('темп: первая покупка за 10 с, первый переезд в поездках 6–10 (3–5 дней по две поездки)', () => {
  const play = (s, c, m, t) => sim.botPlay(s, c, m, t);
  const r = kit.bot(game, sim, cfg, { play, days: 5 });
  console.log('  первая покупка: ' + r.firstBuySec + ' с; первый переезд: поездка ' + (r.prestiges[0] ? r.prestiges[0].trip + ', перегной ' + r.prestiges[0].gain : 'нет'));
  assert.ok(r.firstBuySec !== null && r.firstBuySec <= 10);
  assert.ok(r.prestiges.length > 0, 'нет переезда за 10 поездок');
  assert.ok(r.prestiges[0].trip >= 6 && r.prestiges[0].trip <= 10);
});

done('garden');
