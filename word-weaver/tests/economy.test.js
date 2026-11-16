// node tests/economy.test.js — the pace of «Словоплёт» against the spec («Темп»): the bot of bot.js
// (a word every 10 s of play, a rare one now and then) plays two 25-minute trips a day, the night
// and the day between them offline, like kit.bot. Printed: what the spec names at 5 minutes, an
// hour, a day and a week, and the trip of the first new city.
'use strict';
const T = require('./env.js');
const x = T.open();
const { Core, Big, Rng, sim, game, cfg } = x;
const Lex = x.env.require('modules/games/word-weaver/lexicon.js');
const Bot = x.env.require('modules/games/word-weaver/bot.js');
const lex = Lex.parse(x.env.files.read('data/games/word-weaver/assets/dict.txt'));

const HOUR = 3600000;
const MIN = 60000;
const ctxOf = (rng, now) => ({ now, config: cfg, rng, mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 });

/** Plays like kit.bot and keeps a snapshot after every trip and at the minutes asked. */
function week(days, o) {
  o = o || {};
  const bot = Bot.make(lex, { every: o.every || 10 });
  const rng = Rng.make(12345);
  let now = Date.UTC(2026, 10, 2, 5, 0, 0);
  const state = Core.newState(game, sim, ctxOf(rng, now));
  const gaps = [9 * HOUR, 15 * HOUR - 2 * 25 * MIN];
  const snaps = [];
  const at = {};
  let played = 0;
  let firstBuy = null;
  const prestiges = [];
  let trip = 0;
  const t0 = Date.now();
  const snap = (label) => ({
    label, trip, played: played / 60, album: state.meta.albumCount || 0, closed: state.meta.sets || 0,
    quarters: state.run.quarters.slice(), izba: sim.lvl(state, 'izba'), workshop: sim.lvl(state, 'workshop'),
    residents: sim.residents(state, cfg), bricks: Big.str(Big.floor(state.run.bricks)), fame: sim.fame(state), rare: state.meta.rare || 0
  });
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < 2; k++) {
      trip++;
      for (let s = 0; s < 25 * 60; s++) {
        const bought = bot.play(state, ctxOf(rng, now), sim, 3);
        sim.tick(state, 1, ctxOf(rng, now + 1000));
        now += 1000;
        played++;
        if (firstBuy === null && bought) firstBuy = played;
        [5, 60, 180].forEach((m) => { if (played === m * 60) at[m] = snap(m + ' мин игры'); });
        state.run.quarters.forEach((q) => { if (!at['q:' + q]) at['q:' + q] = { trip, played: played / 60 }; });
        if (played % 30 === 0) {
          const info = Core.prestigeInfo(sim, game, state, 'city', cfg);
          if (info.can && info.hint) {
            const r = Core.prestige(sim, game, state, 'city', ctxOf(rng, now));
            if (r.ok) prestiges.push({ trip, played: played / 60, gain: Big.str(r.gain), album: state.meta.albumCount });
          }
        }
      }
      snaps.push(snap('поездка ' + trip));
      state.lastTick = now;
      const p = Core.plan(now, now + gaps[k % gaps.length], cfg, 0);
      now = p.to;
      Core.runOffline(sim, state, game, p, null, (seg) => ctxOf(rng, seg.to), cfg);
      state.lastTick = now;
    }
  }
  return { state, snaps, at, firstBuy, prestiges, ms: Date.now() - t0, stats: bot.stats };
}

const W = week(7);

T.test('первая покупка не позже 10 с', () => {
  console.log('  первая изба на ' + W.firstBuy + ' с');
  if (!(W.firstBuy <= 10)) throw new Error('первая покупка на ' + W.firstBuy + ' с');
});

T.test('5 минут: 2 набора из 6 букв, 3 избы, мастерская', () => {
  const s = W.at[5];
  console.log('  5 мин: наборов ' + s.closed + ', изб ' + s.izba + ', мастерская ' + s.workshop + ', альбом ' + s.album);
  if (s.closed < 2) throw new Error('наборов ' + s.closed);
  if (s.izba < 3 || s.workshop < 1) throw new Error('изб ' + s.izba + ', мастерская ' + s.workshop);
});

T.test('час игры: 10–15 наборов, Ремесленный и Торговый, около 150 слов альбома', () => {
  const s = W.at[60];
  console.log('  60 мин: наборов ' + s.closed + ', кварталы ' + s.quarters.join(', ') + ', альбом ' + s.album + ', жителей ' + s.residents);
  if (s.closed < 8 || s.closed > 30) throw new Error('наборов за час ' + s.closed);
  if (s.quarters.indexOf('craft') < 0 || s.quarters.indexOf('trade') < 0) throw new Error('кварталы ' + s.quarters);
  if (s.album < 100 || s.album > 400) throw new Error('альбом ' + s.album);
});

T.test('день: Университетский квартал, около 500 слов', () => {
  // «День» — день поездок: две по 25 минут; Университетский — к концу второго-третьего дня.
  const byDay = W.snaps.filter((s, i) => i % 2 === 1).map((s) => s.album);
  const uni = W.at['q:uni'];
  console.log('  альбом по дням: ' + byDay.join(', ') + '; Университетский — поездка ' + (uni ? uni.trip : 'нет'));
  if (!uni || uni.trip > 6) throw new Error('Университетский квартал: ' + JSON.stringify(uni));
});

T.test('неделя: Старый город и первый новый город', () => {
  const old = W.at['q:old'];
  const first = W.prestiges[0];
  console.log('  кварталы: ' + Object.keys(W.at).filter((k) => /^q:/.test(k)).map((k) => k.slice(2) + ' — поездка ' + W.at[k].trip).join(', '));
  console.log('  первый новый город: ' + (first ? 'поездка ' + first.trip + ' (' + first.played.toFixed(0) + ' мин игры), слава +' + first.gain + ', альбом ' + first.album : 'нет'));
  console.log('  городов за неделю: ' + W.prestiges.length + '; слов сыграно ' + W.stats.words + '; прогон ' + (W.ms / 1000).toFixed(1) + ' с');
  if (!old) throw new Error('Старый город не открылся за неделю');
  if (!first) throw new Error('за 14 поездок ни одного нового города');
  if (first.trip < 9 || first.trip > 14) throw new Error('первый новый город в поездке ' + first.trip + ', по описанию — к неделе (поездки 9–14)');
});

T.test('kit.bot (7 дней): тот же итог через движок', () => {
  const play = Bot.make(lex, { every: 10 }).play;
  const r = x.kit.bot(game, sim, cfg, { play, days: 7 });
  console.log('  kit.bot: первая покупка ' + r.firstBuySec + ' с, первый новый город — поездка ' + (r.prestiges[0] ? r.prestiges[0].trip : 'нет') + ', всего ' + r.prestiges.length);
  if (!r.prestiges.length) throw new Error('kit.bot: ни одного нового города');
});

T.test('после недели: состояние целое, без NaN', () => {
  const v = Core.validate(W.state, game);
  if (v) throw new Error(v);
  const own = sim.validate(W.state);
  if (own) throw new Error(own);
  const json = JSON.stringify(W.state);
  if (/NaN|Infinity|null,null/.test(json.replace(/"[^"]*"/g, '""'))) throw new Error('NaN или Infinity в сохранении');
});

T.done('economy');
