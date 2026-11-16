// Choosing a branch by voice without a model: by the keywords of the options and their forms,
// by «первый / второй», by «не медный» (then the other one of two). Plus «да / нет».
// Pure logic (engine and node).
//
//   branch.choose('медный', [{id: 'a1', keywords: ['медный', 'медь']}, {id: 'a2', keywords: ['стальной']}]) -> 0
var words = require('./words.js');

var ORDINALS = [
  ['первый', 'первая', 'первое', 'первую', 'первого', 'один', 'левый', 'левую', 'левая'],
  ['второй', 'вторая', 'второе', 'вторую', 'второго', 'два', 'правый', 'правую', 'правая'],
  ['третий', 'третья', 'третье', 'третью', 'три'],
  ['четвертый', 'четвертая', 'четвертое', 'четвертую', 'четыре']
];

var YES = ['да', 'давай', 'давайте', 'конечно', 'ага', 'угу', 'хорошо', 'продолжим', 'продолжай', 'продолжи',
  'продолжаем', 'согласен', 'согласна', 'верно', 'точно', 'поехали', 'ок', 'окей', 'дальше', 'хочу', 'оттуда', 'можно'];
var NO = ['нет', 'не', 'неа', 'не надо', 'не хочу', 'хватит', 'потом', 'позже', 'стоп', 'отмена', 'нового', 'новую', 'заново'];

function keywordsOf(option) {
  var list = [].concat(option.keywords || []);
  if (option.label) list = list.concat(words.tokens(option.label).filter(function (word) { return word.length >= 4; }));
  return list.map(words.normalize).filter(function (word, i, all) { return word && all.indexOf(word) === i; });
}

/** How many words of the phrase point at the option (each word counts once), and whether with «не». */
function hits(toks, option) {
  var count = 0;
  var negated = false;
  var keys = keywordsOf(option);
  var phrase = ' ' + toks.join(' ') + ' ';
  keys.forEach(function (key) {
    if (key.indexOf(' ') >= 0 && phrase.indexOf(' ' + key + ' ') >= 0) count += 2;
  });
  toks.forEach(function (tok, i) {
    var match = keys.some(function (key) {
      if (key.indexOf(' ') >= 0) return false;
      return tok === key || words.similar(tok, key, 1) ||
        (tok.length >= 5 && key.length >= 5 && words.commonPrefix(tok, key) >= 5);
    });
    if (!match) return;
    count++;
    if (i > 0 && toks[i - 1] === 'не') negated = true;
  });
  return { count: count, negated: negated };
}

/** The index of the option the phrase picks, or -1 when it is not clear. */
function choose(text, options) {
  var toks = words.tokens(text);
  if (!toks.length || !options || !options.length) return -1;
  for (var k = 0; k < Math.min(options.length, ORDINALS.length); k++) {
    if (toks.some(function (tok) { return ORDINALS[k].indexOf(tok) >= 0; }) &&
      !toks.some(function (tok, i) { return ORDINALS[k].indexOf(tok) >= 0 && i > 0 && toks[i - 1] === 'не'; })) {
      var other = false;
      for (var j = 0; j < Math.min(options.length, ORDINALS.length); j++) {
        if (j !== k && toks.some(function (tok) { return ORDINALS[j].indexOf(tok) >= 0; })) other = true;
      }
      if (!other) return k;
    }
  }
  var scores = options.map(function (option) { return hits(toks, option); });
  var positive = [];
  var negative = [];
  scores.forEach(function (score, i) {
    if (!score.count) return;
    if (score.negated) negative.push(i);
    else positive.push(i);
  });
  if (positive.length === 1) return positive[0];
  if (positive.length > 1) {
    var best = positive.slice().sort(function (a, b) { return scores[b].count - scores[a].count; });
    if (scores[best[0]].count > scores[best[1]].count) return best[0];
    return -1;
  }
  if (negative.length === 1 && options.length === 2) return negative[0] === 0 ? 1 : 0;
  return -1;
}

/** 'yes', 'no' or null. */
function yesNo(text) {
  var norm = words.normalize(text);
  if (!norm) return null;
  var toks = norm.split(' ');
  if (NO.indexOf(norm) >= 0 || toks[0] === 'нет' || norm.indexOf('не надо') >= 0 || norm.indexOf('не хочу') >= 0) return 'no';
  if (YES.indexOf(norm) >= 0 || YES.indexOf(toks[0]) >= 0) return 'yes';
  if (toks.some(function (tok) { return NO.indexOf(tok) >= 0 && tok !== 'не'; })) return 'no';
  if (toks.some(function (tok) { return YES.indexOf(tok) >= 0; })) return 'yes';
  return null;
}

exports.ORDINALS = ORDINALS;
exports.choose = choose;
exports.yesNo = yesNo;
exports.keywordsOf = keywordsOf;
