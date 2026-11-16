// The chronicle of Жизнь-RPG: 1–3 lines a day in a light fantasy tone, made from templates;
// once a week a model may rewrite the week into a paragraph. No reproach: every text passes the
// same word filter as the pet's phrases. Pure: no Android.
var dates = require('./dates.js');

exports.BANNED = ['ленив', 'лентя', 'стыд', 'позор', 'опять не', 'снова не', 'должен', 'обязан', 'виноват', 'плохо', 'провал', 'зря', 'слаб'];

/** True when the text has none of the banned words. */
exports.clean = function (text, banned) {
  var low = String(text || '').toLowerCase();
  return !(banned || exports.BANNED).some(function (word) { return word && low.indexOf(String(word).toLowerCase()) >= 0; });
};

function number(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function list(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' и ' + names[names.length - 1];
}

var BY_SKILL = {
  endurance: 'много шагал и окреп',
  regime: 'выспался и встретил утро бодрым',
  exploration: 'бродил по знакомым и новым улицам',
  will: 'держал телефон на расстоянии',
  household: 'берёг казну',
  care: 'позаботился о себе'
};

/**
 * Lines of one closed day.
 *   facts: { day (number since the start), hero, level (new level or null), places: [names],
 *            achievements: [titles], steps, stepsRecord (bool), xp, topSkill, paused }
 */
exports.dayLines = function (facts) {
  var head = 'День ' + facts.day + '. ' + facts.hero + ' ';
  var lines = [];
  if (facts.paused) {
    lines.push(head + (facts.paused === 'sick' ? 'набирался сил под пледом.' : 'отдыхал от дорог.'));
  }
  if (facts.places && facts.places.length) {
    var walked = facts.steps >= 1000 ? ' и прошёл ' + number(facts.steps) + ' шагов' : '';
    lines.push(head + 'открыл ' + list(facts.places.slice(0, 3)) + walked + '.');
  } else if (facts.stepsRecord && facts.steps) {
    lines.push(head + 'прошёл ' + number(facts.steps) + ' шагов — больше, чем когда-либо.');
  }
  if (facts.achievements && facts.achievements.length) {
    lines.push(head + (facts.achievements.length === 1 ? 'получил знак «' + facts.achievements[0] + '».' : 'получил знаки: ' + list(facts.achievements.slice(0, 3).map(function (t) { return '«' + t + '»'; })) + '.'));
  }
  if (facts.level) lines.push(head + 'достиг ' + facts.level + '-го уровня.');
  if (!lines.length && facts.xp > 0) {
    lines.push(head + (BY_SKILL[facts.topSkill] || 'шёл своей дорогой') + ' — +' + number(facts.xp) + ' опыта.');
  }
  return lines.slice(0, 3).filter(function (line) { return exports.clean(line); });
};

/** The prompt for the weekly paragraph: only the week's template lines, no coordinates. */
exports.weekPrompt = function (lines, hero) {
  return {
    system: 'Ты летописец лёгкой фэнтезийной хроники. Перепиши записи недели в один связный абзац (4–6 предложений) ' +
      'по-русски, от третьего лица о герое по имени «' + hero + '». Используй только факты из записей, числа не меняй, ' +
      'ничего не добавляй от себя. Без упрёков, без советов, без эмодзи.',
    prompt: lines.join('\n')
  };
};

/** Every number in the model's text must be in the source lines; otherwise the text is not taken. */
exports.sameNumbers = function (text, lines) {
  var grab = function (s) { return (String(s).replace(/(\d)\s(?=\d{3}\b)/g, '$1').match(/\d+(?:[.,]\d+)?/g) || []).map(function (n) { return n.replace(',', '.'); }); };
  var known = grab(lines.join(' '));
  return grab(text).every(function (n) { return known.indexOf(n) >= 0; });
};

/** Monday of the week a date is in — the key of a weekly paragraph. */
exports.week = function (date) {
  return dates.monday(date);
};
