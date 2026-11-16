(function (root, make) {
  var api = make(typeof exports !== 'undefined' ? require('../engine/rng.js') : root.Rng);
  if (typeof exports !== 'undefined') {
    for (var key in api) exports[key] = api[key];
  } else { root.Combat = api; }
})(this, function (Rng) {
  'use strict';

  // Strong parts alone grant an ability: a head from a coat species is cosmetic.
  var SPECIES = [
    { id: 0, part: 0, ability: 'charge', name: 'Разбег' },
    { id: 1, part: 0, ability: 'hearing', name: 'Чуткий слух' },
    { id: 2, part: 4, ability: 'thorns', name: 'Колючки' },
    { id: 3, part: 2, ability: 'feather', name: 'Лёгкий шаг' },
    { id: 4, part: 3, ability: 'trip', name: 'Подсечка' },
    { id: 5, part: 1, ability: 'armor', name: 'Броня' },
    { id: 6, part: 1, ability: 'flight', name: 'Взлёт' },
    { id: 7, part: 4, ability: 'blind', name: 'Ослепление' },
    { id: 8, part: 0, ability: 'frost', name: 'Холод' },
    { id: 9, part: 2, ability: 'sand', name: 'Зыбучий песок' },
    { id: 10, part: 3, ability: 'shelter', name: 'Укрытие' },
    { id: 11, part: 4, ability: 'mirage', name: 'Морок' },
    { id: 12, part: 0, ability: 'pound', name: 'Долбёжка' },
    { id: 13, part: 1, ability: 'stance', name: 'Стойка' }
  ];
  var DEFAULTS = {
    'combat.levelScale': 0.05, 'combat.hpBase': 30, 'combat.hpStamina': 3,
    'combat.defenseScale': 0.5, 'combat.minDamage': 1, 'combat.senseChance': 0.0025,
    'combat.critMultiplier': 1.5, 'combat.teamSize': 3, 'combat.maxRounds': 120,
    'combat.leaderBonus': 0.05, 'combat.tricksterDodge': 0.1,
    'combat.chargeMultiplier': 2, 'combat.thornsReturn': 0.2,
    'combat.featherDodge': 0.1, 'combat.tripChance': 0.15,
    'combat.armorReduction': 0.2, 'combat.blindReduction': 0.3, 'combat.blindTurns': 2,
    'combat.frostReduction': 0.12, 'combat.frostTurns': 2,
    'combat.sandReduction': 0.3, 'combat.sandTurns': 2,
    'combat.shelterShield': 0.06, 'combat.shelterCooldown': 3,
    'combat.mirageDodge': 0.06, 'combat.poundDefense': 0.2,
    'combat.stanceReduction': 0.12, 'combat.stanceThreshold': 0.5,
    'combat.keenChance': 0.02, 'combat.resilientHp': 0.05, 'combat.vigorousForce': 0.03
  };

  function setting(cfg, key) {
    var value = cfg && cfg[key];
    if (value && typeof value === 'object') value = value.value;
    return value === undefined || !isFinite(Number(value)) ? DEFAULTS[key] : Number(value);
  }
  function has(list, value) { return (list || []).indexOf(value) !== -1; }
  function rounded(value) { return Math.round(value * 1000) / 1000; }
  function nonnegative(value) { return isFinite(Number(value)) ? Math.max(0, Number(value)) : 0; }
  function abilities(beast) {
    var out = [];
    var parts = beast.parts || [];
    for (var index = 0; index < parts.length && index < 5; index++) {
      var part = parts[index];
      var species = SPECIES[part && part.visible !== undefined ? Number(part.visible) : Number(part)];
      if (species && species.part === index) out.push(species.ability);
    }
    return out;
  }
  function stats(beast, cfg) {
    var genes = beast.genes || [0, 0, 0, 0];
    var level = nonnegative(beast.level);
    var factor = 1 + setting(cfg, 'combat.levelScale') * level;
    var result = {
      force: rounded(nonnegative(genes[0]) * factor),
      agility: rounded(nonnegative(genes[1]) * factor),
      stamina: rounded(nonnegative(genes[2]) * factor),
      sense: rounded(nonnegative(genes[3]) * factor)
    };
    if (has(beast.traits, 'vigorous')) result.force = rounded(result.force * (1 + setting(cfg, 'combat.vigorousForce')));
    result.hp = rounded(setting(cfg, 'combat.hpBase') + setting(cfg, 'combat.hpStamina') * result.stamina);
    if (has(beast.traits, 'resilient')) result.hp = rounded(result.hp * (1 + setting(cfg, 'combat.resilientHp')));
    return result;
  }
  function prepare(list, side, cfg, size) {
    var result = [];
    var leader = false;
    var index;
    for (index = 0; index < Math.min(list.length, size); index++) {
      if (has(list[index].traits, 'leader')) leader = true;
    }
    for (index = 0; index < list.length && index < size + 1; index++) {
      var beast = list[index];
      var qualities = stats(beast, cfg);
      if (leader) {
        var factor = 1 + setting(cfg, 'combat.leaderBonus');
        qualities.force = rounded(qualities.force * factor);
        qualities.agility = rounded(qualities.agility * factor);
        qualities.stamina = rounded(qualities.stamina * factor);
        qualities.sense = rounded(qualities.sense * factor);
        qualities.hp = rounded(setting(cfg, 'combat.hpBase') + setting(cfg, 'combat.hpStamina') * qualities.stamina);
        if (has(beast.traits, 'resilient')) qualities.hp = rounded(qualities.hp * (1 + setting(cfg, 'combat.resilientHp')));
      }
      result.push({
        id: beast.id === undefined ? (side ? 'enemy-' : 'player-') + index : beast.id,
        side: side, slot: index, stats: qualities, hp: Math.max(1, qualities.hp), maxHp: Math.max(1, qualities.hp),
        abilities: abilities(beast), traits: (beast.traits || []).slice(), active: index < size,
        attacks: 0, turns: 0, stunned: 0, blind: 0, frost: 0, sand: 0,
        shield: 0, stubborn: false, tie: 0, speed: 0
      });
    }
    return result;
  }

  /** Immutable, seeded combat. Input arrays may include one reserve. log:false is for balance bots. */
  function fight(team, enemies, seed, cfg, options) {
    cfg = cfg || {};
    options = options || {};
    var rng = Rng.make(typeof seed === 'string' ? Rng.hash(seed) : seed);
    var size = Math.max(1, Math.floor(setting(cfg, 'combat.teamSize')));
    var sides = [prepare(team || [], 0, cfg, size), prepare(enemies || [], 1, cfg, size)];
    var fighters = sides[0].concat(sides[1]);
    var log = [];
    var round = 0;
    var limit = Math.max(1, Math.floor(setting(cfg, 'combat.maxRounds')));

    function value(key) { return setting(cfg, 'combat.' + key); }
    function hasAbility(fighter, ability) { return has(fighter.abilities, ability); }
    function record(actor, target, damage, kind) {
      if (options.log === false) return;
      log.push({ round: round, actor: actor ? actor.id : null, target: target.id,
        damage: rounded(damage), kind: kind, hp: rounded(target.hp) });
    }
    function living(side, activeOnly) {
      var out = [];
      for (var i = 0; i < sides[side].length; i++) {
        var member = sides[side][i];
        if (member.hp > 0 && (!activeOnly || member.active)) out.push(member);
      }
      return out;
    }
    function replenish(side) {
      var active = living(side, true).length;
      for (var i = 0; i < sides[side].length && active < size; i++) {
        var member = sides[side][i];
        if (member.hp > 0 && !member.active) {
          member.active = true;
          active++;
          record(null, member, 0, 'enter');
        }
      }
    }
    function harm(actor, target, amount, kind, shieldable) {
      amount = Math.max(0, rounded(amount));
      if (shieldable && target.shield > 0) {
        var blocked = Math.min(target.shield, amount);
        target.shield = rounded(target.shield - blocked);
        amount = rounded(amount - blocked);
      }
      var previous = target.hp;
      var saved = false;
      if (amount >= target.hp && !target.stubborn && has(target.traits, 'stubborn')) {
        target.stubborn = true;
        amount = Math.max(0, target.hp - 1);
        saved = true;
      }
      target.hp = Math.max(0, rounded(target.hp - amount));
      record(actor, target, previous - target.hp, kind);
      if (saved) record(target, target, 0, 'stubborn');
      return previous - target.hp;
    }
    function sense(fighter) {
      return fighter.stats.sense * (fighter.blind > 0 ? 1 - value('blindReduction') : 1);
    }
    function chance(fighter, dodge) {
      var probability = sense(fighter) * value('senseChance');
      if (has(fighter.traits, 'keen')) probability += value('keenChance');
      if (dodge && has(fighter.traits, 'trickster')) probability += value('tricksterDodge');
      if (dodge && hasAbility(fighter, 'feather')) probability += value('featherDodge');
      if (dodge && hasAbility(fighter, 'mirage')) probability += value('mirageDodge');
      return Math.max(0, Math.min(1, probability));
    }
    function strike(actor, target, counter) {
      var first = actor.attacks === 0;
      if (!counter) actor.attacks++;
      if (rng.chance(chance(target, true))) {
        record(actor, target, 0, 'dodge');
        if (!counter && hasAbility(target, 'hearing')) strike(target, actor, true);
        return;
      }
      var force = actor.stats.force * (actor.frost > 0 ? 1 - value('frostReduction') : 1);
      var multiplier = !counter && first && hasAbility(actor, 'charge') ? value('chargeMultiplier') : 1;
      var defense = target.stats.stamina * value('defenseScale');
      if (hasAbility(actor, 'pound')) defense *= 1 - value('poundDefense');
      var damage = Math.max(value('minDamage'), force * multiplier - defense);
      var critical = rng.chance(chance(actor, false));
      if (critical) damage *= value('critMultiplier');
      if (hasAbility(target, 'armor')) damage *= 1 - value('armorReduction');
      if (hasAbility(target, 'stance') && target.hp <= target.maxHp * value('stanceThreshold')) damage *= 1 - value('stanceReduction');
      damage = Math.max(value('minDamage'), damage);
      var kind = counter ? 'counter' : multiplier !== 1 ? 'charge' : critical ? 'critical' : 'attack';
      var dealt = harm(actor, target, damage, kind, true);
      if (hasAbility(target, 'thorns') && dealt > 0) harm(target, actor, dealt * value('thornsReturn'), 'thorns', false);
      if (counter || target.hp <= 0 || actor.hp <= 0) return;
      if (hasAbility(actor, 'trip') && rng.chance(value('tripChance'))) {
        target.stunned = 1;
        record(actor, target, 0, 'trip');
      }
      if (hasAbility(actor, 'blind')) {
        target.blind = Math.max(target.blind, value('blindTurns'));
        record(actor, target, 0, 'blind');
      }
      if (hasAbility(actor, 'frost')) {
        target.frost = Math.max(target.frost, value('frostTurns'));
        record(actor, target, 0, 'frost');
      }
      if (hasAbility(actor, 'sand')) {
        target.sand = Math.max(target.sand, value('sandTurns'));
        record(actor, target, 0, 'sand');
      }
    }
    function shelter(actor) {
      if (!hasAbility(actor, 'shelter') || actor.turns % Math.max(1, Math.floor(value('shelterCooldown'))) !== 0) return;
      var allies = living(actor.side, true);
      var target = allies[0];
      for (var i = 1; i < allies.length; i++) {
        if (allies[i].hp / allies[i].maxHp < target.hp / target.maxHp) target = allies[i];
      }
      target.shield = Math.max(target.shield, rounded(target.maxHp * value('shelterShield')));
      record(actor, target, 0, 'shield');
    }
    function expire(actor) {
      actor.blind = Math.max(0, actor.blind - 1);
      actor.frost = Math.max(0, actor.frost - 1);
      actor.sand = Math.max(0, actor.sand - 1);
      actor.turns++;
    }
    function compare(a, b) {
      var flightA = hasAbility(a, 'flight') && a.turns === 0 ? 1 : 0;
      var flightB = hasAbility(b, 'flight') && b.turns === 0 ? 1 : 0;
      if (flightA !== flightB) return flightB - flightA;
      if (a.speed !== b.speed) return b.speed - a.speed;
      if (options.tactician && a.side !== b.side) return a.side - b.side;
      if (a.tie !== b.tie) return a.tie - b.tie;
      return a.side - b.side || a.slot - b.slot;
    }
    while (round < limit && living(0, false).length && living(1, false).length) {
      round++;
      var order = living(0, true).concat(living(1, true));
      for (var index = 0; index < order.length; index++) {
        order[index].tie = rng.next();
        order[index].speed = rounded(order[index].stats.agility * (order[index].sand > 0 ? 1 - value('sandReduction') : 1));
      }
      order.sort(compare);
      for (index = 0; index < order.length; index++) {
        var actor = order[index];
        if (actor.hp <= 0) continue;
        var targets = living(1 - actor.side, true);
        if (!targets.length) break;
        if (actor.stunned > 0) {
          actor.stunned--;
          record(actor, actor, 0, 'stun');
          expire(actor);
          continue;
        }
        shelter(actor);
        strike(actor, targets[rng.int(targets.length)], false);
        expire(actor);
        replenish(0);
        replenish(1);
      }
    }
    var players = living(0, false);
    var rivals = living(1, false);
    var playerPower = 0;
    var rivalPower = 0;
    var survivors = [];
    var enemySurvivors = [];
    var state = [];
    for (var p = 0; p < players.length; p++) { survivors.push(players[p].id); playerPower += players[p].hp / players[p].maxHp; }
    for (var e = 0; e < rivals.length; e++) { enemySurvivors.push(rivals[e].id); rivalPower += rivals[e].hp / rivals[e].maxHp; }
    for (var f = 0; f < fighters.length; f++) {
      state.push({ id: fighters[f].id, side: fighters[f].side, hp: fighters[f].hp, maxHp: fighters[f].maxHp });
    }
    // At the safety limit, remaining fractions of HP decide; an exact draw loses no seed fairness.
    var draw = (!players.length && !rivals.length) || (players.length > 0 && rivals.length > 0 && rounded(playerPower) === rounded(rivalPower));
    var win = !draw && (rivals.length === 0 || (players.length > 0 && playerPower > rivalPower));
    return { win: win, draw: draw, rounds: round, log: log, survivors: survivors,
      enemySurvivors: enemySurvivors, playerRemaining: players.length, enemyRemaining: rivals.length,
      fighters: state, seed: seed, timedOut: players.length > 0 && rivals.length > 0 };
  }

  return { fight: fight, stats: stats, abilities: abilities, SPECIES: SPECIES, DEFAULTS: DEFAULTS };
});

