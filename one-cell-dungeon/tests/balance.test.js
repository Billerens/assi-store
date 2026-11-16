// The balance of «Подземелье в одну клетку» by bots (the spec's «Как проверить»): the bot that looks
// two steps ahead by «здоровье + щит + ценность оружия» against a random one at four points of the
// workshop; the length of a run at 1 s a move; the embers of the first run; a whole career from a
// fresh save to the first win (= the first prestige) and the next depths; the time of the fairness
// check; no NaN. Default samples keep the file around a minute; FULL=1 runs 5000 descents a point.
const assert = require('assert');
const E = require('./env.js');
const { sim, cfg, Core, game, Rng } = E.setup();
const { test, done } = E;

const FULL = process.env.FULL === '1';
const N = FULL ? 5000 : 400;
const CAREERS = FULL ? 40 : 6;
const C = Object.assign({}, cfg, { 'fair.runs': 0 });
const GIFTS = sim.list('gifts').map((g) => g.id);
const KINDS = sim.list('kind').map((k) => k.id);
// The order the owner (and the bot) values the gifts in — measured: one gift in hand, 400 runs each.
const RANK = ['horseshoe', 'squeeze', 'whet', 'sip', 'swap', 'empty', 'silence', 'shot', 'double', 'glance'];
const CHOICE_SEC = 3;

function fresh() { return { run: { phase: 'hub' }, layers: {}, meta: sim.freshMeta() }; }
function bestHand(open) { return RANK.filter((id) => open.indexOf(id) >= 0).slice(0, cfg['hand.size']); }

/**
 * The workshop at a point: 'bare'; 'mid' — the middle of the way as the spec's «Темп» puts the end
 * of the first hour: 5 gifts (any five, a new draw each run), 2 heroes, the first «Крепости»;
 * 'all' — everything open at depth 0; 'deep' — the same at depth 10.
 */
function point(name, i) {
  const s = fresh();
  const m = s.meta;
  if (name === 'mid') {
    const r = Rng.make(31337 + i);
    const open = r.shuffle(GIFTS.slice()).slice(0, 5);
    m.shop.gifts = open;
    m.shop.fort = 2;
    m.pref.hand = bestHand(open);
    m.unlocked.thief = true;
  }
  if (name === 'all' || name === 'deep') {
    m.shop.gifts = GIFTS.slice();
    // the workshop has no ceiling for gift levels and the fortress: the «all» point is a long career, not infinity
    GIFTS.forEach((id) => { m.shop.lv[id] = isFinite(sim.giftMaxLevel(cfg)) ? sim.giftMaxLevel(cfg) : 2; });
    m.shop.slots = cfg['shop.slot.max'];
    m.shop.fort = isFinite(sim.fortMax(cfg)) ? sim.fortMax(cfg) : 5;
    m.shop.blade = 1;
    m.pref.hand = bestHand(GIFTS);
    m.pref.kinds = KINDS.slice();
    sim.list('heroes').forEach((h) => { m.unlocked[h.id] = true; });
    m.pref.hero = 'smith';
  }
  if (name === 'deep') {
    s.layers.depth = { currency: cfg['depth.max'] };
    m.pref.depth = cfg['depth.max'];
  }
  return s;
}

const stats = {};
function measure(name, kind) {
  const key = name + ':' + kind;
  if (stats[key]) return stats[key];
  const t0 = Date.now();
  const o = { wins: 0, floors: 0, moves: 0, choices: 0, wonSec: 0, embers: 0, bad: null, lost: {} };
  for (let i = 0; i < N; i++) {
    const s = point(name, i);
    const r = sim.botRun(s, C, kind, 100000 + i);
    if (r.won) {
      o.wins++;
      o.wonSec += r.moves + r.choices * CHOICE_SEC;
    } else o.lost[r.floor] = (o.lost[r.floor] || 0) + 1;
    o.floors += r.floors;
    o.moves += r.moves;
    o.choices += r.choices;
    o.embers += r.embers.total;
    if (!o.bad && i % 50 === 0) {
      const json = JSON.stringify(s);
      if (/NaN|undefined|Infinity/.test(json) || sim.validate(s)) o.bad = 'забег ' + i + ': ' + (sim.validate(s) || 'NaN в сохранении');
    }
  }
  o.rate = o.wins / N;
  o.sec = (o.moves + o.choices * CHOICE_SEC) / N;
  o.ms = (Date.now() - t0) / N;
  stats[key] = o;
  const pct = (x) => (x * 100).toFixed(1) + ' %';
  console.log('  ' + name.padEnd(4) + ' ' + kind.padEnd(6) + ' побед ' + pct(o.rate).padStart(7) + ', этажей ' + (o.floors / N).toFixed(2) +
    ', ходов ' + (o.moves / N).toFixed(0) + ', забег ' + (o.sec / 60).toFixed(2) + ' мин' + (o.wins ? ' (победный ' + (o.wonSec / o.wins / 60).toFixed(2) + ' мин)' : '') +
    ', углей ' + (o.embers / N).toFixed(1) + ', гибель на этажах ' + JSON.stringify(o.lost) + ', ' + o.ms.toFixed(1) + ' мс/забег');
  return o;
}

test('доли побед: без даров ~10 %, середина ~45 %, всё открыто ~85 %, глубина 10 ~15 %', () => {
  console.log('  забегов на точку: ' + N);
  const bare = measure('bare', 'smart');
  const mid = measure('mid', 'smart');
  const all = measure('all', 'smart');
  const deep = measure('deep', 'smart');
  [bare, mid, all, deep].forEach((o) => assert.strictEqual(o.bad, null, o.bad));
  const tol = FULL ? 0.06 : 0.1;
  assert.ok(Math.abs(bare.rate - 0.10) <= tol, 'без даров: ' + bare.rate);
  assert.ok(Math.abs(mid.rate - 0.45) <= tol + 0.05, 'середина: ' + mid.rate);
  assert.ok(Math.abs(all.rate - 0.85) <= tol, 'всё открыто: ' + all.rate);
  assert.ok(Math.abs(deep.rate - 0.15) <= tol, 'глубина 10: ' + deep.rate);
});

test('«колода решает»: бот на 2 шага побеждает чаще случайного на 30+ пунктов', () => {
  const lines = ['bare', 'mid', 'all'].map((name) => {
    const d = measure(name, 'smart').rate - measure(name, 'random').rate;
    return { name, d };
  });
  console.log('  разница, пунктов: ' + lines.map((x) => x.name + ' ' + (x.d * 100).toFixed(1)).join(', '));
  assert.ok(lines.find((x) => x.name === 'mid').d >= 0.3, 'середина');
  assert.ok(lines.find((x) => x.name === 'all').d >= 0.3, 'всё открыто');
  assert.ok(measure('bare', 'random').floors < measure('bare', 'smart').floors / 2, 'и без даров случайный проходит вдвое меньше этажей');
});

test('длина забега при 1 с на ход (+3 с на выбор печати, привала, сундука): 2–3 минуты у победного', () => {
  const all = measure('all', 'smart');
  const mid = measure('mid', 'smart');
  const won = mid.wonSec / mid.wins / 60;
  console.log('  победный забег (середина) ' + won.toFixed(2) + ' мин, всё открыто ' + (all.wonSec / all.wins / 60).toFixed(2) + ' мин; первый забег ' + (measure('bare', 'smart').sec / 60).toFixed(2) + ' мин');
  assert.ok(won >= 1.6 && won <= 3.2, 'победный забег ' + won.toFixed(2) + ' мин');
});

test('первый забег: гибель на 2–3-м этаже за минуту с небольшим, 10–15 углей', () => {
  const bare = measure('bare', 'smart');
  const e = bare.embers / N;
  console.log('  углей за первый забег ' + e.toFixed(1) + ', этажей ' + (bare.floors / N).toFixed(2) + ', ' + (bare.sec / 60).toFixed(2) + ' мин; первый дар стоит ' + sim.costs(fresh(), C).gift);
  assert.ok(e >= 8 && e <= 17, 'углей ' + e);
});

/** A whole career: runs one after another, the workshop between them, the prestige after a win. */
function career(seed, until) {
  const s = Core.newState(game, sim, { now: 1, seed, config: C, rng: Rng.make(seed) });
  const out = { runs: 0, sec: 0, firstWin: null, depths: {}, at60: null, firstGift: null };
  while (out.runs < until.runs && (sim.unlockedDepth(s) < until.depth || out.sec < 3600)) {
    s.meta.pref.hand = bestHand(s.meta.shop.gifts);
    const r = sim.botRun(s, C, 'smart', seed * 1000 + out.runs);
    out.runs++;
    out.sec += r.moves + r.choices * CHOICE_SEC;
    if (r.won && out.firstWin === null) out.firstWin = { runs: out.runs, min: out.sec / 60 };
    if (out.at60 === null && out.sec >= 3600) {
      out.at60 = { runs: out.runs, heroes: Object.keys(s.meta.unlocked).length, gifts: s.meta.shop.gifts.length, wins: s.meta.rec.wins };
    }
    if (Core.prestigeInfo(sim, game, s, 'depth', C).can) {
      Core.prestige(sim, game, s, 'depth', { now: 2, config: C });
      out.depths[sim.unlockedDepth(s)] = out.sec / 60;
    }
    // The workshop: a new gift as soon as it is affordable, else the cheapest of what helps.
    for (let k = 0; k < 40; k++) {
      const c = sim.costs(s, C);
      const opts = [];
      const next = RANK.find((id) => s.meta.shop.gifts.indexOf(id) < 0);
      if (next && c.gift !== null && sim.embers(s) >= c.gift) opts.push(['gift', next, 0]);
      else if (next && c.gift !== null && s.meta.shop.gifts.length < 5) break;
      else if (next && c.gift !== null) opts.push(['gift', next, c.gift]);
      bestHand(s.meta.shop.gifts).forEach((id) => { const lc = sim.levelCost(s, C, id); if (lc !== null) opts.push(['level', id, lc]); });
      if (c.fort !== null) opts.push(['fort', null, c.fort]);
      if (c.slot !== null) opts.push(['slot', null, c.slot]);
      if (c.blade !== null) opts.push(['blade', null, c.blade]);
      opts.sort((a, b) => a[2] - b[2]);
      if (!opts.length || sim.embers(s) < opts[0][2]) break;
      const b = sim.buy(s, C, opts[0][0], opts[0][1]);
      if (b.ok && opts[0][0] === 'gift' && out.firstGift === null) out.firstGift = out.runs;
    }
    if (s.meta.unlocked.smith) s.meta.pref.hero = 'smith';
    const bad = Core.validate(s, game) || sim.validate(s);
    assert.strictEqual(bad, null, 'карьера ' + seed + ', забег ' + out.runs + ': ' + bad);
  }
  return out;
}

test('карьера: первый дар, первая победа (= первый престиж), глубины, первый час', () => {
  const until = { runs: FULL ? 600 : 260, depth: FULL ? 5 : 3 };
  const list = [];
  for (let i = 1; i <= CAREERS; i++) list.push(career(i, until));
  const avg = (f) => {
    const xs = list.map(f).filter((x) => x !== null && x !== undefined);
    return xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null;
  };
  const fw = avg((o) => o.firstWin && o.firstWin.min);
  console.log('  карьер: ' + CAREERS + '; первый дар после забега ' + avg((o) => o.firstGift).toFixed(1) +
    '; первая победа — забег ' + avg((o) => o.firstWin && o.firstWin.runs).toFixed(1) + ', ' + fw.toFixed(0) + ' мин игры');
  for (let d = 1; d <= until.depth; d++) {
    const m = avg((o) => o.depths[d]);
    if (m !== null) console.log('  глубина ' + d + ' открыта через ' + m.toFixed(0) + ' мин (' + (m / 60).toFixed(1) + ' ч) у ' + list.filter((o) => o.depths[d]).length + ' из ' + CAREERS);
  }
  const h = list.filter((o) => o.at60);
  if (h.length) {
    console.log('  через час игры: забегов ' + avg((o) => o.at60 && o.at60.runs).toFixed(0) + ', героев ' + avg((o) => o.at60 && o.at60.heroes).toFixed(1) +
      ', даров ' + avg((o) => o.at60 && o.at60.gifts).toFixed(1) + ', побед ' + avg((o) => o.at60 && o.at60.wins).toFixed(1));
  }
  assert.ok(list.every((o) => o.firstWin), 'у каждой карьеры есть победа');
  assert.ok(fw <= 60, 'первая победа через ' + fw.toFixed(0) + ' мин — спец: в первый час');
  assert.ok(avg((o) => o.firstGift) <= 4, 'первый дар за 2–3 забега');
  if (h.length) assert.ok(avg((o) => o.at60 && o.at60.gifts) >= 4, 'к концу первого часа ~5 даров');
});

test('честность раздачи: 200 прогонов простого бота на этаж — время и замены', () => {
  const c = Object.assign({}, cfg);
  const times = [];
  let fixed = 0;
  let floors = 0;
  let low = 0;
  for (let i = 0; i < (FULL ? 60 : 12); i++) {
    const s = fresh();
    sim.startRun(s, Object.assign({}, c, { 'fair.runs': 0 }), { seed: 500 + i });
    for (let f = 1; f <= 5; f++) {
      s.run.floor = f;
      const t0 = Date.now();
      sim.makeFloor(s.run, c);
      times.push(Date.now() - t0);
      floors++;
      if (s.run.fair.fixed) fixed++;
      if (s.run.fair.rate < c['fair.min']) low++;
    }
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, x) => a + x, 0) / times.length;
  console.log('  проверка этажа: в среднем ' + mean.toFixed(0) + ' мс, медиана ' + times[times.length >> 1] + ' мс, худшая ' + times[times.length - 1] +
    ' мс (node); смягчено ' + fixed + ' из ' + floors + ' этажей, ниже порога после замен ' + low);
  assert.ok(times[times.length >> 1] < 400, 'проверка дольше 0,4 с');
});

done('Баланс подземелья');
