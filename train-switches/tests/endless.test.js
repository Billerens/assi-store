// The endless run: the dispatcher bot that follows the plan (and sometimes holds a train at a signal)
// takes 10 000 trains across five networks without a crash or a wrong station; a bot that taps
// switches at random loses lives; the run is the same for one seed; nothing turns into NaN.
const path = require('path');
const T = require('./env.js');
const x = T.open();
const target = path.join(x.env.root, T.STORE.target);
const Endless = x.env.require(path.join(target, 'endless.js'));
const cfg = x.cfg;

T.test('диспетчер: 10 000 поездов без потерь', () => {
  const t0 = Date.now();
  const total = { delivered: 0, crashes: 0, wrong: 0, holds: 0, refused: 0, ticks: 0, stage: 0 };
  for (let seed = 1; seed <= 5; seed++) {
    const live = Endless.create(cfg, x.Rng.make(seed), { signals: 100000, siding: true });
    if (!live) throw new Error('сеть ' + seed + ' не собралась');
    const hr = x.Rng.make(seed + 99);
    let guard = 0;
    while (live.delivered < 2000 && guard++ < 400000 && !live.over) {
      Endless.botTurn(live);
      if (hr.chance(0.02) && live.trains.length) {
        if (Endless.hold(live, cfg, live.trains[hr.int(live.trains.length)].id)) total.holds++;
        else total.refused++;
        Endless.botTurn(live);
      }
      Endless.step(live, cfg, {});
    }
    for (const k of ['delivered', 'crashes', 'wrong']) total[k] += live[k];
    total.ticks += live.tick;
    total.stage = Math.max(total.stage, live.stage);
    if (!isFinite(live.score) || !isFinite(live.mult) || !isFinite(live.speed)) throw new Error('NaN в заходе ' + seed);
  }
  if (total.crashes || total.wrong) throw new Error('потери: ' + JSON.stringify(total));
  if (total.delivered < 10000) throw new Error('доставлено ' + total.delivered);
  console.log('  доставлено ' + total.delivered + ', столкновений 0, чужих 0, светофоров ' + total.holds + ' (отказов ' + total.refused + '), тактов ' + total.ticks + ', наибольшая ступень ' + total.stage + ', ' + (Date.now() - t0) + ' мс');
});

T.test('случайные нажатия теряют жизни', () => {
  let lost = 0;
  let over = 0;
  const seeds = 20;
  const line = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const live = Endless.create(cfg, x.Rng.make(seed), {});
    const r = x.Rng.make(seed * 7);
    let g = 0;
    while (!live.over && g++ < 20000) {
      if (r.chance(0.3)) Endless.tap(live, live.rev[r.int(live.rev.length)]);
      Endless.step(live, cfg, {});
    }
    if (live.crashes > 0) lost++;
    if (live.over) over++;
    line.push(live.crashes + '/' + live.wrong);
  }
  console.log('  столкновений/чужих по зёрнам: ' + line.join(' ') + '; потеряли жизнь ' + lost + ' из ' + seeds + ', заход окончен ' + over);
  if (lost < seeds * 0.7) throw new Error('случайные нажатия теряют жизнь только в ' + lost + ' заходах из ' + seeds);
});

T.test('одно зерно — один заход', () => {
  function runOf(seed) {
    const live = Endless.create(cfg, x.Rng.make(seed), {});
    for (let i = 0; i < 600; i++) {
      Endless.botTurn(live);
      Endless.step(live, cfg, {});
    }
    return JSON.stringify([live.nodes, live.delivered, live.score, live.trains, live.queue]);
  }
  if (runOf(42) !== runOf(42)) throw new Error('два захода одного зерна разошлись');
});

T.test('время: кадры по кусочкам равны одному кадру, долгий кадр не проматывает заход', () => {
  const a = Endless.create(cfg, x.Rng.make(5), {});
  const b = Endless.create(cfg, x.Rng.make(5), {});
  Endless.advance(a, 7, cfg, {});
  for (let i = 0; i < 70; i++) Endless.advance(b, 0.1, cfg, {});
  if (Math.abs(a.tick - b.tick) > 1) throw new Error('тактов ' + a.tick + ' против ' + b.tick);
  if (!isFinite(a.acc) || !isFinite(b.acc)) throw new Error('NaN в накопителе времени');
  // A frame after a long pause (the phone slept) moves at most 20 ticks, not the whole night.
  const c = Endless.create(cfg, x.Rng.make(5), {});
  Endless.advance(c, 3600, cfg, {});
  if (c.tick > 20) throw new Error('долгий кадр промотал ' + c.tick + ' тактов');
});

T.done('endless');
