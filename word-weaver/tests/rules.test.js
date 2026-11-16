// node tests/rules.test.js — the rules of «Словоплёт» from the spec: what a word is, the price of a
// word, when a set closes, quarters, hints, buildings, events, the personal dictionary, a new city.
'use strict';
const T = require('./env.js');
const x = T.open();
const { Core, Big, Rng, sim, game, cfg } = x;
const Lex = x.env.require('modules/games/word-weaver/lexicon.js');
const lex = Lex.parse(x.env.files.read('data/games/word-weaver/assets/dict.txt'));
const NOW = Date.UTC(2026, 10, 14, 9, 0, 0);
const ctx = (o) => T.ctxOf(x, o);

function fresh() {
  const state = Core.newState(game, sim, ctx());
  return state;
}

/** A state with a set of the given letters as the current one (no shuffling). */
function withSet(letters, seed) {
  const state = fresh();
  state.run.sets.push({ id: 1, seed: seed || letters, letters, found: [], hints: {}, hinted: false, at: NOW });
  state.run.cur = 1;
  state.run.nextId = 2;
  return state;
}

function eq(a, b, what) {
  if (a && typeof a === 'object' && Big.isBig(a)) a = Big.toNumber(a);
  if (b && typeof b === 'object' && Big.isBig(b)) b = Big.toNumber(b);
  if (a !== b) throw new Error(what + ': ' + JSON.stringify(a) + ' вместо ' + JSON.stringify(b));
}

// A day whose letter of the day is not in the words used below, so prices are plain.
let DAY = NOW;
for (let i = 0; i < 60 && /[котаелрнмиуш]/.test(sim.letterOfDay(DAY)); i++) DAY += 86400000;

T.test('слово: от 3 букв, из букв набора, из словаря, один раз', () => {
  const s = withSet('катер');
  eq(sim.submit(s, cfg, lex, 'ка', DAY, 1).why, 'short', 'две буквы');
  eq(sim.submit(s, cfg, lex, 'кошка', DAY, 1).why, 'letters', 'нет таких букв');
  eq(sim.submit(s, cfg, lex, 'аке', DAY, 1).why, 'unknown', 'не слово');
  const ok = sim.submit(s, cfg, lex, 'КАТЕР', DAY, 1);
  if (!ok.ok) throw new Error('«катер» не принят: ' + ok.why);
  eq(sim.submit(s, cfg, lex, 'катер', DAY, 1).why, 'again', 'повтор');
  eq(s.meta.albumCount, 1, 'альбом');
  if (sim.submit(s, cfg, lex, 'тракт', DAY, 1).why !== 'letters') throw new Error('буква дважды');
});

T.test('ё вводится как е и показывается с ё', () => {
  const s = withSet('ёлкаб'.replace('ё', 'е'));
  const r = sim.submit(s, cfg, lex, 'елка', DAY, 1);
  if (!r.ok) throw new Error('«елка» не принята: ' + r.why);
  eq(r.word, 'ёлка', 'показ');
});

T.test('цена слова: очки букв × длина, впервые ×3, редкое ×2, зерно ×2', () => {
  const s = withSet('катер', 'катер');
  // к2 а1 т1 е1 р1 = 6 очков × 2 (5 букв) × 3 (впервые) × 2 (зерно) = 72
  const r = sim.submit(s, cfg, lex, 'катер', DAY, 1);
  eq(r.amount, 72, 'катер');
  eq(sim.points('щука', cfg), 8 + 2 + 2 + 1, 'очки «щука»');
  const again = withSet('катер', 'ракета');
  again.meta.album.катер = [1, 0];
  const r2 = sim.submit(again, cfg, lex, 'катер', DAY, 1);
  eq(r2.amount, 12, 'катер не впервые и не зерно');
  const rare = Lex.subwords(lex, 'катерок', cfg['dict.commonTop']).rare[0];
  if (rare) {
    const s3 = withSet('катерок', 'зерно');
    s3.meta.album[rare] = [1, 0];
    const r3 = sim.submit(s3, cfg, lex, rare, DAY, 1);
    const plain = sim.points(rare, cfg) * cfg['len.' + Math.min(9, rare.length)];
    eq(r3.amount, Math.round(plain * 2), 'редкое «' + rare + '»');
  }
  eq(sim.wordValue(withSet('кот'), cfg, 'кот', { now: DAY, mult: 2 }).amount, 8, 'поездка ×2');
});

T.test('буква дня ×3; ярмарка и вдохновение ×2', () => {
  const day = sim.letterOfDay(NOW);
  const word = lex.keys.find((k) => k.length === 4 && k.indexOf(day) >= 0 && Lex.common(lex, k, cfg['dict.commonTop']));
  const s = fresh();
  const base = sim.points(word, cfg) * cfg['len.4'];
  eq(sim.wordValue(s, cfg, word, { now: NOW }).amount, Math.round(base * 3), 'буква дня в «' + word + '»');
  const other = lex.keys.find((k) => k.length === 4 && k.indexOf(day) < 0);
  s.run.fairUntil = NOW + 60000;
  sim.muse(s, cfg, NOW);
  const v = sim.wordValue(s, cfg, other, { now: NOW });
  eq(v.amount, Math.round(sim.points(other, cfg) * cfg['len.4'] * 4), 'ярмарка и вдохновение');
});

T.test('набор закрыт: все обычные из 4+ букв и 70 % из трёх; редкие не нужны', () => {
  const rng = Rng.make(3);
  const s = fresh();
  sim.openNext(s, cfg, lex, rng, NOW);
  const set = sim.current(s);
  const w = sim.setWords(s, cfg, lex, set);
  const three = w.common.filter((k) => k.length === 3);
  const long = w.common.filter((k) => k.length > 3);
  const need3 = Math.ceil(three.length * 0.7 - 1e-9);
  let closedAt = null;
  long.concat(three.slice(0, need3)).forEach((k, i) => {
    const r = sim.submit(s, cfg, lex, k, NOW, 1);
    if (!r.ok) throw new Error(k + ': ' + r.why);
    if (r.closed && closedAt === null) closedAt = i + 1;
  });
  eq(closedAt, long.length + need3, 'закрылся на слове');
  const res = sim.closeSet(s, cfg, lex, rng, NOW, 1);
  if (!res || !res.nohint) throw new Error('закрытие без подсказок');
  eq(s.run.closed, 1, 'закрыто');
  if (sim.current(s)) throw new Error('закрытый набор остался текущим');
});

T.test('наборы готовятся впрок пачкой; зерно не повторяется; незакрытые ждут', () => {
  const rng = Rng.make(5);
  const s = fresh();
  sim.openNext(s, cfg, lex, rng, NOW);
  eq(s.run.queue.length, cfg['sets.batch'] - 1, 'в очереди');
  const seeds = {};
  for (let i = 0; i < 30; i++) {
    const set = sim.openNext(s, cfg, lex, rng, NOW);
    if (seeds[set.seed]) throw new Error('зерно повторилось: ' + set.seed);
    seeds[set.seed] = true;
    const r = sim.seedRange(s, cfg);
    if (set.seed.length < r.min || set.seed.length > r.max) throw new Error('длина зерна ' + set.seed.length);
  }
  eq(s.run.sets.length, cfg['sets.keepOpen'], 'незакрытых в списке');
  const first = s.run.sets[0].id;
  if (!sim.choose(s, first) || sim.current(s).id !== first) throw new Error('не переключился');
});

T.test('длина зерна: в начале 6, со второго квартала 7 (иначе Торговый не открыть), дальше до 9', () => {
  const s = fresh();
  eq(sim.seedRange(s, cfg).max, 6, 'в начале');
  s.run.quarters = ['sloboda', 'craft'];
  eq(sim.seedRange(s, cfg).max, 7, 'второй квартал: слово из 7 букв для Торгового');
  s.run.quarters = ['sloboda', 'craft', 'trade'];
  eq(sim.seedRange(s, cfg).max, 8, 'третий квартал');
  eq(sim.seedRange(s, Object.assign({}, cfg, { 'seed.growFrom': 3 }), cfg).max, 7, 'настройка: с третьего');
  s.run.quarters = ['sloboda', 'craft', 'trade', 'uni', 'quay', 'forms'];
  eq(sim.seedRange(s, cfg).max, 9, 'потолок');
});

T.test('кварталы: длина слова, редкие, альбом; Мост открывает Набережную раньше', () => {
  const s = fresh();
  s.run.stats.maxLen = 6;
  eq(sim.openQuarters(s, cfg).join(), 'craft', '6 букв');
  s.run.stats.maxLen = 8;
  s.run.stats.rare = 24;
  eq(sim.openQuarters(s, cfg).join(), 'trade', '8 букв, 24 редких');
  s.run.stats.rare = 25;
  eq(sim.openQuarters(s, cfg).join(), 'uni', '25 редких');
  s.run.b.bridge = 1;
  eq(sim.openQuarters(s, cfg).join(), 'quay', 'Мост: 8 букв');
  s.meta.albumCount = 300;
  eq(sim.openQuarters(s, cfg).join(), 'forms', '300 слов');
  s.meta.albumCount = 1000;
  eq(sim.openQuarters(s, cfg).join(), 'old', '1000 слов');
});

T.test('Переулок форм: множественное число за полцены, только у обычных', () => {
  const s = withSet('кошкиа', 'кошкиа');
  eq(sim.submit(s, cfg, lex, 'кошки', DAY, 1).why, 'unknown', 'без квартала');
  s.run.quarters.push('forms');
  const r = sim.submit(s, cfg, lex, 'кошки', DAY, 1);
  if (!r.ok || !r.plural) throw new Error('«кошки» не засчитаны как форма: ' + JSON.stringify(r));
  const plain = sim.points('кошки', cfg) * cfg['len.5'] * cfg['forms.share'];
  eq(r.amount, Math.round(plain * (1 + cfg['q.special.pct'])), 'полцены');
  eq(s.meta.albumCount, 0, 'форма в альбом не идёт');
});

T.test('подсказки: Фонарщик — первая буква самого короткого, Глашатай — длинное; заряды копятся', () => {
  const s = withSet('катер', 'катер');
  if (sim.hint(s, cfg, lex, 'lamp', NOW)) throw new Error('подсказка без зарядов');
  s.run.bricks = Big.str(Big.of(1e9));
  sim.buy(s, cfg, 'lamp');
  sim.buy(s, cfg, 'herald');
  const a = sim.hint(s, cfg, lex, 'lamp', NOW);
  const b = sim.hint(s, cfg, lex, 'herald', NOW);
  const w = sim.setWords(s, cfg, lex, sim.current(s)).common;
  eq(a, w[0], 'фонарщик');
  eq(b, w[w.length - 1], 'глашатай');
  eq(s.run.hints.lamp, 0, 'заряд потрачен');
  sim.tick(s, 1, ctx({ now: NOW + cfg['b.lamp.everyMin'] * 60000 + 1000 }));
  eq(s.run.hints.lamp, 1, 'заряд вернулся');
  if (!sim.current(s).hinted) throw new Error('набор не помечен');
});

T.test('здания: цена base × 1,45^L, участки, дом получше на месте избы', () => {
  const s = fresh();
  s.run.bricks = Big.str(Big.of(1e12));
  eq(sim.cost(s, cfg, 'izba'), 20, 'первая изба');
  sim.buy(s, cfg, 'izba');
  eq(sim.cost(s, cfg, 'izba'), 29, 'вторая изба: ceil(20 × 1,45)');
  while (sim.buy(s, cfg, 'izba'));
  eq(sim.houses(s), cfg['quarter.plots'], 'изб на участках');
  eq(sim.blocked(s, cfg, 'izba'), 'нет свободных участков', 'изба без места');
  sim.buy(s, cfg, 'stone');
  eq(sim.lvl(s, 'izba'), cfg['quarter.plots'] - 1, 'изба уступила место');
  eq(sim.residents(s, cfg), 5 * 5 + 20, 'жители');
  sim.buy(s, cfg, 'garden');
  eq(sim.residents(s, cfg), Math.floor(45 * 1.03), 'Сад скульптур');
});

T.test('налог: 0,05 в минуту с жителя; Рынок, Ратуша, слава, Речной', () => {
  const s = fresh();
  s.run.b.izba = 4;
  const base = 0.05 * 20 / 60;
  if (Math.abs(sim.taxPerSec(s, cfg) - base) > 1e-12) throw new Error('налог ' + sim.taxPerSec(s, cfg));
  s.run.b.market = 2;
  s.run.b.townhall = 1;
  s.meta.albumCount = 250;
  s.layers.city.currency = Big.str(Big.of(4));
  s.run.city = 'river';
  const want = base * 1.16 * 1.02 * 1.2 * 1.5;
  if (Math.abs(sim.taxPerSec(s, cfg) - want) > 1e-9) throw new Error('налог ' + sim.taxPerSec(s, cfg) + ' вместо ' + want);
});

T.test('офлайн: половина налога, с Мельницей весь', () => {
  const a = fresh();
  a.run.b.izba = 6;
  const b = Core.clone(a);
  b.run.b.mill = 1;
  sim.offline(a, 3600, ctx({ offline: true }));
  sim.offline(b, 3600, ctx({ offline: true }));
  const one = 0.05 * 30 * 60 + cfg['start.bricks'];
  if (Math.abs(Big.toNumber(a.run.bricks) - (cfg['start.bricks'] + 0.05 * 30 * 60 * 0.5)) > 1e-6) throw new Error('без Мельницы ' + a.run.bricks);
  if (Math.abs(Big.toNumber(b.run.bricks) - one) > 1e-6) throw new Error('с Мельницей ' + b.run.bricks);
});

T.test('события после набора: ярмарка, гонец, заказ ратуши', () => {
  const s = fresh();
  s.run.b.izba = 6;
  const rng = { chance: () => true, int: () => 0, next: () => 0, shuffle: (l) => l, pick: (l) => l[0] };
  const seven = { id: 7, seed: 'кот', letters: 'кот', found: [], hints: {}, hinted: false, at: NOW };
  seven.found = sim.setWords(s, cfg, lex, seven).common.slice();
  s.run.sets.push(seven);
  s.run.cur = 7;
  const res = sim.closeSet(s, cfg, lex, rng, NOW, 1);
  eq(res.events.map((e) => e.id).join(), 'fair,courier,order', 'события');
  eq(s.run.order.letter, 'к', 'заказ на «к»');
  eq(res.events[1].amount, cfg['courier.min'], 'гонец: не меньше courier.min');
  s.run.sets.push({ id: 8, seed: 'капитан', letters: 'капитанкорм', found: [], hints: {}, hinted: false, at: NOW });
  s.run.cur = 8;
  let done = null;
  const ks = sim.setWords(s, cfg, lex, sim.current(s)).common.filter((k) => k.charAt(0) === 'к' && k.length >= 5).slice(0, 3);
  if (ks.length < 3) throw new Error('мало слов на «к»: ' + ks);
  ks.forEach((w) => {
    const r = sim.submit(s, cfg, lex, w, NOW, 1);
    if (r.order && r.order.done) done = r.order;
  });
  if (!done || s.run.order) throw new Error('заказ не выполнен: ' + JSON.stringify(s.run.order));
  if (Big.toNumber(done.reward) < cfg['order.min']) throw new Error('награда ' + done.reward);
});

T.test('Каланча: сундук налога раз в 30 минут', () => {
  const s = fresh();
  s.run.b.izba = 6;
  s.run.b.tower = 1;
  sim.tick(s, 1, ctx({ now: NOW }));
  if (s.run.towerReady) throw new Error('сразу готова');
  const notes = sim.next(s, NOW, cfg);
  eq(notes.length && notes[0].id, 'tower', 'уведомление');
  sim.tick(s, 1, ctx({ now: NOW + 30 * 60000 }));
  if (!s.run.towerReady) throw new Error('не готова через 30 мин');
  const got = sim.collectTower(s, cfg, NOW + 30 * 60000, 1);
  eq(got, Math.max(cfg['b.tower.min'], Math.floor(0.05 * 30 / 60 * 60 * 15)), 'сундук');
  if (s.run.towerReady || sim.collectTower(s, cfg, NOW + 31 * 60000, 1)) throw new Error('сундук дважды');
});

T.test('«Нет в словаре?»: очередь, «да» модели — личный словарь, редкое, с Почтой вдвое', () => {
  const s = withSet('кракен', 'кракен');
  eq(sim.submit(s, cfg, lex, 'кракен', DAY, 1).why, 'unknown', 'нет в словаре');
  if (!sim.ask(s, 'кракен', NOW)) throw new Error('не встало в очередь');
  if (sim.ask(s, 'кракен', NOW)) throw new Error('встало дважды');
  const own = Lex.parse(x.env.files.read('data/games/word-weaver/assets/dict.txt'));
  const r = sim.approve(s, cfg, own, [{ k: 'кракен', ok: true }], DAY, 1);
  eq(r.added.join(), 'кракен', 'добавлено');
  eq(s.meta.extra.кракен, 'кракен', 'личный словарь');
  eq(s.meta.pending.length, 0, 'очередь пуста');
  const s2 = withSet('кракен', 'кракен');
  s2.meta.album.кракен = [1, 0];
  const plain = sim.submit(s2, cfg, own, 'кракен', DAY, 1);
  const s3 = withSet('кракен', 'кракен');
  s3.meta.album.кракен = [1, 0];
  s3.run.b.post = 1;
  const post = sim.submit(s3, cfg, own, 'кракен', DAY, 1);
  if (!plain.rare) throw new Error('не редкое');
  eq(post.amount, Big.toNumber(plain.amount) * 2, 'Почта');
  const s4 = withSet('абвгд');
  sim.ask(s4, 'бвгд', NOW);
  sim.approve(s4, cfg, own, [{ k: 'бвгд', ok: false }], NOW, 1);
  eq(s4.meta.rejected.join(), 'бвгд', 'не взято');
});

T.test('Новый город: слава floor(sqrt(жители / 100)), +5 % навсегда; виды городов', () => {
  const s = fresh();
  s.run.maxResidents = 10000;
  eq(sim.prestigeGain(s, 'city', cfg), 0, 'без Старого города и 50 000 жителей');
  s.run.quarters.push('old');
  eq(sim.prestigeGain(s, 'city', cfg), 10, 'слава');
  eq(sim.bonus(s, 'city', Big.of(10), cfg), 1.5, 'бонус');
  const r = Core.prestige(sim, game, s, 'city', ctx());
  if (!r.ok) throw new Error('не прошло');
  if (!sim.pickCity(s, 'mountain')) throw new Error('вид города');
  eq(s.run.city, 'mountain', 'Горный');
  const rare = sim.wordValue(s, cfg, 'кот', { rare: true, now: DAY }).amount;
  eq(rare, Math.round(4 * 3 * 1.5), 'Горный: редкое ×3, слава ×1,5');
  eq(s.meta.albumCount, 0, 'альбом');
  eq(sim.fame(s), 10, 'слава осталась');
  eq(sim.lvl(s, 'izba'), 0, 'город с нуля');
  s.run.city = 'sea';
  eq(sim.wordValue(s, cfg, 'мак', { now: DAY }).amount, Math.round(5 * 1.5 * 1.5), 'Приморский: «м» ×1,5');
  s.run.city = 'north';
  eq(sim.wordValue(s, cfg, 'кот', { now: DAY }).amount, Math.round(4 * 0.8 * 1.5), 'Северный: короткое ×0,8');
  if (!sim.alphabetMissing(s).length) throw new Error('алфавит');
});

T.test('сохранение: туда и обратно, migrate, validate ловит порчу', () => {
  const rng = Rng.make(8);
  const s = fresh();
  sim.openNext(s, cfg, lex, rng, NOW);
  sim.submit(s, cfg, lex, sim.setWords(s, cfg, lex, sim.current(s)).common[0], NOW, 1);
  const json = JSON.stringify(s);
  const picked = Core.pick([{ json, seq: 1, source: 'test' }], game, sim);
  if (!picked.state) throw new Error('не читается');
  eq(JSON.stringify(picked.state.run), JSON.stringify(JSON.parse(json).run), 'run');
  eq(Big.str(Big.of(sim.migrate(Core.clone(s), 1).run.bricks)), Big.str(Big.of(s.run.bricks)), 'migrate');
  const bad = Core.clone(s);
  bad.run.b.izba = 1.5;
  if (!sim.validate(bad)) throw new Error('дробный уровень не пойман');
  bad.run.b.izba = 1;
  bad.run.bricks = '-5e0';
  if (!sim.validate(bad)) throw new Error('минус не пойман');
});

T.done('rules');
