// The tree and the checks of the model's answers: the hand-made set, the nine steps on prepared
// bad answers, the whole way through the engine's stock into graph.json (graph.js in the harness
// workspace, with a fake model), quarantine, embeddings, the owner's veto.
//   node tests/graph.test.js
'use strict';
const assert = require('assert');
const { H, make } = require('./setup');
const { test, done } = H;

const w = make();
process.on('exit', () => w.env.close());
const { x, env } = w;
const sim = x.sim;

function opts(asked, extra) {
  const a = {};
  asked.forEach((k) => { a[k] = true; });
  return Object.assign({ config: x.cfg, asked: a, banned: sim.content().banned, triples: false }, extra || {});
}

function newItem(pair, result, more) {
  return Object.assign({ pair, kind: 'new', result, desc: 'Описание для проверки', category: 'вещество', glyph: 'blob', colors: [3, 7] }, more || {});
}

test('ручной набор: 92 элемента, 91 рецепт, ступени по таблице, дерево целое', () => {
  const c = sim.content();
  assert.strictEqual(c.elements.filter((e) => e.src === 'base').length, 92);
  assert.strictEqual(c.recipes.filter((r) => r.src === 'base').length, 91);
  assert.strictEqual(c.recipes.filter((r) => r.src === 'ether').length, 11);
  const t = sim.tree();
  const tiers = { 'пар': 1, 'гейзер': 2, 'стекло': 3, 'колба': 4, 'солнце': 5, 'книга': 6, 'поезд': 7, 'метро': 8, 'хлеб': 9, 'свеча': 9 };
  for (const k in tiers) assert.strictEqual(t.els[k].tier, tiers[k], k);
  assert.strictEqual(t.recipes['вода+облако'].r, 'дождь', 'второй путь к дождю');
  const r = sim.checkTree(c, null, x.cfg);
  assert.deepStrictEqual(r.problems, []);
  console.log('  почти дубли в наборе (отчёт): ' + (r.near.map((n) => n.join(' / ')).join('; ') || 'нет'));
});

test('проверка дерева находит цикл, дубль ключа, недостижимое, неверную ступень, два рецепта у пары', () => {
  const g = {
    elements: [
      { key: 'пар', name: 'Пар', tier: 1 },
      { key: 'туманность', name: 'Туманность', tier: 5, cat: 'небо' },
      { key: 'сирота', name: 'Сирота', tier: 3 }
    ],
    recipes: [
      { k: 'гора+ветер', r: 'камень' },
      { k: 'вода+огонь', r: 'туманность' },
      { k: 'облако+туманность', r: 'сирота' }
    ],
    none: ['вода+огонь']
  };
  const p = sim.checkTree(sim.content(), g, x.cfg).problems.join('\n');
  assert.ok(/ключ дважды: пар/.test(p), p);
  assert.ok(/цикл/.test(p), p);
  assert.ok(/у пары два рецепта: вода\+огонь/.test(p), p);
  assert.ok(/ступень туманность/.test(p) || /нет рецепта у туманность/.test(p), p);
  assert.ok(/и рецепт, и «нет»/.test(p), p);
});

test('имена: обрезка, заглавная, кириллица, длина, слова, ключ сравнения', () => {
  assert.deepStrictEqual(sim.normName('  морская   ПЕНА ', x.cfg), { name: 'Морская пена', key: 'морская пена' });
  assert.strictEqual(sim.normName('Ёлка-палка', x.cfg).key, 'елка палка');
  assert.ok(sim.normName('Steam', x.cfg).error);
  assert.ok(sim.normName('Пар2', x.cfg).error);
  assert.ok(sim.normName('Я', x.cfg).error);
  assert.ok(sim.normName('Очень длинное имя элемента тут', x.cfg).error);
  assert.ok(sim.normName('Раз два три четыре', x.cfg).error);
  assert.strictEqual(sim.levenshtein('вулкан', 'вулкен'), 1);
  assert.strictEqual(sim.stem('кирпичь'), sim.stem('кирпич'));
  assert.strictEqual(sim.stem('морская пена'), sim.stem('морской пены'));
});

test('плохие ответы: латиница, дубль, почти дубль, цикл, чужая пара, стихия, ингредиент, слова, поля', () => {
  const t = sim.tree();
  const asked = ['вода+пар', 'земля+пар', 'ветер+гора', 'гора+пар', 'камень+пар', 'вода+лава'];
  const o = opts(asked);
  const why = (item) => sim.validateAnswer(t, item, o).why || '';
  assert.ok(/кириллица/.test(why(newItem('вода+пар', 'Steam'))));
  assert.ok(/не спрашивали/.test(why({ pair: 'огонь+пар', kind: 'none' })), 'чужая пара');
  assert.ok(/нет ингредиента/.test(why({ pair: 'вода+единорог', kind: 'none' })));
  assert.ok(/не читается/.test(why({ pair: 'вода', kind: 'none' })));
  assert.ok(/стихия/.test(why({ pair: 'вода+пар', kind: 'existing', result: 'Вода' })));
  assert.ok(/ингредиент/.test(why({ pair: 'вода+пар', kind: 'existing', result: 'Пар' })));
  assert.ok(/цикл/.test(why({ pair: 'ветер+гора', kind: 'existing', result: 'Камень' })));
  assert.ok(/уже есть рецепт/.test(why(Object.assign({}, newItem('вода+лава', 'Базальт')))), 'пара с рецептом ручного набора');
  assert.ok(/запрещённое/.test(why(newItem('вода+пар', 'Святой пар'))));
  assert.ok(/категория/.test(why(newItem('вода+пар', 'Туман', { category: 'магия' }))));
  assert.ok(/глиф/.test(why(newItem('вода+пар', 'Туман', { glyph: 'dragon' }))));
  assert.ok(/цвет/.test(why(newItem('вода+пар', 'Туман', { colors: [3, 99] }))));
  assert.ok(/вид ответа/.test(why({ pair: 'вода+пар', kind: 'maybe' })));
  assert.ok(/a и b/.test(why({ pair: 'вода+пар', a: 'Вода', b: 'Огонь', kind: 'none' })));
  // Exact duplicate: becomes «existing».
  const dup = sim.validateAnswer(t, newItem('земля+пар', 'Гейзер'), o);
  assert.ok(dup.why, 'земля+пар уже рецепт набора');
  const ex = sim.validateAnswer(t, newItem('гора+пар', 'облако'), o);
  assert.strictEqual(ex.action, 'recipe');
  assert.strictEqual(ex.r, 'облако');
  assert.ok(!ex.el, 'точный дубль не создаёт элемент');
  // Near duplicates: one letter from 6 letters, and the endings.
  const near1 = sim.validateAnswer(t, newItem('вода+пар', 'Вулкен'), o);
  assert.strictEqual(near1.action, 'quarantine');
  assert.strictEqual(near1.like, 'вулкан');
  const near2 = sim.validateAnswer(t, newItem('вода+пар', 'Кирпичи'), o);
  assert.strictEqual(near2.action, 'quarantine');
  assert.strictEqual(near2.like, 'кирпич');
  // A good one, with the description cut to 120 at a word.
  const good = sim.validateAnswer(t, newItem('вода+пар', 'Туман', { desc: 'Белая пелена над водой '.repeat(10), category: 'погода', glyph: 'cloud' }), o);
  assert.strictEqual(good.action, 'recipe');
  assert.strictEqual(good.el.tier, 2);
  assert.ok(good.el.desc.length <= 120, good.el.desc.length);
});

// ---- through the engine's stock --------------------------------------------------------------------------

function promptOf() { return env.files.read('modules/games/alchemist/prompts/pairs.md'); }

function pairsOf(text) {
  const out = [];
  const re = /^\d+\. «([^»]+)»/gm;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

const NAMES = ['Туман', 'Морская пена', 'Иней', 'Роса', 'Ракушка', 'Янтарь', 'Мох', 'Гончар', 'Фонарь', 'Пряжа', 'Кузница', 'Плот',
  'Компас', 'Колокол', 'Мельница', 'Корзина', 'Свирель', 'Пастух', 'Улей', 'Сыр', 'Варенье', 'Перо', 'Гнездо', 'Маяк', 'Ткач',
  'Каравай', 'Подкова', 'Клад', 'Сундук', 'Скала', 'Овраг', 'Ручей', 'Пруд', 'Болото', 'Тростник', 'Камыш', 'Лодка', 'Весло', 'Сеть', 'Улов'];

let seenSent = null;

function syncWith(book, extra) {
  seenSent = Object.assign({ book, recent: book.slice(-10), opened: [], queue: [], unlocks: {}, triple: false }, extra || {});
  return w.graph().sync(seenSent);
}

test('путь ответа: sync пишет запрос, запас движка спрашивает модель, принятое сразу в graph.json', () => {
  const t = sim.tree();
  const book = t.list.filter((e) => e.src === 'base' && e.tier <= 3).map((e) => e.key);
  const s = syncWith(book, { queue: ['вода+пар'] });
  assert.ok(s.asking >= 30, 'пар в запросе: ' + s.asking);
  const text = promptOf();
  assert.ok(/```schema/.test(text) && /\{count\}/.test(text), 'схема и {count} в запросе');
  const pairs = pairsOf(text);
  assert.strictEqual(pairs[0], 'вода+пар', 'очередь первой');
  let n = 0;
  env.shell.ai = (req) => {
    assert.ok(/"pair"/.test(req.system), 'поля схемы в системном запросе');
    const items = pairs.slice(0, 30).map((k, i) => {
      if (i % 5 === 1 || i % 5 === 3) return { pair: k, kind: 'none' };
      if (i % 5 === 4) return { pair: k, kind: 'existing', result: 'Энергия' };
      return newItem(k, NAMES[n++], { category: 'вещество', glyph: 'blob' });
    });
    return { items };
  };
  const r = w.graph().fill(false);
  assert.ok(r.added >= 20, JSON.stringify(r));
  const g = env.files.readJson('data/games/alchemist/graph.json');
  assert.ok(g.recipes.length >= 12, 'рецептов модели ' + g.recipes.length);
  assert.ok(g.none.length >= 10, '«нет» ' + g.none.length);
  assert.ok(g.elements.length >= 8, 'новых элементов ' + g.elements.length);
  const tree = sim.tree();
  const one = g.recipes[0];
  assert.strictEqual(tree.recipes[one.k].src, 'model', 'дерево видит рецепт модели сразу');
  assert.deepStrictEqual(sim.checkTree(sim.content(), g, x.cfg).problems, []);
  // Stock: the engine counts only the live recipes; «none» are used up.
  const stock = env.files.readJson('data/games/alchemist/stock.json');
  const live = stock.filter((s2) => !s2.usedAt).length;
  w.graph().sync(seenSent);
  const after = env.files.readJson('data/games/alchemist/stock.json');
  const unused = x.Core.stock.count(after, 'pairs');
  assert.strictEqual(unused, g.recipes.length, 'неиспользованный запас = рецепты модели (' + live + ' до уборки)');
  // The next request does not ask the answered pairs again.
  const next = pairsOf(promptOf());
  pairs.slice(0, 30).filter((k) => sim.pairState(k) !== 'unknown').forEach((k) => assert.ok(next.indexOf(k) < 0, 'спрошено снова: ' + k));
  // The same answer again is a repeat: the engine refuses it, graph.json does not change.
  const before = env.files.read('data/games/alchemist/graph.json');
  const again = w.graph().fill(false);
  assert.strictEqual(again.added, 0, JSON.stringify(again));
  assert.strictEqual(JSON.parse(env.files.read('data/games/alchemist/graph.json')).recipes.length, JSON.parse(before).recipes.length);
});

test('битый ответ модели и ответ не о том ничего не портят', () => {
  const before = env.files.read('data/games/alchemist/graph.json');
  env.shell.ai = () => '{не json';
  const r = w.graph().fill(false);
  assert.strictEqual(r.added, 0);
  env.shell.ai = () => ({ answers: [{ pair: 'вода+огонь', kind: 'none' }] });
  assert.strictEqual(w.graph().fill(false).added, 0);
  env.shell.ai = () => { throw new Error('нет сети'); };
  assert.ok(w.graph().fill(false).error);
  assert.strictEqual(JSON.parse(env.files.read('data/games/alchemist/graph.json')).recipes.length, JSON.parse(before).recipes.length);
});

test('40 новых элементов в пачке: принято 15, остальные пары остались неизвестными', () => {
  const t = sim.tree();
  syncWith(t.list.filter((e) => e.tier <= 4).map((e) => e.key));
  const pairs = pairsOf(promptOf());
  assert.ok(pairs.length >= 40, 'пар ' + pairs.length);
  const names = ['Арфа', 'Бочка', 'Валун', 'Гвоздь', 'Дудка', 'Ежевика', 'Жёлудь', 'Зонт', 'Изба', 'Йогурт', 'Кадка', 'Лапоть', 'Мост',
    'Невод', 'Обруч', 'Пила', 'Рогатка', 'Самовар', 'Топор', 'Утюг', 'Фляга', 'Хомут', 'Цепь', 'Чайник', 'Шалаш', 'Щит', 'Эхо', 'Юла',
    'Ярмарка', 'Брусника', 'Вьюга', 'Горшок', 'Дятел', 'Ёрш', 'Зола', 'Иголка', 'Кисель', 'Лукошко', 'Метла', 'Ножницы'];
  env.shell.ai = () => ({ items: pairs.slice(0, 40).map((k, i) => newItem(k, names[i])) });
  const before = JSON.parse(env.files.read('data/games/alchemist/graph.json')).elements.length;
  const r = w.graph().fill(false);
  const g = env.files.readJson('data/games/alchemist/graph.json');
  assert.strictEqual(g.elements.length - before, x.cfg['batch.maxNew'], 'новых принято: ' + (g.elements.length - before) + ' ' + JSON.stringify(r));
  const tree = sim.tree();
  const unknown = pairs.slice(0, 40).filter((k) => sim.pairState(k, tree) === 'unknown').length;
  assert.ok(unknown >= 40 - x.cfg['batch.maxNew'] - 2, 'неизвестных осталось ' + unknown);
  const log = env.files.readJson('data/games/alchemist/log.json', []).map((l) => l[1]).join('\n');
  assert.ok(/в пачке уже 15 новых/.test(log), 'отказ сверх лимита в журнале');
});

test('карантин: почти дубль спрашивается «одно и то же?», «same» — рецепт к старому', () => {
  const t = sim.tree();
  syncWith(t.list.filter((e) => e.tier <= 4).map((e) => e.key));
  const pairs = pairsOf(promptOf()).filter((k) => !/^проверка/.test(k));
  const k = pairs[0];
  env.shell.ai = () => ({ items: [newItem(k, 'Вулкен', { category: 'явление', glyph: 'volcano' })] });
  w.graph().fill(false);
  let g = env.files.readJson('data/games/alchemist/graph.json');
  assert.ok(g.quarantine.some((q) => q.k === k && q.like === 'вулкан'), 'в карантине');
  assert.strictEqual(sim.pairState(k), 'unknown', 'пара для игрока всё ещё неизвестна');
  syncWith(t.list.filter((e) => e.tier <= 4).map((e) => e.key));
  const text = promptOf();
  assert.ok(text.indexOf('«проверка ' + k + '»') >= 0, 'вопрос карантина в запросе');
  env.shell.ai = () => ({ items: [{ pair: 'проверка ' + k, kind: 'same' }] });
  w.graph().fill(false);
  g = env.files.readJson('data/games/alchemist/graph.json');
  assert.ok(!g.quarantine.some((q) => q.k === k), 'карантин снят');
  assert.strictEqual(sim.tree().recipes[k].r, 'вулкан', 'рецепт к существующему');
});

test('дубль по смыслу: с моделью «embed» — в карантин, без неё — пропуск с записью в журнале', () => {
  const t = sim.tree();
  syncWith(t.list.filter((e) => e.tier <= 4).map((e) => e.key));
  const pairs = pairsOf(promptOf()).filter((k) => !/^проверка/.test(k));
  // Vectors: «Пламя» means the same as «Жар», everything else is far apart.
  env.shell.natives['models.embed'] = (texts) => texts.map((s) => {
    const name = String(s).split(':')[0];
    if (name === 'Пламя' || name === 'Жар') return [1, 0, 0];
    let h = 7;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 1000;
    return [0, Math.cos(h), Math.sin(h)];
  });
  env.shell.ai = () => ({ items: [newItem(pairs[0], 'Пламя', { category: 'явление', glyph: 'flame' })] });
  w.graph().fill(false);
  const g = env.files.readJson('data/games/alchemist/graph.json');
  const q = g.quarantine.find((y) => y.k === pairs[0]);
  assert.ok(q && q.like === 'жар', 'по смыслу в карантин: ' + JSON.stringify(g.quarantine.slice(-2)));
  assert.ok(env.files.exists('data/games/alchemist/vectors.json'), 'векторы сохранены');
  delete env.shell.natives['models.embed'];
  env.shell.ai = () => ({ items: [newItem(pairs[1], 'Пламечко', { category: 'явление', glyph: 'flame' })] });
  const gBefore = env.files.readJson('data/games/alchemist/graph.json');
  gBefore.embed = null;
  env.files.writeJson('data/games/alchemist/graph.json', gBefore);
  w.graph().fill(false);
  const log = env.files.readJson('data/games/alchemist/log.json', []).map((l) => l[1]).join('\n');
  assert.ok(/по смыслу пропущена/.test(log), 'запись о пропуске');
});

test('вето: элемент модели уходит с неоткрытыми рецептами; ручной и с открытыми потомками — нельзя', () => {
  const tree = sim.tree();
  const model = Object.keys(tree.recipes).map((k) => tree.recipes[k]).filter((r) => r.src === 'model' && tree.els[r.r].src === 'model');
  assert.ok(model.length, 'есть элемент модели');
  const rec = model[0];
  assert.ok(!w.graph().veto('вода+огонь', []).ok, 'ручной рецепт не убирается');
  // A model recipe that uses the element, opened: the veto is refused.
  const g = env.files.readJson('data/games/alchemist/graph.json');
  g.recipes.push({ k: sim.keyOf([rec.r, 'огонь']), r: 'энергия', at: Date.now(), by: 'test' });
  env.files.writeJson('data/games/alchemist/graph.json', g);
  sim.setGraph(g);
  const user = sim.keyOf([rec.r, 'огонь']);
  const refused = w.graph().veto(rec.k, [rec.k, user]);
  assert.ok(!refused.ok && /потомки/.test(refused.why), JSON.stringify(refused));
  const plan = w.graph().veto(rec.k, [rec.k]);
  assert.ok(plan.ok, JSON.stringify(plan));
  assert.ok(plan.els.indexOf(rec.r) >= 0, 'элемент ушёл');
  assert.ok(plan.recipes.indexOf(user) >= 0, 'неоткрытый рецепт с ним ушёл');
  const t2 = sim.tree();
  assert.strictEqual(sim.pairState(rec.k, t2), 'none', 'пара стала «реакции нет»');
  assert.ok(!t2.els[rec.r], 'нет в дереве');
  // The screen's part.
  const ctx = { now: Date.now(), config: x.cfg, rng: x.Rng.make(1), mult: 1 };
  const state = x.Core.newState(x.game, sim, ctx);
  state.meta.book[rec.r] = 1;
  state.meta.bookN++;
  state.meta.opened[rec.k] = 1;
  state.run.store[rec.r] = 3;
  sim.forgetVetoed(state, plan);
  assert.ok(!state.meta.book[rec.r] && !state.run.store[rec.r] && !state.meta.opened[rec.k]);
  assert.deepStrictEqual(sim.checkTree(sim.content(), env.files.readJson('data/games/alchemist/graph.json'), x.cfg).problems, []);
});

test('три состояния пары без сети: рецепт из запаса, «нет», «неизвестно» — ингредиенты не списаны', () => {
  const tree = sim.tree();
  const ctx = { now: Date.now(), config: x.cfg, rng: x.Rng.make(1), mult: 1 };
  const state = x.Core.newState(x.game, sim, ctx);
  const model = Object.keys(tree.recipes).map((k) => tree.recipes[k]).filter((r) => r.src === 'model')[0];
  const none = Object.keys(tree.none)[0];
  [model.k, none, 'огонь+пар'].forEach((k) => k.split('+').forEach((e) => {
    if (!state.meta.book[e]) { state.meta.book[e] = 1; state.meta.bookN++; }
    state.run.store[e] = 5;
  }));
  state.run.store['пар'] = 5;
  state.meta.book['пар'] = 1;
  const a = sim.mix(state, x.cfg, model.k.split('+'), { now: ctx.now });
  assert.strictEqual(a.result, 'recipe');
  assert.ok(state.meta.opened[model.k]);
  const store = JSON.stringify(state.run.store);
  const b = sim.mix(state, x.cfg, none.split('+'), { now: ctx.now });
  assert.strictEqual(b.result, 'none');
  const c = sim.mix(state, x.cfg, ['огонь', 'пар'], { now: ctx.now });
  assert.strictEqual(c.result, 'unknown');
  assert.ok(state.meta.asked['огонь+пар'], 'в очереди');
  assert.strictEqual(JSON.stringify(state.run.store), store, 'ничего не потрачено');
  // The queue reaches the next request first.
  w.graph().sync(sim.seenOf(state));
  assert.strictEqual(pairsOf(promptOf()).filter((k) => !/^проверка/.test(k))[0], 'огонь+пар');
});

test('тройки: ключ — тройка, до 50 камней закрыто, после — рецепт набора', () => {
  const ctx = { now: Date.now(), config: x.cfg, rng: x.Rng.make(1), mult: 1 };
  const state = x.Core.newState(x.game, sim, ctx);
  ['море', 'ветер', 'дерево'].forEach((k) => { state.meta.book[k] = 1; state.run.store[k] = 3; });
  assert.strictEqual(sim.mix(state, x.cfg, ['море', 'ветер', 'дерево'], { now: ctx.now }).result, 'locked');
  state.meta.unlocks.triple = true;
  const r = sim.mix(state, x.cfg, ['дерево', 'море', 'ветер'], { now: ctx.now });
  assert.strictEqual(r.result, 'recipe');
  assert.strictEqual(r.r, 'корабль');
  const v = sim.validateAnswer(sim.tree(), { pair: 'вода+огонь+земля', kind: 'none' }, opts(['вода+земля+огонь']));
  assert.ok(/тройное/.test(v.why), 'тройки модели только после открытия');
});

done('Алхимик: дерево и ответы модели');
