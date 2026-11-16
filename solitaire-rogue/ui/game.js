// The screen of «Пасьянс-рогалик»: the start screen (decks, nights, the deal of the day, the
// workshop), the table of a deal, the shop, the result. The logic is in ../sim.js; the engine
// (Game.start) keeps the state, saves after every move, prestige (the nights), sound, links.
(function () {
  const h = ui.h;
  const sim = window.GameSim;
  const Art = window.SolArt;
  const FILES = ['relics', 'seals', 'curses', 'hosts', 'decks', 'upgrades', 'nights', 'circles', 'bricks'];
  const content = {};
  Promise.all(FILES.map((k) => fetch('../content/' + k + '.json').then((r) => r.json()).then((v) => { content[k] = v; })))
    .then(() => {
      sim.setContent(content);
      main();
    });

  function main() {
    const SVG = 'http://www.w3.org/2000/svg';
    const view = { ver: 0, key: '' };
    const sel = { deck: null, night: null, charge: false };
    let g = null;
    let mode = null;
    let lastTop = null;
    let busy = false;

    // ---- sounds, vibration and icons of the game's own ----

    Sfx.add('card1', [{ type: 'triangle', f: [620, 760], d: 0.05, v: 0.32 }]);
    Sfx.add('card2', [{ type: 'triangle', f: [780, 960], d: 0.05, v: 0.34 }]);
    Sfx.add('card3', [{ type: 'triangle', f: [980, 1240], d: 0.06, v: 0.36 }, { at: 0.04, type: 'sine', f: [1960, 1960], d: 0.05, v: 0.12 }]);
    Sfx.add('draw', [{ type: 'noise', f: [1, 1], d: 0.07, v: 0.16 }, { at: 0.02, type: 'sine', f: [330, 300], d: 0.06, v: 0.2 }]);
    Sfx.add('break', [{ type: 'square', f: [320, 210], d: 0.12, v: 0.16 }]);
    Sfx.add('spark', [{ type: 'sine', f: [1200, 2100], d: 0.16, v: 0.3 }, { at: 0.1, type: 'sine', f: [2100, 2400], d: 0.12, v: 0.18 }]);
    Sfx.add('clear', [{ type: 'triangle', f: [523, 523], d: 0.08 }, { at: 0.07, type: 'triangle', f: [659, 659], d: 0.08 },
      { at: 0.14, type: 'triangle', f: [784, 784], d: 0.08 }, { at: 0.21, type: 'triangle', f: [1047, 1047], d: 0.2 }]);
    Sfx.add('candle', [{ type: 'sine', f: [420, 140], d: 0.28, v: 0.32 }, { type: 'noise', f: [1, 1], d: 0.12, v: 0.08 }]);
    Sfx.add('shuffle', [{ type: 'noise', f: [1, 1], d: 0.08, v: 0.18 }, { at: 0.09, type: 'noise', f: [1, 1], d: 0.08, v: 0.18 }]);
    Sfx.add('over', [{ type: 'sawtooth', f: [300, 90], d: 0.7, v: 0.14, a: 0.02 }]);
    const BUZZ = { candle: [40, 60, 40], clear: [20, 40, 20, 40, 60], over: [80, 60, 120] };

    GameIcons.add('candle', '<path d="M12 3c1.5 2 2 3 2 4a2 2 0 0 1-4 0c0-1 .5-2 2-4z"/><path d="M9 11h6v10H9z"/>');
    GameIcons.add('cards', '<rect x="3" y="7" width="10" height="14" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>');
    GameIcons.add('undo', '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>');
    GameIcons.add('stone', '<path d="M5 17l2-8 6-4 6 5-1 7-7 2z"/>');
    GameIcons.add('lockc', '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
    GameIcons.add('thorn', '<path d="M3 17l3-6 3 6 3-6 3 6 3-6 3 6"/>');
    GameIcons.add('swap', '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>');
    GameIcons.add('back', '<path d="M12 20V8M6 13l6-6 6 6M5 4h14"/>');
    GameIcons.add('eye', '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');

    // ---- texts ----

    function num(v) { return g ? g.fmt(v) : String(v); }

    function fill(item) {
      if (!item) return '';
      const text = String(item.text || '');
      if (item.num && g && g.config[item.num] !== undefined) return text.replace('{n}', num(g.config[item.num]));
      return text.replace('{n}', '');
    }

    function count(n, one, two, five) { return n + ' ' + Fmt.plural(n, one, two, five); }
    function candles(n) { return count(n, 'свеча', 'свечи', 'свечей'); }
    function golds(n) { return count(n, 'золото', 'золота', 'золота'); }
    function waxText(n) { return n + ' воска'; }

    const RARITY = { common: 'обычная', rare: 'редкая', legend: 'легендарная' };

    function relicOf(id) { return sim.relicInfo(g.state.run, id) || { id, title: id, text: '' }; }
    function deckOf(id) { return content.decks.find((d) => d.id === id) || content.decks[0]; }
    // A picture beside a title and a text: the row of every list (the shop, the workshop, the album).
    function pic(markup, size) { return Art.el(markup, size); }
    function relicPic(x, size) { return pic(Art.relic(x.id, x.rarity), size); }
    function itemRow(picture, headNodes, body) {
      return h('div', { class: 'p-item-row' }, picture, h('div', { class: 'p-item-b' }, h('div', { class: 'p-item-h' }, headNodes), body));
    }

    function hostOf(id) { return content.hosts.find((x) => x.id === id); }
    function sealOf(id) { return content.seals.find((x) => x.id === id); }
    function curseOf(id) { return content.curses.find((x) => x.id === id); }

    function dealTitle(run) {
      if (run.mode === 'daily') return 'Расклад дня';
      if (run.whiteOn) return 'Белая ночь, расклад ' + (run.white + 1);
      const per = sim.perCircle(run, g.config);
      return sim.circleTitle(sim.circleOf(run, g.config)) + ', расклад ' + (run.dealNo % per + 1) + ' из ' + per;
    }

    // ---- drawing cards ----

    // The suits: spades, hearts, clubs, diamonds — the usual signs, black and red. A suit index
    // s: 0 spades, 1 hearts, 2 clubs, 3 diamonds (s % 2 gives the colour: even black, odd red).
    const CLASSIC = [
      '<path d="M10 1.5C7.5 5 2.5 7.8 2.5 11.6a3.9 3.9 0 0 0 6.6 2.8c-.2 1.6-.9 2.9-2.1 4.1h6c-1.2-1.2-1.9-2.5-2.1-4.1a3.9 3.9 0 0 0 6.6-2.8C17.5 7.8 12.5 5 10 1.5z"/>',
      '<path d="M10 18C6.2 14.6 2 11.4 2 7.1A4.4 4.4 0 0 1 10 4.6a4.4 4.4 0 0 1 8 2.5C18 11.4 13.8 14.6 10 18z"/>',
      '<circle cx="10" cy="5.6" r="3.6"/><circle cx="5.6" cy="11.2" r="3.6"/><circle cx="14.4" cy="11.2" r="3.6"/>' +
        '<path d="M9 10h2c0 3.4.7 5.8 2.6 8.5H6.4C8.3 15.8 9 13.4 9 10z"/>',
      '<path d="M10 1.5L16.2 10 10 18.5 3.8 10z"/>'
    ];
    // For those who asked for plain shapes in the settings: circle, rhomb, triangle, square.
    const SHAPES = [
      '<circle cx="10" cy="10" r="7"/>',
      '<path d="M10 2.5l7 7.5-7 7.5-7-7.5z"/>',
      '<path d="M10 3l8 14H2z"/>',
      '<rect x="3.5" y="3.5" width="13" height="13" rx="1.5"/>'
    ];

    function suitSvg(s) {
      if (s < 0) return null;
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', '0 0 20 20');
      svg.setAttribute('class', 'c-suit');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = (g.config['suits.style'] === 'shapes' ? SHAPES : CLASSIC)[s % 4];
      return svg;
    }

    function sealMark(card) {
      if (!card.se) return null;
      const mark = h('span', { class: 'c-seal seal-' + card.se });
      if (card.se === 'twin') mark.textContent = sim.rankName(card.r2);
      return mark;
    }

    /** A card as a button: face (rank big in the top third, the suit, a seal mark) or back. */
    function cardEl(card, o) {
      o = o || {};
      const d = g.state.run.deal;
      const face = o.face !== undefined ? o.face : card.u && !card.bh;
      const cls = ['c-card'];
      const kids = [];
      if (!face) cls.push('back');
      else if (card.c === 'stone') {
        cls.push('stone');
        kids.push(GameIcons.el('stone'));
      } else if (d && g.state.run.phase === 'play' && card.c === 'shadow' && sim.hiddenShadow(d, card, g.config)) {
        cls.push('shadow');
        kids.push(h('span', { class: 'c-rank' }, '?'));
      } else if (card.j) {
        cls.push('joker');
        kids.push(h('span', { class: 'c-rank' }, 'Дж'), GameIcons.el('sparkle'));
      } else {
        cls.push('s' + (card.s % 2 ? 'b' : 'a'));
        kids.push(h('span', { class: 'c-rank' }, sim.rankName(card.r)), suitSvg(card.s), sealMark(card));
        if (card.c === 'thorn') kids.push(h('span', { class: 'c-curse thorn' }, GameIcons.el('thorn')));
        if (card.c === 'weed') kids.push(h('span', { class: 'c-curse weed' }, GameIcons.el('leaf')));
        if (card.c === 'shadow') cls.push('shadowed');
      }
      if (face && card.c === 'lock' && !card.unl) {
        cls.push('locked');
        kids.push(h('span', { class: 'c-curse lock' }, GameIcons.el('lockc')));
      }
      if (o.cls) cls.push(o.cls);
      const b = h('button', { class: cls.join(' '), type: 'button', 'aria-label': o.label || labelOf(card, face) }, kids);
      if (o.onclick) b.addEventListener('click', o.onclick);
      return b;
    }

    function labelOf(card, face) {
      if (!face) return 'закрытая карта';
      if (card.c === 'stone') return 'камень';
      if (card.j) return 'джокер';
      return sim.rankName(card.r);
    }

    // ---- acting ----

    /** Every move: the act with an immediate save, the result settled when the run ended, feedback. */
    function act(fn, o) {
      if (g.readonly) return { ok: false };
      view.ver++;
      const res = g.act((s) => {
        const r = fn(s) || { ok: false };
        if (s.run.phase === 'over' && s.run.result && s.run.result.pending) r.settled = sim.settle(s, g.config, g.links.mult());
        return r;
      }, { now: true, reason: 'action' });
      feedback(res, o || {});
      return res;
    }

    function shake(node) {
      if (!node) return;
      node.classList.remove('c-shake');
      void node.offsetWidth;
      node.classList.add('c-shake');
    }

    function feedback(res, o) {
      if (!res) return;
      if (res.deny || res.ok === false) {
        g.sfx('deny');
        g.buzz('deny');
        shake(o.node);
        if (res.why && o.say !== false) ui.toast(res.why);
        if (res.broke) g.flash('energy', 'Тень обманула', 'Цепочка оборвалась');
        return;
      }
      if (res.gold !== undefined && res.card) {
        g.sfx(res.chain >= 10 ? 'card3' : res.chain >= 5 ? 'card2' : 'card1');
        g.buzz('tap');
      } else if (res.drew) {
        g.sfx(res.broke ? 'break' : 'draw');
        g.buzz('tap');
      } else if (res.shuffle || res.turncoat || res.reverse || res.reroll) {
        g.sfx('shuffle');
      } else if (res.relic || res.seal || res.candle || res.removed || res.level) {
        g.sfx('buy');
        g.buzz('buy');
      } else g.sfx('tap');
      if (res.sparks) {
        g.sfx('spark');
        g.flash('sparkle', res.sparks > 1 ? 'Искры: +' + res.sparks : 'Искра', 'Заряд для приёмов реликвий');
      }
      if (res.wick) g.flash('candle', 'Длинный фитиль', 'Цепочка не оборвалась');
      if (res.thorn) {
        g.sfx('candle');
        g.buzz(BUZZ.candle);
      }
      if (res.ember || res.wax) g.sfx('level');
      if (res.clear) {
        g.sfx('clear');
        g.buzz(BUZZ.clear);
        g.flash('crown', 'Пустой стол', '+' + golds(res.clear.gold) + (res.clear.candles ? ', +' + candles(res.clear.candles) : ''));
      }
      if (res.bonusTable) g.flash('sparkle', 'Тень мастера', 'Ещё один стол — только золото');
      if (res.dealEnd && res.dealEnd.lost) {
        g.sfx('candle');
        g.buzz(BUZZ.candle);
        if (!res.clear) g.flash('candle', 'Погасло: ' + candles(res.dealEnd.lost), 'Карт на столе: ' + res.dealEnd.left);
      }
      (res.decks || []).forEach((id) => g.flash('cards', 'Открыта колода «' + deckOf(id).title + '»', deckOf(id).text, 4000));
      if (res.won) {
        g.sfx('level');
        g.flash('trophy', 'Рассвет пройден', 'Победа в забеге');
      }
      if (res.settled && res.settled.ok) {
        const r = g.state.run.result;
        if (r.outcome === 'lost') {
          g.sfx('over');
          g.buzz(BUZZ.over);
        }
        (res.settled.unlocks || []).forEach((id) => g.flash('cards', 'Открыта колода «' + deckOf(id).title + '»', deckOf(id).text, 4000));
      }
    }

    // ---- the start screen ----

    function today() { return Core.dayKey(Date.now()); }

    function startRun() {
      if (busy || g.readonly) return;
      busy = true;
      const st = g.links.status();
      let charge = false;
      const custom = [];
      const wantCharge = sel.charge && st.steps && st.steps.on;
      Promise.resolve(wantCharge ? g.links.spend('charge') : null)
        .then((r) => {
          if (r && r.ok) charge = true;
          else if (r) ui.toast(r.off ? 'Связка «Шаги» выключена' : 'Нужна ' + r.need + ' энергия');
          return g.stock.count('rules') > 0 ? g.stock.take('rules') : null;
        })
        .then((item) => {
          if (item && !item.procedural && !sim.validateRule(item)) custom.push(item);
          const seed = g.rng.int(0, 2147483646);
          const res = act((s) => sim.newRun(s, g.config, { seed, deck: sel.deck, night: sel.night, charge, custom }));
          if (res.ok && charge) g.flash('steps', 'Заряд от шагов', '+' + candles(g.config['charge.candles']) + ' в начале забега');
          mode = null;
        })
        .then(() => { busy = false; }, (error) => {
          busy = false;
          throw error;
        });
    }

    function startDaily() {
      if (busy || g.readonly) return;
      busy = true;
      const day = today();
      const meta = g.state.meta;
      const kept = meta.daily && meta.daily.day === day ? meta.daily.rule : null;
      Promise.resolve(kept || g.stock.take('rules'))
        .then((rule) => {
          act((s) => sim.newRun(s, g.config, { mode: 'daily', day, rule }));
          mode = null;
        })
        .then(() => { busy = false; }, (error) => {
          busy = false;
          throw error;
        });
    }

    function nightRules(n) {
      return content.nights.filter((x) => x.n <= n).map((x) => x.text);
    }

    function renderHub(state) {
      const meta = state.meta;
      const nights = sim.nightsOf(state);
      if (sel.deck === null || !sim.deckOpen(state, sel.deck)) sel.deck = sim.deckOpen(state, meta.pickDeck) ? meta.pickDeck : 'normal';
      if (sel.night === null || sel.night > nights) sel.night = Math.min(nights, meta.pickNight || 0);
      const rec = meta.rec || {};
      top([h('div', { class: 'p-hud' },
        h('div', { class: 'p-cur' }, GameIcons.el('sparkle'), h('span', { class: 'g-big' }, num(sim.waxOf(meta))), h('span', { class: 'p-unit' }, 'воска')),
        h('div', { class: 'p-side' }, 'Ночей открыто: ' + nights, h('br'), 'Побед: ' + (rec.wins || 0) + ' · цепочка ' + (rec.bestChain || 0)))]);

      const decks = h('div', { class: 'p-decks' }, content.decks.map((d) => {
        const open = sim.deckOpen(state, d.id);
        return h('button', {
          class: 'p-choice' + (sel.deck === d.id ? ' on' : '') + (open ? '' : ' locked'), disabled: !open, type: 'button',
          onclick: () => { sel.deck = d.id; g.redraw(); }
        }, pic(Art.deck(d.id), 52), h('span', { class: 'p-choice-b' }, h('span', { class: 'p-choice-t' }, d.title), h('span', { class: 'p-choice-s' }, open ? d.text : 'Откроется: ' + d.unlock)));
      }));
      const nightRow = h('div', { class: 'p-nights' });
      Array.from({ length: nights + 1 }, (x, n) => n).forEach((n) => {
        nightRow.append(h('button', { class: 'p-night' + (sel.night === n ? ' on' : ''), type: 'button', onclick: () => { sel.night = n; g.redraw(); } }, String(n)));
      });
      const rules = nightRules(sel.night);
      const nightNote = sel.night ? h('div', { class: 'g-note' }, h('div', {}, 'Ночь ' + sel.night + ': воска ' + g.fmt.mult(1 + sel.night * g.config['night.bonus'])),
        h('ul', { class: 'p-rules' }, rules.map((x) => h('li', {}, x)))) :
        h('div', { class: 'g-note' }, 'Без ночных правил. Победа открывает ночь 1: труднее, но воска больше.');
      const st = g.links.status();
      const chargeOn = !!(st.steps && st.steps.on);
      const charge = chargeOn ? h('button', { class: 'p-switch' + (sel.charge ? ' on' : ''), type: 'button', onclick: () => { sel.charge = !sel.charge; g.redraw(); } },
        GameIcons.el('steps'), h('span', { class: 'grow' }, 'Заряд от шагов: +' + candles(g.config['charge.candles']) + ' в начале — 1 энергия'),
        h('span', { class: 'p-switch-v' }, sel.charge ? 'да' : 'нет')) : null;
      const d = meta.daily && meta.daily.day === today() ? meta.daily : null;
      const daily = h('div', { class: 'p-daily' }, h('div', { class: 'p-daily-t' }, GameIcons.el('timer'), 'Расклад дня'),
        d && d.rule ? h('div', { class: 'g-note' }, h('b', {}, d.rule.title), h('span', {}, ' — '), h('span', {}, d.rule.text)) :
          h('div', { class: 'g-note' }, 'Одна раздача на всех: одно зерно, правило дня, свой рекорд.'),
        d ? h('div', { class: 'g-note' }, 'Сегодня: попыток ' + d.tries + ', лучший счёт ' + (d.best || 0) + (d.tries ? ' (воск — только за первую)' : '')) : null);
      field([h('h3', { class: 'p-h' }, 'Колода'), decks, h('h3', { class: 'p-h' }, 'Ночь'), nightRow, nightNote, charge, daily]);

      const prestige = sim.prestigeGain(state, sim.LAYER, g.config);
      actions([
        h('button', { class: 'g-btn primary', id: 'start', type: 'button', onclick: startRun }, GameIcons.el('cards'), 'Начать забег'),
        h('div', { class: 'g-btns' },
          h('button', { class: 'g-btn small', id: 'workshop', type: 'button', onclick: workshopSheet }, GameIcons.el('gear'), 'Мастерская'),
          h('button', { class: 'g-btn small', id: 'album', type: 'button', onclick: albumSheet }, GameIcons.el('map'), 'Альбом')),
        h('div', { class: 'g-btns' },
          h('button', { class: 'g-btn small', id: 'daily', type: 'button', onclick: startDaily }, GameIcons.el('timer'), 'Расклад дня'),
          Big.gt(prestige, 0) ? view.prestige : null)
      ]);
    }

    // ---- the start relic ----

    function renderPick(state) {
      const run = state.run;
      hud(state);
      field([h('h3', { class: 'p-h' }, 'Стартовая реликвия'), h('div', { class: 'g-note' }, 'Одна из трёх обычных — на весь забег.'),
        h('div', { class: 'p-list' }, run.pick.options.map((id, i) => {
          const x = relicOf(id);
          return h('button', { class: 'p-item', type: 'button', onclick: () => act((s) => sim.pickStart(s, g.config, i)) },
            itemRow(relicPic(x), [h('span', { class: 'p-item-t' }, x.title)], h('span', { class: 'g-note' }, fill(x))));
        }))]);
      actions([h('button', { class: 'g-btn', type: 'button', onclick: () => act((s) => sim.pickStart(s, g.config, -1)) }, 'Без реликвии')]);
    }

    // ---- the table ----

    function hud(state) {
      const run = state.run;
      const where = run.phase === 'shop' ? 'Лавка' : run.phase === 'pick' ? 'Перед забегом' : run.phase === 'won' ? 'Победа' : dealTitle(run);
      const items = [
        h('span', { class: 'p-stat candles' + (run.candles <= 3 ? ' low' : '') }, GameIcons.el('candle'), h('b', { class: 'g-num' }, String(run.candles))),
        h('span', { class: 'p-stat' }, GameIcons.el('coin'), h('b', { class: 'g-num' }, String(run.gold))),
        run.sparks || sim.has(run, 'sparkstone') || sim.POWERS.some((p) => sim.has(run, p)) ? h('span', { class: 'p-stat' }, GameIcons.el('sparkle'), h('b', { class: 'g-num' }, String(run.sparks))) : null
      ];
      const night = run.mode === 'run' && run.night ? h('span', {}, ' · ночь ' + run.night) : null;
      top([h('div', { class: 'p-hud' }, h('div', { class: 'p-stats' }, items), h('div', { class: 'p-side' }, h('span', {}, where), night))]);
    }

    function sizes(d) {
      const fieldW = Math.max(240, g.el.field.clientWidth - (g.layout === 'narrow' ? 8 : 24));
      const n = d.cols.length;
      const gap = g.layout === 'narrow' ? 3 : 6;
      const w = Math.max(36, Math.min(g.layout === 'wide' ? 78 : 64, Math.floor((fieldW - gap * (n - 1)) / n)));
      return { w, h: Math.round(w * 1.38), gap, down: Math.max(10, Math.round(w * 0.22)), up: Math.max(20, Math.round(w * 0.42)) };
    }

    function legalCols(d) {
      const out = {};
      d.cols.forEach((col, i) => {
        const b = col[col.length - 1];
        if (b && b.u && !b.bh && sim.legal(d, b, g.config, false).ok) out[i] = true;
      });
      return out;
    }

    function tapCard(col, idx, node) {
      const run = g.state.run;
      const d = run.deal;
      const colArr = d.cols[col];
      const last = idx === colArr.length - 1;
      if (mode === 'reveal') {
        act((s) => sim.reveal(s, g.config, col, idx), { node });
        mode = null;
        return;
      }
      if (!last) {
        if (sim.has(run, 'sparkstone') && run.sparks > 0 && !colArr[idx].u) ui.toast('Чтобы открыть карту искрой — кнопка «Открыть»');
        shake(node);
        return;
      }
      if (mode === 'pocket') {
        mode = null;
        act((s) => sim.pocketPut(s, g.config, col), { node });
        return;
      }
      if (mode === 'turncoat') {
        mode = null;
        act((s) => sim.turncoat(s, g.config, col), { node });
        return;
      }
      if (mode === 'reverse') {
        mode = null;
        act((s) => sim.reverse(s, g.config, col), { node });
        return;
      }
      act((s) => sim.play(s, g.config, col), { node, say: false });
    }

    function tableEl(state) {
      const d = state.run.deal;
      const sz = sizes(d);
      const fits = legalCols(d);
      const hint = g.config['ui.hint'];
      const targets = mode === 'reverse' ? sim.reverseTargets(d) : null;
      const open = mode === 'pocket' || mode === 'turncoat' ? sim.openBottoms(d) : null;
      const table = h('div', { class: 'c-table' });
      table.style.gap = sz.gap + 'px';
      let tallest = 0;
      d.cols.forEach((col, ci) => {
        const colEl = h('div', { class: 'c-col' });
        colEl.style.width = sz.w + 'px';
        let y = 0;
        col.forEach((card, idx) => {
          const last = idx === col.length - 1;
          let cls = '';
          if (last && fits[ci] && !mode && hint !== 'none') cls = hint === 'outline' ? 'fit-o' : 'fit';
          if (last && ((targets && targets.indexOf(ci) >= 0) || (open && open.indexOf(ci) >= 0))) cls = 'target';
          if (mode === 'reveal' && !card.u) cls = 'target';
          const el = cardEl(card, { cls, onclick: (e) => tapCard(ci, idx, e.currentTarget) });
          el.style.width = sz.w + 'px';
          el.style.height = sz.h + 'px';
          el.style.top = y + 'px';
          el.style.zIndex = String(idx + 1);
          colEl.append(el);
          if (!last) y += card.u && !card.bh ? sz.up : sz.down;
        });
        const height = col.length ? y + sz.h : sz.h;
        if (!col.length) colEl.append(h('div', { class: 'c-empty' }));
        colEl.style.height = height + 'px';
        if (height > tallest) tallest = height;
        table.append(colEl);
      });
      table.style.minHeight = (tallest + 10) + 'px';
      table.style.setProperty('--cw', sz.w + 'px');
      return table;
    }

    function hostEl(d) {
      const parts = [];
      d.hosts.forEach((id) => {
        const x = hostOf(id);
        if (x) parts.push(h('div', { class: 'p-host' }, pic(Art.host(id), 40), h('div', { class: 'p-host-b' }, h('b', {}, 'Хозяин: ' + x.title), h('span', {}, ' — '), h('span', {}, fill(x)))));
      });
      // one block of running text, like a host above: the parts are not columns of a row
      if (d.hx) parts.push(h('div', { class: 'p-host' + (d.hx.kind === 'relic' ? ' rule' : '') }, h('div', { class: 'p-host-b' }, h('b', {}, (d.hx.kind === 'host' ? 'Хозяин: ' : 'Правило дня: ')), d.hx.procedural ? h('span', {}, d.hx.title) : ui.raw(d.hx.title), ' — ', d.hx.procedural ? h('span', {}, d.hx.text) : ui.raw(d.hx.text))));
      return parts;
    }

    function relicStrip(run) {
      if (!run.relics.length) return null;
      return h('div', { class: 'p-relics' }, run.relics.map((id) => h('button', { class: 'p-chip', type: 'button', onclick: relicsSheet }, relicPic(relicOf(id), 26), relicOf(id).title)));
    }

    function chainLog(run) {
      const list = (run.log || []).slice(-8).reverse();
      return h('div', { class: 'p-log' }, h('div', { class: 'p-log-t' }, 'Журнал цепочек'),
        list.length ? list.map((x) => h('div', { class: 'p-log-i' }, 'Расклад ' + (x.deal + 1) + ': цепочка ' + x.chain)) : h('div', { class: 'g-note' }, 'Цепочки от трёх карт будут здесь'));
    }

    function nextCards(d) {
      const see = Math.max(d.m.see || 0, d.glance ? 1 : 0);
      if (!see || !d.deck.length) return null;
      const list = d.deck.slice(Math.max(0, d.deck.length - see)).reverse().slice(0, 12);
      return h('div', { class: 'p-next' }, h('span', { class: 'g-note' }, 'Дальше в колоде:'), list.map((c) => cardEl(c, { face: true, cls: 'mini' })));
    }

    function statusEl(state) {
      const run = state.run;
      const d = run.deal;
      const per = g.config['gold.perCard'] + Math.floor((d.chain + 1) / Math.max(1, g.config['gold.chainStep']));
      const bits = ['Цепочка ' + d.chain, 'следующая карта +' + per];
      if (d.chain < g.config['spark.chain'] && (sim.has(run, 'sparkstone') || sim.POWERS.some((p) => sim.has(run, p)))) bits.push('искра с ' + g.config['spark.chain']);
      const chain = [];
      bits.forEach((b, i) => { chain.push(i ? h('span', {}, ' · ') : null, h('span', {}, b)); });
      return h('div', { class: 'p-status' }, h('span', { class: 'p-chain' + (d.chain >= 10 ? ' hot' : '') }, chain),
        d.undos ? h('span', { class: 'g-note' }, 'отмен: ' + d.undos) : null);
    }

    function pileEl(d) {
      const t = d.pile[d.pile.length - 1];
      const node = cardEl(t, { face: true, cls: 'pile', label: 'стопка: ' + labelOf(t, true) });
      if (lastTop !== t.i) {
        node.classList.add('c-in');
        node.style.animationDuration = g.config['ui.animMs'] + 'ms';
        lastTop = t.i;
      }
      return h('div', { class: 'p-slot' }, node, h('span', { class: 'p-slot-l' }, 'Стопка'));
    }

    function deckEl(state) {
      const run = state.run;
      const d = run.deal;
      const left = d.deck.length;
      const again = !left && sim.has(run, 'bottomless') && d.pile.length > 1;
      const node = h('button', { class: 'c-card back deck' + (left || again ? '' : ' empty'), id: 'deck', type: 'button', 'aria-label': 'колода',
        onclick: (e) => act((s) => sim.draw(s, g.config), { node: e.currentTarget }) },
      h('span', { class: 'c-count' }, left ? String(left) : again ? 'по кругу' : 'пусто'));
      return h('div', { class: 'p-slot' }, node, h('span', { class: 'p-slot-l' }, 'Колода'));
    }

    function pocketEl(d, i) {
      const c = d.pocket[i];
      if (c) {
        const node = cardEl(c, { face: true, cls: 'pocket' + (sim.legal(d, c, g.config, true).ok && g.config['ui.hint'] !== 'none' ? ' fit-o' : ''), onclick: (e) => act((s) => sim.pocketPlay(s, g.config, i), { node: e.currentTarget }) });
        return h('div', { class: 'p-slot side' }, node, h('span', { class: 'p-slot-l' }, 'Карман'));
      }
      const node = h('button', { class: 'c-card hole' + (mode === 'pocket' ? ' on' : ''), type: 'button', 'aria-label': 'карман', onclick: () => { mode = mode === 'pocket' ? null : 'pocket'; g.redraw(); } }, '+');
      return h('div', { class: 'p-slot side' }, node, h('span', { class: 'p-slot-l' }, 'Карман'));
    }

    function undoEl(d) {
      const can = d.undos > 0 && d.hist.length > 0;
      const node = h('button', { class: 'c-card hole undo', type: 'button', disabled: !can, 'aria-label': 'отменить ход', onclick: () => act((s) => sim.undo(s, g.config)) },
        GameIcons.el('undo'), h('span', { class: 'c-count' }, String(d.undos)));
      return h('div', { class: 'p-slot side' }, node, h('span', { class: 'p-slot-l' }, 'Отмена'));
    }

    const TRICKS = [
      { id: 'shuffle', title: 'Перетасовка', icon: 'reset' },
      { id: 'turncoat', title: 'Перевёртыш', icon: 'swap' },
      { id: 'reverse', title: 'Обратный ход', icon: 'back' }
    ];

    function tricksEl(state) {
      const run = state.run;
      const d = run.deal;
      const out = [];
      TRICKS.forEach((t) => {
        if (!sim.has(run, t.id)) return;
        const used = !!d.used[t.id];
        out.push(h('button', {
          class: 'g-btn small p-trick' + (mode === t.id ? ' on' : ''), type: 'button', disabled: used && run.sparks < 1,
          onclick: () => {
            if (used) {
              act((s) => sim.recharge(s, g.config, t.id));
              return;
            }
            if (t.id === 'shuffle') {
              act((s) => sim.shuffle(s, g.config));
              return;
            }
            mode = mode === t.id ? null : t.id;
            g.redraw();
          }
        }, GameIcons.el(t.icon), h('span', {}, used ? 'Зарядить' : t.title, used ? h('span', { class: 'g-sub' }, '1 искра') : null)));
      });
      if (sim.has(run, 'sparkstone')) {
        out.push(h('button', {
          class: 'g-btn small p-trick' + (mode === 'reveal' ? ' on' : ''), type: 'button', disabled: run.sparks < 1,
          onclick: () => { mode = mode === 'reveal' ? null : 'reveal'; g.redraw(); }
        }, GameIcons.el('eye'), h('span', {}, 'Открыть', h('span', { class: 'g-sub' }, '1 искра'))));
      }
      return out.length ? h('div', { class: 'g-btns p-tricks' }, out) : null;
    }

    const MODE_TEXT = {
      pocket: 'Выберите открытую карту — она ляжет в карман',
      turncoat: 'Выберите открытую карту — она поменяется со стопкой',
      reverse: 'Выберите столбец — верх стопки вернётся туда',
      reveal: 'Выберите закрытую карту — искра её откроет'
    };

    function renderPlay(state) {
      const run = state.run;
      const d = run.deal;
      hud(state);
      const wide = g.layout === 'wide';
      field([wide ? null : relicStrip(run), hostEl(d), tableEl(state), statusEl(state), nextCards(d)]);
      const row = h('div', { class: 'p-row' });
      const left = d.pocket.length ? d.pocket.map((c, i) => pocketEl(d, i)) : [h('div', { class: 'p-slot side' })];
      row.append(h('div', { class: 'p-side-slots' }, left), pileEl(d), deckEl(state), h('div', { class: 'p-side-slots' }, d.undos || d.undoUsed || sim.has(run, 'undo') || sim.has(run, 'sandundo') ? undoEl(d) : h('div', { class: 'p-slot side' })));
      const extra = [];
      if (mode) extra.push(h('div', { class: 'p-mode' }, h('span', { class: 'grow' }, MODE_TEXT[mode]), h('button', { class: 'g-btn small', type: 'button', onclick: () => { mode = null; g.redraw(); } }, 'Отмена')));
      if (sim.stuck(state, g.config) && !d.over) {
        const left2 = sim.tableCount(d) + sim.pocketCount(d);
        const btn = h('button', { class: 'g-btn primary p-two', id: 'giveup', type: 'button' }, 'Закончить расклад', h('span', { class: 'g-sub' }, 'держите · карт на столе ' + left2));
        g.ui.hold(btn, 700, () => act((s) => sim.giveUp(s, g.config)));
        extra.push(btn);
      }
      actions([wide ? h('div', { class: 'p-panel' }, relicPanel(run), chainLog(run)) : null, tricksEl(state)].concat(extra, [row]));
    }

    function relicPanel(run) {
      return h('div', { class: 'p-relic-list' }, h('div', { class: 'p-log-t' }, 'Реликвии'),
        run.relics.length ? run.relics.map((id) => {
          const x = relicOf(id);
          return h('button', { class: 'p-relic', type: 'button', onclick: relicsSheet }, relicPic(x, 36), h('span', { class: 'p-item-b' }, h('b', {}, x.title), h('span', { class: 'g-note' }, fill(x))));
        }) : h('div', { class: 'g-note' }, 'Пока ни одной — они продаются в лавке'));
    }

    // ---- the shop ----

    function price(kind, id) { return sim.priceOf(g.state, g.config, kind, id); }

    function renderShop(state) {
      const run = state.run;
      const shop = run.shop;
      hud(state);
      const relics = shop.relics.map((id, i) => {
        const x = relicOf(id);
        const sold = !!shop.soldR[i];
        const p = price('relic', id);
        return h('div', { class: 'p-item ' + (x.rarity || '') + (sold ? ' sold' : '') },
          itemRow(relicPic(x), [h('span', { class: 'p-item-t' }, x.title), h('span', { class: 'p-tag ' + (x.rarity || '') }, RARITY[x.rarity] || 'от модели')], h('div', { class: 'g-note' }, fill(x))),
          h('button', { class: 'g-btn small', type: 'button', disabled: sold || run.gold < p, onclick: (e) => act((s) => sim.buyRelic(s, g.config, i), { node: e.currentTarget }) },
            sold ? 'Куплено' : 'Купить · ' + p));
      });
      const seals = shop.seals.map((id, i) => {
        const x = sealOf(id);
        const sold = !!shop.soldS[i];
        const p = price('seal', id);
        return h('div', { class: 'p-item' + (sold ? ' sold' : '') },
          itemRow(pic(Art.seal(id)), [h('span', { class: 'p-item-t' }, x.title)], h('div', { class: 'g-note' }, fill(x))),
          h('button', { class: 'g-btn small', type: 'button', disabled: sold || run.gold < p, onclick: () => cardsSheet('seal', i) }, sold ? 'Куплено' : 'На карту · ' + p));
      });
      const services = h('div', { class: 'g-btns p-services' },
        h('button', { class: 'g-btn small', type: 'button', disabled: run.gold < price('remove'), onclick: () => cardsSheet('remove') }, pic(Art.service('remove'), 32), h('span', {}, 'Убрать карту', h('span', { class: 'g-sub' }, String(price('remove'))))),
        h('button', { class: 'g-btn small', type: 'button', disabled: run.gold < price('candle') || run.candles >= g.config['candles.max'], onclick: (e) => act((s) => sim.buyCandle(s, g.config), { node: e.currentTarget }) },
          pic(Art.service('candle'), 32), h('span', {}, 'Свеча', h('span', { class: 'g-sub' }, String(price('candle'))))),
        h('button', { class: 'g-btn small', type: 'button', disabled: run.gold < price('reroll'), onclick: (e) => act((s) => sim.reroll(s, g.config), { node: e.currentTarget }) },
          pic(Art.service('reroll'), 32), h('span', {}, 'Переброс', h('span', { class: 'g-sub' }, String(price('reroll'))))));
      const curses = run.cards.filter((c) => c.c).length;
      field([h('h3', { class: 'p-h' }, 'Лавка'),
        h('div', { class: 'g-note' }, h('div', {}, 'В колоде ' + count(run.cards.length, 'карта', 'карты', 'карт') + (curses ? ', проклятых ' + curses : '')),
          h('div', {}, h('span', {}, 'Следующее:'), ' ', h('span', {}, nextTitle(run)))),
        h('h3', { class: 'p-h' }, 'Реликвии'), h('div', { class: 'p-list' }, relics),
        seals.length ? h('h3', { class: 'p-h' }, 'Печати') : null, seals.length ? h('div', { class: 'p-list' }, seals) : null,
        h('h3', { class: 'p-h' }, 'Услуги'), services]);
      const wide = g.layout === 'wide';
      actions([wide ? h('div', { class: 'p-panel' }, relicPanel(run), chainLog(run)) : (run.relics.length ? relicStrip(run) : null),
        h('button', { class: 'g-btn primary p-two', id: 'next', type: 'button', onclick: () => act((s) => sim.nextDeal(s, g.config)) }, 'Дальше', h('span', { class: 'g-sub' }, nextTitle(run))),
        run.whiteOn ? h('button', { class: 'g-btn small', id: 'finish', type: 'button', onclick: () => act((s) => sim.finish(s, g.config)) }, 'Закончить забег') : null]);
    }

    function nextTitle(run) {
      if (run.whiteOn) return 'Белая ночь, расклад ' + (run.white + 1) + ((run.white + 1) % g.config['whiteNight.hostEvery'] === 0 ? ', с хозяином' : '');
      const per = sim.perCircle(run, g.config);
      const k = Math.min(2, Math.floor(run.dealNo / per));
      const probe = { mode: run.mode, whiteOn: false, white: 0, dealNo: run.dealNo, night: run.night, deck: run.deck };
      return sim.circleTitle(k) + ', расклад ' + (run.dealNo % per + 1) + (sim.isHostDeal(probe, g.config) ? ', с хозяином' : '');
    }

    /** The deck of the run as small cards: pick one for a seal or to take out. */
    function cardsSheet(kind, i) {
      const run = g.state.run;
      const list = kind === 'seal' ? sim.sealTargets(run) : run.cards.slice().sort((a, b) => (b.c ? 1 : 0) - (a.c ? 1 : 0) || a.r - b.r);
      let close = null;
      const title = kind === 'seal' ? sealOf(run.shop.seals[i]).title + ': на какую карту' : 'Какую карту убрать из колоды';
      const grid = h('div', { class: 'p-cards' }, list.map((c) => cardEl(c, {
        face: true, cls: 'mini' + (c.c ? ' cursed' : ''),
        onclick: (e) => {
          const res = act((s) => (kind === 'seal' ? sim.buySeal(s, g.config, i, c.i) : sim.removeCard(s, g.config, c.i)), { node: e.currentTarget });
          if (res.ok && close) close();
        }
      })));
      const legend = kind === 'remove' ? h('div', { class: 'g-note' }, h('div', {}, 'Проклятые карты — первыми.'),
        h('div', { class: 'p-list p-legend' }, content.curses.map((c) => h('div', { class: 'p-item-row' }, pic(Art.curse(c.id), 36), h('div', { class: 'p-item-b' }, h('b', {}, c.title), h('span', {}, fill(c))))))) : null;
      close = g.sheet([h('h3', {}, title), legend, grid]);
    }

    // ---- after the victory, the result ----

    function renderWon(state) {
      const run = state.run;
      hud(state);
      field([h('div', { class: 'p-result' }, GameIcons.el('trophy'), h('h3', {}, 'Рассвет пройден'),
        h('div', { class: 'g-note' }, 'Все три круга позади. Можно забрать воск или продолжить «Белой ночью»: бесконечные расклады, хозяин — каждый ' +
          g.config['whiteNight.hostEvery'] + '-й, счёт — по раскладам.'))]);
      actions([
        g.config['whiteNight.on'] ? h('button', { class: 'g-btn primary p-two', id: 'white', type: 'button', onclick: () => act((s) => sim.whiteNight(s, g.config)) }, 'Белая ночь', h('span', { class: 'g-sub' }, 'на рекорд')) : null,
        h('button', { class: 'g-btn' + (g.config['whiteNight.on'] ? '' : ' primary'), id: 'finish', type: 'button', onclick: () => act((s) => sim.finish(s, g.config)) }, 'Закончить забег')
      ]);
    }

    function renderOver(state) {
      const run = state.run;
      const r = run.result || {};
      const meta = state.meta;
      const title = run.mode === 'daily' ? 'Расклад дня' : r.won ? (run.whiteOn ? 'Белая ночь: раскладов ' + run.white : 'Победа') : 'Свечи погасли';
      const lines = [];
      const parts = r.parts || {};
      lines.push(g.ui.line('Сыграно карт: ' + (r.played || 0), '+' + (parts.cards || 0)));
      if (parts.empties) lines.push(g.ui.line('Пустых столов', '+' + parts.empties));
      if (parts.hosts && run.mode !== 'daily') lines.push(g.ui.line('Хозяева', '+' + parts.hosts));
      if (parts.win && run.mode !== 'daily') lines.push(g.ui.line('Победа', '+' + parts.win));
      if (run.mode === 'run' && run.night) lines.push(g.ui.line('Ночь ' + run.night, g.fmt.mult(1 + run.night * g.config['night.bonus'])));
      if (run.deck === 'widow' && run.mode === 'run') lines.push(g.ui.line('Вдовья колода', g.fmt.mult(g.config['deck.widow.wax'])));
      if ((r.linkMult || 1) > 1) lines.push(g.ui.line('в поездке', g.fmt.mult(r.linkMult)));
      lines.push(h('div', { class: 'g-line p-total' }, h('span', { class: 'k' }, 'Воск'), h('span', { class: 'v' }, r.repeat ? '0 — не первая попытка дня' : '+' + (r.wax || 0))));
      const extra = [];
      if (run.mode === 'daily') extra.push(h('div', { class: 'g-note' }, 'Счёт: ' + (r.score || 0) + ' золота. Лучший сегодня: ' + ((meta.daily && meta.daily.best) || 0) + '.'));
      else extra.push(h('div', { class: 'g-note' }, 'Раскладов: ' + (r.deals || 0) + ', лучшая цепочка: ' + (r.bestChain || 0) + '.'));
      (r.unlocks || []).forEach((id) => extra.push(h('div', { class: 'p-unlock' }, pic(Art.deck(id), 40), 'Открыта колода «' + deckOf(id).title + '»')));
      if (meta.ascend && Big.gt(sim.prestigeGain(state, sim.LAYER, g.config), 0)) extra.push(h('div', { class: 'p-unlock' }, GameIcons.el('crown'), 'Можно открыть ночь ' + (sim.nightsOf(state) + 1)));
      top([h('div', { class: 'p-hud' }, h('div', { class: 'p-cur' }, GameIcons.el('sparkle'), h('span', { class: 'g-big' }, num(sim.waxOf(meta))), h('span', { class: 'p-unit' }, 'воска')))]);
      field([h('div', { class: 'p-result' }, GameIcons.el(r.won ? 'trophy' : run.mode === 'daily' ? 'timer' : 'candle'), h('h3', {}, title)),
        h('div', { class: 'g-lines' }, lines), extra]);
      const gain = sim.prestigeGain(state, sim.LAYER, g.config);
      actions([Big.gt(gain, 0) ? view.prestige : null,
        h('button', { class: 'g-btn' + (Big.gt(gain, 0) ? '' : ' primary'), id: 'hub', type: 'button', onclick: () => { act((s) => sim.toHub(s)); } }, 'К началу')]);
    }

    // ---- sheets: relics of the run, the workshop, the album ----

    function relicsSheet() {
      const run = g.state.run;
      let close = null;
      const quit = ['play', 'shop', 'pick', 'won'].indexOf(run.phase) >= 0 ? h('button', { class: 'g-btn small p-two', type: 'button' }, 'Сдаться', h('span', { class: 'g-sub' }, 'держите — забег кончится, воск за сделанное останется')) : null;
      if (quit) g.ui.hold(quit, 1200, () => { act((s) => sim.abandon(s)); if (close) close(); });
      const curses = run.cards.filter((c) => c.c);
      close = g.sheet([h('h3', {}, 'Реликвии забега'),
        run.relics.length ? h('div', { class: 'p-list' }, run.relics.map((id) => {
          const x = relicOf(id);
          return h('div', { class: 'p-item ' + (x.rarity || '') }, itemRow(relicPic(x), [h('span', { class: 'p-item-t' }, x.title), h('span', { class: 'p-tag ' + (x.rarity || '') }, RARITY[x.rarity] || 'от модели')], h('div', { class: 'g-note' }, fill(x))));
        })) : h('div', { class: 'g-note' }, 'Реликвий пока нет.'),
        curses.length ? h('div', { class: 'g-note' }, 'Проклятые карты в колоде:') : null,
        curses.length ? h('div', { class: 'p-curses' }, curses.map((c) => h('span', { class: 'p-curse' }, pic(Art.curse(c.c), 28), curseOf(c.c).title))) : null,
        quit]);
    }

    function workshopSheet() {
      let close = null;
      function body() {
        const state = g.state;
        return [h('h3', {}, 'Мастерская'), h('div', { class: 'g-note' }, 'Воска: ' + sim.waxOf(state.meta) + '. Улучшения — навсегда, для всех забегов.'),
          h('div', { class: 'p-list' }, content.upgrades.map((u) => {
            const lvl = sim.upgradeLevel(state, u.id);
            const max = sim.upgradeMax(g.config, u.id);
            const cost = sim.upgradeCost(state, g.config, u.id);
            // an improvement with no ceiling shows its level alone
            const level = isFinite(max) ? lvl + ' из ' + max : 'уровень ' + lvl;
            return h('div', { class: 'p-item' + (cost === null ? ' full' : '') },
              itemRow(pic(Art.upgrade(u.id)), [h('span', { class: 'p-item-t' }, u.title), h('span', { class: 'p-tag' }, level)],
                h('div', { class: 'g-note' }, u.id === 'coins' ? '+' + g.config['ws.coins.gold'] + ' золота на старте' : u.id === 'discount' ? '−' + Math.round(g.config['ws.discount.pct'] * 100) + '% цен в лавке' : u.text)),
              h('button', { class: 'g-btn small', type: 'button', disabled: cost === null || sim.waxOf(state.meta) < cost, onclick: (e) => {
                const res = act((s) => sim.buyUpgrade(s, g.config, u.id), { node: e.currentTarget });
                if (res.ok) {
                  g.sfx('level');
                  close();
                  workshopSheet();
                }
              } }, cost === null ? 'Наибольший уровень' : 'Купить · ' + cost + ' воска'));
          }))];
      }
      close = g.sheet(body());
    }

    function albumSheet() {
      const meta = g.state.meta;
      const album = meta.album || {};
      const seen = album.relics || {};
      const rec = meta.rec || {};
      const relics = content.relics.map((x) => {
        const n = seen[x.id] || 0;
        return h('div', { class: 'p-item' + (n ? '' : ' unseen') }, itemRow(n ? relicPic(x) : pic(Art.unknown()), [h('span', { class: 'p-item-t' }, n ? x.title : 'Неизвестная'), h('span', { class: 'p-tag ' + x.rarity }, RARITY[x.rarity])],
          n ? h('div', { class: 'g-note' }, h('div', {}, fill(x)), h('div', {}, 'Куплена: ' + n + ' раз')) : h('div', { class: 'g-note' }, 'Ещё не попадалась.')));
      });
      const seals = content.seals.map((x) => {
        const n = (album.seals || {})[x.id] || 0;
        return h('div', { class: 'p-item' + (n ? '' : ' unseen') }, itemRow(pic(n ? Art.seal(x.id) : Art.unknown()), [h('span', { class: 'p-item-t' }, n ? x.title : 'Неизвестная')], h('div', { class: 'g-note' }, n ? fill(x) : 'Ещё не ставилась.')));
      });
      const lines = [
        g.ui.line('Забегов', rec.runs || 0), g.ui.line('Побед', rec.wins || 0), g.ui.line('Лучшая цепочка', rec.bestChain || 0),
        g.ui.line('Дальше всех: раскладов', rec.deepest || 0), g.ui.line('Белая ночь: рекорд', rec.bestWhite || 0),
        g.ui.line('Расклад дня: рекорд', rec.dailyBest || 0), g.ui.line('Воска всего', rec.totalWax || 0)
      ];
      g.sheet([h('h3', {}, 'Альбом'), h('div', { class: 'g-lines' }, lines),
        h('h3', {}, 'Реликвии: ' + Object.keys(seen).length + ' из ' + content.relics.length), h('div', { class: 'p-list' }, relics),
        h('h3', {}, 'Печати'), h('div', { class: 'p-list' }, seals)]);
    }

    // ---- the frame ----

    function top(nodes) { g.el.top.replaceChildren.apply(g.el.top, nodes.filter(Boolean)); }
    function field(nodes) { g.el.field.replaceChildren.apply(g.el.field, flat(nodes)); }
    function actions(nodes) { g.el.actions.replaceChildren.apply(g.el.actions, flat(nodes)); }
    function flat(nodes) {
      const out = [];
      (function walk(list) { list.forEach((x) => { if (Array.isArray(x)) walk(x); else if (x) out.push(x); }); })(nodes);
      return out;
    }

    function achievements(state) {
      const meta = state.meta;
      const rec = meta.rec || {};
      if (rec.wins) g.achieve('first-win');
      if (rec.cleanRun) g.achieve('clean');
      if ((rec.bestChain || 0) >= g.config['ach.chain']) g.achieve('chain30');
      if (rec.blindWin) g.achieve('blind');
      if (rec.wonNights && rec.wonNights[10]) g.achieve('night10');
      if (Object.keys((meta.album && meta.album.relics) || {}).length >= g.config['ach.album']) g.achieve('album15');
      if (sim.DECK_IDS.every((id) => sim.deckOpen(state, id))) g.achieve('decks');
      if ((rec.bestWhite || 0) >= g.config['ach.white']) g.achieve('white5');
    }

    // The engine calls render on every tick; the screen is rebuilt only when something it shows changed.
    function render(state) {
      const run = state.run;
      const d = run.deal;
      // A run that ended outside a move of this screen (the engine, a check) is settled right after.
      if (run.phase === 'over' && run.result && run.result.pending && !g.readonly && !view.settling) {
        view.settling = true;
        setTimeout(() => {
          view.settling = false;
          if (g.state.run.phase === 'over' && g.state.run.result && g.state.run.result.pending) act(() => ({ ok: true }));
        }, 0);
      }
      const key = [view.ver, g.layout, mode, sel.deck, sel.night, sel.charge, g.links.mult(), sim.waxOf(state.meta), sim.nightsOf(state), run.phase,
        run.gold, run.candles, run.sparks, d ? d.moves + '/' + d.pile.length + '/' + d.deck.length + '/' + d.undos : '', run.relics ? run.relics.length : '',
        run.cards ? run.cards.length : '', run.shop ? run.shop.soldR.join('') + run.shop.soldS.join('') + run.shop.relics.join('') : ''].join('|');
      if (key === view.key) return;
      view.key = key;
      document.documentElement.setAttribute('data-phase', run.phase);
      document.documentElement.setAttribute('data-deck', run.deck || 'normal');
      if (run.phase !== 'play') mode = null;
      if (run.phase === 'play' && run.deal) renderPlay(state);
      else if (run.phase === 'shop' && run.shop) renderShop(state);
      else if (run.phase === 'pick' && run.pick) renderPick(state);
      else if (run.phase === 'won') renderWon(state);
      else if (run.phase === 'over') renderOver(state);
      else renderHub(state);
      achievements(state);
    }

    function build(game) {
      g = game;
      view.prestige = g.ui.prestigeButton(sim.LAYER, { label: 'Следующая ночь', primary: true });
      view.prestige.id = 'prestige';
      g.on('resize', () => g.redraw());
      g.on('chest', () => {
        view.ver++;
        g.sfx('chest');
      });
      ['inbox', 'offline', 'links', 'visible'].forEach((name) => g.on(name, () => { view.ver++; }));
      g.on('prestige', () => {
        view.ver++;
        sel.night = sim.nightsOf(g.state);
        g.flash('crown', 'Открыта ночь ' + sel.night, nightRules(sel.night).slice(-1)[0] || '');
      });
      // A run that ended while the screen was closed is settled now (the links of this moment).
      if (g.state.run.phase === 'over' && g.state.run.result && g.state.run.result.pending) act((s) => sim.settle(s, g.config, g.links.mult()));
    }

    Game.start({ sim, render, init: build });
  }
})();
