// The logic of «Сокровищница дракона»: a dragon keeps a hoard of gold. Servants bring gold, the
// glitter of the pile multiplies it, knights come for it (the bigger the pile, the stronger they
// are), raids bring loot and fear, a sleep of an age (prestige) gives Antiquity by the largest
// pile of the age, a new clutch (the second layer) gives the Blood of the ancestors.
//
// Shared subset of JavaScript: the screen (window.GameSim), the engine (Rhino) and node. Every
// number is a setting of config.json (cfg / ctx.config). Randomness of what happens by the clock
// (knights, fights, raids) comes from generators seeded by the state (run.seed and a counter), so
// offline by the formula and by steps give the same knights and the same fights; online events
// take ctx.rng.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/fmt.js'), require('../engine/rng.js')) : make(root.Big, root.Fmt, root.Rng);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Fmt, Rng) {
  'use strict';

  var SLEEP = 'sleep';
  var CLUTCH = 'clutch';
  var SEC = 1000;
  var MIN = 60000;

  // ---- content: names and texts (the numbers are in config.json) ----------------------------------

  var SERVANTS = [
    { id: 'kobold', title: 'Кобольд-носильщик' },
    { id: 'lizard', title: 'Ящер-рудокоп' },
    { id: 'troll', title: 'Пещерный тролль' },
    { id: 'cultist', title: 'Культист-сборщик дани' },
    { id: 'turncoat', title: 'Наёмник-перебежчик' },
    { id: 'alchemist', title: 'Алхимик-пленник' },
    { id: 'wyvern', title: 'Виверна-курьер' },
    { id: 'lender', title: 'Ростовщик из людей' }
  ];

  var QUALITIES = [
    { id: 'claws', title: 'Когти', text: 'сила ×1,3 за уровень' },
    { id: 'scale', title: 'Чешуя', text: 'сила ×1,3; поражение уносит меньше (10 % → до 5 %)' },
    { id: 'flame', title: 'Пламя', text: 'сила ×1,3; набеги быстрее на 2 % за уровень' },
    { id: 'wings', title: 'Крылья', text: 'сила ×1,3; открывают дальние цели' }
  ];

  var RAIDS = [
    { n: 1, title: 'Хутор у леса' },
    { n: 2, title: 'Мельничная деревня' },
    { n: 3, title: 'Караван солеваров', caravan: true },
    { n: 4, title: 'Монастырь на скале', gems: true },
    { n: 5, title: 'Ярмарочный город' },
    { n: 6, title: 'Замок барона' },
    { n: 7, title: 'Торговый порт', gems: true, port: true },
    { n: 8, title: 'Казна графства' },
    { n: 9, title: 'Королевский обоз', caravan: true },
    { n: 10, title: 'Столица', trophy: true, gems: true }
  ];

  var KNIGHTS = [
    { id: 'squire', title: 'Оруженосец', trophy: 'helm' },
    { id: 'wanderer', title: 'Странствующий рыцарь', trophy: 'spear' },
    { id: 'miller', title: 'Сын мельника с вилами', trophy: 'pitchfork', text: 'слабый, но кошелёк ×3' },
    { id: 'hunter', title: 'Охотник на драконов', trophy: 'map', trait: 'scale', text: 'знает слабость: Чешуя не работает' },
    { id: 'mercs', title: 'Отряд наёмников', trophy: 'ring', trait: 'group', text: 'приходят втроём' },
    { id: 'champion', title: 'Королевский чемпион', trophy: 'gauntlet' },
    { id: 'sorcerer', title: 'Чародей-изгнанник', trophy: 'staff', trait: 'flame', text: 'бьёт по Пламени: оно не в счёт' },
    { id: 'bard', title: 'Певец с героем', trophy: 'lute', trait: 'fear', text: 'при победе Страх ×2' },
    { id: 'order', title: 'Рыцарь ордена Серебряного копья', trophy: 'banner', text: 'только в век орденов' },
    { id: 'veteran', title: 'Старый рыцарь, проигравший прошлый раз', trophy: 'raven', text: 'помнит дракона' }
  ];

  var TROPHIES = [
    { id: 'helm', title: 'Помятый шлем', kind: 'power' },
    { id: 'spear', title: 'Сломанное копьё', kind: 'gold' },
    { id: 'pitchfork', title: 'Вилы', kind: 'gold' },
    { id: 'map', title: 'Карта логова', kind: 'raid' },
    { id: 'ring', title: 'Кольцо наёмника', kind: 'raid' },
    { id: 'gauntlet', title: 'Перчатка чемпиона', kind: 'power' },
    { id: 'staff', title: 'Посох с трещиной', kind: 'power' },
    { id: 'lute', title: 'Лютня', kind: 'raid' },
    { id: 'banner', title: 'Знамя ордена', kind: 'gold' },
    { id: 'raven', title: 'Щит с вороном', kind: 'power' }
  ];

  var HALLS = [
    { id: 'grotto', title: 'Сторожевой грот', text: 'ур. 1 — стража: куча не без охраны в набеге; ур. 2 — офлайн-доход 100 %' },
    { id: 'bones', title: 'Зал костей', text: 'трофеи сильнее: +100 % к их эффекту за уровень' },
    { id: 'nest', title: 'Гнездо', text: 'слуги дешевле на 15 % за уровень' },
    { id: 'mirror', title: 'Зеркальный свод', text: 'блеск кучи ×1,5 за уровень' },
    { id: 'sanctum', title: 'Святилище', text: 'каждый сон даёт +10 % Древности за уровень' },
    { id: 'cache', title: 'Тайник', text: '5 % кучи за уровень не теряется никогда' }
  ];

  var AGES = [
    { id: 'young', title: 'Молодой', key: null, opens: 'слуги, качества, набеги 1–3' },
    { id: 'adult', title: 'Взрослый', key: 'age.adult', opens: 'самоцветы, залы, Старший кобольд, Летописец набегов, набеги 4–6' },
    { id: 'old', title: 'Старый', key: 'age.old', opens: 'дыхание на век, Сторожевой гонг, набеги 7–8' },
    { id: 'ancient', title: 'Древний', key: 'age.ancient', opens: 'Ужас: раз в век прогнать рыцаря без боя; набеги 9–10' },
    { id: 'great', title: 'Великий', key: 'age.great', opens: 'магия кучи: золотой дождь' },
    { id: 'legend', title: 'Легендарный', key: 'age.legend', opens: 'новая кладка' }
  ];

  var RAIDS_BY_AGE = [3, 6, 8, 10, 10, 10];

  var WORLDS = [
    { id: 'orders', title: 'Век рыцарских орденов', text: 'рыцари ×1,5, набеги ×2, приходят рыцари ордена' },
    { id: 'trade', title: 'Век торговли', text: 'караваны ×3' },
    { id: 'trouble', title: 'Век смуты', text: 'рыцарей меньше: приходят в 1,5 раза реже' },
    { id: 'mages', title: 'Век магов', text: 'рыцари-чародеи приходят впятеро чаще' },
    { id: 'peace', title: 'Век мира', text: 'Страх копится вдвое медленнее' }
  ];

  var SPECIES = [
    { id: 'cave', title: 'Пещерный', text: 'обычный дракон' },
    { id: 'ice', title: 'Ледяной', text: 'рыцари приходят реже, офлайн ×1,5' },
    { id: 'storm', title: 'Грозовой', text: 'набеги вдвое короче' },
    { id: 'sand', title: 'Песчаный', text: 'блеск ×2, чешуя слабее' },
    { id: 'sea', title: 'Морской', text: 'набеги на порты ×5' },
    { id: 'shadow', title: 'Теневой', text: 'рыцари не видят кучу до 1 млн' }
  ];

  var BREATHS = [
    { id: 'fire', title: 'Огонь', text: 'в бою сила ×1,3' },
    { id: 'frost', title: 'Холод', text: 'рыцари на 25 % реже, поражение уносит вдвое меньше' },
    { id: 'storm', title: 'Гроза', text: 'набеги на 25 % короче, добыча ×1,25' }
  ];

  var EVENTS = [
    { id: 'merchant', title: 'Заблудший купец', text: 'Купец свернул не туда и оставил выкуп у входа: +3 минуты дохода.' },
    { id: 'gem', title: 'Блестящая находка', text: 'В углу логова что-то блеснуло: самоцвет.', age: 1 },
    { id: 'rumor', title: 'Слухи о куче', text: 'По тавернам ползут слухи: следующий рыцарь придёт вдвое раньше, но кошелёк у него ×3.' },
    { id: 'echo', title: 'Пещерное эхо', text: 'Эхо гонит слуг быстрее: слуги ×3 на минуту.' },
    { id: 'offering', title: 'Подношение деревни', text: 'Деревня принесла дары, чтобы дракон её не трогал: Страх растёт, +5 минут дохода.' },
    { id: 'runaway', title: 'Сбежавший слуга', text: 'Кобольд сбежал с монетой в зубах.', choices: [['back', 'Вернуть: кобольд бесплатно'], ['free', 'Отпустить: +1 % блеска']] },
    { id: 'sheep', title: 'Охота на овец', text: 'Стадо у подножия: набег на хутор — мгновенно.' },
    { id: 'rival', title: 'Дракон-соперник', text: 'Над горой пролетает чужой дракон.', choices: [['fight', 'Прогнать: бой на равных, награда — трофей'], ['hide', 'Затаиться']] },
    { id: 'vein', title: 'Золотая жила', text: 'Под логовом нашлась жила: куча +1 %.' },
    { id: 'quiet', title: 'Тихая ночь', text: 'Рыцари не придут ближайшие 30 минут.' },
    { id: 'prophecy', title: 'Предсказание', text: 'Старуха у костра назвала трёх следующих рыцарей.' },
    { id: 'rain', title: 'Магия кучи', text: 'Над кучей пошёл золотой дождь: ловите монеты 15 секунд.', age: 4, choices: [['catch', 'Ловить монеты'], ['skip', 'Пропустить']] },
    { id: 'envoys', title: 'Послы короля', text: 'Король предлагает дань за то, чтобы дракон не трогал столицу.', age: 3, choices: [['accept', 'Принять: доход ×2 на час, столица закрыта'], ['refuse', 'Отказать']] },
    { id: 'eclipse', title: 'Затмение', text: 'Солнце скрылось: набеги, начатые в ближайшие 10 минут, приносят ×2.' },
    { id: 'molt', title: 'Линька', text: 'Чешуя сходит: ×0,5 на 5 минут, потом +1 уровень бесплатно.' }
  ];

  // ---- small helpers ------------------------------------------------------------------------------

  function num(v, d) {
    var n = Number(v);
    return v === undefined || v === null || v === '' || n !== n || n === Infinity || n === -Infinity ? d : n;
  }

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  var marksCache = { text: null, list: [] };
  function marks(cfg) {
    var text = String(cfg['servant.milestones'] || '');
    if (marksCache.text !== text) {
      marksCache.text = text;
      marksCache.list = text.split(',').map(function (x) { return Number(x); }).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    }
    return marksCache.list;
  }

  /** Milestones past the listed ones: one more every `servant.milestoneEvery` servants, without an end. */
  function marksPast(n, cfg) {
    var list = marks(cfg);
    var every = Math.floor(num(cfg['servant.milestoneEvery'], 0));
    var last = list.length ? list[list.length - 1] : 0;
    if (every <= 0 || n < last + every) return 0;
    return Math.floor((n - last) / every);
  }

  function milestoneMult(n, cfg) {
    var list = marks(cfg);
    var k = marksPast(n, cfg);
    for (var i = 0; i < list.length; i++) if (n >= list[i]) k++;
    return Math.pow(cfg['servant.milestoneMult'], k);
  }

  function nextMilestone(n, cfg) {
    var list = marks(cfg);
    for (var i = 0; i < list.length; i++) if (n < list[i]) return list[i];
    var every = Math.floor(num(cfg['servant.milestoneEvery'], 0));
    if (every <= 0) return null;
    var last = list.length ? list[list.length - 1] : 0;
    return last + (marksPast(n, cfg) + 1) * every;
  }

  function layer(state, id) {
    var l = state.layers && state.layers[id];
    return l || { currency: '0e0', count: 0, state: {} };
  }

  function lstate(state, id) {
    var l = layer(state, id);
    if (!l.state || typeof l.state !== 'object') l.state = {};
    return l.state;
  }

  function sleeps(state) { return num(lstate(state, SLEEP).sleeps, 0); }

  function hall(state, id) {
    var halls = lstate(state, SLEEP).halls || {};
    return num(halls[id], 0);
  }

  function species(state) { return lstate(state, CLUTCH).species || 'cave'; }

  function antiquity(state) { return Math.max(0, num(Big.toNumber(Big.of(layer(state, SLEEP).currency, 0)), 0)); }

  function blood(state) { return Math.max(0, num(Big.toNumber(Big.of(layer(state, CLUTCH).currency, 0)), 0)); }

  /** The age of the dragon: 0 Молодой … 5 Легендарный, by the sleeps since the last clutch. */
  function ageIndex(state, cfg) {
    var s = sleeps(state);
    var i = 0;
    for (var k = 1; k < AGES.length; k++) if (s >= cfg[AGES[k].key]) i = k;
    return i;
  }

  function gems(state) { return Big.of(state.meta.gems, 0); }

  function addGems(state, n) {
    state.meta.gems = Big.str(Big.floor(Big.add(gems(state), n)));
  }

  function auto(state) {
    var a = state.meta.auto = state.meta.auto || {};
    if (a.buy === undefined) a.buy = true;
    if (a.raid === undefined) a.raid = true;
    if (a.gong === undefined) a.gong = true;
    return a;
  }

  /** Is an effect of an event on at the moment? */
  function on(state, name, now) { return num(state.run.fx && state.run.fx[name], 0) > now; }

  function stream(state, label, n) { return Rng.make(Rng.hash(String(state.run.seed) + ':' + label + ':' + n)); }

  function pushLog(state, entry) {
    var log = state.run.log = state.run.log || [];
    log.push(entry);
    if (log.length > 40) state.run.log = log.slice(-40);
  }

  // ---- the world of the age -------------------------------------------------------------------------

  /** A factor of the world of the age: knights (strength), raids (loot), interval, fear, caravans, sorcerers, defense (of the targets). */
  function worldMod(state, cfg, key) {
    var w = state.run.world || {};
    if (w.id === 'custom') return num(w[key], 1);
    if (key === 'defense') return w.id && cfg['world.' + w.id + 'Defense'] !== undefined ? num(cfg['world.' + w.id + 'Defense'], 1) : 1;
    if (w.id === 'orders') return key === 'knights' ? cfg['world.ordersKnights'] : key === 'raids' ? cfg['world.ordersRaids'] : 1;
    if (w.id === 'trade') return key === 'caravans' ? cfg['world.tradeCaravans'] : 1;
    if (w.id === 'trouble') return key === 'interval' ? cfg['world.troubleInterval'] : 1;
    if (w.id === 'mages') return key === 'sorcerers' ? cfg['world.magesWeight'] : 1;
    if (w.id === 'peace') return key === 'fear' ? cfg['world.peaceFear'] : 1;
    return 1;
  }

  function worldOf(state) {
    var w = state.run.world || {};
    if (w.id === 'custom') return { id: 'custom', title: w.title || 'Неведомый век', text: w.text || '' };
    return find(WORLDS, w.id) || WORLDS[0];
  }

  /** A world of the age from the model's stock (or the procedural one): {title, text, knights, raids, interval, fear, defense}. */
  function setWorld(state, item) {
    if (!item) return false;
    if (item.id && find(WORLDS, item.id)) {
      state.run.world = { id: item.id };
      return true;
    }
    var clamp = function (v, a, b) { return Math.max(a, Math.min(b, num(v, 1))); };
    state.run.world = {
      id: 'custom', title: String(item.title || 'Неведомый век').slice(0, 40), text: String(item.text || '').slice(0, 120),
      knights: clamp(item.knights, 0.5, 2), raids: clamp(item.raids, 0.5, 3), interval: clamp(item.interval, 0.5, 2), fear: clamp(item.fear, 0.25, 2),
      defense: clamp(item.defense, 0.5, 2)
    };
    return true;
  }

  // ---- income ------------------------------------------------------------------------------------

  function servantBaseCost(state, cfg, k) {
    var base = Big.mul(cfg['servant.cost'], Big.pow(cfg['servant.costStep'], k));
    var nest = hall(state, 'nest');
    if (nest > 0) base = Big.mul(base, Math.pow(1 - cfg['hall.nest.discount'], nest));
    return base;
  }

  /** The price of `count` servants of tier k (0..7). */
  function servantCost(state, cfg, k, count) {
    return Big.costGeom(servantBaseCost(state, cfg, k), cfg['servant.growth'], state.run.servants[k], count || 1);
  }

  /** Gold a second from one servant of tier k, with its milestones. */
  function servantRate(state, cfg, k, n) {
    var owned = n === undefined ? state.run.servants[k] : n;
    return Big.mul(Big.mul(cfg['servant.income'], Big.pow(cfg['servant.incomeStep'], k)), milestoneMult(owned, cfg));
  }

  function baseIncome(state, cfg) {
    var sum = Big.ZERO;
    for (var k = 0; k < SERVANTS.length; k++) {
      var n = state.run.servants[k];
      if (n > 0) sum = Big.add(sum, Big.mul(servantRate(state, cfg, k), n));
    }
    return sum;
  }

  /** Trophies: 1 + Σ of their percents by kind (gold | power | raid), with the Hall of bones. */
  function trophyBonus(state, cfg, kind) {
    var have = state.meta.trophies || {};
    var sum = 0;
    TROPHIES.forEach(function (t) { if (t.kind === kind && have[t.id]) sum += num(cfg['trophy.' + t.id], 0) * have[t.id]; });
    return 1 + sum * (1 + hall(state, 'bones') * cfg['hall.bones.mult']);
  }

  /** The glitter of the pile: ×(1 + 0.15 · lg(H + 1)), the Mirror vault and the sand dragon multiply the 0.15. */
  function glitter(state, cfg, gold) {
    var coef = cfg['glitter.k'] * Math.pow(cfg['hall.mirror.mult'], hall(state, 'mirror')) * (species(state) === 'sand' ? cfg['species.sandGlitter'] : 1);
    var lg = Big.log10(Big.add(Big.max(gold === undefined ? state.run.gold : gold, 0), 1));
    return (1 + coef * lg) * (1 + num(state.run.glitterBonus, 0));
  }

  /** Everything over the servants except the glitter: Antiquity, trophies, Blood, events. */
  function goldMult(state, cfg, now) {
    var m = (1 + cfg['antiquity.gold'] * antiquity(state)) * trophyBonus(state, cfg, 'gold');
    if (on(state, 'echo', now)) m *= cfg['event.echoMult'];
    if (on(state, 'tribute', now)) m *= cfg['event.tributeMult'];
    var b = blood(state);
    return b > 0 ? Big.mul(m, Big.pow(cfg['blood.mult'], b)) : Big.of(m);
  }

  /** Gold a second now (before the links' multiplier and the offline share). */
  function income(state, cfg, now) {
    return Big.mul(Big.mul(baseIncome(state, cfg), glitter(state, cfg)), goldMult(state, cfg, now === undefined ? 0 : now));
  }

  function offlineShare(state, cfg) {
    var share = hall(state, 'grotto') >= 2 ? cfg['offline.shareGrotto'] : cfg['offline.share'];
    if (species(state) === 'ice') share *= cfg['species.iceOffline'];
    return share;
  }

  function gain(state, amount) {
    var r = state.run;
    if (Big.sign(amount) <= 0) return;
    r.gold = Big.add(r.gold, amount);
    r.earned = Big.add(r.earned, amount);
    if (Big.gt(r.gold, r.hmax)) r.hmax = r.gold;
  }

  function pay(state, amount) {
    state.run.gold = Big.max(0, Big.sub(state.run.gold, amount));
  }

  // ---- servants ------------------------------------------------------------------------------------

  /** Tiers that may be bought: every owned one and the next. */
  function servantsOpen(state) {
    var top = 0;
    for (var k = 0; k < SERVANTS.length; k++) if (state.run.servants[k] > 0) top = k + 1;
    return Math.min(SERVANTS.length, top + 1);
  }

  function buyServant(state, cfg, k, count) {
    count = count || 1;
    if (k < 0 || k >= SERVANTS.length || k >= servantsOpen(state)) return 0;
    var price = servantCost(state, cfg, k, count);
    if (Big.lt(state.run.gold, price)) return 0;
    pay(state, price);
    state.run.servants[k] += count;
    return count;
  }

  /** How many of tier k the pile buys now (at most `limit`). */
  function servantsAffordable(state, cfg, k, limit) {
    var n = Big.maxBuy(state.run.gold, Big.mul(servantBaseCost(state, cfg, k), 1), cfg['servant.growth'], state.run.servants[k]);
    return Math.min(n, limit || 1e9);
  }

  /** The tier that pays back soonest (price / added gold a second), or -1. */
  function bestServant(state, cfg) {
    var best = -1;
    var bestScore = Infinity;
    var open = servantsOpen(state);
    for (var k = 0; k < open; k++) {
      var n = state.run.servants[k];
      var before = Big.mul(servantRate(state, cfg, k, n), n);
      var after = Big.mul(servantRate(state, cfg, k, n + 1), n + 1);
      var added = Big.sub(after, before);
      var score = Big.toNumber(Big.div(servantCost(state, cfg, k, 1), added));
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    }
    return best;
  }

  /** Buys the best-value servant when there is enough: true when bought (the checks' bot). */
  function buy(state, cfg) {
    var k = bestServant(state, cfg);
    return k >= 0 && buyServant(state, cfg, k, 1) > 0;
  }

  // ---- the dragon --------------------------------------------------------------------------------

  /** Levels counted in the power: Scale is weaker for a sand dragon and in a molt; a trait may drop one. */
  function levels(state, cfg, o) {
    o = o || {};
    var q = state.run.q;
    var scale = q.scale;
    if (species(state) === 'sand') scale *= cfg['species.sandScale'];
    if (o.now !== undefined && on(state, 'molt', o.now)) scale *= cfg['event.moltScale'];
    if (o.noScale) scale = 0;
    return q.claws + q.wings + (o.noFlame ? 0 : q.flame) + scale;
  }

  /** The power of the dragon D = 10 · 1.3^L · (1 + 0.05 · Antiquity) · trophies. */
  function power(state, cfg, o) {
    var L = levels(state, cfg, o);
    var m = (1 + cfg['antiquity.power'] * antiquity(state)) * trophyBonus(state, cfg, 'power');
    return Big.mul(Big.mul(cfg['power.base'], Big.pow(cfg['power.step'], L)), m);
  }

  function qualityCost(state, cfg, id) {
    return Big.mul(cfg['quality.cost'], Big.pow(cfg['quality.growth'], state.run.q[id]));
  }

  function buyQuality(state, cfg, id) {
    if (state.run.q[id] === undefined) return false;
    var price = qualityCost(state, cfg, id);
    if (Big.lt(state.run.gold, price)) return false;
    pay(state, price);
    state.run.q[id]++;
    state.run.spentPower = Big.add(state.run.spentPower || 0, price);
    return true;
  }

  /** The cheapest quality (Wings first among equals: they also open targets); `except` — one that does not count. */
  function cheapestQuality(state, cfg, except) {
    var best = null;
    ['wings', 'claws', 'scale', 'flame'].forEach(function (id) {
      if (id === except) return;
      if (!best || Big.lt(qualityCost(state, cfg, id), qualityCost(state, cfg, best))) best = id;
    });
    return best;
  }

  function breathe(state, cfg, id) {
    if (ageIndex(state, cfg) < 2 || state.run.breath || !find(BREATHS, id)) return false;
    if (Big.lt(gems(state), cfg['breath.cost'])) return false;
    addGems(state, -cfg['breath.cost']);
    state.run.breath = id;
    return true;
  }

  function setCurl(state, onPile) {
    if (state.run.raid) return false;
    state.run.curled = !!onPile;
    return true;
  }

  // ---- knights -------------------------------------------------------------------------------------

  function knightList(state) {
    var extra = (state.meta.extraKnights || []).map(function (k) { return { id: k.id, title: k.title, text: k.text, trait: k.trait, extra: true, mult: k.mult, purse: k.purse }; });
    return KNIGHTS.concat(extra);
  }

  function knightDef(state, id) { return find(knightList(state), id) || KNIGHTS[1]; }

  function knightMult(state, cfg, id) {
    var d = knightDef(state, id);
    var m = d.extra ? num(d.mult, 1) : num(cfg['knight.' + id], 1);
    return m * worldMod(state, cfg, 'knights');
  }

  /** K = 0.25 · H^0.65 · type (one knight of a group for the mercenaries). */
  function knightPower(state, cfg, id, gold) {
    var H = Big.max(gold === undefined ? state.run.gold : gold, 1);
    return Big.mul(Big.mul(cfg['knight.k'], Big.pow(H, cfg['knight.exp'])), knightMult(state, cfg, id));
  }

  /** The chance to win: D² / (D² + K²), by logarithms. */
  function chance(D, K) {
    var r = Big.log10(K) - Big.log10(D);
    if (!(r === r)) return 0.5;
    if (r * 2 > 300) return 0;
    if (r * 2 < -300) return 1;
    return 1 / (1 + Math.pow(10, 2 * r));
  }

  function threshold(state, cfg) { return species(state) === 'shadow' ? cfg['species.shadowHoard'] : cfg['knight.minHoard']; }

  /** Minutes between knights: 12, down to 6 with full Fear; the world, the ice dragon and the frost stretch it. */
  function knightInterval(state, cfg) {
    var f = Math.max(0, Math.min(1, num(state.run.fear, 0) / cfg['fear.max']));
    var min = cfg['knight.everyMin'] - (cfg['knight.everyMin'] - cfg['knight.fearMin']) * f;
    min *= worldMod(state, cfg, 'interval');
    if (species(state) === 'ice') min *= cfg['species.iceKnights'];
    if (state.run.breath === 'frost') min *= cfg['breath.frost'];
    return min * MIN;
  }

  /** The type of the n-th knight of the age (the same in every path: seeded by the state). */
  function pickType(state, cfg, n) {
    var list = knightList(state);
    var weights = list.map(function (k) {
      if (k.extra) return num(cfg['knight.w.extra'], 1);
      var w = num(cfg['knight.w.' + k.id], 1);
      if (k.id === 'order' && (state.run.world || {}).id !== 'orders') w = 0;
      if (k.id === 'veteran' && !(state.run.wins > 0)) w = 0;
      if (k.id === 'sorcerer') w *= worldMod(state, cfg, 'sorcerers');
      return w;
    });
    var picked = stream(state, 'k', n).weighted(list, weights);
    return picked ? picked.id : 'wanderer';
  }

  function schedule(state, cfg, from) {
    var r = state.run;
    if (Big.lt(r.gold, threshold(state, cfg))) {
      r.knight = null;
      return;
    }
    var seen = false;
    var type;
    // The first knight of an age comes soon after the pile is seen; the next ones by the interval.
    var wait = r.knightCount === 0 && !(r.queue && r.queue.length) ? cfg['knight.firstMin'] * MIN : knightInterval(state, cfg);
    if (r.queue && r.queue.length) {
      type = r.queue.shift();
      seen = true;
    } else {
      r.knightCount++;
      type = pickType(state, cfg, r.knightCount);
    }
    r.knight = { type: type, at: Math.max(from + wait, num(r.fx.quiet, 0)), purse: 1, seen: seen };
  }

  /** The loss share of a defeat: 10 % → toward 5 % with Scale, half with the frost breath. */
  function lossShare(state, cfg, noScale) {
    var scale = noScale ? 0 : state.run.q.scale * (species(state) === 'sand' ? cfg['species.sandScale'] : 1);
    var s = cfg['knight.lossMin'] + (cfg['knight.loss'] - cfg['knight.lossMin']) * Math.pow(cfg['knight.lossScaleStep'], scale);
    if (state.run.breath === 'frost') s *= cfg['breath.frostLoss'];
    return s;
  }

  /** The power the dragon fights with: curled ×1.5, away on a raid ×0.5 without the guard, fire ×1.3. */
  function combatPower(state, cfg, id, now, curl) {
    var d = knightDef(state, id);
    var D = power(state, cfg, { now: now, noScale: d.trait === 'scale', noFlame: d.trait === 'flame' });
    var m = 1;
    if (state.run.breath === 'fire') m *= cfg['breath.fire'];
    if (state.run.raid) {
      if (hall(state, 'grotto') < 1) m *= cfg['knight.unguarded'];
    } else if (state.run.curled || curl) {
      m *= cfg['knight.curl'];
    }
    return Big.mul(D, m);
  }

  /** What the next knight means: {type, title, at, K, D, p, seen, gong}. */
  function knightView(state, cfg, now) {
    var k = state.run.knight;
    if (!k) return null;
    var d = knightDef(state, k.type);
    var members = d.trait === 'group' ? cfg['knight.mercsCount'] : 1;
    var K = knightPower(state, cfg, k.type);
    var gong = gongWould(state, cfg, k.type, now);
    var D = combatPower(state, cfg, k.type, now, gong);
    var p = chance(D, K);
    return { type: k.type, title: d.title, text: d.text || '', at: k.at, K: K, D: D, p: p, members: members, gong: gong,
      seen: !!k.seen || now >= k.at - cfg['knight.previewSec'] * SEC, purse: k.purse || 1 };
  }

  function gongWould(state, cfg, id, now) {
    var r = state.run;
    if (!auto(state).gong || ageIndex(state, cfg) < 2 || r.raid || r.curled) return false;
    return Big.gt(knightPower(state, cfg, id), combatPower(state, cfg, id, now, false));
  }

  function takeTrophy(state, cfg, id, at) {
    var r = state.run;
    if (!id || r.trophies.indexOf(id) >= 0) return false;
    r.trophies.push(id);
    var have = state.meta.trophies = state.meta.trophies || {};
    have[id] = (have[id] || 0) + 1;
    addGems(state, cfg['trophy.gems']);
    if (r.away) r.away.trophies.push(id);
    pushLog(state, { at: at, k: 't', id: id });
    return true;
  }

  /** A trophy type not taken this age, at random from `rng`, or null. */
  function freeTrophy(state, rng) {
    var left = TROPHIES.filter(function (t) { return state.run.trophies.indexOf(t.id) < 0; });
    return left.length ? rng.pick(left).id : null;
  }

  function oneFight(state, cfg, at, ctx, id, part, gong) {
    var r = state.run;
    var d = knightDef(state, id);
    var K = knightPower(state, cfg, id);
    var D = combatPower(state, cfg, id, at, gong);
    var p = chance(D, K);
    r.fightCount++;
    var rng = stream(state, 'f', r.fightCount);
    var win = rng.next() < p;
    var amount;
    if (win) {
      var purseMult = (d.extra ? num(d.purse, 1) : id === 'miller' ? cfg['knight.millerPurse'] : 1) * num(r.knight && r.knight.purse, 1);
      amount = Big.mul(income(state, cfg, at), cfg['knight.purseMin'] * 60 * purseMult * part);
      gain(state, amount);
      r.wins++;
      state.meta.knightsWon = num(state.meta.knightsWon, 0) + 1;
      if (d.trait === 'fear') r.fear = Math.min(cfg['fear.max'], Math.max(1, r.fear) * cfg['knight.bardFear']);
      if (!d.extra && rng.next() < cfg['knight.trophyChance']) takeTrophy(state, cfg, d.trophy, at);
    } else {
      var exposed = Big.mul(r.gold, Math.max(0, 1 - hall(state, 'cache') * cfg['hall.cache.share']));
      amount = Big.mul(exposed, lossShare(state, cfg, d.trait === 'scale') * part);
      if (r.away) {
        var left = Big.max(0, Big.sub(r.away.cap, r.away.lost));
        amount = Big.min(amount, left);
        r.away.lost = Big.str(Big.add(r.away.lost, amount));
      }
      pay(state, amount);
      r.lost = Big.add(r.lost, amount);
      r.losses++;
      state.meta.knightsLost = num(state.meta.knightsLost, 0) + 1;
      r.woundedUntil = Math.max(num(r.woundedUntil, 0), at + cfg['knight.woundMin'] * MIN);
    }
    pushLog(state, { at: at, k: 'f', id: id, w: win, a: Big.str(amount), p: Math.round(p * 100), g: gong ? 1 : 0 });
    return win;
  }

  /** The knight at the door fights (a group of mercenaries — three fights: won when all are). */
  function fight(state, cfg, at, ctx) {
    var r = state.run;
    var id = r.knight.type;
    var d = knightDef(state, id);
    var gong = gongWould(state, cfg, id, at);
    var won = true;
    if (d.trait === 'group') {
      var n = cfg['knight.mercsCount'];
      for (var i = 0; i < n; i++) if (!oneFight(state, cfg, at, ctx, id, 1 / n, gong)) won = false;
    } else {
      won = oneFight(state, cfg, at, ctx, id, 1, gong);
    }
    if (r.away) {
      r.away.knights++;
      if (won) r.away.wins++;
      else r.away.losses++;
    }
  }

  /** Ужас (the ancient dragon): once an age the knight at the door runs away without a fight. */
  function terror(state, cfg, now) {
    var r = state.run;
    if (ageIndex(state, cfg) < 3 || r.terror || !r.knight) return false;
    r.terror = true;
    pushLog(state, { at: now, k: 'x', id: r.knight.type });
    r.knight = null;
    schedule(state, cfg, now);
    return true;
  }

  // ---- raids ------------------------------------------------------------------------------------------

  function raidOf(n) { return RAIDS[n - 1] || null; }

  function wingsNeed(cfg, n) { return n > cfg['raid.wingsFrom'] ? cfg['raid.wingsPer'] * (n - cfg['raid.wingsFrom']) : 0; }

  /** Can the dragon fly to target n now: {ok, why}. */
  function raidAllowed(state, cfg, n, now) {
    var r = state.run;
    if (!raidOf(n)) return { ok: false, why: 'нет такой цели' };
    if (n > RAIDS_BY_AGE[ageIndex(state, cfg)]) return { ok: false, why: 'откроется с возрастом', age: true };
    if (r.q.wings < wingsNeed(cfg, n)) return { ok: false, why: 'нужны Крылья ' + wingsNeed(cfg, n), wings: true };
    if (n === 10 && on(state, 'tribute', now)) return { ok: false, why: 'столица платит дань' };
    if (r.raid) return { ok: false, why: 'дракон в набеге' };
    if (num(r.woundedUntil, 0) > now) return { ok: false, why: 'дракон ранен' };
    return { ok: true, why: '' };
  }

  function raidDuration(state, cfg, n) {
    var min = cfg['raid.' + n + '.min'] / (1 + cfg['raid.flameStep'] * state.run.q.flame);
    if (species(state) === 'storm') min *= cfg['species.stormRaid'];
    if (state.run.breath === 'storm') min *= cfg['breath.storm'];
    return min * MIN;
  }

  /** The defense of target n: its own from the settings, changed by the world of the age. */
  function raidDefense(state, cfg, n) { return Big.mul(cfg['raid.' + n + '.defense'], worldMod(state, cfg, 'defense')); }

  function raidChance(state, cfg, n) {
    var D = power(state, cfg);
    var def = raidDefense(state, cfg, n);
    return Big.toNumber(Big.div(D, Big.add(D, def)));
  }

  /** The loot of a raid: gold a second × its time × the target's multiplier and everything over it. */
  function raidLoot(state, cfg, n, now) {
    var t = raidOf(n);
    var m = num(cfg['raid.loot'], 1) * cfg['raid.' + n + '.mult'] * (1 + Math.min(1, num(state.run.fear, 0) / cfg['fear.max']) * cfg['fear.lootBonus']);
    m *= trophyBonus(state, cfg, 'raid') * worldMod(state, cfg, 'raids');
    if (t.caravan) m *= worldMod(state, cfg, 'caravans');
    if (t.port && species(state) === 'sea') m *= cfg['species.seaPort'];
    if (on(state, 'eclipse', now)) m *= cfg['event.eclipseMult'];
    if (state.run.breath === 'storm') m *= cfg['breath.stormLoot'];
    return Big.mul(income(state, cfg, now), (raidDuration(state, cfg, n) / SEC) * m);
  }

  function startRaid(state, cfg, n, now) {
    var r = state.run;
    if (!raidAllowed(state, cfg, n, now).ok) return false;
    r.curled = false;
    r.raidCount++;
    r.raid = { n: n, start: now, end: now + raidDuration(state, cfg, n), loot: Big.str(raidLoot(state, cfg, n, now)) };
    r.lastRaid = n;
    r.fear = Math.min(cfg['fear.max'], num(r.fear, 0) + (cfg['fear.perRaid'] + cfg['fear.perTarget'] * (n - 1)) * worldMod(state, cfg, 'fear'));
    return true;
  }

  function finishRaid(state, cfg, at, ctx) {
    var r = state.run;
    var raid = r.raid;
    var t = raidOf(raid.n);
    var ok = stream(state, 'r', r.raidCount).next() < raidChance(state, cfg, raid.n);
    var loot = ok ? Big.of(raid.loot) : Big.mul(raid.loot, cfg['raid.failShare']);
    gain(state, loot);
    var gotGems = 0;
    if (ok && t.gems) {
      gotGems = cfg['raid.' + raid.n + '.gems'];
      addGems(state, gotGems);
    }
    r.raid = null;
    r.raids++;
    if (ok) r.raidWins++;
    if (!ok) r.woundedUntil = Math.max(num(r.woundedUntil, 0), at + cfg['raid.woundMin'] * MIN);
    if (ok && t.trophy) {
      state.meta.capital = num(state.meta.capital, 0) + 1;
      var tr = freeTrophy(state, stream(state, 'c', r.raidCount));
      if (tr) takeTrophy(state, cfg, tr, at);
      else addGems(state, cfg['raid.10.gems']);
    }
    pushLog(state, { at: at, k: 'r', n: raid.n, w: ok, a: Big.str(loot), g: gotGems });
    if (r.away) r.away.raids.push({ n: raid.n, w: ok, a: Big.str(loot) });
    // Летописец набегов: the same target again, right from the moment of return.
    if (auto(state).raid && ageIndex(state, cfg) >= 1 && !r.curled) startRaid(state, cfg, r.lastRaid, at);
  }

  /** The steps' spend «долгий полёт»: the raid in flight becomes twice shorter. */
  function longFlight(state, now) {
    var raid = state.run.raid;
    if (!raid) return false;
    raid.end = Math.max(now, raid.start + (raid.end - raid.start) / 2);
    return true;
  }

  // ---- the clock: income, fear, raids, knights, the molt --------------------------------------------

  function nextTimer(state) {
    var r = state.run;
    var t = Infinity;
    if (r.knight) t = Math.min(t, r.knight.at);
    if (r.raid) t = Math.min(t, r.raid.end);
    ['molt', 'echo', 'tribute'].forEach(function (k) { if (num(r.fx[k], 0) > 0) t = Math.min(t, r.fx[k]); });
    return t;
  }

  /** What is due by `t`: in order of time — the end of a molt, a raid, a knight; then a knight is scheduled. */
  function timers(state, cfg, t, ctx) {
    var r = state.run;
    for (var guard = 0; guard < 500; guard++) {
      var molt = num(r.fx.molt, 0) > 0 && r.fx.molt <= t ? r.fx.molt : Infinity;
      var raid = r.raid && r.raid.end <= t ? r.raid.end : Infinity;
      var knight = r.knight && r.knight.at <= t ? r.knight.at : Infinity;
      var first = Math.min(molt, raid, knight);
      if (first === Infinity) break;
      if (first === molt) {
        r.fx.molt = 0;
        r.q.scale++;
      } else if (first === raid) {
        finishRaid(state, cfg, raid, ctx);
      } else {
        fight(state, cfg, knight, ctx);
        r.knight = null;
        schedule(state, cfg, knight);
      }
    }
    ['echo', 'tribute', 'eclipse', 'quiet'].forEach(function (k) { if (num(r.fx[k], 0) > 0 && r.fx[k] <= t) r.fx[k] = 0; });
    if (!r.knight) schedule(state, cfg, t);
  }

  /** Gold from t0 to t1 at the rate of t0, Fear fading; then what is due by t1. */
  function advance(state, cfg, t0, t1, ctx) {
    var r = state.run;
    var dt = Math.max(0, (t1 - t0) / SEC);
    if (dt > 0) {
      var m = num(ctx.mult, 1) * (ctx.offline ? offlineShare(state, cfg) : 1);
      gain(state, Big.mul(income(state, cfg, t0), dt * m));
      r.fear = Math.max(0, num(r.fear, 0) - cfg['fear.decayPerHour'] * dt / 3600);
    }
    timers(state, cfg, t1, ctx);
  }

  function ensureAway(state, cfg, from) {
    var r = state.run;
    if (r.away) return r.away;
    r.away = { from: from, gold0: Big.str(r.gold), cap: Big.str(Big.mul(r.gold, cfg['knights.offlineLossCap'])), lost: '0e0',
      knights: 0, wins: 0, losses: 0, trophies: [], raids: [] };
    return r.away;
  }

  // ---- online: events and the elder kobold --------------------------------------------------------------

  function age(state, cfg) { return ageIndex(state, cfg); }

  function eligible(state, cfg, ev, now) {
    var r = state.run;
    if (ev.age && age(state, cfg) < ev.age) return false;
    if ((ev.id === 'rumor' || ev.id === 'quiet' || ev.id === 'prophecy') && !r.knight) return false;
    if (ev.id === 'prophecy' && r.queue && r.queue.length) return false;
    if (ev.id === 'envoys' && on(state, 'tribute', now)) return false;
    if (ev.id === 'rival' && Big.lt(r.gold, threshold(state, cfg))) return false;
    if (ev.id === 'molt' && on(state, 'molt', now)) return false;
    return true;
  }

  /** An online event every 2–3 minutes: instant ones apply now (run.news), choices wait in run.event. */
  function rollEvent(state, cfg, now, rng) {
    var r = state.run;
    var list = EVENTS.filter(function (ev) { return eligible(state, cfg, ev, now); });
    r.nextEventAt = now + rng.range(cfg['event.minSec'], cfg['event.maxSec']) * SEC;
    if (!list.length) return null;
    var ev = rng.weighted(list, function (e) { return num(cfg['event.w.' + e.id], 1); }) || list[0];
    if (ev.choices) {
      r.event = { id: ev.id, at: now, until: now + cfg['event.choiceSec'] * SEC };
    } else {
      applyEvent(state, cfg, ev.id, null, now, rng);
    }
    return ev.id;
  }

  function applyEvent(state, cfg, id, choice, now, rng) {
    var r = state.run;
    var text = '';
    if (id === 'merchant') {
      var m = Big.mul(income(state, cfg, now), cfg['event.merchantMin'] * 60);
      gain(state, m);
      text = '+' + Fmt.num(m);
    } else if (id === 'gem') {
      addGems(state, cfg['event.gems']);
      text = '+' + cfg['event.gems'] + ' самоцвет';
    } else if (id === 'rumor') {
      if (r.knight) {
        r.knight.at = now + Math.max(0, r.knight.at - now) / 2;
        r.knight.purse = cfg['event.rumorPurse'];
      }
    } else if (id === 'echo') {
      r.fx.echo = now + cfg['event.echoSec'] * SEC;
    } else if (id === 'offering') {
      r.fear = Math.min(cfg['fear.max'], num(r.fear, 0) + cfg['event.offeringFear'] * worldMod(state, cfg, 'fear'));
      var o = Big.mul(income(state, cfg, now), cfg['event.offeringMin'] * 60);
      gain(state, o);
      text = '+' + Fmt.num(o);
    } else if (id === 'runaway') {
      if (choice === 'free') r.glitterBonus = num(r.glitterBonus, 0) + cfg['event.runawayGlitter'];
      else r.servants[0]++;
    } else if (id === 'sheep') {
      var ok = rng.next() < raidChance(state, cfg, 1);
      var loot = raidLoot(state, cfg, 1, now);
      if (!ok) loot = Big.mul(loot, cfg['raid.failShare']);
      gain(state, loot);
      text = (ok ? 'удачно: +' : 'неудачно: +') + Fmt.num(loot);
    } else if (id === 'rival') {
      if (choice === 'fight') {
        if (rng.next() < 0.5) {
          var tr = freeTrophy(state, rng);
          if (tr) takeTrophy(state, cfg, tr, now);
          else addGems(state, cfg['event.rivalGems']);
          text = 'соперник прогнан';
        } else {
          r.woundedUntil = Math.max(num(r.woundedUntil, 0), now + cfg['knight.woundMin'] * MIN);
          text = 'дракон ранен';
        }
      }
    } else if (id === 'vein') {
      var v = Big.mul(r.gold, cfg['event.veinShare']);
      gain(state, v);
      text = '+' + Fmt.num(v);
    } else if (id === 'quiet') {
      r.fx.quiet = now + cfg['event.quietMin'] * MIN;
      if (r.knight && r.knight.at < r.fx.quiet) r.knight.at = r.fx.quiet;
    } else if (id === 'prophecy') {
      r.queue = r.queue || [];
      if (r.knight) r.knight.seen = true;
      for (var i = 0; i < cfg['event.prophecyCount']; i++) {
        r.knightCount++;
        r.queue.push(pickType(state, cfg, r.knightCount));
      }
    } else if (id === 'rain') {
      if (choice === 'catch') r.fx.rain = now + cfg['rain.sec'] * SEC;
    } else if (id === 'envoys') {
      if (choice === 'accept') r.fx.tribute = now + cfg['event.tributeMin'] * MIN;
    } else if (id === 'eclipse') {
      r.fx.eclipse = now + cfg['event.eclipseMin'] * MIN;
    } else if (id === 'molt') {
      r.fx.molt = now + cfg['event.moltSec'] * SEC;
    }
    r.news = { id: id, at: now, c: choice || '', text: text };
    pushLog(state, { at: now, k: 'e', id: id, c: choice || '', t: text });
  }

  /** The owner answers the waiting event (choice — an id of its choices; null or 0 — the first). */
  function answer(state, cfg, choice, now, rng) {
    var r = state.run;
    if (!r.event) return false;
    var ev = find(EVENTS, r.event.id);
    var c = choice;
    if (!c || typeof c === 'number') c = ev.choices ? ev.choices[num(choice, 0)][0] : null;
    r.event = null;
    applyEvent(state, cfg, ev.id, c, now, rng);
    return true;
  }

  /** A coin of the golden rain caught: gold of rain.coinSec seconds. */
  function rainCoin(state, cfg, now) {
    // A coin still falling when the time is out counts: two seconds of grace.
    if (!(num(state.run.fx.rain, 0) + 2000 > now)) return Big.ZERO;
    var a = Big.mul(income(state, cfg, now), cfg['rain.coinSec']);
    gain(state, a);
    state.meta.rainCoins = num(state.meta.rainCoins, 0) + 1;
    return a;
  }

  /** Старший кобольд: buys servants while a servant costs no more than auto.buyShare of the pile. */
  function autoBuy(state, cfg) {
    var n = 0;
    for (var i = 0; i < 20; i++) {
      var k = bestServant(state, cfg);
      if (k < 0) break;
      if (Big.gt(servantCost(state, cfg, k, 1), Big.mul(state.run.gold, cfg['auto.buyShare']))) break;
      if (!buyServant(state, cfg, k, 1)) break;
      n++;
    }
    return n;
  }

  function online(state, cfg, now, rng) {
    var r = state.run;
    if (!rng) return;
    if (r.event && now > r.event.until) {
      var ev = find(EVENTS, r.event.id);
      r.event = null;
      applyEvent(state, cfg, ev.id, ev.choices ? ev.choices[ev.choices.length - 1][0] : null, now, rng);
    }
    if (!r.nextEventAt) r.nextEventAt = now + rng.range(cfg['event.minSec'], cfg['event.maxSec']) * SEC;
    else if (now >= r.nextEventAt && !r.event && rng) rollEvent(state, cfg, now, rng);
    if (auto(state).buy && age(state, cfg) >= 1 && now >= num(r.autoAt, 0)) {
      r.autoAt = now + SEC;
      autoBuy(state, cfg);
    }
  }

  // ---- the bot of the checks (and of the tests) -------------------------------------------------------

  /** Buys power until the dragon wins the next knight (a wanderer when none is coming) with `target`. */
  function holdPower(state, cfg, now, target) {
    var r = state.run;
    var type = r.knight ? r.knight.type : 'wanderer';
    var d = knightDef(state, type);
    var n = 0;
    for (var i = 0; i < 60; i++) {
      var D = power(state, cfg, { now: now, noScale: d.trait === 'scale', noFlame: d.trait === 'flame' });
      if (state.run.breath === 'fire') D = Big.mul(D, cfg['breath.fire']);
      if (chance(D, knightPower(state, cfg, type)) >= target) break;
      var q = cheapestQuality(state, cfg, d.trait);
      if (!buyQuality(state, cfg, q)) break;
      n++;
    }
    return n;
  }

  /** The best target for a raid of at most `maxMin` minutes with success at least `minChance`, or 0. */
  function bestRaid(state, cfg, now, maxMin, minChance) {
    var best = 0;
    for (var n = 1; n <= RAIDS.length; n++) {
      if (!raidAllowed(state, cfg, n, now).ok) continue;
      if (raidDuration(state, cfg, n) > maxMin * MIN) continue;
      if (raidChance(state, cfg, n) < minChance) continue;
      best = n;
    }
    return best;
  }

  /**
   * One second of the bot: answers events, catches the rain, holds the power (o.power: false — never
   * buys it), buys servants, flies the best short raid when no knight comes meanwhile. Returns the
   * count of purchases.
   */
  function botPlay(state, cfg, now, rng, o) {
    o = o || {};
    var r = state.run;
    var n = 0;
    if (r.event && rng) answer(state, cfg, 0, now, rng);
    if (on(state, 'rain', now)) for (var c = 0; c < 2; c++) rainCoin(state, cfg, now);
    if (o.power !== false) n += holdPower(state, cfg, now, o.target || 0.8);
    // o.keep: a hoarder buys a servant only while it costs no more than this share of the pile.
    for (var b = 0; b < 80; b++) {
      var k = bestServant(state, cfg);
      if (k < 0) break;
      if (o.keep && Big.gte(r.gold, threshold(state, cfg)) && Big.gt(servantCost(state, cfg, k, 1), Big.mul(r.gold, o.keep))) break;
      if (!buyServant(state, cfg, k, 1)) break;
      n++;
    }
    if (o.raids !== false && !r.raid) {
      // Back before the next knight (or when there is none yet).
      var limit = o.raidMin || 30;
      if (r.knight) limit = Math.min(limit, (r.knight.at - now) / MIN);
      var t = bestRaid(state, cfg, now, limit, o.raidChance || 0.7);
      if (t) startRaid(state, cfg, t, now);
    }
    return n;
  }

  // ---- the functions the engine calls -----------------------------------------------------------------

  function pickWorld(rng) { return { id: rng ? rng.pick(WORLDS).id : 'orders' }; }

  function init(ctx) {
    var cfg = ctx.config || {};
    var rng = ctx.rng;
    var start = Big.of(cfg['start.gold'] === undefined ? 20 : cfg['start.gold']);
    return {
      run: {
        gold: Big.str(start), earned: '0e0', hmax: Big.str(start), servants: [0, 0, 0, 0, 0, 0, 0, 0],
        q: { claws: 0, scale: 0, flame: 0, wings: 0 }, spentPower: '0e0',
        fear: 0, curled: false, raid: null, lastRaid: 1, woundedUntil: 0,
        knight: null, queue: [], knightCount: 0, fightCount: 0, raidCount: 0,
        wins: 0, losses: 0, lost: '0e0', raids: 0, raidWins: 0,
        trophies: [], glitterBonus: 0, breath: null, terror: false,
        fx: { echo: 0, tribute: 0, eclipse: 0, quiet: 0, molt: 0, rain: 0 },
        event: null, news: null, nextEventAt: 0, autoAt: 0,
        log: [], world: pickWorld(rng), seed: rng ? rng.int(1000000000) : 1, away: null
      },
      layers: {
        sleep: { state: { sleeps: 0, halls: { grotto: 0, bones: 0, nest: 0, mirror: 0, sanctum: 0, cache: 0 } } },
        clutch: { state: { species: 'cave', next: 'cave', bloodTotal: 0 } }
      },
      meta: { gems: '0e0', trophies: {}, chronicle: [], knightsWon: 0, knightsLost: 0, capital: 0, rainCoins: 0, extraKnights: [], auto: { buy: true, raid: true, gong: true } }
    };
  }

  function tick(state, dt, ctx) {
    var cfg = ctx.config;
    var now = ctx.now;
    if (ctx.offline) ensureAway(state, cfg, now - dt * SEC);
    else state.run.away = null;
    advance(state, cfg, now - dt * SEC, now, ctx);
    if (!ctx.offline) online(state, cfg, now, ctx.rng);
  }

  /** The same as tick for `sec` seconds at once: from timer to timer, in pieces of offline.chunkSec. */
  function offline(state, sec, ctx) {
    var cfg = ctx.config;
    var end = ctx.now;
    var t = end - sec * SEC;
    ensureAway(state, cfg, t);
    var chunk = Math.max(1, cfg['offline.chunkSec']) * SEC;
    for (var guard = 0; t < end && guard < 100000; guard++) {
      var next = Math.min(end, t + chunk, Math.max(t + 1, nextTimer(state)));
      advance(state, cfg, t, next, ctx);
      t = next;
    }
    return { events: [] };
  }

  /** Lines of the summary «Пока вас не было» from what the absence counted (the screen adds them). */
  function awaySummary(state, cfg, now) {
    var a = state.run.away;
    var out = [];
    if (!a) return out;
    out.push('Куча: ' + Fmt.num(a.gold0) + ' → ' + Fmt.num(state.run.gold));
    if (a.knights) {
      out.push('Рыцарей: ' + a.knights + ' — побед ' + a.wins + ', поражений ' + a.losses + (Big.gt(a.lost, 0) ? ', унесли ' + Fmt.num(a.lost) : ''));
    }
    // One line per trophy: a line is translated as a whole («Трофей: {}»), a list would not be.
    a.trophies.forEach(function (id) { out.push('Трофей: ' + find(TROPHIES, id).title); });
    if (a.raids.length) {
      var w = a.raids.filter(function (x) { return x.w; }).length;
      var sum = a.raids.reduce(function (s, x) { return Big.add(s, x.a); }, Big.ZERO);
      var last = raidOf(a.raids[a.raids.length - 1].n);
      out.push('Набеги: ' + a.raids.length + ' (удачных ' + w + '), добыча ' + Fmt.num(sum) + (a.raids.length === 1 ? ' — «' + last.title + '»' : ''));
    }
    var hint = advice(state, cfg, now);
    if (hint) out.push(hint);
    return out;
  }

  /** «Следующий рыцарь — Королевский чемпион, шанс 62 %: подкрепите Чешую». */
  function advice(state, cfg, now) {
    var v = knightView(state, cfg, now);
    if (!v) return '';
    var pct = Math.round(v.p * 100);
    var acc = { claws: 'Когти', scale: 'Чешую', flame: 'Пламя', wings: 'Крылья' };
    var what = acc[cheapestQuality(state, cfg, knightDef(state, v.type).trait)];
    return 'Следующий рыцарь — ' + v.title + ', шанс ' + pct + ' %' + (pct < 80 ? ': подкрепите ' + what : '');
  }

  function prestigeGain(state, layerId, cfg) {
    if (layerId === SLEEP) {
      var lg = Big.log10(Big.max(state.run.hmax, 1));
      if (!(lg >= cfg['antiquity.from'])) return Big.ZERO;
      var x = Math.floor(Math.pow(lg - cfg['antiquity.base'], 2) / cfg['antiquity.div']);
      return Big.of(Math.floor(x * (1 + hall(state, 'sanctum') * cfg['hall.sanctum.bonus'])));
    }
    if (layerId === CLUTCH) {
      if (ageIndex(state, cfg) < 5) return Big.ZERO;
      return Big.floor(Big.sqrt(Big.div(Big.of(layer(state, SLEEP).currency, 0), cfg['blood.div'])));
    }
    return Big.ZERO;
  }

  function bonus(state, layerId, amount, cfg) {
    if (layerId === SLEEP) return Big.add(1, Big.mul(amount, cfg['antiquity.gold']));
    return Big.pow(cfg['blood.mult'], Math.min(1e6, num(Big.toNumber(Big.of(amount, 0)), 0)));
  }

  function onPrestige(state, layerId, before, ctx) {
    var cfg = ctx.config;
    var r = before.run;
    var chron = state.meta.chronicle = state.meta.chronicle || [];
    if (layerId === SLEEP) {
      var s = lstate(state, SLEEP);
      s.sleeps = num(s.sleeps, 0) + 1;
      var halls = s.halls = s.halls || {};
      HALLS.forEach(function (h) { halls[h.id] = Math.floor(num(halls[h.id], 0) / 2); });
      var w = before.run.world || {};
      chron.push({
        n: num(state.layers[SLEEP].count, 1), kind: 'sleep', at: ctx.now, age: AGES[ageIndex(before, cfg)].title,
        world: w.id === 'custom' ? w.title : (find(WORLDS, w.id) || WORLDS[0]).title, hmax: Big.str(r.hmax),
        wins: r.wins, losses: r.losses, raids: r.raids, trophies: r.trophies.slice(), gain: Big.str(Big.sub(state.layers[SLEEP].currency, before.layers[SLEEP].currency))
      });
    } else if (layerId === CLUTCH) {
      var c = lstate(state, CLUTCH);
      c.species = c.next && find(SPECIES, c.next) ? c.next : 'cave';
      c.bloodTotal = num(c.bloodTotal, 0) + Big.toNumber(Big.sub(state.layers[CLUTCH].currency, before.layers[CLUTCH].currency));
      chron.push({ n: num(state.layers[CLUTCH].count, 1), kind: 'clutch', at: ctx.now, species: find(SPECIES, c.species).title, gain: Big.str(Big.sub(state.layers[CLUTCH].currency, before.layers[CLUTCH].currency)) });
    }
    if (chron.length > 60) state.meta.chronicle = chron.slice(-60);
  }

  /** Species unlocked by all the Blood ever got. */
  function speciesOpen(state, cfg) {
    var total = Math.max(num(lstate(state, CLUTCH).bloodTotal, 0), blood(state));
    return SPECIES.filter(function (s) { return s.id === 'cave' || total >= cfg['species.' + s.id + 'Blood']; }).map(function (s) { return s.id; });
  }

  function chooseSpecies(state, cfg, id) {
    if (speciesOpen(state, cfg).indexOf(id) < 0) return false;
    lstate(state, CLUTCH).next = id;
    return true;
  }

  function hallCost(state, cfg, id) {
    return Math.ceil(cfg['hall.' + id + '.cost'] * Math.pow(cfg['hall.' + id + '.growth'], hall(state, id)));
  }

  /** The levels a hall may have: 0 — without an end (the price grows), else `hall.<id>.max`. */
  function hallMax(cfg, id) { return Math.max(0, Math.floor(num(cfg['hall.' + id + '.max'], 0))); }

  function hallFull(state, cfg, id) {
    var max = hallMax(cfg, id);
    return max > 0 && hall(state, id) >= max;
  }

  function buyHall(state, cfg, id) {
    if (ageIndex(state, cfg) < 1 || !find(HALLS, id)) return false;
    if (hallFull(state, cfg, id)) return false;
    var price = hallCost(state, cfg, id);
    if (Big.lt(gems(state), price)) return false;
    addGems(state, -price);
    var s = lstate(state, SLEEP);
    s.halls = s.halls || {};
    s.halls[id] = hall(state, id) + 1;
    return true;
  }

  function migrate(state, fromVer) { return state; }

  function validate(state) {
    var r = state.run;
    if (!Array.isArray(r.servants) || r.servants.length !== SERVANTS.length) return 'слуги не список из 8';
    for (var i = 0; i < r.servants.length; i++) {
      if (typeof r.servants[i] !== 'number' || r.servants[i] < 0 || r.servants[i] % 1 !== 0) return 'слуг не целое число: ' + r.servants[i];
    }
    if (!r.q || typeof r.q.claws !== 'number') return 'нет качеств дракона';
    if (!Big.valid(r.gold) || Big.sign(r.gold) < 0) return 'куча меньше нуля';
    if (!Big.valid(state.meta.gems) || Big.sign(state.meta.gems) < 0) return 'самоцветов меньше нуля';
    return null;
  }

  function summary(state, cfg) {
    var parts = ['куча ' + Fmt.num(state.run.gold), Fmt.rate(income(state, cfg, state.lastTick || 0)), AGES[ageIndex(state, cfg)].title];
    if (state.run.raid) parts.push('в набеге');
    return { line: parts.join(' · ') };
  }

  /** Notifications: a knight with a chance below half is coming; the raid is over. */
  function next(state, now, cfg) {
    var out = [];
    var v = knightView(state, cfg, now);
    if (v && v.p < 0.5 && v.at > now) {
      out.push({ id: 'knight', at: Math.max(now, v.at - cfg['knight.previewSec'] * SEC), text: 'Идёт ' + v.title + ', шанс ' + Math.round(v.p * 100) + ' %' });
    }
    if (state.run.raid && state.run.raid.end > now) {
      out.push({ id: 'raid', at: state.run.raid.end, text: 'Дракон вернулся: «' + raidOf(state.run.raid.n).title + '»' });
    }
    return out;
  }

  /** The chest of «Пассажир»: «дань с дороги» — the loot of the raid chest.target at once. */
  function chest(state, rng, cfg) {
    var n = cfg['chest.target'];
    var amount = Big.max(raidLoot(state, cfg, n, state.lastTick || 0), Big.mul(cfg['start.gold'], 10));
    gain(state, amount);
    pushLog(state, { at: state.lastTick || 0, k: 'c', a: Big.str(amount) });
    return { title: 'Дань с дороги: «' + raidOf(n).title + '»', items: [{ title: 'Золото', amount: amount }] };
  }

  // ---- the content stock -------------------------------------------------------------------------------------

  var BALLAD = {
    open: ['Пой, струна, о драконе горы', 'Старики у огня говорят', 'Было то в век, что звали', 'Над холмами дым и звон'],
    mid: ['пришли к нему {рыцарей} в железе — {побед} ушли ни с чем', 'куча росла до {куча} монет, и блеск её видели с моря',
      'в {мир} рыцари шли гурьбой, а дракон лишь зевал', 'он прятал в кости трофеи: {трофеи}'],
    end: ['И уснул он на век — проснётся древнее.', 'Спи, гора, — твой страж не дремлет.', 'А монеты звенят до сих пор.', 'Кто услышит звон — тот и найдёт.']
  };

  var WORLD_WORDS = {
    a: ['Век', 'Пора', 'Время', 'Эпоха'],
    b: ['холодных костров', 'пустых трактов', 'серебряных шпор', 'гнилых мостов', 'длинных зим', 'тихих колоколов'],
    text: ['Рыцари злее, зато и добыча богаче.', 'Рыцарей мало, но каждый — упрямец.', 'Дороги опустели: набеги скромнее.', 'Страх разносится вдвое быстрее.']
  };

  /** Without the model: a ballad of fragments, a world of words, a knight of parts. */
  function procedural(kind, rng) {
    if (kind === 'ballads') {
      return { title: rng.pick(['Баллада о куче', 'Песнь горы', 'Сказ о драконе', 'Колыбельная для рыцарей']),
        text: rng.pick(BALLAD.open) + ', — ' + rng.pick(BALLAD.mid) + '. ' + rng.pick(BALLAD.end), procedural: true };
    }
    if (kind === 'worlds') {
      return { title: rng.pick(WORLD_WORDS.a) + ' ' + rng.pick(WORLD_WORDS.b), text: rng.pick(WORLD_WORDS.text),
        knights: Math.round(rng.range(0.8, 1.4) * 10) / 10, raids: Math.round(rng.range(0.8, 1.8) * 10) / 10,
        interval: Math.round(rng.range(0.8, 1.3) * 10) / 10, fear: Math.round(rng.range(0.6, 1.4) * 10) / 10,
        defense: Math.round(rng.range(0.7, 1.4) * 10) / 10, procedural: true };
    }
    if (kind === 'knights') {
      return { title: rng.pick(['Рыцарь', 'Барон', 'Паломник', 'Капитан']) + ' ' + rng.pick(['с медным щитом', 'на хромом коне', 'из-за реки', 'без шлема', 'с фонарём']),
        text: rng.pick(['дерётся честно', 'долго кричит у входа', 'пришёл за славой']),
        mult: Math.round(rng.range(0.6, 1.6) * 10) / 10, purse: 1, trait: 'none', procedural: true };
    }
    if (kind === 'tales') return null;
    return null;
  }

  var PLACEHOLDER = /\{([^}]*)\}/g;
  var ALLOWED = { 'рыцарей': 1, 'побед': 1, 'поражений': 1, 'куча': 1, 'мир': 1, 'трофеи': 1 };

  function validateStock(kind, item) {
    var text = JSON.stringify(item);
    if (/https?:|www\./i.test(text)) return 'ссылка в тексте';
    if (kind === 'ballads') {
      var m;
      PLACEHOLDER.lastIndex = 0;
      while ((m = PLACEHOLDER.exec(String(item.text || '')))) if (!ALLOWED[m[1]]) return 'неизвестная подстановка {' + m[1] + '}';
    }
    if (kind === 'knights' && item.trait && ['none', 'scale', 'flame', 'fear'].indexOf(item.trait) < 0) return 'неизвестная черта';
    return null;
  }

  /** A ballad with the facts of an age put in. */
  function ballad(item, entry) {
    if (!item) return null;
    var facts = {
      'рыцарей': String((entry.wins || 0) + (entry.losses || 0)), 'побед': String(entry.wins || 0), 'поражений': String(entry.losses || 0),
      'куча': Fmt.num(entry.hmax || 0), 'мир': String(entry.world || ''),
      'трофеи': entry.trophies && entry.trophies.length ? entry.trophies.map(function (id) { return (find(TROPHIES, id) || { title: id }).title.toLowerCase(); }).join(', ') : 'ничего'
    };
    var text = String(item.text || '').replace(PLACEHOLDER, function (all, key) { return facts[key] !== undefined ? facts[key] : all; });
    return { title: String(item.title || 'Баллада'), text: text, model: !item.procedural };
  }

  /** A knight type from the model's stock joins the knights of every next age. */
  function addKnight(state, cfg, item) {
    if (!item || !item.title) return false;
    var list = state.meta.extraKnights = state.meta.extraKnights || [];
    var id = 'x' + Rng.hash(String(item.title)).toString(36);
    if (list.some(function (k) { return k.id === id; })) return false;
    list.push({ id: id, title: String(item.title).slice(0, 40), text: String(item.text || '').slice(0, 90),
      mult: Math.max(0.3, Math.min(2.5, num(item.mult, 1))), purse: Math.max(1, Math.min(3, num(item.purse, 1))),
      trait: ['scale', 'flame', 'fear'].indexOf(item.trait) >= 0 ? item.trait : 'none' });
    if (list.length > cfg['knight.extraMax']) state.meta.extraKnights = list.slice(-cfg['knight.extraMax']);
    return true;
  }

  return {
    SLEEP: SLEEP, CLUTCH: CLUTCH,
    SERVANTS: SERVANTS, QUALITIES: QUALITIES, RAIDS: RAIDS, KNIGHTS: KNIGHTS, TROPHIES: TROPHIES, HALLS: HALLS, AGES: AGES,
    RAIDS_BY_AGE: RAIDS_BY_AGE, WORLDS: WORLDS, SPECIES: SPECIES, BREATHS: BREATHS, EVENTS: EVENTS,
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, next: next, chest: chest,
    procedural: procedural, validateStock: validateStock,
    income: income, baseIncome: baseIncome, glitter: glitter, goldMult: goldMult, offlineShare: offlineShare,
    servantCost: servantCost, servantRate: servantRate, servantsOpen: servantsOpen, servantsAffordable: servantsAffordable,
    buyServant: buyServant, bestServant: bestServant, buy: buy, cost: function (state, cfg) { var k = bestServant(state, cfg); return servantCost(state, cfg, Math.max(0, k), 1); },
    nextMilestone: nextMilestone, milestoneMult: milestoneMult, hallMax: hallMax, hallFull: hallFull,
    power: power, levels: levels, qualityCost: qualityCost, buyQuality: buyQuality, cheapestQuality: cheapestQuality,
    knightPower: knightPower, knightView: knightView, knightDef: knightDef, knightList: knightList, knightInterval: knightInterval,
    chance: chance, combatPower: combatPower, lossShare: lossShare, threshold: threshold, terror: terror,
    raidOf: raidOf, raidAllowed: raidAllowed, raidDuration: raidDuration, raidChance: raidChance, raidDefense: raidDefense, raidLoot: raidLoot,
    startRaid: startRaid, longFlight: longFlight, wingsNeed: wingsNeed, setCurl: setCurl,
    answer: answer, rollEvent: rollEvent, rainCoin: rainCoin, autoBuy: autoBuy,
    ageIndex: ageIndex, sleeps: sleeps, hall: hall, hallCost: hallCost, buyHall: buyHall, gems: gems, addGems: addGems,
    antiquity: antiquity, blood: blood, species: species, speciesOpen: speciesOpen, chooseSpecies: chooseSpecies,
    breathe: breathe, worldOf: worldOf, setWorld: setWorld, worldMod: worldMod, auto: auto, trophyBonus: trophyBonus,
    awaySummary: awaySummary, advice: advice, ballad: ballad, addKnight: addKnight, on: on,
    holdPower: holdPower, bestRaid: bestRaid, botPlay: botPlay, applyEvent: applyEvent, pickType: pickType
  };
});
