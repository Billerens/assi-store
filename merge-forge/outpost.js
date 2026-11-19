// Living companions of the forge. Shared ES5, no engine I/O and no global damage multipliers.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('./upgrade-progress.js'), require('./artifacts.js')) : make(root.Big, root.MFUpgradeProgress, root.MFArtifacts);
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; }
  else root.MFOutpost = api;
})(this, function (Big, UpgradeProgress, Artifacts) {
  'use strict';

  var HEROS = [
    { id: 'bran', title: 'Бран', description: 'Хранитель ворот: открывает броню для следующего удара.', ability: 'Раскол' },
    { id: 'veya', title: 'Вея', description: 'Дуэлянтка: готовит сильный ответный выпад.', ability: 'Рипост' },
    { id: 'eira', title: 'Эйра', description: 'Рунная кузница: сочетает закалки и подавляет восстановление.', ability: 'Печать стихий' },
    { id: 'corvin', title: 'Корвин', description: 'Охотник за трофеями: отмечает противника ради дополнительной награды.', ability: 'Метка добычи' }
  ];
  var PETS = [
    { id: 'salamander', title: 'Саламандра', description: 'Жар ручной ковки помогает закончить следующую поковку.' },
    { id: 'fox', title: 'Часовая лиса', description: 'После серии слияний помогает горну и замечает подходящие пары.' },
    { id: 'raven', title: 'Ворон-торговец', description: 'Повышает награду заказов; опыт усиливает торговую помощь.' },
    { id: 'turtle', title: 'Руническая черепаха', description: 'Защищает залп от заклинателя; на третьем ранге — дважды за встречу.' }
  ];
  var TEMPERS = [
    { id: 'fire', title: 'Раскалённая', description: 'Подавляет восстановление противника.' },
    { id: 'ice', title: 'Ледяная', description: 'Помогает сдерживать опасную подготовку врага.' },
    { id: 'resonant', title: 'Звонкая', description: 'Поддерживает сильный удар отряда.' }
  ];
  var FORMS = [
    { id: 'ash', title: 'Пепельный', description: 'Снимает панцирь и подавляет восстановление огнём.' },
    { id: 'frost', title: 'Иней', description: 'Меньше прямого урона, дольше сдерживает босса и заклинателя.' },
    { id: 'storm', title: 'Грозовой', description: 'На 10% больше суммарного урона, но 40% приходят эхом следующего залпа.' }
  ];
  var MOLT_PERKS = [
    { id: 'strength', title: 'Глубокое дыхание', description: 'Урон дыхания растёт, максимум три ступени.' },
    { id: 'ember', title: 'Бережный жар', description: 'Дыхание требует меньше жара, максимум три ступени.' }
  ];
  var TALENTS = {
    bran: [
      { rank: 3, choices: [{ id: 'heavy', title: 'Тяжёлый раскол', description: 'Раскол наносит больше собственного урона.', effect: 'hit' }, { id: 'cadence', title: 'Выверенный ритм', description: 'Раскол быстрее восстанавливается.', effect: 'cooldown' }] },
      { rank: 6, choices: [{ id: 'opening', title: 'Открытая брешь', description: 'Подготавливает небольшое усиление следующего залпа.', effect: 'opening' }, { id: 'embers', title: 'Угольный след', description: 'После приёма противник временно не восстанавливается.', effect: 'suppress' }] },
      { rank: 10, choices: [{ id: 'challenge', title: 'Личный вызов', description: 'Сильнее бьёт босса.', effect: 'boss' }, { id: 'echo', title: 'Звон щита', description: 'Часть силы героя отзывается в следующем залпе.', effect: 'echo' }] }
    ],
    veya: [
      { rank: 3, choices: [{ id: 'swift', title: 'Лёгкая стойка', description: 'Рипост быстрее восстанавливается.', effect: 'cooldown' }, { id: 'duel', title: 'Точный выпад', description: 'Рипост наносит больше собственного урона.', effect: 'hit' }] },
      { rank: 6, choices: [{ id: 'counter', title: 'Чтение замаха', description: 'Дополнительная награда за точный рипост в окно заклинателя.', effect: 'riposte' }, { id: 'echo', title: 'Второй росчерк', description: 'Часть силы героя отзывается в следующем залпе.', effect: 'echo' }] },
      { rank: 10, choices: [{ id: 'finish', title: 'Дуэль до конца', description: 'Сильнее бьёт босса.', effect: 'boss' }, { id: 'opening', title: 'Удобный момент', description: 'Подготавливает небольшое усиление следующего залпа.', effect: 'opening' }] }
    ],
    eira: [
      { rank: 3, choices: [{ id: 'frost', title: 'Холодная печать', description: 'Ледяной контроль длится дольше.', effect: 'slow' }, { id: 'embers', title: 'Несгораемая печать', description: 'Дольше подавляет восстановление противника.', effect: 'suppress' }] },
      { rank: 6, choices: [{ id: 'prism', title: 'Призма', description: 'Часть силы героя отзывается в следующем залпе.', effect: 'echo' }, { id: 'opening', title: 'Согласие рун', description: 'Подготавливает небольшое усиление следующего залпа.', effect: 'opening' }] },
      { rank: 10, choices: [{ id: 'flow', title: 'Течение стихий', description: 'Печать быстрее восстанавливается.', effect: 'cooldown' }, { id: 'overload', title: 'Перегрузка', description: 'Печать наносит больше собственного урона.', effect: 'hit' }] }
    ],
    corvin: [
      { rank: 3, choices: [{ id: 'bounty', title: 'Щедрый трофей', description: 'Метка даёт немного больше золота за одну победу.', effect: 'mark' }, { id: 'keen', title: 'Острый глаз', description: 'Метка наносит больше собственного урона.', effect: 'hit' }] },
      { rank: 6, choices: [{ id: 'pace', title: 'Быстрый след', description: 'Метка быстрее восстанавливается.', effect: 'cooldown' }, { id: 'scout', title: 'Связи охотника', description: 'Вооружённый Корвин в отряде повышает награды заказов.', effect: 'contract' }] },
      { rank: 10, choices: [{ id: 'trophy', title: 'Крупная добыча', description: 'Сильнее бьёт босса.', effect: 'boss' }, { id: 'opening', title: 'Слабое место', description: 'Подготавливает небольшое усиление следующего залпа.', effect: 'opening' }] }
    ]
  };
  // Mirrors the shipped configuration: old callers without the new defaults remain safe.
  var DEFAULTS = {
    'outpost.hero.wave': 11, 'outpost.pet.wave': 20, 'outpost.temper.wave': 20, 'outpost.dragon.wave': 30,
    'outpost.rack.size': 4, 'outpost.hero.xpStep': 12, 'outpost.hero.xpKnee': 120,
    'outpost.hero.masteryMax': 0.25, 'outpost.hero.killXp': 1, 'outpost.hero.bossXp': 3,
    'outpost.bran.hit': 2, 'outpost.bran.cooldown': 18,
    'outpost.veya.hit': 3, 'outpost.veya.cooldown': 16,
    'outpost.temper.base': 75, 'outpost.temper.growth': 1.6,
    'outpost.salamander.taps': 12, 'outpost.salamander.seconds': 0.5,
    'outpost.fox.merges': 3, 'outpost.fox.seconds': 0.75, 'outpost.pet.xpStep': 50,
    'outpost.dragon.share': 0.1, 'outpost.dragon.cap': 1,
    'outpost.dragon.queue': 3, 'outpost.dragon.digestSec': 20,
    'outpost.dragon.hatch': 3, 'outpost.dragon.adult': 20, 'outpost.dragon.gap': 3, 'outpost.dragon.perRun': 6,
    'outpost.dragon.chargeMax': 100, 'outpost.dragon.feedCharge': 12, 'outpost.dragon.killCharge': 4,
    'outpost.dragon.hit': 3, 'outpost.dragon.cooldown': 30,
    'outpost.mf.dragonCare.step': 0.08, 'outpost.mf.dragonCare.soft': 6,
    'outpost.mf.rhythm.step': 0.08, 'outpost.mf.rhythm.soft': 6,
    'outpost.eira.wave': 40, 'outpost.corvin.wave': 50, 'outpost.raven.wave': 40, 'outpost.turtle.wave': 50,
    'outpost.eira.hit': 2, 'outpost.eira.cooldown': 20, 'outpost.corvin.hit': 2, 'outpost.corvin.cooldown': 22,
    'outpost.eira.suppressSec': 5, 'outpost.eira.slowSec': 3, 'outpost.eira.echoShare': 0.25, 'outpost.corvin.markShare': 0.08,
    'outpost.talent.hit': 0.15, 'outpost.talent.cooldown': 0.12, 'outpost.talent.opening': 0.04,
    'outpost.talent.suppressSec': 4, 'outpost.talent.slowSec': 2, 'outpost.talent.boss': 0.25,
    'outpost.talent.echo': 0.2, 'outpost.talent.riposte': 0.25, 'outpost.talent.mark': 0.03, 'outpost.talent.contract': 0.05,
    'outpost.raven.bonus': 0.05, 'outpost.raven.mastery': 0.05, 'outpost.raven.xpKnee': 200,
    'outpost.forms.wave': 50, 'outpost.frost.hitShare': 0.7, 'outpost.frost.slowSec': 6, 'outpost.frost.slowStrength': 0.5,
    'outpost.storm.directShare': 0.6, 'outpost.storm.echoShare': 0.4,
    'outpost.dragon.storm.mult': 1.1,
    'outpost.turtle.wardXp': 1, 'outpost.turtle.secondWardRank': 3, 'outpost.turtle.maxWards': 2,
    'outpost.molt.wave': 80, 'outpost.molt.waveStep': 20, 'outpost.molt.feedStep': 20,
    'outpost.molt.costShare': 0.25, 'outpost.molt.perkMax': 3, 'outpost.molt.strength': 0.08, 'outpost.molt.ember': 0.05
  };
  function finite(value, fallback) { var n = Number(value); return isFinite(n) ? n : fallback; }
  function setting(cfg, name) { return finite(cfg && cfg[name], DEFAULTS[name]); }
  function integer(value) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value; }
  function has(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return true; return false; }
  function fail(reason) { return { ok: false, reason: reason }; }
  function copyGear(gear) { return gear ? { level: gear.level, temper: gear.temper || '' } : null; }
  function validGear(gear) { return gear && integer(gear.level) && gear.level >= 1 && gear.level <= 1000 && (!gear.temper || has(TEMPERS, gear.temper)); }
  function mf(state, key) {
    var l = state.layers && state.layers.forge;
    return Math.max(0, finite(l && l.state && l.state.mf && l.state.mf[key], 0));
  }
  function masteryBonus(state, cfg, id) {
    var n = mf(state, id);
    var knee = Math.max(1, setting(cfg, 'outpost.mf.' + id + '.soft'));
    var effective = n <= knee ? n : knee * (1 + Math.log(n / knee));
    return 1 + effective * setting(cfg, 'outpost.mf.' + id + '.step');
  }
  function wave(state) {
    var f = state.layers && state.layers.forge;
    return Math.max(1, finite(state.run.maxWave, 1), finite(f && f.state && f.state.record, 0), finite(state.meta.outpost && state.meta.outpost.seenWave, 0));
  }
  function initialAnchor(state) {
    var result = 1;
    (state.run.grid || []).concat(state.run.pending || []).forEach(function (level) {
      if (integer(level) && level > result && level <= 1000) result = level;
    });
    return result;
  }
  function ensure(state) {
    state.meta = state.meta || {};
    var m = state.meta.outpost = state.meta.outpost || {};
    m.heroes = m.heroes || {};
    HEROS.forEach(function (h) {
      var hero = m.heroes[h.id] = m.heroes[h.id] || {};
      if (hero.unlocked === undefined) hero.unlocked = false;
      if (hero.xp === undefined) hero.xp = 0;
      if (hero.talents === undefined) hero.talents = {};
    });
    if (m.heroes.eira.attunement === undefined) m.heroes.eira.attunement = 'fire';
    if (m.selected === undefined) m.selected = '';
    if (m.squad === undefined) {
      // v2 had at most Bran and Veya. Additional recruits must never appear automatically.
      m.squad = [];
      if (m.selected && m.heroes[m.selected] && m.heroes[m.selected].unlocked) m.squad.push(m.selected);
      if (slots(state) > 1) ['bran', 'veya'].forEach(function (id) {
        if (m.heroes[id].unlocked && m.squad.indexOf(id) < 0 && m.squad.length < slots(state)) m.squad.push(id);
      });
    }
    if (m.pet === undefined) m.pet = '';
    m.petXp = m.petXp || {};
    PETS.forEach(function (p) { if (m.petXp[p.id] === undefined) m.petXp[p.id] = 0; });
    m.dragon = m.dragon || {};
    if (m.dragon.absorbed === undefined) m.dragon.absorbed = '0e0';
    if (m.dragon.fed === undefined) m.dragon.fed = 0;
    if (m.dragon.form === undefined) m.dragon.form = 'ash';
    if (m.dragon.lineage === undefined) m.dragon.lineage = 0;
    if (m.dragon.moltRecord === undefined) m.dragon.moltRecord = 0;
    if (m.dragon.moltFed === undefined) m.dragon.moltFed = 0;
    if (m.dragon.perks === undefined) m.dragon.perks = { strength: 0, ember: 0 };
    m.seenWave = wave(state);
    var r = state.run.outpost = state.run.outpost || {};
    r.equipment = r.equipment || {};
    HEROS.forEach(function (h) { if (r.equipment[h.id] === undefined) r.equipment[h.id] = null; });
    r.rack = r.rack || [];
    r.cooldowns = r.cooldowns || {};
    HEROS.map(function (h) { return h.id; }).concat(['dragon']).forEach(function (id) { if (r.cooldowns[id] === undefined) r.cooldowns[id] = 0; });
    r.pet = r.pet || { heat: 0, merges: 0 };
    if (r.pet.heat === undefined) r.pet.heat = 0;
    if (r.pet.merges === undefined) r.pet.merges = 0;
    r.dragon = r.dragon || {};
    if (r.dragon.anchorLevel === undefined) r.dragon.anchorLevel = initialAnchor(state);
    r.dragon.queue = r.dragon.queue || [];
    if (r.dragon.charge === undefined) r.dragon.charge = 0;
    // Blades given to the dragon in this run; the count starts over with the forge.
    if (r.dragon.eaten === undefined) r.dragon.eaten = 0;
    return state;
  }
  function available(state, cfg) {
    ensure(state);
    var w = wave(state);
    return { heroes: w >= setting(cfg, 'outpost.hero.wave'), pets: w >= setting(cfg, 'outpost.pet.wave'), tempers: w >= setting(cfg, 'outpost.temper.wave'), dragon: w >= setting(cfg, 'outpost.dragon.wave') };
  }
  function slots(state) { return mf(state, 'command') > 0 && mf(state, 'team') > 0 ? 3 : mf(state, 'team') > 0 ? 2 : 1; }
  function activeIds(state) {
    var m = state.meta.outpost;
    return (m.squad || []).filter(function (id) { return has(HEROS, id) && m.heroes[id] && m.heroes[id].unlocked; }).slice(0, slots(state));
  }
  function heroWave(cfg, id) { return id === 'eira' || id === 'corvin' ? setting(cfg, 'outpost.' + id + '.wave') : setting(cfg, 'outpost.hero.wave'); }
  function petWave(cfg, id) { return id === 'raven' || id === 'turtle' ? setting(cfg, 'outpost.' + id + '.wave') : setting(cfg, 'outpost.pet.wave'); }
  function heroLevel(state, cfg, id) {
    return 1 + Math.floor(Math.sqrt(Math.max(0, finite(state.meta.outpost.heroes[id].xp, 0)) / Math.max(1, setting(cfg, 'outpost.hero.xpStep'))));
  }
  function pendingHero(state, id) {
    var encounter = state.run.encounter;
    var pending = encounter && encounter.pending;
    if (!Array.isArray(pending)) return false;
    for (var i = 0; i < pending.length; i++) if (pending[i] && pending[i].id === id) return true;
    return false;
  }
  function recruit(state, cfg, id) {
    ensure(state);
    if (!has(HEROS, id)) return fail('Неизвестный герой');
    if (wave(state) < heroWave(cfg, id)) return fail('Этот герой пока не открыт');
    var m = state.meta.outpost;
    if (m.heroes[id].unlocked) return fail('Герой уже в отряде');
    m.heroes[id].unlocked = true;
    if (!m.selected) m.selected = id;
    if (m.squad.length < slots(state)) m.squad.push(id);
    return { ok: true, id: id };
  }
  function selectHero(state, cfg, id, replaceId) {
    ensure(state);
    var m = state.meta.outpost;
    if (!has(HEROS, id) || !m.heroes[id].unlocked) return fail('Сначала пригласите героя');
    var ids = activeIds(state);
    if (ids.indexOf(id) >= 0) { m.selected = id; return { ok: true, id: id }; }
    if (ids.length >= slots(state)) {
      if (!replaceId && slots(state) === 1) replaceId = ids[0];
      if (ids.indexOf(replaceId) < 0) return fail('Выберите, кого заменить в отряде');
      if (pendingHero(state, replaceId)) return fail('Дождитесь подготовленного удара героя');
      ids[ids.indexOf(replaceId)] = id;
    } else ids.push(id);
    m.squad = ids;
    m.selected = id;
    return { ok: true, id: id };
  }
  function reserveHero(state, cfg, id) {
    ensure(state);
    var m = state.meta.outpost;
    var ids = activeIds(state);
    if (ids.indexOf(id) < 0) return fail('Герой уже в резерве');
    if (pendingHero(state, id)) return fail('Дождитесь подготовленного удара героя');
    ids.splice(ids.indexOf(id), 1);
    m.squad = ids;
    if (m.selected === id) m.selected = ids[0] || '';
    return { ok: true, id: id };
  }
  function selectedTalent(state, cfg, id, rank) {
    if (heroLevel(state, cfg, id) < rank) return null;
    var selected = state.meta.outpost.heroes[id].talents[rank];
    var tiers = TALENTS[id] || [];
    for (var i = 0; i < tiers.length; i++) if (tiers[i].rank === rank) {
      for (var j = 0; j < tiers[i].choices.length; j++) if (tiers[i].choices[j].id === selected) return tiers[i].choices[j];
    }
    return null;
  }
  function talentEffects(state, cfg, id) {
    var out = { hit: 0, cooldown: 0, opening: 0, suppress: 0, slow: 0, boss: 0, echo: 0, riposte: 0, mark: 0, contract: 0 };
    (TALENTS[id] || []).forEach(function (tier) {
      var choice = selectedTalent(state, cfg, id, tier.rank);
      if (!choice) return;
      var key = choice.effect;
      var settingKey = key === 'suppress' ? 'suppressSec' : key === 'slow' ? 'slowSec' : key;
      out[key] += Math.max(0, setting(cfg, 'outpost.talent.' + settingKey));
    });
    return out;
  }
  function chooseTalent(state, cfg, id, rank, choiceId) {
    ensure(state);
    if (!has(HEROS, id) || !state.meta.outpost.heroes[id].unlocked) return fail('Сначала пригласите героя');
    if (pendingHero(state, id) || state.run.outpost.cooldowns[id] > 0) return fail('Смените талант после восстановления приёма');
    var tiers = TALENTS[id];
    var choice = null;
    for (var i = 0; i < tiers.length; i++) if (tiers[i].rank === rank) {
      for (var j = 0; j < tiers[i].choices.length; j++) if (tiers[i].choices[j].id === choiceId) choice = tiers[i].choices[j];
    }
    if (!choice || heroLevel(state, cfg, id) < rank) return fail('Этот талант пока не открыт');
    state.meta.outpost.heroes[id].talents[rank] = choiceId;
    return { ok: true, id: id, rank: rank, choice: choiceId };
  }
  function rackCapacity(state, cfg) { return Math.max(1, Math.floor(setting(cfg, 'outpost.rack.size'))) + Math.min(4, mf(state, 'rack')); }
  function openCell(state, cell, cells) { return integer(cell) && Array.isArray(cells) && cells.indexOf(cell) >= 0 && cell >= 0 && cell < state.run.grid.length; }
  function equip(state, cfg, cell, id, cells) {
    ensure(state);
    if (!has(HEROS, id) || !state.meta.outpost.heroes[id].unlocked) return fail('Сначала пригласите героя');
    if (pendingHero(state, id)) return fail('Дождитесь подготовленного удара героя');
    if (!openCell(state, cell, cells) || !state.run.grid[cell]) return fail('Выберите клинок на открытой клетке');
    var r = state.run.outpost;
    var old = r.equipment[id];
    var level = state.run.grid[cell];
    if (!integer(level) || level < 1 || level > 1000) return fail('Некорректный клинок');
    if (old && old.temper && r.rack.length >= rackCapacity(state, cfg)) return fail('На стойке нет места для закалённого оружия');
    var next = { level: level, temper: '' };
    if (old && old.temper) r.rack.push(copyGear(old));
    state.run.grid[cell] = old && !old.temper ? old.level : 0;
    r.equipment[id] = next;
    return { ok: true, id: id, level: level };
  }
  function unequip(state, cfg, id, cells) {
    ensure(state);
    if (!has(HEROS, id)) return fail('Неизвестный герой');
    if (pendingHero(state, id)) return fail('Дождитесь подготовленного удара героя');
    var r = state.run.outpost;
    var old = r.equipment[id];
    if (!old) return fail('У героя нет оружия');
    var free = -1;
    (cells || []).some(function (cell) { if (openCell(state, cell, cells) && !state.run.grid[cell]) { free = cell; return true; } return false; });
    if (!old.temper && free >= 0) {
      state.run.grid[free] = old.level;
    } else {
      if (r.rack.length >= rackCapacity(state, cfg)) return fail('На стойке нет места');
      r.rack.push(copyGear(old));
    }
    r.equipment[id] = null;
    return { ok: true, id: id };
  }
  function equipRack(state, cfg, index, id) {
    ensure(state);
    if (!has(HEROS, id) || !state.meta.outpost.heroes[id].unlocked) return fail('Сначала пригласите героя');
    if (pendingHero(state, id)) return fail('Дождитесь подготовленного удара героя');
    var r = state.run.outpost;
    if (!integer(index) || index < 0 || index >= r.rack.length) return fail('Оружие на стойке уже изменилось');
    var next = copyGear(r.rack[index]);
    if (!validGear(next)) return fail('Некорректный клинок');
    var old = copyGear(r.equipment[id]);
    if (old) r.rack[index] = old;
    else r.rack.splice(index, 1);
    r.equipment[id] = next;
    return { ok: true, id: id, level: next.level };
  }
  /** Explicitly strips a stored temper and returns the same blade level to a free open cell. */
  function releaseRack(state, cfg, index, cells) {
    ensure(state);
    var r = state.run.outpost;
    if (!integer(index) || index < 0 || index >= r.rack.length) return fail('Оружие на стойке уже изменилось');
    var gear = r.rack[index];
    if (!validGear(gear)) return fail('Некорректный клинок');
    var free = -1;
    (cells || []).some(function (cell) { if (openCell(state, cell, cells) && !state.run.grid[cell]) { free = cell; return true; } return false; });
    if (free < 0) return fail('Освободите клетку на наковальне');
    var result = { ok: true, level: gear.level, removedTemper: gear.temper || '', cell: free };
    state.run.grid[free] = gear.level;
    r.rack.splice(index, 1);
    return result;
  }
  function temperCost(state, cfg, id) {
    ensure(state);
    var gear = state.run.outpost.equipment[id];
    if (!gear) return Big.ZERO;
    return Big.ceil(Big.mul(setting(cfg, 'outpost.temper.base'), Big.pow(setting(cfg, 'outpost.temper.growth'), gear.level - 1)));
  }
  function temper(state, cfg, id, kind) {
    ensure(state);
    if (!has(HEROS, id) || !has(TEMPERS, kind)) return fail('Неизвестная закалка');
    if (pendingHero(state, id)) return fail('Дождитесь подготовленного удара героя');
    if (!available(state, cfg).tempers) return fail('Закалка пока не открыта');
    var gear = state.run.outpost.equipment[id];
    if (!gear) return fail('Сначала выдайте герою клинок');
    if (gear.temper === kind) return fail('Эта закалка уже нанесена');
    var price = temperCost(state, cfg, id);
    if (Big.lt(state.run.gold, price)) return fail('Недостаточно золота');
    var gold = Big.str(Big.sub(state.run.gold, price));
    gear.temper = kind;
    state.run.gold = gold;
    return { ok: true, id: id, temper: kind, price: Big.str(price) };
  }
  function choosePet(state, cfg, id) {
    ensure(state);
    if (!has(PETS, id)) return fail('Неизвестный питомец');
    if (wave(state) < petWave(cfg, id)) return fail('Этот питомец пока не открыт');
    state.meta.outpost.pet = id;
    return { ok: true, id: id };
  }
  function addXp(holder, key, amount) { holder[key] = Math.min(1e15, Math.max(0, finite(holder[key], 0)) + Math.max(0, amount)); }
  function rewardPet(state, cfg, amount, natural) {
    ensure(state);
    var id = state.meta.outpost.pet;
    if (!has(PETS, id) || wave(state) < petWave(cfg, id)) return false;
    addXp(state.meta.outpost.petXp, id, amount * (natural === false ? 1 : 1 + Artifacts.modifiers(state, cfg).petXp));
    return true;
  }
  function onTap(state, cfg) {
    ensure(state);
    if (state.meta.outpost.pet !== 'salamander' || !available(state, cfg).pets) return 0;
    var p = state.run.outpost.pet;
    rewardPet(state, cfg, 1);
    p.heat += masteryBonus(state, cfg, 'rhythm');
    var threshold = Math.max(1, setting(cfg, 'outpost.salamander.taps'));
    var charges = Math.floor(p.heat / threshold);
    p.heat -= charges * threshold;
    return charges * Math.max(0, setting(cfg, 'outpost.salamander.seconds'));
  }
  function onMerge(state, cfg) {
    ensure(state);
    if (state.meta.outpost.pet !== 'fox' || !available(state, cfg).pets) return 0;
    var p = state.run.outpost.pet;
    rewardPet(state, cfg, 1);
    p.merges += masteryBonus(state, cfg, 'rhythm');
    var threshold = Math.max(1, setting(cfg, 'outpost.fox.merges'));
    var charges = Math.floor(p.merges / threshold);
    p.merges -= charges * threshold;
    return charges * Math.max(0, setting(cfg, 'outpost.fox.seconds'));
  }
  function basePower(cfg, level) {
    return Big.mul(finite(cfg && cfg['blade.dmg'], 1), Big.pow(finite(cfg && cfg['blade.dmgGrowth'], 2.35), Math.max(0, level - 1)));
  }
  function heroPower(state, cfg, id, options) {
    var gear = state.run.outpost.equipment[id];
    if (!gear) return Big.ZERO;
    var xp = Math.max(0, finite(state.meta.outpost.heroes[id].xp, 0));
    var mastery = 1 + setting(cfg, 'outpost.hero.masteryMax') * xp / (xp + Math.max(1, setting(cfg, 'outpost.hero.xpKnee')));
    var upgrades = state.run.up || {};
    var local = 1;
    if (gear.level >= finite(cfg['temper.fromLevel'], Infinity)) local *= 1 + finite(cfg['up.temper.step'], 0) * UpgradeProgress.effective('temper', finite(upgrades.temper, 0), cfg);
    // Equipment keeps bought blade bonuses. Expected crit avoids additional RNG draws and
    // applies here once; the battle only rolls per-cell crits for weapons still on the field.
    // The perks of the 50th and 100th upgrade levels count as they do for a blade on the field.
    var perks = UpgradeProgress.perkTotals(upgrades, cfg);
    var chance = Math.min(finite(cfg['crit.maxChance'], 1), finite(cfg['crit.chance'], 0) + finite(upgrades.eye, 0) * finite(cfg['up.eye.step'], 0) + perks.critChance);
    var critical = (finite(cfg['crit.mult'], 1) + UpgradeProgress.effective('hand', finite(upgrades.hand, 0), cfg) * finite(cfg['up.hand.step'], 0)) * perks.critMult;
    var crit = Artifacts.criticalStats(state, cfg, chance, critical, options);
    local *= 1 + crit.chance * (crit.multiplier - 1);
    return Big.mul(basePower(cfg, gear.level), mastery * local);
  }
  function noteForged(state, level) {
    ensure(state);
    if (integer(level) && level >= 1 && level <= 1000) state.run.outpost.dragon.anchorLevel = Math.max(state.run.outpost.dragon.anchorLevel, level);
  }
  function dragonPowerFor(state, cfg, absorbed, fed) {
    if (fed < setting(cfg, 'outpost.dragon.hatch')) return Big.ZERO;
    var cap = Big.mul(basePower(cfg, state.run.outpost.dragon.anchorLevel), setting(cfg, 'outpost.dragon.cap'));
    var q = Big.of(absorbed, 0);
    if (Big.isZero(q) || Big.isZero(cap)) return Big.ZERO;
    return Big.div(Big.mul(cap, q), Big.add(cap, q));
  }
  function dragonPower(state, cfg) {
    ensure(state);
    var d = state.meta.outpost.dragon;
    return dragonPowerFor(state, cfg, d.absorbed, d.fed);
  }
  /**
   * The strongest blade the dragon takes: a few levels below the best one forged in this run, so
   * the blades that carry a run cannot be turned into lasting power just before a reforge.
   */
  function feedMaxLevel(state, cfg) {
    ensure(state);
    return state.run.outpost.dragon.anchorLevel - Math.max(0, Math.floor(setting(cfg, 'outpost.dragon.gap')));
  }
  /** Blades the dragon takes in one run: the setting, and more with the relic. */
  function feedLimit(state, cfg) {
    return Math.max(0, Math.floor(setting(cfg, 'outpost.dragon.perRun'))) + Math.round(Artifacts.modifiers(state, cfg).dragonMeals || 0);
  }
  function queueCapacity(cfg) { return Math.max(1, Math.min(20, Math.floor(setting(cfg, 'outpost.dragon.queue')))); }
  function digestSpeed(state, cfg) { return masteryBonus(state, cfg, 'dragonCare') * (1 + Artifacts.modifiers(state, cfg).dragonDigest); }
  function feedPreview(state, cfg, cell, cells) {
    ensure(state);
    if (!available(state, cfg).dragon) return fail('Яйцо дракона пока не найдено');
    if (!openCell(state, cell, cells) || !state.run.grid[cell]) return fail('Выберите клинок на открытой клетке');
    var level = state.run.grid[cell];
    if (!integer(level) || level < 1 || level > 1000) return fail('Некорректный клинок');
    var r = state.run.outpost.dragon;
    if (r.eaten >= feedLimit(state, cfg)) return fail('Дракон сыт до перековки');
    if (level > feedMaxLevel(state, cfg)) return fail('Выберите клинок слабее');
    if (r.queue.length >= queueCapacity(cfg)) return fail('Очередь кормления заполнена');
    var d = state.meta.outpost.dragon;
    var absorbed = Big.mul(basePower(cfg, level), setting(cfg, 'outpost.dragon.share'));
    var pending = Big.of(d.absorbed);
    r.queue.forEach(function (meal) { pending = Big.add(pending, Big.mul(basePower(cfg, meal.level), setting(cfg, 'outpost.dragon.share'))); });
    var seconds = Math.max(0.1, setting(cfg, 'outpost.dragon.digestSec'));
    return { ok: true, level: level, absorbed: Big.str(absorbed), powerBefore: Big.str(dragonPower(state, cfg)), powerAfter: Big.str(dragonPowerFor(state, cfg, Big.add(pending, absorbed), d.fed + r.queue.length + 1)), seconds: seconds / digestSpeed(state, cfg), workSeconds: seconds };
  }
  function feed(state, cfg, cell, cells) {
    var preview = feedPreview(state, cfg, cell, cells);
    if (!preview.ok) return preview;
    state.run.outpost.dragon.queue.push({ level: preview.level, left: preview.workSeconds });
    state.run.outpost.dragon.eaten++;
    state.run.grid[cell] = 0;
    return preview;
  }
  function tick(state, dt, cfg, options) {
    ensure(state);
    dt = Math.max(0, finite(dt, 0));
    var r = state.run.outpost;
    HEROS.map(function (h) { return h.id; }).concat(['dragon']).forEach(function (id) { r.cooldowns[id] = Math.max(0, finite(r.cooldowns[id], 0) - dt); });
    var result = digest(state, dt, cfg);
    result.offline = !!(options && options.offline);
    return result;
  }
  function digest(state, dt, cfg) {
    ensure(state);
    var r = state.run.outpost, d = state.meta.outpost.dragon, artifacts = Artifacts.modifiers(state, cfg);
    var left = Math.max(0, finite(dt, 0)) * digestSpeed(state, cfg);
    var fed = 0;
    var gain = Big.ZERO;
    // The queue is bounded and only explicitly offered weapons are processed offline.
    while (r.dragon.queue.length && left > 0 && fed < 20) {
      var meal = r.dragon.queue[0];
      var spent = Math.min(left, Math.max(0, meal.left));
      meal.left = Math.max(0, meal.left - spent);
      left -= spent;
      if (meal.left > 1e-9) break;
      var power = Big.mul(basePower(cfg, meal.level), setting(cfg, 'outpost.dragon.share'));
      var total = Big.str(Big.add(d.absorbed, power));
      r.dragon.queue.shift();
      d.absorbed = total;
      d.fed++;
      r.dragon.charge = Math.min(setting(cfg, 'outpost.dragon.chargeMax'), r.dragon.charge + setting(cfg, 'outpost.dragon.feedCharge') * (1 + artifacts.dragonCharge));
      gain = Big.add(gain, power);
      fed++;
    }
    return { fed: fed, absorbed: Big.str(gain) };
  }
  function onKill(state, cfg, boss) {
    ensure(state);
    var m = state.meta.outpost;
    var artifacts = Artifacts.modifiers(state, cfg);
    activeIds(state).forEach(function (id) {
      if (state.run.outpost.equipment[id]) addXp(m.heroes[id], 'xp', setting(cfg, boss ? 'outpost.hero.bossXp' : 'outpost.hero.killXp') * (1 + artifacts.heroXp));
    });
    if (m.dragon.fed >= setting(cfg, 'outpost.dragon.hatch')) {
      var d = state.run.outpost.dragon;
      d.charge = Math.min(setting(cfg, 'outpost.dragon.chargeMax'), d.charge + setting(cfg, 'outpost.dragon.killCharge') * (1 + artifacts.dragonCharge));
    }
  }
  function passivePower(state, cfg, options) {
    ensure(state);
    var sum = dragonPower(state, cfg);
    activeIds(state).forEach(function (id) { sum = Big.add(sum, heroPower(state, cfg, id, options)); });
    return sum;
  }
  function elements(state, cfg) {
    ensure(state);
    var out = { fire: false, ice: false, resonant: false };
    activeIds(state).forEach(function (id) { var gear = state.run.outpost.equipment[id]; if (gear && has(TEMPERS, gear.temper)) out[gear.temper] = true; });
    return out;
  }
  function setAttunement(state, cfg, kind) {
    ensure(state);
    if (!state.meta.outpost.heroes.eira.unlocked || !has(TEMPERS, kind)) return fail('Сначала пригласите рунную кузницу');
    if (pendingHero(state, 'eira') || state.run.outpost.cooldowns.eira > 0) return fail('Смените стихию после восстановления печати');
    state.meta.outpost.heroes.eira.attunement = kind;
    return { ok: true, temper: kind };
  }
  function benefits(state, cfg) {
    ensure(state);
    var m = state.meta.outpost;
    var contract = 0;
    if (m.pet === 'raven' && wave(state) >= petWave(cfg, 'raven')) {
      var xp = Math.max(0, finite(m.petXp.raven, 0));
      contract += Math.max(0, setting(cfg, 'outpost.raven.bonus')) + Math.max(0, setting(cfg, 'outpost.raven.mastery')) * xp / (xp + Math.max(1, setting(cfg, 'outpost.raven.xpKnee')));
    }
    if (activeIds(state).indexOf('corvin') >= 0 && state.run.outpost.equipment.corvin) contract += talentEffects(state, cfg, 'corvin').contract;
    var turtle = m.pet === 'turtle' && wave(state) >= petWave(cfg, 'turtle');
    var rank = Math.min(3, 1 + Math.floor(m.petXp.turtle / Math.max(1, setting(cfg, 'outpost.pet.xpStep'))));
    var wards = turtle ? rank >= setting(cfg, 'outpost.turtle.secondWardRank') ? Math.max(1, Math.min(2, Math.floor(setting(cfg, 'outpost.turtle.maxWards')))) : 1 : 0;
    return { contractBonus: Math.min(0.3, contract), casterWard: turtle, casterWards: wards };
  }
  /** Called by the encounter only after a snapshotted turtle ward was actually spent. */
  function onWard(state, cfg) { ensure(state); addXp(state.meta.outpost.petXp, 'turtle', setting(cfg, 'outpost.turtle.wardXp') * (1 + Artifacts.modifiers(state, cfg).petXp)); }
  function onContract(state, cfg) {
    ensure(state);
    if (state.meta.outpost.pet === 'raven') rewardPet(state, cfg, 1);
  }
  function formUnlocked(state, cfg, id) {
    return id === 'ash' || (wave(state) >= setting(cfg, 'outpost.forms.wave') && state.meta.outpost.dragon.fed >= setting(cfg, 'outpost.dragon.adult'));
  }
  function selectForm(state, cfg, id) {
    ensure(state);
    if (!has(FORMS, id) || !formUnlocked(state, cfg, id)) return fail('Эта форма дракона пока не открыта');
    if (pendingHero(state, 'dragon') || state.run.outpost.cooldowns.dragon > 0) return fail('Смените форму после восстановления дыхания');
    state.meta.outpost.dragon.form = id;
    return { ok: true, form: id };
  }
  function perkLevel(state, key) { return Math.max(0, Math.min(3, finite(state.meta.outpost.dragon.perks[key], 0))); }
  function breathCost(state, cfg) {
    return Math.max(1, setting(cfg, 'outpost.dragon.chargeMax') * (1 - Math.min(0.3, perkLevel(state, 'ember') * setting(cfg, 'outpost.molt.ember'))));
  }
  function moltPreview(state, cfg) {
    ensure(state);
    var d = state.meta.outpost.dragon;
    var nextWave = Math.max(setting(cfg, 'outpost.molt.wave'), d.moltRecord + setting(cfg, 'outpost.molt.waveStep'));
    var nextFed = d.moltFed + setting(cfg, 'outpost.molt.feedStep');
    var cap = Math.max(1, Math.min(3, Math.floor(setting(cfg, 'outpost.molt.perkMax'))));
    var cost = Big.mul(d.absorbed, Math.max(0, Math.min(0.9, setting(cfg, 'outpost.molt.costShare'))));
    var after = Big.str(Big.sub(d.absorbed, cost));
    var perks = MOLT_PERKS.map(function (p) { return { id: p.id, title: p.title, description: p.description, level: perkLevel(state, p.id), max: cap }; });
    var reason = '';
    if (wave(state) < nextWave) reason = 'Для линьки нужен новый рекорд волн';
    else if (d.fed < Math.max(nextFed, setting(cfg, 'outpost.dragon.adult'))) reason = 'Дракону нужно завершить ещё кормления';
    else if (pendingHero(state, 'dragon') || state.run.outpost.cooldowns.dragon > 0) reason = 'Дождитесь восстановления дыхания';
    else if (!Big.gt(d.absorbed, 0) || !Big.gt(cost, 0)) reason = 'Для линьки нужна усвоенная сила';
    else if (perks.every(function (p) { return p.level >= p.max; })) reason = 'Все ступени линьки уже изучены';
    return { ok: !reason, reason: reason, cost: Big.str(cost), costShare: setting(cfg, 'outpost.molt.costShare'), absorbedAfter: after,
      powerAfter: Big.str(dragonPowerFor(state, cfg, after, d.fed)), nextWave: nextWave, nextFed: nextFed, perks: perks };
  }
  function molt(state, cfg, perk) {
    var preview = moltPreview(state, cfg);
    if (!preview.ok) return fail(preview.reason);
    var selected = null;
    preview.perks.forEach(function (p) { if (p.id === perk) selected = p; });
    if (!selected || selected.level >= selected.max) return fail('Выберите доступную ступень линьки');
    var d = state.meta.outpost.dragon;
    d.absorbed = preview.absorbedAfter;
    d.lineage++;
    d.moltRecord = wave(state);
    d.moltFed = d.fed;
    d.perks[perk] = selected.level + 1;
    return { ok: true, perk: perk, lineage: d.lineage, cost: preview.cost };
  }
  function active(state, cfg, id) {
    ensure(state);
    var r = state.run.outpost;
    if (id === 'dragon') {
      if (!available(state, cfg).dragon || state.meta.outpost.dragon.fed < setting(cfg, 'outpost.dragon.hatch')) return fail('Дракон ещё не вылупился');
      if (r.cooldowns.dragon > 0) return fail('Дыхание восстанавливается');
      var cost = breathCost(state, cfg);
      if (r.dragon.charge < cost) return fail('Дракону нужно накопить жар');
      var form = state.meta.outpost.dragon.form;
      var raw = Big.mul(dragonPower(state, cfg), setting(cfg, 'outpost.dragon.hit') * (1 + perkLevel(state, 'strength') * setting(cfg, 'outpost.molt.strength')));
      var breath = { ok: true, id: id, damage: Big.str(raw), temper: 'fire', breakArmor: true, slowSec: 0, resonant: false, form: form };
      if (form === 'frost') {
        breath.damage = Big.str(Big.mul(raw, setting(cfg, 'outpost.frost.hitShare')));
        breath.temper = 'ice'; breath.breakArmor = false; breath.slowSec = setting(cfg, 'outpost.frost.slowSec'); breath.slowStrength = setting(cfg, 'outpost.frost.slowStrength');
      } else if (form === 'storm') {
        // A small fixed damage premium pays for delayed output; echo never feeds itself.
        raw = Big.mul(raw, setting(cfg, 'outpost.dragon.storm.mult'));
        var direct = Math.max(0, Math.min(1, setting(cfg, 'outpost.storm.directShare')));
        var echo = Math.max(0, Math.min(1 - direct, setting(cfg, 'outpost.storm.echoShare')));
        breath.damage = Big.str(Big.mul(raw, direct));
        breath.echoDamage = Big.str(Big.mul(raw, echo));
        breath.temper = ''; breath.breakArmor = false; breath.resonant = true;
      }
      r.dragon.charge = Math.max(0, r.dragon.charge - cost);
      r.cooldowns.dragon = setting(cfg, 'outpost.dragon.cooldown');
      return breath;
    }
    if (!has(HEROS, id) || activeIds(state).indexOf(id) < 0) return fail('Герой сейчас не в бою');
    var weapon = r.equipment[id];
    if (!weapon) return fail('Выдайте герою оружие');
    if (r.cooldowns[id] > 0) return fail('Приём восстанавливается');
    var talents = talentEffects(state, cfg, id);
    var hit = Big.str(Big.mul(heroPower(state, cfg, id), setting(cfg, 'outpost.' + id + '.hit') * (1 + talents.hit)));
    var temper = id === 'eira' ? state.meta.outpost.heroes.eira.attunement : weapon.temper || '';
    var result = { ok: true, id: id, damage: hit, temper: temper, breakArmor: id === 'bran',
      slowSec: (temper === 'ice' ? id === 'eira' ? setting(cfg, 'outpost.eira.slowSec') : 1 : 0) + talents.slow,
      resonant: temper === 'resonant', bossBonus: talents.boss, openingBonus: talents.opening,
      suppressRegenSec: (id === 'eira' && temper === 'fire' ? setting(cfg, 'outpost.eira.suppressSec') : 0) + talents.suppress,
      echoShare: talents.echo + (id === 'eira' && temper === 'resonant' ? setting(cfg, 'outpost.eira.echoShare') : 0),
      riposteBonus: talents.riposte, markGoldShare: id === 'corvin' ? Math.min(0.15, setting(cfg, 'outpost.corvin.markShare') + talents.mark) : 0,
      heroPower: Big.str(heroPower(state, cfg, id)) };
    r.cooldowns[id] = Math.max(0.1, setting(cfg, 'outpost.' + id + '.cooldown') * Math.max(0.5, 1 - talents.cooldown));
    return result;
  }
  function onPrestige(state, before) {
    // Core already preserves meta. Only run-owned gear and timers reset with the forge.
    var m = state.meta.outpost;
    var squad = (m.squad || []).filter(function (id) { return has(HEROS, id) && m.heroes[id].unlocked; });
    if (squad.indexOf(m.selected) >= 0) { squad.splice(squad.indexOf(m.selected), 1); squad.unshift(m.selected); }
    m.squad = squad.slice(0, slots(state));
    m.selected = m.squad[0] || '';
    state.run.outpost = undefined;
    ensure(state);
    return state;
  }
  function model(state, cfg) {
    ensure(state);
    var m = state.meta.outpost;
    var r = state.run.outpost;
    var unlocks = available(state, cfg);
    var activeHeroes = activeIds(state);
    var heroes = HEROS.map(function (h) {
      var own = m.heroes[h.id];
      var level = heroLevel(state, cfg, h.id);
      var ready = !pendingHero(state, h.id) && r.cooldowns[h.id] <= 0;
      var talents = (TALENTS[h.id] || []).map(function (tier) {
        return { rank: tier.rank, unlocked: !!own.unlocked && level >= tier.rank, selected: own.talents[tier.rank] || '',
          choices: tier.choices.map(function (choice) {
            var key = choice.effect === 'suppress' ? 'suppressSec' : choice.effect === 'slow' ? 'slowSec' : choice.effect;
            return { id: choice.id, title: choice.title, description: choice.description, effect: choice.effect, value: setting(cfg, 'outpost.talent.' + key) };
          }) };
      });
      return { id: h.id, title: h.title, description: h.description, ability: h.ability,
        unlocked: !!own.unlocked, available: wave(state) >= heroWave(cfg, h.id), wave: heroWave(cfg, h.id),
        selected: m.selected === h.id, active: activeHeroes.indexOf(h.id) >= 0, xp: own.xp, level: level,
        equipment: copyGear(r.equipment[h.id]), cooldown: r.cooldowns[h.id],
        abilityReady: activeHeroes.indexOf(h.id) >= 0 && !!r.equipment[h.id] && ready,
        temperCost: Big.str(temperCost(state, cfg, h.id)), power: Big.str(heroPower(state, cfg, h.id)),
        talents: talents, talentReady: !!own.unlocked && ready,
        attunement: h.id === 'eira' ? own.attunement : '', attunements: h.id === 'eira' ? TEMPERS : [], attunementReady: h.id === 'eira' && !!own.unlocked && ready };
    });
    var pets = PETS.map(function (p) {
      var w = petWave(cfg, p.id);
      var charged = p.id === 'salamander' || p.id === 'fox';
      return { id: p.id, title: p.title, description: p.description, available: wave(state) >= w, wave: w, selected: m.pet === p.id,
        xp: m.petXp[p.id], level: Math.min(3, 1 + Math.floor(m.petXp[p.id] / Math.max(1, setting(cfg, 'outpost.pet.xpStep')))),
        charge: p.id === 'salamander' ? r.pet.heat : p.id === 'fox' ? r.pet.merges : 0,
        chargeMax: charged ? setting(cfg, p.id === 'salamander' ? 'outpost.salamander.taps' : 'outpost.fox.merges') : 0 };
    });
    var fed = m.dragon.fed;
    var next = null;
    [{ wave: setting(cfg, 'outpost.hero.wave'), title: 'Первый герой' }, { wave: setting(cfg, 'outpost.pet.wave'), title: 'Питомцы и закалка' },
      { wave: setting(cfg, 'outpost.dragon.wave'), title: 'Яйцо дракона' }, { wave: setting(cfg, 'outpost.eira.wave'), title: 'Эйра и ворон' },
      { wave: setting(cfg, 'outpost.corvin.wave'), title: 'Корвин, черепаха и формы дракона' }, { wave: setting(cfg, 'outpost.molt.wave'), title: 'Линька дракона' }]
      .some(function (entry) { if (wave(state) < entry.wave) { next = { wave: entry.wave, title: entry.title }; return true; } return false; });
    var formsReady = wave(state) >= setting(cfg, 'outpost.forms.wave') && fed >= setting(cfg, 'outpost.dragon.adult');
    return { unlocks: unlocks, heroes: heroes, pets: pets, squad: activeHeroes, benefits: benefits(state, cfg),
      dragon: { unlocked: unlocks.dragon, stage: fed < setting(cfg, 'outpost.dragon.hatch') ? 'egg' : fed < setting(cfg, 'outpost.dragon.adult') ? 'young' : 'adult',
        absorbed: m.dragon.absorbed, power: Big.str(dragonPower(state, cfg)), fed: fed, hatch: setting(cfg, 'outpost.dragon.hatch'), adult: setting(cfg, 'outpost.dragon.adult'),
        anchorLevel: r.dragon.anchorLevel, charge: r.dragon.charge, chargeMax: setting(cfg, 'outpost.dragon.chargeMax'), chargeCost: breathCost(state, cfg), cooldown: r.cooldowns.dragon,
        ready: unlocks.dragon && fed >= setting(cfg, 'outpost.dragon.hatch') && !pendingHero(state, 'dragon') && r.cooldowns.dragon <= 0 && r.dragon.charge >= breathCost(state, cfg),
        queue: r.dragon.queue.map(function (q) { return { level: q.level, left: q.left / digestSpeed(state, cfg) }; }), queueCapacity: queueCapacity(cfg),
        eaten: r.dragon.eaten, feedLimit: feedLimit(state, cfg), feedMaxLevel: feedMaxLevel(state, cfg),
        form: m.dragon.form, forms: FORMS.map(function (f) { return { id: f.id, title: f.title, description: f.description, unlocked: formUnlocked(state, cfg, f.id), selected: m.dragon.form === f.id }; }),
        formReady: formsReady && !pendingHero(state, 'dragon') && r.cooldowns.dragon <= 0, formsWave: setting(cfg, 'outpost.forms.wave'), lineage: m.dragon.lineage, moltPreview: moltPreview(state, cfg) },
      rack: r.rack.map(copyGear), rackCapacity: rackCapacity(state, cfg), slots: slots(state), nextUnlock: next };
  }
  function validate(state) {
    var m = state.meta && state.meta.outpost;
    var r = state.run && state.run.outpost;
    if (!m && !r) return null;
    if (!m || !r || !m.heroes || !r.equipment || !r.cooldowns || !r.dragon || !m.dragon) return 'неполный форпост';
    if (m.selected && !has(HEROS, m.selected)) return 'неизвестный герой';
    if (m.pet && !has(PETS, m.pet)) return 'неизвестный питомец';
    if (!Array.isArray(m.squad) || m.squad.length > 3 || m.squad.some(function (id, index) { return !has(HEROS, id) || !m.heroes[id] || !m.heroes[id].unlocked || m.squad.indexOf(id) !== index; })) return 'состав отряда повреждён';
    if (!has(FORMS, m.dragon.form) || !integer(m.dragon.lineage) || m.dragon.lineage < 0 || !integer(m.dragon.moltRecord) || m.dragon.moltRecord < 0 || !integer(m.dragon.moltFed) || m.dragon.moltFed < 0 || !m.dragon.perks) return 'развитие дракона повреждено';
    if (!has(TEMPERS, m.heroes.eira && m.heroes.eira.attunement)) return 'стихия Эйры повреждена';
    for (var perk in m.dragon.perks) if (!has(MOLT_PERKS, perk) || !integer(m.dragon.perks[perk]) || m.dragon.perks[perk] < 0 || m.dragon.perks[perk] > 3) return 'ступени линьки повреждены';
    if (!Array.isArray(r.rack) || r.rack.length > 20 || !Array.isArray(r.dragon.queue) || r.dragon.queue.length > 20) return 'очередь форпоста повреждена';
    if (!Big.valid(m.dragon.absorbed) || Big.sign(m.dragon.absorbed) < 0) return 'сила дракона повреждена';
    if (!integer(m.dragon.fed) || m.dragon.fed < 0 || !integer(r.dragon.anchorLevel) || r.dragon.anchorLevel < 1 || r.dragon.anchorLevel > 1000) return 'уровень дракона повреждён';
    if (!integer(r.dragon.eaten) || r.dragon.eaten < 0) return 'кормление повреждено';
    var error = null;
    HEROS.forEach(function (h) {
      var own = m.heroes[h.id];
      if (!own || !isFinite(own.xp) || own.xp < 0 || !own.talents || (r.equipment[h.id] && !validGear(r.equipment[h.id]))) { error = 'герой повреждён'; return; }
      for (var rank in own.talents) {
        var found = false;
        (TALENTS[h.id] || []).forEach(function (tier) { if (String(tier.rank) === rank) tier.choices.forEach(function (c) { if (c.id === own.talents[rank]) found = true; }); });
        if (!found) error = 'таланты героя повреждены';
      }
    });
    r.rack.forEach(function (gear) { if (!validGear(gear)) error = 'оружие на стойке повреждено'; });
    r.dragon.queue.forEach(function (q) { if (!integer(q.level) || q.level < 1 || q.level > 1000 || !isFinite(q.left) || q.left < 0) error = 'кормление повреждено'; });
    HEROS.map(function (h) { return h.id; }).concat(['dragon']).forEach(function (id) { if (!isFinite(r.cooldowns[id]) || r.cooldowns[id] < 0) error = 'перезарядка повреждена'; });
    if (!isFinite(r.dragon.charge) || r.dragon.charge < 0) error = 'заряд дракона повреждён';
    return error;
  }
  return { HEROS: HEROS, HEROES: HEROS, PETS: PETS, TEMPERS: TEMPERS, TALENTS: TALENTS, FORMS: FORMS, defaults: DEFAULTS,
    ensure: ensure, migrate: ensure, available: available, recruit: recruit, selectHero: selectHero, reserveHero: reserveHero,
    chooseTalent: chooseTalent, setAttunement: setAttunement, selectForm: selectForm, molt: molt, moltPreview: moltPreview, benefits: benefits, onContract: onContract, onWard: onWard, heroLevel: heroLevel,
    equip: equip, unequip: unequip, equipRack: equipRack, releaseRack: releaseRack, temper: temper, temperCost: temperCost,
    choosePet: choosePet, feed: feed, feedPreview: feedPreview, feedLimit: feedLimit, feedMaxLevel: feedMaxLevel, tick: tick, digest: digest, digestSpeed: digestSpeed, rewardPet: rewardPet, noteForged: noteForged,
    onTap: onTap, onMerge: onMerge, onKill: onKill, passivePower: passivePower, heroPower: heroPower,
    dragonPower: dragonPower, basePower: basePower, elements: elements, active: active,
    model: model, onPrestige: onPrestige, validate: validate };
});
