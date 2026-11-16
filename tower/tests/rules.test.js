'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { H, GAME, open, ctx } = require('./env');
const Bot = require('./bot');

const w = open();
const x = w.x;
const catalog = JSON.parse(fs.readFileSync(path.join(GAME, 'content', 'catalog.json'), 'utf8'));

function act(state, action, extra) {
  return x.sim.act(state, action, ctx(x, Bot.T0, x.Rng.make(41), extra));
}

function start(seed, point) {
  const state = Bot.fresh(x, seed || 1, point);
  assert.ok(act(state, { type: 'start', classId: 'guardian', height: point ? point.height : 1, seed: seed || 1 }).ok);
  return state;
}

function advance(state, limit) {
  for (let i = 0; i < (limit || 1) && state.run.phase !== 'ended'; i++) {
    const action = x.sim.botAction(state, x.cfg);
    const result = act(state, action);
    assert.ok(result && result.ok, JSON.stringify({ action, result, run: state.run }));
  }
}

H.test('полный каталог: 10 приёмов, 28 реликвий, 5 классов, 12 врагов, 3 босса, 12 высот', () => {
  const expected = { moves: 10, relics: 28, classes: 5, enemies: 12, bosses: 3, workshop: 8, heights: 12, doors: 6, flights: 4, eliteMods: 3 };
  for (const [key, value] of Object.entries(expected)) {
    assert.strictEqual(catalog[key].length, value, key);
    assert.strictEqual(new Set(catalog[key].map((item) => item.id)).size, value, key + ': дубли id');
    assert.ok(catalog[key].every((item) => item.title && item.text), key + ': подписи и описания');
  }
  assert.strictEqual(catalog.relics.filter((item) => item.rarity === 'common').length, 10);
  assert.strictEqual(catalog.relics.filter((item) => item.rarity === 'rare').length, 11);
  assert.strictEqual(catalog.relics.filter((item) => item.rarity === 'legendary').length, 7);
});

H.test('новая игра, запуск и запрет недоступного класса/высоты', () => {
  const state = Bot.fresh(x, 4);
  assert.strictEqual(state.run.phase, 'home');
  assert.strictEqual(x.Core.validate(state, x.game), null);
  assert.strictEqual(x.sim.validate(state), null);
  const classResult = act(state, { type: 'start', classId: 'nameless', height: 1 });
  assert.ok(!classResult.ok, 'закрытый класс доступен');
  const heightResult = act(state, { type: 'start', classId: 'guardian', height: 12 });
  assert.ok(!heightResult.ok, 'закрытая высота доступна');
  assert.ok(act(state, { type: 'start', classId: 'guardian', height: 1, seed: 4 }).ok);
  assert.strictEqual(state.run.floor, 1);
  assert.strictEqual(state.run.phase, 'doors');
  assert.ok(state.run.hero.hp > 0 && state.run.hero.hp <= state.run.hero.maxHp);
  assert.ok(state.run.moves.block > 0, 'Страж начинается с Блоком+');
  assert.ok(Object.prototype.hasOwnProperty.call(state.run.moves, 'reflect'));
});

H.test('сохранение после каждого действия воспроизводит следующий ход и случайности', () => {
  let state = start(413, Bot.POINTS[1]);
  let checkpoints = 0;
  for (let step = 0; step < 100 && state.run.phase !== 'ended'; step++) {
    const serialized = JSON.stringify(state);
    const picked = x.Core.pick([{ json: serialized, seq: state.seq, source: 'action' }], x.game, x.sim);
    assert.ok(picked.state, JSON.stringify(picked.broken));
    assert.deepStrictEqual(picked.state.run, JSON.parse(serialized).run);
    const action = x.sim.botAction(state, x.cfg);
    const restoredAction = x.sim.botAction(picked.state, x.cfg);
    assert.deepStrictEqual(restoredAction, action);
    const now = Bot.T0 + step * 5000;
    const first = x.sim.act(state, action, ctx(x, now, x.Rng.make(1)));
    const second = x.sim.act(picked.state, restoredAction, ctx(x, now, x.Rng.make(987654)));
    assert.deepStrictEqual(second, first);
    assert.strictEqual(JSON.stringify(picked.state.run), JSON.stringify(state.run));
    assert.strictEqual(JSON.stringify(picked.state.meta.tower), JSON.stringify(state.meta.tower));
    state = picked.state;
    checkpoints++;
  }
  assert.ok(checkpoints >= 20, 'слишком короткий тестовый забег: ' + checkpoints);
});

H.test('12 часов офлайна: формула, секунды и движок совпадают точно', () => {
  const state = start(26, Bot.POINTS[1]);
  for (let i = 0; i < 30 && state.run.phase !== 'combat'; i++) advance(state);
  assert.strictEqual(state.run.phase, 'combat');
  const base = JSON.stringify({ run: state.run, tower: state.meta.tower });
  const formula = x.Core.clone(state);
  const steps = x.Core.clone(state);
  const report = x.sim.offline(formula, 43200, ctx(x, Bot.T0 + 43200000));
  for (let sec = 1; sec <= 43200; sec++) x.sim.tick(steps, 1, ctx(x, Bot.T0 + sec * 1000));
  assert.strictEqual(JSON.stringify({ run: formula.run, tower: formula.meta.tower }), base);
  assert.strictEqual(JSON.stringify({ run: steps.run, tower: steps.meta.tower }), base);
  assert.deepStrictEqual(formula.run, steps.run);
  assert.ok(report && typeof report === 'object');
  const agree = w.kit.offlineAgree(x.game, x.sim, x.cfg, 10, (s, c) => {
    const action = x.sim.botAction(s, x.cfg);
    if (action) x.sim.act(s, action, c);
  });
  assert.strictEqual(agree.diff, 0);
  console.log('OFFLINE ' + JSON.stringify({ hours: 12, discrepancyPct: agree.diff * 100, formula: agree.formula, steps: agree.steps }));
});

H.test('мастерская: геометрическая цена, пределы, хватает ровно, недостаток средств', () => {
  const state = Bot.fresh(x, 1);
  assert.ok(!act(state, { type: 'workshop', id: 'health' }).ok);
  state.meta.tower.shards = '10';
  assert.ok(act(state, { type: 'workshop', id: 'health' }).ok);
  assert.strictEqual(x.Big.toNumber(state.meta.tower.shards), 0);
  assert.strictEqual(state.meta.tower.workshop.health, 1);
  state.meta.tower.shards = '100000';
  for (const [id, max] of Object.entries(Bot.MAX_LEVELS)) {
    let oldCost = 0;
    while (state.meta.tower.workshop[id] < max) {
      const before = x.Big.toNumber(state.meta.tower.shards);
      assert.ok(act(state, { type: 'workshop', id }).ok, id);
      const cost = before - x.Big.toNumber(state.meta.tower.shards);
      assert.ok(cost > oldCost, id + ': цена не растёт');
      oldCost = cost;
    }
    if (x.cfg['workshop.' + id + '.max'] > 0) {
      assert.strictEqual(x.cfg['workshop.' + id + '.max'], max, id + ': предел в настройках');
      const before = x.Big.toNumber(state.meta.tower.shards);
      assert.ok(!act(state, { type: 'workshop', id }).ok, id + ': предел');
      assert.strictEqual(x.Big.toNumber(state.meta.tower.shards), before);
    } else assert.strictEqual(x.cfg['workshop.' + id + '.mastery'], max, id + ': порог мастерства');
  }
  const saved = x.Core.clone(state.meta.tower.workshop);
  assert.ok(act(state, { type: 'start', classId: 'guardian', height: 1, seed: 10 }).ok);
  assert.deepStrictEqual(state.meta.tower.workshop, saved);
  assert.strictEqual(state.run.hero.maxHp, x.cfg['hero.hp'] + 50);
  assert.strictEqual(state.run.hero.strength, x.cfg['hero.strength'] + 5);
  assert.strictEqual(state.run.hero.defense, x.cfg['hero.defense'] + 5);
});

H.test('мастерская без предела: после порога мастерства уровни продолжаются, цена растёт быстрее', () => {
  const state = Bot.fresh(x, 1);
  const endless = Object.keys(Bot.MAX_LEVELS).filter((id) => !(x.cfg['workshop.' + id + '.max'] > 0));
  assert.deepStrictEqual(endless, ['health', 'strength', 'defense', 'gold']);
  assert.ok(x.cfg['workshop.lateGrowth'] > x.cfg['workshop.growth'], 'поздний рост цены должен быть круче раннего');
  for (const id of endless) {
    const mastery = Bot.MAX_LEVELS[id];
    state.meta.tower.workshop[id] = mastery;
    const price = () => x.Big.toNumber(x.sim.view(state, x.cfg).workshop.find((item) => item.id === id).price);
    const atMastery = x.cfg['workshop.' + id + '.base'] * Math.pow(x.cfg['workshop.growth'], mastery);
    assert.strictEqual(price(), Math.ceil(atMastery), id + ': цена на пороге не изменилась');
    state.meta.tower.shards = String(price() - 1);
    assert.ok(!act(state, { type: 'workshop', id }).ok, id + ': в долг нельзя');
    let old = price();
    for (let extra = 1; extra <= 12; extra++) {
      state.meta.tower.shards = String(old);
      assert.ok(act(state, { type: 'workshop', id }).ok, id + ': уровень ' + (mastery + extra));
      assert.strictEqual(x.Big.toNumber(state.meta.tower.shards), 0);
      const next = price();
      assert.ok(Math.abs(next / old - x.cfg['workshop.lateGrowth']) < 0.02, id + ': шаг цены ' + next / old);
      old = next;
    }
    assert.strictEqual(state.meta.tower.workshop[id], mastery + 12);
    const item = x.sim.view(state, x.cfg).workshop.find((entry) => entry.id === id);
    assert.ok(item.endless && item.max === 0);
  }
  assert.ok(act(state, { type: 'start', classId: 'guardian', height: 1, seed: 10 }).ok);
  assert.strictEqual(state.run.hero.maxHp, x.cfg['hero.hp'] + (Bot.MAX_LEVELS.health + 12) * x.cfg['workshop.health.effect']);
  assert.strictEqual(state.run.hero.strength, x.cfg['hero.strength'] + (Bot.MAX_LEVELS.strength + 12) * x.cfg['workshop.strength.effect']);
  assert.strictEqual(x.sim.validate(state), null);
});

H.test('проигрыш не портит состояние: 50 зерён, все действия валидны', () => {
  for (let seed = 1; seed <= 50; seed++) Bot.run(x, seed, Bot.POINTS[0], { validateEveryAction: true });
});

H.test('версия сохранения и миграции соответствуют реальным fixtures', () => {
  const names = fs.readdirSync(path.join(GAME, 'fixtures')).filter((name) => name.endsWith('.json'));
  if (x.game.saveVersion > 1) assert.ok(names.length, 'для новой версии нужны старые сохранения');
  for (const name of names) {
    const fixture = JSON.parse(fs.readFileSync(path.join(GAME, 'fixtures', name), 'utf8'));
    fixture.game = x.game.id;
    const loaded = x.Core.pick([{ state: fixture, seq: fixture.seq, source: name }], x.game, x.sim);
    assert.ok(loaded.state, name + ': ' + JSON.stringify(loaded.broken));
    assert.strictEqual(loaded.state.ver, x.game.saveVersion);
    assert.strictEqual(x.sim.validate(loaded.state), null);
  }
});

H.test('встроенный запас проходит схему, неизвестные эффекты и шаблоны отвергаются', () => {
  const state = start(12);
  for (const kind of ['events', 'enemies', 'daily']) {
    const values = JSON.parse(fs.readFileSync(path.join(GAME, 'content', kind + '.json'), 'utf8'));
    if (kind === 'events') assert.strictEqual(values.length, 15);
    for (const item of values) {
      assert.strictEqual(x.sim.validateStock(kind, item), null, kind + ': ' + item.id);
      assert.ok(act(state, { type: 'stock', kind, item }).ok, 'очередь ' + kind + ': ' + item.id);
    }
    assert.ok(state.meta.tower.stock[kind].length > 0);
  }
  assert.ok(x.sim.validateStock('enemies', { id: 'bad', title: 'Неизвестный', template: 'runCode', flight: 1 }));
  assert.ok(x.sim.validateStock('events', { id: 'bad', title: 'Событие', text: 'Текст события', choices: [
    { title: 'Выбор', effects: [{ type: 'runCode' }] }, { title: 'Уйти', effects: [] }
  ] }));
  assert.ok(x.sim.validateStock('events', { id: 'bad-key', title: 'Событие', text: 'Текст события', choices: [
    { title: 'Выбор', effects: [{ type: 'gold', key: 'hero.hp' }] }, { title: 'Уйти', effects: [] }
  ] }));
});

H.test('башня дня: одинаковое зерно и двери при повторном старте', () => {
  const a = Bot.fresh(x, 4);
  const b = Bot.fresh(x, 999);
  const action = { type: 'start', daily: true, classId: 'guardian', height: 1 };
  assert.ok(x.sim.act(a, Object.assign({ seed: 1 }, action), ctx(x, Bot.T0, x.Rng.make(4))).ok);
  assert.ok(x.sim.act(b, Object.assign({ seed: 987654 }, action), ctx(x, Bot.T0, x.Rng.make(999))).ok);
  assert.strictEqual(a.run.seed, b.run.seed);
  assert.deepStrictEqual(a.run.doors, b.run.doors);
  assert.deepStrictEqual(a.run.daily, b.run.daily);
  const savedSeed = a.run.seed;
  a.run.phase = 'ended';
  assert.ok(act(a, action).ok);
  assert.strictEqual(a.run.seed, savedSeed);
  assert.deepStrictEqual(a.run.doors, b.run.doors);
});

H.test('сундук Пассажира ждёт нового пролёта, после выбора возвращаются его двери', () => {
  const s = start(74);
  const chest = x.sim.chest(s, x.Rng.make(2), x.cfg);
  assert.ok(chest.items.length > 0);
  assert.strictEqual(s.meta.tower.pendingChests, 1);
  assert.strictEqual(s.run.phase, 'doors', 'сундук не прерывает текущий этаж');
  s.run.floor = 10;
  s.run.phase = 'fork';
  s.run.bosses = 1;
  assert.ok(act(s, { type: 'continue' }).ok);
  assert.strictEqual(s.run.floor, 11);
  assert.strictEqual(s.run.phase, 'reward');
  assert.strictEqual(s.run.rewardKind, 'chest');
  assert.strictEqual(s.meta.tower.pendingChests, 0);
  assert.ok(act(s, { type: 'reward', index: 0 }).ok);
  assert.strictEqual(s.run.phase, 'doors');
  assert.strictEqual(s.run.floor, 11);
  assert.ok(s.run.doors.length >= 2, 'двери следующего пролёта не подготовлены');
});

H.test('запас событий: бесплатный выход, тип ключа и повреждённый выбор', () => {
  const safe = { title: 'Пройти мимо', text: 'Продолжить подъём без потерь.', effects: [] };
  const paid = { title: 'Заплатить', text: 'Отдать монеты и получить награду.',
    cost: { type: 'gold', key: 'event.well.cost' }, effects: [{ type: 'relic' }] };
  const event = { id: 'stock-validation', title: 'Закрытая арка', text: 'У арки ждёт сторож с медной чашей.', choices: [paid, safe] };
  assert.strictEqual(x.sim.validateStock('events', event), null, 'валидный платный выбор с бесплатным выходом');
  assert.ok(x.sim.validateStock('events', Object.assign({}, event, { choices: [paid, paid] })), 'только платные варианты блокируют игру без золота');
  const wrongType = Object.assign({}, paid, { effects: [{ type: 'strength', key: 'event.shelf.gold' }] });
  assert.ok(x.sim.validateStock('events', Object.assign({}, event, { choices: [wrongType, safe] })), 'ключ золота нельзя применять к силе');
  let problem;
  assert.doesNotThrow(() => { problem = x.sim.validateStock('events', Object.assign({}, event, { choices: [null, safe] })); });
  assert.ok(problem, 'повреждённый выбор должен отвергаться');
});

H.test('башня дня: подготовленный запас следующего дня сохраняет новое зерно', () => {
  const s = Bot.fresh(x, 51);
  const item = { id: 'daily-prepared', title: 'Подготовленный день', text: 'Враги начинают бой со щитом.', rule: 'ironDoors', seed: 'prepared-one' };
  assert.ok(x.sim.act(s, { type: 'stock', kind: 'daily', item }, ctx(x, Bot.T0, x.Rng.make(1))).ok);
  const daily = { type: 'start', daily: true, classId: 'guardian', height: 1 };
  assert.ok(x.sim.act(s, daily, ctx(x, Bot.T0, x.Rng.make(2))).ok);
  assert.strictEqual(s.run.seed, x.Rng.hash('prepared-one'));
  s.run.phase = 'ended';
  const tomorrow = Bot.T0 + 86400000;
  const next = Object.assign({}, item, { seed: 'prepared-two' });
  assert.ok(x.sim.act(s, { type: 'stock', kind: 'daily', item: next }, ctx(x, tomorrow, x.Rng.make(3))).ok);
  assert.ok(x.sim.act(s, daily, ctx(x, tomorrow, x.Rng.make(4))).ok);
  assert.strictEqual(s.run.seed, x.Rng.hash('prepared-two'), 'повтор id и названия в новую дату не теряет новое зерно');
});
H.test('башня дня: выбранный день не меняется после нового запаса и загрузки', () => {
  let s = Bot.fresh(x, 91);
  const daily = { type: 'start', daily: true, classId: 'guardian', height: 1 };
  assert.ok(x.sim.act(s, daily, ctx(x, Bot.T0, x.Rng.make(11))).ok);
  const first = { seed: s.run.seed, daily: x.Core.clone(s.run.daily), doors: x.Core.clone(s.run.doors) };
  const prepared = { id: 'late-prepared', title: 'Поздняя башня', text: 'Новое предложение пришло после первого подъёма.',
    rule: first.daily.rule === 'ironDoors' ? 'generous' : 'ironDoors', seed: 'late-day-seed' };
  assert.ok(x.sim.act(s, { type: 'stock', kind: 'daily', item: prepared }, ctx(x, Bot.T0, x.Rng.make(22))).ok);
  s.run.phase = 'ended';
  s = x.Core.clone(s);
  assert.ok(x.sim.act(s, daily, ctx(x, Bot.T0, x.Rng.make(33))).ok);
  assert.strictEqual(s.run.seed, first.seed);
  assert.deepStrictEqual(s.run.daily, first.daily);
  assert.deepStrictEqual(s.run.doors, first.doors);
});
H.done('tower: правила и сохранение');


