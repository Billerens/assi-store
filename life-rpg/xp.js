// Experience of Жизнь-RPG: what a day gives, how levels grow. Pure: no Android — the engine and
// node (tests/) run the same code. Every number comes from settings (DEFAULTS below are the
// values of docs/modules/life-rpg.md).
var dates = require('./dates.js');

exports.SKILLS = [
  { id: 'endurance', title: 'Выносливость', icon: 'dumbbell', trait: 'sturdy' },
  { id: 'regime', title: 'Режим', icon: 'moon', trait: 'nightcap' },
  { id: 'exploration', title: 'Исследование', icon: 'pin', trait: 'backpack' },
  { id: 'will', title: 'Воля', icon: 'lock' },
  { id: 'household', title: 'Хозяйство', icon: 'wallet' },
  { id: 'care', title: 'Забота', icon: 'heart' }
];

exports.DEFAULTS = {
  stepsPer: 100, stepsXp: 1, stepsCap: 250,
  workoutPerMin: 2, workoutCap: 120,
  sleepGoal: 40, bedtimeOk: 20, bedtimeWindow: 30, noLate: 10,
  newPlace: 30, newCell: 10, newCellCap: 150, farTrip: 50, farTripKm: 50,
  socialUnder: 20, socialLimit: 90, screenUnder: 20, screenLimit: 240,
  budgetOk: 15, noSpend: 10, subscription: 50,
  medOnTime: 5, waterGoal: 10,
  habitBase: 10, habitChainBonus: 0.5, habitChainCap: 30,
  focusPerMin: 0, focusCap: 60,
  playPerMin: 1, playCap: 20
};

/** Experience that counts only for the level, not for a skill: achievements, quests, games. */
exports.LEVEL_ONLY = ['achievement', 'quest', 'play'];

exports.round = function (value, mode) {
  if (mode === 'round') return Math.round(value);
  if (mode === 'ceil') return Math.ceil(value - 1e-9);
  return Math.floor(value + 1e-9);
};

/** Experience a habit mark gives: 10 × (1 + 0,5 × min(chain, 30) / 30). */
exports.habitXp = function (chain, x) {
  x = x || exports.DEFAULTS;
  var c = Math.max(0, Math.min(Number(chain) || 0, x.habitChainCap));
  return x.habitBase * (1 + x.habitChainBonus * c / x.habitChainCap);
};

/**
 * The experience of one closed day, entry by entry: [{ skill, amount, reason, ref }].
 *   day — the summary (normalized: known flags), ctx — { goals, newCells, places: [{ id, title }],
 *   subscriptions, chains: { habitId: days }, habits: { id: title }, bonus (×1,5 today), rounding }
 * Unknown data gives nothing; nothing is ever taken away.
 */
exports.dayEntries = function (day, ctx, x) {
  x = Object.assign({}, exports.DEFAULTS, x || {});
  ctx = ctx || {};
  var goals = ctx.goals || { sleep: 450, bedtime: '00:00', water: 2000 };
  var known = day.known || {};
  var out = [];
  var ref = function (key) { return 'day:' + day.date + ':' + key; };
  var add = function (skill, amount, reason, key) {
    if (amount > 0) out.push({ skill: skill, amount: amount, reason: reason, ref: ref(key) });
  };

  if (known.steps && day.steps > 0) {
    add('endurance', Math.min(x.stepsCap, Math.floor(day.steps / x.stepsPer) * x.stepsXp), 'шаги: ' + day.steps, 'steps');
  }
  if (day.workoutMin > 0) add('endurance', Math.min(x.workoutCap, day.workoutMin * x.workoutPerMin), 'тренировка: ' + day.workoutMin + ' мин', 'workout');

  if (known.sleep) {
    var sleepGoal = day.sleepGoal || goals.sleep;
    if (day.sleepMin >= sleepGoal) add('regime', x.sleepGoal, 'сон не меньше цели', 'sleep');
    var bed = dates.night(day.bedtime);
    if (bed !== null && Math.abs(bed - dates.night(goals.bedtime || '00:00')) <= x.bedtimeWindow) add('regime', x.bedtimeOk, 'отбой вовремя', 'bedtime');
  }
  if (known.screen && day.lateMin === 0) add('regime', x.noLate, 'ни минуты экрана ночью', 'nolate');

  if (known.places) {
    var places = ctx.places || [];
    if (places.length) {
      places.forEach(function (place) { add('exploration', x.newPlace, 'новое место: ' + place.title, 'place:' + place.id); });
    } else if (day.newPlaces > 0) {
      add('exploration', day.newPlaces * x.newPlace, 'новых мест: ' + day.newPlaces, 'places');
    }
    var cells = ctx.newCells !== undefined ? ctx.newCells : day.newCells;
    if (cells > 0) add('exploration', Math.min(x.newCellCap, cells * x.newCell), 'новых клеток: ' + cells, 'cells');
    if (day.farthestKm > x.farTripKm) add('exploration', x.farTrip, 'поездка дальше ' + x.farTripKm + ' км', 'far');
  }

  if (known.screen) {
    if (day.socialMin !== null && day.socialMin !== undefined && day.socialMin < x.socialLimit) add('will', x.socialUnder, 'соцсети меньше ' + x.socialLimit + ' мин', 'social');
    if (day.screenMin !== null && day.screenMin !== undefined && day.screenMin < x.screenLimit) add('will', x.screenUnder, 'экран меньше ' + x.screenLimit + ' мин', 'screen');
  }
  if (x.focusPerMin > 0 && day.focusMin > 0) add('will', Math.min(x.focusCap, day.focusMin * x.focusPerMin), 'фокус: ' + day.focusMin + ' мин', 'focus');
  // Sessions of «Игротека» (kind 'play' in the base, playMin in the summary): only the level grows, with a daily cap.
  if (x.playPerMin > 0 && day.playMin > 0) add('play', Math.min(x.playCap, day.playMin * x.playPerMin), 'игры: ' + Math.round(day.playMin) + ' мин', 'play');

  if (known.spend) {
    if (day.budgetOk === true) add('household', x.budgetOk, 'в пределах бюджета', 'budget');
    if (day.noSpend === true) add('household', x.noSpend, 'день без трат', 'nospend');
  }
  if (ctx.subscriptions > 0) add('household', ctx.subscriptions * x.subscription, 'отменённая подписка', 'subscription');

  var onTime = Math.max(0, (day.medsTaken || 0) - (day.medsLate || 0));
  if (onTime > 0) add('care', onTime * x.medOnTime, 'лекарства вовремя: ' + onTime, 'meds');
  var waterGoal = day.waterGoal || goals.water;
  if (waterGoal && day.waterMl >= waterGoal) add('care', x.waterGoal, 'вода не меньше цели', 'water');

  (day.habitIds || []).forEach(function (id) {
    var chain = (ctx.chains && ctx.chains[id]) || (day.chains && day.chains[id]) || 1;
    var title = (ctx.habits && ctx.habits[id]) || id;
    add('habit:' + id, exports.habitXp(chain, x), title + (chain > 1 ? ', цепочка ' + chain : ''), 'habit:' + id);
  });

  if (ctx.bonus) exports.applyComeback(out, ctx.bonusMult, ctx.rounding);
  else out.forEach(function (entry) { entry.amount = exports.round(entry.amount, ctx.rounding); });
  return out.filter(function (entry) { return entry.amount > 0; });
};

/**
 * The comeback bonus on entries of the day: «весь опыт дня ×1,5» — the day's summary, and the
 * achievements and quests closed the same day (main.close). Changes the entries in place.
 */
exports.applyComeback = function (entries, mult, rounding) {
  mult = Number(mult) || 1.5;
  entries.forEach(function (entry) {
    entry.amount = exports.round(entry.amount * mult, rounding);
    if (mult !== 1) entry.reason += ' · ×' + String(mult).replace('.', ',');
  });
  return entries;
};

/** Total experience needed for level L: round(base × (L − 1)^power). */
exports.threshold = function (level, base, power) {
  return Math.round(base * Math.pow(Math.max(0, level - 1), power));
};

/** The level a total gives, and the way to the next one. */
exports.level = function (total, base, power) {
  base = base || 120;
  power = power || 1.6;
  var level = 1;
  while (level < 1000 && exports.threshold(level + 1, base, power) <= total) level++;
  var from = exports.threshold(level, base, power);
  var to = exports.threshold(level + 1, base, power);
  return { level: level, total: total, from: from, to: to, into: total - from, need: to - from, pct: to > from ? (total - from) / (to - from) : 1 };
};

/** Was the day a comeback: the first day with data after `gap` (3) empty days or after a pause. */
exports.comeback = function (date, lastActive, lastPaused, gap) {
  if (lastPaused && dates.diff(date, lastPaused) === 1) return true;
  if (!lastActive) return false;
  return dates.diff(date, lastActive) - 1 >= (gap || 3);
};

/** Does the day have any data at all. */
exports.hasData = function (day) {
  var k = day.known || {};
  return Boolean(k.sleep || k.steps || k.screen || k.places || k.spend || (day.habitIds || []).length || day.waterMl > 0 || day.medsTaken > 0 || day.workoutMin > 0);
};

/**
 * Habit chains as the RPG keeps them (used when «Здоровье» gives none): marked yesterday — the
 * chain grows; one missed day is bridged by a freeze (`freezes` a week); a pause freezes chains.
 *   chains: { id: { days, last, freezesLeft, week } } — changed in place and returned.
 */
exports.trackChains = function (chains, day, freezesPerWeek) {
  chains = chains || {};
  var week = dates.monday(day.date);
  Object.keys(chains).forEach(function (id) {
    var c = chains[id];
    if (c.week !== week) { c.week = week; c.freezesLeft = freezesPerWeek; }
  });
  if (day.paused) {
    Object.keys(chains).forEach(function (id) { if (chains[id].last) chains[id].last = day.date; });
    return chains;
  }
  (day.habitIds || []).forEach(function (id) {
    var c = chains[id] = chains[id] || { days: 0, last: null, freezesLeft: freezesPerWeek, week: week };
    if (c.last === day.date) return;
    var gap = c.last ? dates.diff(day.date, c.last) : null;
    if (gap === 1) c.days++;
    else if (gap === 2 && c.freezesLeft > 0) { c.freezesLeft--; c.days++; }
    else c.days = 1;
    c.last = day.date;
  });
  return chains;
};

/** Pet's growth stage by level: thresholds [1, 5, 15, 30, 50] → index and name. */
exports.STAGES = ['sprout', 'two-leaves', 'four-leaves', 'bud', 'flower'];
exports.stage = function (level, thresholds) {
  var t = thresholds && thresholds.length ? thresholds : [1, 5, 15, 30, 50];
  var index = 0;
  for (var i = 0; i < t.length; i++) if (level >= t[i]) index = i;
  index = Math.min(index, exports.STAGES.length - 1);
  return { index: index, name: exports.STAGES[index] };
};
