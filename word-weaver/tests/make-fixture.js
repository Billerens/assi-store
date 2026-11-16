// node tests/make-fixture.js — writes fixtures/v1.json: a real save of «Словоплёт» in the middle of
// the game (three trips of the bot of bot.js with the nights offline between them, a set half
// found, a word waiting for «Нет в словаре?»). tests/offline.test.js reads it back. Not a test itself.
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./env.js');
const x = T.open();
const { Core, Rng, sim, game, cfg } = x;
const Lex = x.env.require('modules/games/word-weaver/lexicon.js');
const Bot = x.env.require('modules/games/word-weaver/bot.js');
const lex = Lex.parse(x.env.files.read('data/games/word-weaver/assets/dict.txt'));

const HOUR = 3600000;
const rng = Rng.make(4242);
const ctxOf = (now) => ({ now, config: cfg, rng, mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 });
let now = Date.UTC(2026, 10, 9, 5, 30, 0);
const state = Core.newState(game, sim, ctxOf(now));
const bot = Bot.make(lex, { every: 10 });
let seq = 0;
for (let trip = 0; trip < 3; trip++) {
  for (let s = 0; s < 25 * 60; s++) {
    bot.play(state, ctxOf(now), sim, 3);
    sim.tick(state, 1, ctxOf(now + 1000));
    now += 1000;
    if (s % 30 === 0) seq++;
  }
  state.lastTick = now;
  if (trip < 2) {
    const p = Core.plan(now, now + (trip % 2 ? 15 : 9) * HOUR, cfg, 0);
    now = p.to;
    Core.runOffline(sim, state, game, p, null, (seg) => ctxOf(seg.to), cfg);
    state.lastTick = now;
  }
}
// The current set half found, so the screen opens on a game in hand.
if (!sim.current(state)) sim.openNext(state, cfg, lex, rng, now);
const set = sim.current(state);
const words = sim.setWords(state, cfg, lex, set).common.filter((k) => set.found.indexOf(k) < 0);
words.slice(0, Math.floor(words.length / 2)).forEach((k) => sim.submit(state, cfg, lex, k, now, 1));
sim.ask(state, 'словоплёт', now);
state.seq = seq;
state.savedAt = now;
state.lastTick = now;
state.card = Core.card(sim, state, cfg);
const err = Core.validate(state, game) || sim.validate(state);
if (err) throw new Error(err);
const out = path.join(T.GAME_DIR, 'fixtures', 'v1.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(state) + '\n');
console.log('fixtures/v1.json: ' + fs.statSync(out).size + ' байт; ' + state.card + '; наборов ' + state.meta.sets + ', кварталы ' + state.run.quarters.join(', '));
