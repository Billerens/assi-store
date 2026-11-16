// The weekly look at sleep: which things of the day before came together with bad nights. Pure.
// Coincidence is not a cause: the table only counts, the text says so, and a sign needs enough
// nights on both sides before it is reported at all.
var T = require('./time.js');

var FEATURES = [
  { key: 'social', label: 'соцсети больше {social} мин' },
  { key: 'late', label: 'экран в ночном окне больше {late} мин' },
  { key: 'lowSteps', label: 'меньше {steps} шагов' },
  { key: 'lateWorkout', label: 'тренировка после {workout}' },
  { key: 'lateDelivery', label: 'доставка еды после {delivery}' },
  { key: 'lateCoffee', label: 'кофейня после {coffee}' },
  { key: 'weekend', label: 'выходной' }
];
exports.FEATURES = FEATURES;

function label(feature, s) {
  return feature.label.replace('{social}', s.featSocialMin).replace('{late}', s.featLateMin)
    .replace('{steps}', String(s.featStepsBelow).replace(/\B(?=(\d{3})+(?!\d))/g, ' '))
    .replace('{workout}', s.featWorkoutAfter).replace('{delivery}', s.deliveryAfter).replace('{coffee}', s.featCoffeeAfter);
}
exports.label = label;

/**
 * Signs of the day before a night. day: the summary of that day (or null), extra: { lateWorkout,
 * lateCoffee } counted from records. A sign is true, false, or null when the data is not there.
 */
exports.features = function (day, extra, s) {
  var e = extra || {};
  var known = (day && day.known) || {};
  return {
    social: day && known.screen && day.socialMin !== null ? day.socialMin > s.featSocialMin : null,
    late: day && known.screen && day.lateMin !== null ? day.lateMin > s.featLateMin : null,
    lowSteps: day && known.steps && day.steps !== null ? day.steps < s.featStepsBelow : null,
    lateWorkout: typeof e.lateWorkout === 'boolean' ? e.lateWorkout : null,
    lateDelivery: day && known.spend && day.deliveryLate !== null ? day.deliveryLate > 0 : null,
    lateCoffee: day && known.spend && typeof e.lateCoffee === 'boolean' ? e.lateCoffee : null,
    weekend: day ? T.weekday(day.date) >= 6 : null
  };
};

/** Is a purchase a coffee shop: the café tag and a word of the list in its title. */
exports.isCoffee = function (record, s) {
  var tags = record.tags || [];
  if (tags.indexOf(String(s.cafeTag || '').toLowerCase()) < 0) return false;
  var title = String(record.title || '').toLowerCase();
  return (s.coffeeWords || []).some(function (word) { return word && title.indexOf(String(word).toLowerCase()) >= 0; });
};

function mean(list) {
  return list.length ? list.reduce(function (a, b) { return a + b; }, 0) / list.length : null;
}

/**
 * rows: [{ night, sleepMin, feats }] → { nights, bad, rows: [{ key, label, withN, withBad,
 * withoutN, withoutBad, pWith, pWithout, diffPp, avgWith, avgWithout, diffMin, report }] }.
 * A night is bad when the sleep is shorter than the goal by badSleepBelow minutes or more.
 */
exports.analyze = function (rows, s) {
  var limit = s.sleepGoal - s.badSleepBelow;
  var nights = (rows || []).filter(function (row) { return typeof row.sleepMin === 'number'; });
  var isBad = function (row) { return row.sleepMin <= limit; };
  var table = FEATURES.map(function (feature) {
    var withF = nights.filter(function (row) { return row.feats && row.feats[feature.key] === true; });
    var without = nights.filter(function (row) { return row.feats && row.feats[feature.key] === false; });
    var withBad = withF.filter(isBad).length;
    var withoutBad = without.filter(isBad).length;
    var pWith = withF.length ? withBad / withF.length : null;
    var pWithout = without.length ? withoutBad / without.length : null;
    var diffPp = pWith !== null && pWithout !== null ? Math.round((pWith - pWithout) * 100) : null;
    var avgWith = mean(withF.map(function (row) { return row.sleepMin; }));
    var avgWithout = mean(without.map(function (row) { return row.sleepMin; }));
    var enough = withF.length >= s.minCases && without.length >= s.minCases;
    return {
      key: feature.key,
      label: label(feature, s),
      withN: withF.length,
      withBad: withBad,
      withoutN: without.length,
      withoutBad: withoutBad,
      pWith: pWith === null ? null : Math.round(pWith * 100),
      pWithout: pWithout === null ? null : Math.round(pWithout * 100),
      diffPp: diffPp,
      avgWith: avgWith === null ? null : Math.round(avgWith),
      avgWithout: avgWithout === null ? null : Math.round(avgWithout),
      diffMin: avgWith !== null && avgWithout !== null ? Math.round(avgWith - avgWithout) : null,
      report: enough && diffPp !== null && Math.abs(diffPp) >= s.minDiffPp
    };
  });
  return { nights: nights.length, bad: nights.filter(isBad).length, limit: limit, rows: table };
};

function minutesWord(n) {
  var a = Math.abs(n) % 100;
  var b = a % 10;
  if (a > 10 && a < 20) return 'минут';
  if (b === 1) return 'минуту';
  if (b >= 2 && b <= 4) return 'минуты';
  return 'минут';
}

/** The text without a model: one sentence a reported sign, and the caveat. */
exports.text = function (table) {
  var lines = [];
  if (!table.nights) return 'За это время ночей с данными о сне нет — разбирать пока нечего.';
  lines.push('Ночей с данными: ' + table.nights + ', из них коротких: ' + table.bad + '.');
  var found = table.rows.filter(function (row) { return row.report; });
  if (!found.length) {
    lines.push('Заметных совпадений с короткими ночами не нашлось: ни один признак не отличается достаточно на достаточном числе ночей.');
  }
  found.forEach(function (row) {
    var more = row.diffPp > 0;
    var sentence = 'После дней, когда было «' + row.label + '», ночи были короткими в ' + row.pWith + '% случаев против ' +
      row.pWithout + '% в остальные (' + row.withBad + ' из ' + row.withN + ')';
    if (row.diffMin) {
      sentence += '; сон в среднем ' + (row.diffMin < 0 ? 'на ' + Math.abs(row.diffMin) + ' ' + minutesWord(row.diffMin) + ' короче' :
        'на ' + row.diffMin + ' ' + minutesWord(row.diffMin) + ' длиннее');
    }
    lines.push(sentence + (more ? '.' : ' — здесь наоборот, ночи были лучше.'));
  });
  lines.push('Совпадение — не обязательно причина.');
  return lines.join(' ');
};

/** What the model gets: the table and the averages, nothing else (no places, no names). */
exports.prompt = function (table, averages) {
  var lines = ['Ночей с данными: ' + table.nights + '. Коротких (сон не длиннее ' + table.limit + ' мин): ' + table.bad + '.',
    'Признак дня перед ночью | ночей с признаком | из них коротких | ночей без признака | из них коротких | средний сон с признаком, мин | без признака, мин | заметно'];
  table.rows.forEach(function (row) {
    lines.push([row.label, row.withN, row.withBad, row.withoutN, row.withoutBad, row.avgWith === null ? '—' : row.avgWith,
      row.avgWithout === null ? '—' : row.avgWithout, row.report ? 'да' : 'нет'].join(' | '));
  });
  if (averages) {
    lines.push('Средние за эту неделю против прошлой: сон ' + fmt(averages.now.sleepMin) + ' против ' + fmt(averages.prev.sleepMin) +
      ' мин, шаги ' + fmt(averages.now.steps) + ' против ' + fmt(averages.prev.steps) + ', экран ' + fmt(averages.now.screenMin) +
      ' против ' + fmt(averages.prev.screenMin) + ' мин.');
  }
  return lines.join('\n');
};

function fmt(n) {
  return n === null || n === undefined ? '—' : String(Math.round(n));
}

exports.SYSTEM = 'Ты пишешь владельцу короткий разбор его сна за неделю по таблице совпадений. 4–6 предложений по-русски, ' +
  'на «вы». Говори только о признаках, отмеченных «заметно: да», с числами из таблицы: сколько раз и насколько короче сон. ' +
  'Если заметных нет — так и скажи и коротко упомяни средние. Без медицинских советов, без советов вообще, без упрёков и ' +
  'оценок владельца. Обязательно одно предложение: совпадение — не обязательно причина. Без заголовков и списков.';

/** Averages of a list of day summaries: { sleepMin, steps, screenMin, waterMl } over the days that have them. */
exports.averages = function (days) {
  var pick = function (key, knownKey) {
    return mean((days || []).filter(function (d) { return d && (!knownKey || (d.known && d.known[knownKey])) && typeof d[key] === 'number'; })
      .map(function (d) { return d[key]; }));
  };
  return { sleepMin: pick('sleepMin', 'sleep'), steps: pick('steps', 'steps'), screenMin: pick('screenMin', 'screen'), waterMl: pick('waterMl') };
};
