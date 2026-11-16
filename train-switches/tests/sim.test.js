// The sim: the level of the day and the challenge of the week are the same for one seed, harder than
// the first chapters and built within a second; tokens, stars, streaks, upgrades, the chest, the
// endless run and the trip; the save goes through Core.pick and back; fixtures/v1.json reads; no NaN.
const fs = require('fs');
const path = require('path');
const T = require('./env.js');
const x = T.open();
const target = path.join(x.env.root, T.STORE.target);
const Rails = x.env.require(path.join(target, 'rails.js'));
const Endless = x.env.require(path.join(target, 'endless.js'));
const read = (f) => JSON.parse(fs.readFileSync(path.join(target, f), 'utf8'));
const chapters = read('content/chapters.json');
const names = read('content/names.json');
const sim = x.sim;
const cfg = x.cfg;

function fresh(seed) {
  return x.Core.newState(x.game, sim, T.ctxOf(x, { seed: seed || 1 }));
}

function finite(v, where) {
  if (typeof v === 'number' && !isFinite(v)) throw new Error('не число в ' + where);
  if (v && typeof v === 'object') for (const k in v) finite(v[k], where + '.' + k);
}

function day(i) {
  const d = new Date(Date.UTC(2026, 10, 1 + i));
  return d.toISOString().slice(0, 10);
}

T.test('уровень дня и вызов недели: одно зерно — один уровень, быстро, сложнее первых глав', () => {
  let worst = 0;
  let sum = 0;
  const dd = [];
  const wd = [];
  for (let i = 0; i < 30; i++) {
    const key = day(i);
    let t = Date.now();
    const a = Rails.seeded('daily:' + key, chapters.daily, names, cfg['daily.tries']);
    const ms = Date.now() - t;
    t = Date.now();
    const w = Rails.seeded('weekly:' + Rails.weekKey(key), chapters.weekly, names, cfg['daily.tries']);
    const ms2 = Date.now() - t;
    if (!a || !w) throw new Error(key + ': уровень не собрался');
    worst = Math.max(worst, ms, ms2);
    sum += ms + ms2;
    const b = Rails.seeded('daily:' + key, chapters.daily, names, cfg['daily.tries']);
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(key + ': два уровня одного дня разные');
    const s = Rails.solve(a, {});
    if (!s.S || s.startWin || s.useless.length) throw new Error(key + ': уровень дня не проходит перебор');
    if (!Rails.simulate(a, a.sol, { trace: false, paths: false }).win) throw new Error(key + ': решение уровня дня не выигрывает');
    if (!Rails.simulate(w, w.sol, { trace: false, paths: false }).win) throw new Error(key + ': решение вызова недели не выигрывает');
    dd.push(a.d);
    wd.push(w.d);
  }
  if (worst > 1500) throw new Error('самый долгий уровень ' + worst + ' мс');
  const mean = (l) => l.reduce((p, c) => p + c, 0) / l.length;
  if (Math.min.apply(null, dd) < 4.5) throw new Error('уровень дня слишком лёгкий: d ' + Math.min.apply(null, dd));
  if (mean(wd) <= mean(dd)) throw new Error('вызов недели не сложнее уровня дня');
  if (Rails.weekKey('2026-11-16') === Rails.weekKey('2026-11-15') || Rails.weekKey('2026-11-16') !== Rails.weekKey('2026-11-22')) throw new Error('неделя считается не с понедельника');
  console.log('  30 дней: дольше всего ' + worst + ' мс, в среднем ' + (sum / 60).toFixed(1) + ' мс; d дня ' + Math.min.apply(null, dd) + '…' + Math.max.apply(null, dd) + ', недели ' + Math.min.apply(null, wd) + '…' + Math.max.apply(null, wd));
});

T.test('звёзды, жетоны и серия уровня дня', () => {
  const st = fresh(2);
  const per = cfg['tokens.perStar'];
  let r = sim.award(st, cfg, { id: 'daily', mode: 'daily', day: '2026-11-10' }, 2);
  if (r.tokens !== 2 * per * cfg['daily.mult'] || st.run.daily.streak !== 1) throw new Error('первый день: ' + JSON.stringify(r));
  sim.award(st, cfg, { id: 'daily', mode: 'daily', day: '2026-11-11' }, 3);
  if (st.run.daily.streak !== 2) throw new Error('серия на второй день ' + st.run.daily.streak);
  sim.award(st, cfg, { id: 'daily', mode: 'daily', day: '2026-11-11' }, 3);
  if (st.run.daily.streak !== 2 || st.run.daily.count !== 2) throw new Error('повтор того же дня меняет серию');
  sim.award(st, cfg, { id: 'daily', mode: 'daily', day: '2026-11-13' }, 1);
  if (st.run.daily.streak !== 1 || st.run.daily.best !== 2) throw new Error('пропуск дня не обнулил серию');
  r = sim.award(st, cfg, { id: 'weekly', mode: 'weekly', week: '2026-W46' }, 3);
  if (r.tokens !== 3 * per * cfg['weekly.mult']) throw new Error('вызов недели: ' + r.tokens);
  r = sim.award(st, cfg, { id: '1-1', mode: 'chapter', kinds: ['m', 'f', 'c', 'n'] }, 3);
  if (r.tokens !== 3 * per || st.run.solved !== 1 || sim.totalStars(st) !== 3) throw new Error('звёзды главы: ' + JSON.stringify(r));
  if (Object.keys(st.run.kinds).length !== 4) throw new Error('виды стрелок не отмечены');
});

T.test('улучшения: цена, нехватка жетонов, рост цены, окраска и тема', () => {
  const st = fresh(3);
  if (sim.buyUpgrade(st, cfg, 'hint')) throw new Error('купили без жетонов');
  sim.addTokens(st, 1000);
  const p1 = sim.price(st, cfg, 'brake');
  if (!sim.buyUpgrade(st, cfg, 'brake')) throw new Error('не купили тормоз');
  const p2 = sim.price(st, cfg, 'brake');
  if (!(p2 > p1)) throw new Error('цена тормоза не выросла: ' + p1 + ' → ' + p2);
  if (sim.tokens(st) !== 1000 - p1) throw new Error('списано не столько, сколько стоит');
  if (!sim.buyUpgrade(st, cfg, 'skin', 'stripes') || st.run.skin !== 'stripes') throw new Error('окраска не куплена');
  if (sim.buyUpgrade(st, cfg, 'skin', 'stripes')) throw new Error('одну окраску купили дважды');
  if (!sim.buyUpgrade(st, cfg, 'night') || st.run.theme !== 'night') throw new Error('ночная тема не включилась');
  if (sim.buyUpgrade(st, cfg, 'night')) throw new Error('тему купили дважды');
  if (sim.UPGRADES.length !== 16) throw new Error('улучшений ' + sim.UPGRADES.length);
});

T.test('тормоз и светофор без потолка: уровень растёт, цена каждый раз выше, разовое остаётся разовым', () => {
  const st = fresh(31);
  ['brake', 'signal'].forEach((id) => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const p = sim.price(st, cfg, id);
      if (!(p > last)) throw new Error(id + ': цена уровня ' + (i + 1) + ' не выросла: ' + last + ' → ' + p);
      sim.addTokens(st, p);
      if (!sim.buyUpgrade(st, cfg, id)) throw new Error(id + ': уровень ' + (i + 1) + ' не купился');
      last = p;
    }
    if (st.run.up[id] !== 12) throw new Error(id + ': уровень ' + st.run.up[id]);
    if (sim.price(st, cfg, id) !== Math.round(cfg['price.' + id] * Math.pow(cfg['price.' + id + 'Growth'], 12))) throw new Error(id + ': цена 13-го уровня не по формуле');
  });
  if (sim.tokens(st) !== 0) throw new Error('жетоны не сошлись: ' + sim.tokens(st));
  const live = sim.startEndless(st, cfg, x.Rng.make(5), {});
  if (!live || live.brakes !== 12 || live.signals !== 12) throw new Error('заряды захода не по уровню: ' + (live ? live.brakes + ', ' + live.signals : 'сеть не собралась'));
  sim.addTokens(st, 100000);
  if (!sim.buyUpgrade(st, cfg, 'life') || sim.price(st, cfg, 'life') !== -1 || sim.buyUpgrade(st, cfg, 'life')) throw new Error('запасная жизнь должна быть разовой');
});

T.test('подсказка ставит стрелку решения и тратит заряд; сундук даёт заряд', () => {
  const st = fresh(4);
  const lv = read('content/levels-03.json')[4];
  sim.setPuzzle(st, lv.id, lv.sol.sw.map((b) => 1 - b), lv.sol.dl);
  if (sim.useHint(st, lv) !== -1) throw new Error('подсказка без заряда');
  sim.chest(st, x.Rng.make(1), cfg);
  if (st.run.up.hint !== 1 || sim.tokens(st) !== cfg['chest.tokens']) throw new Error('сундук: ' + JSON.stringify(st.run.up));
  const i = sim.useHint(st, lv);
  if (i < 0 || st.run.puzzle.sw[i] !== lv.sol.sw[i] || st.run.up.hint !== 0) throw new Error('подсказка не поставила стрелку');
});

T.test('бесконечный: заход, поездка ×1,5, жетоны за очки, рекорд', () => {
  function runWith(trip) {
    const st = fresh(5);
    st.run.bonusLife = 1;
    const live = sim.startEndless(st, cfg, x.Rng.make(77), {});
    if (!live || live.lives !== cfg['endless.lives'] + 1 || st.run.bonusLife) throw new Error('лишняя жизнь «Шагов» не дана');
    const ctx = T.ctxOf(x, { links: trip ? { passenger: { on: true, state: 'trip' } } : {} });
    for (let i = 0; i < 400; i++) {
      Endless.botTurn(live);
      sim.tick(st, cfg['endless.tickSec'] + 0.001, ctx);
    }
    return st;
  }
  const a = runWith(false);
  const b = runWith(true);
  const la = a.run.live;
  const lb = b.run.live;
  if (la.delivered !== lb.delivered || !la.delivered) throw new Error('доставки разошлись: ' + la.delivered + ' и ' + lb.delivered);
  const k = lb.score / la.score;
  if (Math.abs(k - cfg['endless.tripMult']) > 0.05) throw new Error('множитель поездки ' + k.toFixed(3));
  const before = sim.tokens(a);
  const res = sim.finishEndless(a, cfg);
  if (a.run.live || !res || !res.record || res.score !== la.score) throw new Error('итог захода: ' + JSON.stringify(res));
  if (sim.tokens(a) - before !== Math.floor(la.score / cfg['tokens.pointsPerToken'])) throw new Error('жетоны за очки');
  // Absence never moves the run: the tick with ctx.offline leaves it as it is.
  const c = runWith(false);
  const t0 = c.run.live.tick;
  sim.tick(c, 3600, T.ctxOf(x, { offline: true }));
  if (c.run.live.tick !== t0) throw new Error('заход шёл без игрока');
  console.log('  400 кадров: доставлено ' + la.delivered + ', очки ' + la.score + ' и в поездке ' + lb.score + ' (×' + k.toFixed(2) + ')');
});

T.test('сохранение: туда и обратно через Core.pick, fixtures/v1.json читается, нет NaN', () => {
  const st = fresh(6);
  sim.addTokens(st, 500);
  sim.award(st, cfg, { id: '1-1', mode: 'chapter', kinds: ['m'] }, 3);
  sim.buyUpgrade(st, cfg, 'signal');
  const lv = read('content/levels-02.json')[3];
  sim.setPuzzle(st, lv.id, lv.sol.sw, lv.sol.dl);
  const live = sim.startEndless(st, cfg, x.Rng.make(8), {});
  for (let i = 0; i < 200; i++) {
    Endless.botTurn(live);
    Endless.step(live, cfg, {});
  }
  finite(st, 'state');
  const json = JSON.stringify(st);
  const got = x.Core.pick([{ json: json }], x.game, sim);
  if (!got.state) throw new Error('сохранение не принято: ' + JSON.stringify(got.broken));
  if (JSON.stringify(got.state.run) !== JSON.stringify(st.run)) throw new Error('сохранение изменилось по дороге');
  // The run goes on from the save exactly as from the state in memory.
  const l2 = got.state.run.live;
  for (let i = 0; i < 100; i++) {
    Endless.botTurn(live);
    Endless.step(live, cfg, {});
    Endless.botTurn(l2);
    Endless.step(l2, cfg, {});
  }
  if (JSON.stringify(l2) !== JSON.stringify(live)) throw new Error('заход из сохранения пошёл иначе');
  const fx = fs.readFileSync(path.join(target, 'fixtures', 'v1.json'), 'utf8');
  const f = x.Core.pick([{ json: fx }], x.game, sim);
  if (!f.state) throw new Error('fixtures/v1.json не читается: ' + JSON.stringify(f.broken));
  finite(f.state, 'fixture');
  if (sim.validate(f.state)) throw new Error('fixture: ' + sim.validate(f.state));
  const line = sim.summary(f.state, cfg).line;
  if (!/звёзд/.test(line)) throw new Error('summary: ' + line);
  console.log('  сохранение ' + json.length + ' байт, fixture: ' + sim.summary(f.state, cfg));
});

T.done('sim');
