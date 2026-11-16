// The checks of «Династия» from its spec (docs/games/dynasty.md, «Как проверить» and «Темп»),
// with the numbers printed: the pace bot, Glory of a 45-minute reign, the second generation,
// the offline aging and the deathbed, the shares of the traits, no NaN, saves, and the rules —
// marriage, children, upbringing, the cards, campaigns, laws, the epochs.  node tests/dynasty.test.js
'use strict';
const assert = require('assert');
const { H, open } = require('./env');

const w = open();
const { sim, Big, Rng, Core, game, cfg } = w.x;
const kit = w.kit;
const DAY0 = Date.UTC(2026, 10, 2, 8, 0, 0);

function ctx(now, seed, extra) {
  const c = { now, config: cfg, rng: Rng.make(seed || 1), mult: 1, links: {}, stock: {}, offline: false, capBonusHours: 0 };
  return Object.assign(c, extra || {});
}

function fresh(seed, now) { return Core.newState(game, sim, ctx(now || DAY0, seed)); }

/** The bot plays online by seconds until the ruler dies (or `sec` runs out). */
function reign(state, now, sec, each) {
  let t = 0;
  for (; t < sec && !state.run.dead; t++) {
    now += 1000;
    sim.botPlay(state, cfg, now);
    sim.tick(state, 1, ctx(now));
    if (each) each(t, state);
  }
  return { now, sec: t };
}

function top(state) { return state.run.h.reduce((a, v, i) => (v ? i + 1 : a), 0); }

function median(list) {
  const s = list.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

function offlineCtx(now, seed) { return ctx(now, seed, { offline: true, report() {} }); }

H.test('темп ботом движка: три дня по две поездки', () => {
  const r = kit.bot(game, sim, cfg, { play: (s, c) => sim.botPlay(s, c.config, c.now), firstBuySec: 10, prestigeTrips: [2, 3] });
  console.log('  первая покупка на ' + r.firstBuySec + ' с; смены поколения: ' + r.prestiges.map((p) => 'поездка ' + p.trip + ' +' + Big.toNumber(p.gain)).join(', '));
  console.log('  через 3 дня: поколение ' + (r.state.layers.generation.count + 1) + ', Величие ' + Big.str(r.state.layers.generation.currency) +
    ', законы: ' + Object.keys(sim.genState(r.state).laws).filter((k) => sim.genState(r.state).laws[k]).join(', '));
  assert.ok(r.firstBuySec !== null && r.firstBuySec <= 10, 'первая покупка ' + r.firstBuySec);
  assert.ok(r.prestiges.length >= 2, 'смен поколения за 3 дня: ' + r.prestiges.length);
  assert.ok(r.prestiges[0].trip >= 2 && r.prestiges[0].trip <= 3, 'первая смена поколения в поездке ' + r.prestiges[0].trip + ' (нужно 2–3: первая смерть в первый день)');
  assert.strictEqual(sim.validate(r.state), null);
});

H.test('правление 45 минут активной игры: 6–12 Славы, к 30-й минуте 7 тиров', () => {
  const rows = [];
  for (let seed = 1; seed <= 12; seed++) {
    const st = fresh(seed);
    let at30 = null;
    let e30 = null;
    const r = reign(st, DAY0, 3 * 3600, (t, s) => { if (t === 1799) { at30 = top(s); e30 = Big.str(s.run.earned); } });
    rows.push({ seed, min: Math.round(r.sec / 60), glory: sim.gloryOf(st, cfg), deeds: sim.deedList(st, cfg).length, earned: Big.str(st.run.earned), e30, tiers30: at30 });
  }
  rows.forEach((r) => console.log('  сид ' + r.seed + ': умер на ' + r.min + '-й минуте, Слава ' + r.glory + ' (деяний ' + r.deeds + '), заработано ' + r.earned +
    ', к 30-й минуте ' + r.tiers30 + ' тиров и ' + r.e30));
  const glory = rows.map((r) => r.glory);
  const inside = glory.filter((g) => g >= 6 && g <= 12).length;
  console.log('  Слава: медиана ' + median(glory) + ', в 6–12: ' + inside + ' из ' + rows.length + ', разброс ' + Math.min(...glory) + '–' + Math.max(...glory));
  assert.ok(median(glory) >= 6 && median(glory) <= 12, 'медиана Славы ' + median(glory));
  assert.ok(inside >= rows.length - 2, 'в 6–12 только ' + inside + ' из ' + rows.length);
  assert.ok(rows.every((r) => r.min >= 40 && r.min <= 55), 'правление не около 45 минут: ' + rows.map((r) => r.min).join(', '));
  assert.ok(median(rows.map((r) => r.tiers30)) >= 6 && median(rows.map((r) => r.tiers30)) <= 7, 'тиров к 30-й минуте: ' + rows.map((r) => r.tiers30).join(', '));
});

H.test('второе поколение с 10 % наследства выходит на доход отца быстрее', () => {
  const out = [];
  for (let seed = 1; seed <= 6; seed++) {
    const st = fresh(seed);
    const father = [];
    let r = reign(st, DAY0, 3 * 3600, (t, s) => father.push(Big.toNumber(sim.income(s, cfg))));
    const goal = father[father.length - 1];
    Core.prestige(sim, game, st, 'generation', ctx(r.now));
    let son = null;
    r = reign(st, r.now, 3 * 3600, (t, s) => { if (son === null && Big.toNumber(sim.income(s, cfg)) >= goal) son = t + 1; });
    const fatherAt = father.findIndex((v) => v >= goal) + 1;
    out.push({ seed, father: fatherAt, son, speed: 1 - son / fatherAt });
  }
  out.forEach((o) => console.log('  сид ' + o.seed + ': отец вышел на свой последний доход за ' + Math.round(o.father / 60) + ' мин, сын — за ' + Math.round(o.son / 60) +
    ' мин (быстрее на ' + Math.round(o.speed * 100) + ' %)'));
  console.log('  медиана: быстрее на ' + Math.round(median(out.map((o) => o.speed)) * 100) + ' % (в описании 30–40 %, см. README)');
  assert.ok(out.every((o) => o.son !== null && o.speed >= 0.3), 'сын не быстрее отца на 30 %');
});

H.test('офлайн 8 ч через движок: +24 года, золото = доход × 28 800 × 0.5, сводка', () => {
  const st = fresh(21);
  st.run.h[0] = 10;
  st.run.h[1] = 5;
  const rate = sim.income(st, cfg);
  const gold = Big.of(st.run.gold);
  const age = st.run.ruler.age;
  st.lastTick = DAY0;
  const p = Core.plan(DAY0, DAY0 + 8 * 3600000, cfg, 0);
  const rep = Core.runOffline(sim, st, game, p, null, (seg) => ctx(seg.to, 21), cfg);
  const want = Big.add(gold, Big.mul(rate, 28800 * 0.5));
  console.log('  возраст ' + age + ' → ' + st.run.ruler.age + '; золото ' + Big.str(gold) + ' → ' + Big.str(st.run.gold) + ' (ждали ' + Big.str(want) + ')');
  console.log('  сводка: ' + rep.events.join(' | '));
  assert.ok(Math.abs(st.run.ruler.age - age - 24) < 1e-6);
  assert.ok(Math.abs(Big.toNumber(Big.div(st.run.gold, want)) - 1) < 1e-6);
  assert.ok(/Прошло/.test(rep.events[0]) && /Золото/.test(rep.events[1]), 'сводка без лет и золота');
});

H.test('офлайн 3 суток: правитель на одре, не умер, сводка зовёт попрощаться', () => {
  // Through the engine the absence is capped at 12 h (36 years): from 40 that is past the deathbed.
  const st = fresh(22);
  st.run.ruler.age = 40;
  st.run.h[0] = 3;
  st.lastTick = DAY0;
  const p = Core.plan(DAY0, DAY0 + 72 * 3600000, cfg, 0);
  const rep = Core.runOffline(sim, st, game, p, null, (seg) => ctx(seg.to, 22), cfg);
  console.log('  засчитано ' + (p.to - p.from) / 3600000 + ' ч; возраст 40 → ' + st.run.ruler.age + ' при жизни ' + sim.life(st, cfg) + '; ' + rep.events.join(' | '));
  assert.ok(!st.run.dead && sim.onDeathbed(st, cfg));
  assert.ok(rep.events.some((e) => /проститесь/.test(e)));
  assert.ok(sim.next(st, DAY0 + 72 * 3600000, cfg).every((n) => n.id !== 'deathbed'), 'напоминание об одре, когда он уже на одре');
  // Directly by sim.offline, three days in one go (no cap): the same stop.
  const st2 = fresh(23);
  const r = sim.offline(st2, 72 * 3600, offlineCtx(DAY0 + 72 * 3600000, 23));
  assert.ok(!st2.run.dead && sim.onDeathbed(st2, cfg) && r.events.some((e) => /проститесь/.test(e)));
  // The deathbed halves the income: an hour on it gives half of an hour before it.
  const before = Big.of(st2.run.gold);
  sim.offline(st2, 3600, offlineCtx(DAY0, 23));
  const got = Big.toNumber(Big.sub(st2.run.gold, before));
  const want = Big.toNumber(sim.income(st2, cfg)) * 3600 * cfg['offline.share'] * cfg['deathbed.mult'];
  assert.ok(Math.abs(got / Math.max(want, 1e-9) - 1) < 1e-6 || want === 0, 'доход на одре ' + got + ', ждали ' + want);
});

H.test('офлайн 12 ч: формула и шаги движка совпадают', () => {
  const r = kit.offlineAgree(game, sim, cfg, 300, (s, c) => sim.botPlay(s, c.config, c.now));
  console.log('  формула ' + r.formula + ', шаги ' + r.steps + ' (' + r.stepsRun + ' шагов), расхождение ' + (r.diff * 100).toFixed(3) + ' %');
  assert.ok(r.diff <= 0.01);
});

H.test('наследование черт на 1 000 поколениях: 35 % и 60 %', () => {
  const father = { tr: ['wise', 'giant'] };
  const mother = { tr: ['brave', 'merry'] };
  const rng = Rng.make(99);
  const got = { wise: 0, giant: 0, brave: 0, merry: 0 };
  const N = 1000;
  for (let i = 0; i < N; i++) sim.inheritTraits(father, mother, cfg, rng).forEach((id) => { got[id]++; });
  console.log('  обычные: Мудрый ' + got.wise / 10 + ' %, Храбрый ' + got.brave / 10 + ' %, Весельчак ' + got.merry / 10 + ' %; сильная Великан ' + got.giant / 10 + ' %');
  ['wise', 'brave', 'merry'].forEach((id) => assert.ok(Math.abs(got[id] / N - cfg['trait.chance']) < 0.045, id + ': ' + got[id]));
  assert.ok(Math.abs(got.giant / N - cfg['trait.strongChance']) < 0.045, 'giant: ' + got.giant);
  assert.ok(sim.trait('giant').strong && !sim.trait('wise').strong);
  // Not more than four and no opposites.
  const many = { tr: ['wise', 'brave', 'sturdy', 'learned'] };
  const many2 = { tr: ['generous', 'kind', 'diligent', 'coward'] };
  for (let i = 0; i < 300; i++) {
    const tr = sim.inheritTraits(many, many2, Object.assign({}, cfg, { 'trait.chance': 1 }), rng);
    assert.ok(tr.length <= cfg['trait.max'], 'черт больше четырёх');
    assert.ok(!(tr.includes('brave') && tr.includes('coward')), 'Храбрый и Трусливый вместе');
  }
});

H.test('без NaN и Infinity: три дня бота, сохранение и чтение', () => {
  const r = kit.bot(game, sim, cfg, { play: (s, c) => sim.botPlay(s, c.config, c.now) });
  const bad = [];
  (function walk(v, p) {
    if (typeof v === 'number' && !isFinite(v)) bad.push(p + '=' + v);
    else if (typeof v === 'string' && /NaN|Infinity/.test(v)) bad.push(p + '=' + v);
    else if (v && typeof v === 'object') for (const k in v) walk(v[k], p + '.' + k);
  })(JSON.parse(JSON.stringify(r.state)), 'state');
  assert.deepStrictEqual(bad, []);
  const picked = Core.pick([{ json: JSON.stringify(r.state), seq: 1, source: 'test' }], game, sim);
  assert.ok(picked.state, 'сохранение не читается');
  assert.strictEqual(sim.validate(picked.state), null);
  assert.strictEqual(sim.migrate(picked.state, 1), picked.state, 'версия 1 — без миграций');
  assert.strictEqual(game.saveVersion, 1, 'saveVersion выше 1 — нужны fixtures и migrate');
  console.log('  поколений за 3 дня: ' + (r.state.layers.generation.count + 1) + ', имён на древе ' + r.state.meta.tree.length + ', записей летописи ' + r.state.meta.chronicle.length);
});

H.test('брак: три кандидата, приданое, дети раз в 3–8 лет до 45', () => {
  const st = fresh(31);
  st.run.ruler.age = 18;
  const cands = sim.makeCandidates(st, cfg);
  assert.strictEqual(cands.length, 3);
  assert.ok(cands.every((c) => c.g !== st.run.ruler.g && c.dowry && (c.dowry.lands || c.dowry.min)));
  const lands = st.run.lands;
  const got = sim.marry(st, cfg, 0, ctx(DAY0));
  assert.ok(got && st.run.spouse, 'брак не заключён');
  if (cands[0].dowry.lands) assert.strictEqual(st.run.lands, lands + cands[0].dowry.lands);
  assert.ok(!sim.canMarry(st, cfg), 'второй брак');
  const births = [];
  for (let t = 0; t < 60 * 40; t++) {
    const before = st.run.children.length;
    sim.tick(st, 1, ctx(DAY0 + t * 1000));
    if (st.run.children.length > before) births.push(Math.round(st.run.ruler.age * 10) / 10);
    st.run.card = null;
    if (st.run.dead) break;
  }
  console.log('  рождения в возрасте: ' + births.join(', '));
  assert.ok(births.length >= 2, 'детей ' + births.length);
  assert.ok(births.every((a) => a < cfg['child.until']), 'ребёнок после 45');
  for (let i = 1; i < births.length; i++) assert.ok(births[i] - births[i - 1] >= cfg['child.minYears'] * 0.69 - 0.2 && births[i] - births[i - 1] <= cfg['child.maxYears'] + 0.2, 'промежуток ' + (births[i] - births[i - 1]));
  const c = st.run.children[0];
  sim.STATS.forEach((k) => assert.ok(c.st[k] >= 1 && c.st[k] <= cfg['stat.max']));
});

H.test('ребёнок: среднее родителей −2…+3, воспитание +2 и шанс черты 40 %', () => {
  let hits = 0;
  const N = 400;
  const diffs = [];
  for (let i = 0; i < N; i++) {
    const st = fresh(100 + i);
    st.run.ruler.age = 20;
    st.run.ruler.tr = [];
    st.run.spouse = { id: 'x', name: 'Х', g: 'f', st: { adm: 6, trade: 6, war: 6, learn: 6, health: 6 }, tr: [] };
    st.run.ruler.st = { adm: 10, trade: 10, war: 10, learn: 10, health: 10 };
    st.run.nextChild = 20;
    sim.tick(st, 1, ctx(DAY0));
    const c = st.run.children[0];
    diffs.push(c.st.adm - 8);
    const before = c.st.war;
    const r = sim.raise(st, cfg, c.id, 'war', 'diligent');
    assert.strictEqual(c.st.war, Math.min(cfg['stat.max'], before + cfg['heir.focus']));
    if (r.trait) hits++;
    assert.strictEqual(sim.raise(st, cfg, c.id, 'adm', 'wise'), null, 'воспитание дважды');
  }
  console.log('  разброс к среднему: ' + Math.min(...diffs) + '…+' + Math.max(...diffs) + '; черта привита в ' + Math.round(hits / N * 100) + ' %');
  assert.ok(Math.min(...diffs) >= -2 && Math.max(...diffs) <= 3);
  assert.ok(Math.abs(hits / N - cfg['heir.traitChance']) < 0.08, 'шанс черты ' + hits / N);
});

H.test('наследник: выбранный, иначе старший, иначе дальний родич; регентство', () => {
  const st = fresh(41);
  st.run.ruler.age = 60;
  st.run.children = [
    { id: 'a', name: 'Старший', g: 'm', born: 22, st: { adm: 5, trade: 5, war: 5, learn: 5, health: 5 }, tr: [] },
    { id: 'b', name: 'Младшая', g: 'f', born: 50, st: { adm: 5, trade: 5, war: 5, learn: 5, health: 5 }, tr: ['wise'] }
  ];
  st.run.heir = null;
  assert.strictEqual(sim.heirOf(st).id, 'a');
  assert.ok(sim.setHeir(st, 'b'));
  st.run.dead = true;
  Core.prestige(sim, game, st, 'generation', ctx(DAY0));
  assert.strictEqual(st.run.ruler.name, 'Младшая');
  assert.strictEqual(st.run.ruler.age, cfg['age.start'], 'наследнице 10 лет — правит с 16');
  assert.ok(st.run.ruler.tr.includes('wise'));
  // With the regency the child rules at her own age.
  const s2 = fresh(42);
  sim.genState(s2).laws.regency = true;
  s2.run.ruler.age = 60;
  s2.run.children = [{ id: 'c', name: 'Малой', g: 'm', born: 52, st: { adm: 5, trade: 5, war: 5, learn: 5, health: 5 }, tr: [] }];
  s2.run.dead = true;
  Core.prestige(sim, game, s2, 'generation', ctx(DAY0));
  assert.strictEqual(s2.run.ruler.age, 8, 'с Регентством правит в 8 лет');
  // No children: a distant kinsman of 16–30.
  const s3 = fresh(43);
  s3.run.ruler.age = 64;
  s3.run.dead = true;
  Core.prestige(sim, game, s3, 'generation', ctx(DAY0));
  assert.ok(s3.run.ruler.age >= cfg['kin.ageMin'] && s3.run.ruler.age <= cfg['kin.ageMax'], 'родич ' + s3.run.ruler.age);
  assert.ok(s3.meta.tree.some((t) => t.kin), 'родич не на древе');
});

H.test('отречение с 50 лет, «выгодно» по hintRatio', () => {
  const st = fresh(44);
  st.run.earned = Big.of('1e10');
  st.run.ruler.age = 49;
  assert.ok(!Core.prestigeInfo(sim, game, st, 'generation', cfg).can, 'отречение до 50');
  st.run.ruler.age = 50;
  const info = Core.prestigeInfo(sim, game, st, 'generation', cfg);
  assert.ok(info.can && info.hint, 'отречение в 50 недоступно');
  st.layers.generation.currency = Big.of(1000);
  assert.ok(!Core.prestigeInfo(sim, game, st, 'generation', cfg).hint, '«выгодно» при большом Величии');
  st.layers.generation.currency = Big.of(0);
  Core.prestige(sim, game, st, 'generation', ctx(DAY0));
  assert.ok(st.meta.chronicle[0].lines.some((l) => /отрека|слагает венец/.test(l)), 'летопись не про отречение: ' + st.meta.chronicle[0].lines.join(' '));
});

H.test('карточки двора: каждая и каждый ответ работают, тексты без пустых подстановок', () => {
  const content = {
    cards: require(w.env.root + '/' + 'modules/games/dynasty/content/cards.json')
  };
  const all = content.cards.court.concat([content.cards.illness, content.cards.tourney]);
  assert.strictEqual(content.cards.court.length, 16, 'карточек двора в описании 16');
  all.forEach((card, i) => {
    ['a', 'b'].forEach((ch) => {
      const st = fresh(200 + i);
      st.run.h[0] = 30;
      st.run.h[5] = 2;
      st.run.gold = Big.of('1e9');
      st.run.card = JSON.parse(JSON.stringify(card));
      const text = sim.effectText(st, cfg, card[ch].effect);
      assert.ok(!/[{}]/.test(text), card.id + '.' + ch + ': ' + text);
      const r = sim.answer(st, cfg, ch, DAY0);
      assert.ok(r.ok, card.id + '.' + ch + ': ' + r.text);
      assert.strictEqual(sim.validate(st), null, card.id + '.' + ch);
      assert.strictEqual(st.run.card, null);
    });
  });
  // Cards come once in 1–2 years and only online.
  const st = fresh(300);
  const seen = [];
  for (let t = 0; t < 60 * 20; t++) {
    sim.tick(st, 1, ctx(DAY0 + t * 1000));
    if (st.run.card) {
      seen.push(st.run.ruler.age);
      sim.answer(st, cfg, 'b', DAY0 + t * 1000);
    }
  }
  console.log('  за 20 лет онлайн карточек: ' + seen.length);
  assert.ok(seen.length >= 10 && seen.length <= 20, 'карточек за 20 лет: ' + seen.length);
  const off = fresh(301);
  sim.offline(off, 6 * 3600, offlineCtx(DAY0, 301));
  assert.strictEqual(off.run.card, null, 'карточка офлайн');
});

H.test('походы: шанс Война / (Война + сосед), Земля за успех, потеря за неудачу', () => {
  let won = 0;
  let lost = 0;
  let chance = 0;
  for (let i = 0; i < 300; i++) {
    const st = fresh(400 + i);
    st.run.ruler.st.war = 8;
    st.run.ruler.tr = [];
    st.run.h[0] = 20;
    st.run.gold = Big.of('1e6');
    const info = sim.campaignInfo(st, cfg, 'war');
    chance = info.chance;
    assert.ok(sim.startCampaign(st, cfg, 'war', DAY0));
    assert.ok(!sim.startCampaign(st, cfg, 'border', DAY0), 'два похода сразу');
    sim.tick(st, 1, ctx(DAY0 + cfg['campaign.war.min'] * 60000));
    if (st.run.lands === 1) won++;
    else lost++;
    assert.strictEqual(st.run.campaign, null, 'поход не кончился по таймеру');
  }
  console.log('  Война 8 против соседа ' + cfg['campaign.neighbor'] + ': шанс ' + Math.round(chance * 100) + ' %, побед ' + won + ' из 300');
  assert.ok(Math.abs(chance - 8 / (8 + cfg['campaign.neighbor'])) < 1e-9);
  assert.ok(Math.abs(won / 300 - chance) < 0.08);
  const weak = fresh(9);
  weak.run.ruler.st.war = 2;
  weak.run.ruler.tr = [];
  assert.ok(!sim.canCampaign(weak, cfg), 'поход при Войне < 5');
  // The description: a campaign brings one Land; the great one (longer, dearer, a stronger foe) two.
  for (const kind of ['border', 'war']) assert.strictEqual(sim.campaignInfo(fresh(5), cfg, kind).lands, 1, kind);
  assert.strictEqual(sim.campaignInfo(fresh(5), cfg, 'great').lands, 2, 'great');
});

H.test('имена и прозвища модели: проверка запаса, прозвище правителя по главной черте', () => {
  assert.strictEqual(sim.validateStock('names', { name: 'Ведислав', gender: 'm' }), null);
  assert.strictEqual(sim.validateStock('names', { name: 'Ведислав', gender: 'm', nick: 'Тугой кошель', trait: 'stingy' }), null);
  assert.ok(sim.validateStock('names', { name: 'Ведислав', gender: 'm', nick: 'Тугой кошель' }), 'прозвище без черты');
  assert.ok(sim.validateStock('names', { name: 'Ведислав', gender: 'm', nick: 'Тугой', trait: 'constructor' }), 'черта из прототипа');
  assert.ok(sim.validateStock('names', { name: 'Ведислав', gender: 'm', nick: 'Stingy', trait: 'stingy' }), 'латиница');
  const st = fresh(41);
  st.meta.pool.names = [
    { name: 'Ведислав', gender: 'm', nick: 'Тугой кошель', trait: 'stingy' },
    { name: 'Милорада', gender: 'f', nick: 'Ясноокая', trait: 'wise' },
    { name: 'Звенислава', gender: 'f', nick: 'Чужая', trait: 'brave' }
  ];
  st.run.ruler.age = 60;
  st.run.children = [{ id: 'b', name: 'Младшая', g: 'f', born: 50, st: { adm: 5, trade: 5, war: 5, learn: 5, health: 5 }, tr: ['wise'] }];
  st.run.heir = null;
  st.run.dead = true;
  Core.prestige(sim, game, st, 'generation', ctx(DAY0));
  assert.strictEqual(sim.nickOf(st.run.ruler), 'Ясноокая', 'прозвище модели у наследницы');
  assert.strictEqual(st.meta.tree.find((t) => t.id === 'b').nick, 'Ясноокая', 'прозвище на древе');
  // A bigger stock later does not rename the ruler in the middle of the reign.
  st.meta.pool.names.push({ name: 'Ладомира', gender: 'f', nick: 'Светлая', trait: 'wise' });
  assert.strictEqual(sim.nickOf(st.run.ruler), 'Ясноокая');
  // Without a model nickname the built-in one by the trait.
  const s2 = fresh(42);
  s2.run.ruler.age = 60;
  s2.run.children = [{ id: 'c', name: 'Малой', g: 'm', born: 30, st: { adm: 5, trade: 5, war: 5, learn: 5, health: 5 }, tr: ['brave'] }];
  s2.run.dead = true;
  Core.prestige(sim, game, s2, 'generation', ctx(DAY0));
  assert.strictEqual(sim.nickOf(s2.run.ruler), 'Храбрый');
});

H.test('законы автоматизации и Ночной дозор работают офлайн', () => {
  const st = fresh(51);
  st.run.h[0] = 5;
  sim.genState(st).laws.steward = true;
  sim.genState(st).laws.nightwatch = true;
  const rate = sim.income(st, cfg);
  sim.offline(st, 3600, offlineCtx(DAY0 + 3600000, 51));
  assert.ok(st.run.h[0] > 5 || st.run.h[1] > 0, 'Управляющий ничего не купил');
  const s2 = fresh(52);
  s2.run.h[0] = 5;
  sim.genState(s2).laws.nightwatch = true;
  const g0 = Big.of(s2.run.gold);
  sim.offline(s2, 3600, offlineCtx(DAY0 + 3600000, 52));
  assert.ok(Math.abs(Big.toNumber(Big.sub(s2.run.gold, g0)) / (Big.toNumber(rate) * 3600) - 1) < 1e-6, 'Ночной дозор: офлайн не 100 %');
  const s3 = fresh(53);
  s3.run.ruler.age = 20;
  sim.genState(s3).laws.matchmaker = true;
  sim.tick(s3, 1, ctx(DAY0));
  assert.ok(s3.run.spouse, 'Сват не женил');
});

H.test('эпохи: турниры, меценаты, колонии, парламент, фабрики; Легенды ×1.5', () => {
  const st = fresh(61);
  st.layers.epoch.count = 1;
  st.layers.epoch.currency = Big.of(2);
  st.run.h[0] = 10;
  const base = fresh(61);
  base.run.h[0] = 10;
  assert.ok(Math.abs(Big.toNumber(Big.div(sim.income(st, cfg), sim.income(base, cfg))) - 2.25) < 1e-9, 'две Легенды — ×2.25');
  st.run.nextTourney = st.run.ruler.age;
  st.run.nextCard = 99;
  sim.tick(st, 1, ctx(DAY0));
  assert.strictEqual(st.run.card && st.run.card.id, 'joust', 'нет турнира в Высоком средневековье');
  // Renaissance: a scholar for gold, a discovery after years.
  st.layers.epoch.count = 2;
  st.run.card = null;
  st.run.gold = Big.of('1e9');
  assert.ok(sim.fundScholar(st, cfg), 'учёный не нанят');
  const g = sim.genState(st);
  g.years = g.scholar.at;
  sim.tick(st, 0.01, ctx(DAY0));
  assert.strictEqual(g.discoveries, 1, 'нет открытия');
  // Sails: a ship comes back with gold.
  st.layers.epoch.count = 3;
  const before = Big.of(st.run.gold);
  assert.ok(sim.sendColony(st, cfg, 0, DAY0));
  sim.offline(st, 2 * 3600, offlineCtx(DAY0 + 2 * 3600000, 61));
  assert.strictEqual(g.colonies.length, 0, 'корабль не вернулся');
  assert.ok(Big.gt(st.run.gold, Big.sub(before, sim.colonyInfo(st, cfg, 0).price)), 'корабль без золота');
  // Enlightenment: once a generation a law can be repealed for its Glory.
  st.layers.epoch.count = 4;
  st.layers.generation.currency = Big.of(10);
  assert.ok(sim.buyLaw(st, cfg, 'healers'));
  const glory = sim.glory(st);
  assert.ok(sim.repealLaw(st, cfg, 'healers'), 'парламент не отменил закон');
  assert.strictEqual(sim.glory(st), glory + cfg['law.healers.cost']);
  assert.ok(sim.buyLaw(st, cfg, 'healers') && !sim.repealLaw(st, cfg, 'healers'), 'вторая отмена за поколение');
  // Industry: the ninth tier.
  assert.strictEqual(sim.tiers(st), 8);
  st.layers.epoch.count = 5;
  assert.strictEqual(sim.tiers(st), 9);
  st.run.gold = Big.of('1e15');
  assert.strictEqual(sim.buyHolding(st, cfg, 8, 1), 1, 'фабрика не куплена');
  // The seventh epoch is the first of the second round: prices ×100, income ×50.
  st.layers.epoch.count = 6;
  assert.strictEqual(sim.round(st), 1);
});

H.test('связки: караван, паломничество, напоминания', () => {
  const st = fresh(71);
  st.run.h[0] = 10;
  const c = sim.chest(st, Rng.make(5), cfg);
  assert.ok(c.items[0].amount && Big.gt(c.items[0].amount, 0));
  for (let i = 0; i < cfg['pilgrimage.maxHealth']; i++) assert.ok(sim.pilgrimage(st, cfg, 'health'));
  assert.ok(!sim.pilgrimage(st, cfg, 'health'), 'больше +5 Здоровья за жизнь');
  assert.ok(sim.pilgrimage(st, cfg, 'deed') && sim.deedList(st, cfg).includes('pilgrimage'));
  const next = sim.next(st, DAY0, cfg);
  const bed = next.find((n) => n.id === 'deathbed');
  const years = sim.life(st, cfg) - 1 - st.run.ruler.age;
  assert.ok(bed && Math.abs((bed.at - DAY0) / 1000 - years * cfg['age.offlineSec']) < 1);
  assert.ok(game.notify.some((n) => n.id === 'deathbed') && game.notify.some((n) => n.id === 'campaign'));
});

H.done(w.id + ': правила и темп');
