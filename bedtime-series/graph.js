// A night episode as a graph: three common scenes, two forks, after each fork two short scenes of
// its own, then the paths meet again; plus a quiet ending «if asleep». Pure logic (engine, node).
//
//   s1 → A → s2a | s2b → s3 → B → s4a | s4b → final
//
// An episode (data/series/<season>/e<N>.json):
//   {number, title, scenes: {s1, s2a, s2b, s3, s4a, s4b, final},
//    choices: {A: {question, moment, options: [{label, keywords}, {label, keywords}], calm: 0|1}, B: {…}},
//    asleep, summary, ending, usedDetails, bibleUpdates}
var words = require('modules/voice-adventure/story-engine/words.js');
var branch = require('modules/voice-adventure/story-engine/branch.js');
var lines = require('modules/voice-adventure/story-engine/lines.js');

var FORKS = {
  A: { after: 's1', branches: ['s2a', 's2b'], join: 's3' },
  B: { after: 's3', branches: ['s4a', 's4b'], join: 'final' }
};
var MAIN = ['s1', 's3', 'final'];
var BRANCHES = ['s2a', 's2b', 's4a', 's4b'];
var SCENES = ['s1', 's2a', 's2b', 's3', 's4a', 's4b', 'final'];

var EMOJI = /[☀-➿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
var LIST = /(^|\n)\s*([-*•]|\d+[.)])\s+/;
var SURNAME = /(^|[^А-Яа-яЁё])[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]*(ов|ев|ёв|ин|ын|ский|цкий|ова|ева|ёва|ина|ына|ская|цкая)(?=$|[^А-Яа-яЁё])/;
var ADDRESS = /(^|[^А-Яа-яЁё])(улиц[аеуы]\s+[А-ЯЁ]|ул\.\s*[А-ЯЁ]|проспект[аеу]?\s+[А-ЯЁ]|пр-т|переул[оке]+\s+[А-ЯЁ]|д\.\s*\d|дом\s+\d|кв\.\s*\d|квартир[аеуы]\s+\d|корпус\s+\d)/i;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sceneText(value) {
  if (value && typeof value === 'object') return String(value.text || '').trim();
  return String(value === undefined || value === null ? '' : value).trim();
}

/** The model's answer brought to one shape (a missing piece stays empty for validate to name). */
function normalize(raw) {
  var ep = clone(raw || {});
  var scenes = ep.scenes && typeof ep.scenes === 'object' ? ep.scenes : {};
  ep.scenes = {};
  SCENES.forEach(function (id) { ep.scenes[id] = sceneText(scenes[id]); });
  var choices = ep.choices && typeof ep.choices === 'object' ? ep.choices : {};
  ep.choices = {};
  Object.keys(FORKS).forEach(function (fork) {
    var c = choices[fork] || {};
    var options = Array.isArray(c.options) ? c.options : [];
    // calm: the index of the calmer option (0 or 1); 'a'/'b' are taken too.
    var calm = c.calm !== undefined ? c.calm : c['default'];
    if (typeof calm === 'string') calm = /^[bб]$/i.test(calm.trim()) ? 1 : Number(calm.trim()) || 0;
    ep.choices[fork] = {
      question: String(c.question || '').trim(),
      moment: String(c.moment || '').trim(),
      calm: calm === 1 ? 1 : 0,
      options: options.slice(0, 2).map(function (option, i) {
        var o = typeof option === 'string' ? { label: option } : (option || {});
        return {
          label: String(o.label || '').trim(),
          keywords: (Array.isArray(o.keywords) ? o.keywords : []).map(function (k) { return String(k).trim(); }).filter(Boolean),
          next: FORKS[fork].branches[i]
        };
      })
    };
  });
  ep.asleep = String(ep.asleep || '').trim();
  ep.title = String(ep.title || '').trim();
  ep.summary = String(ep.summary || '').trim();
  ep.ending = String(ep.ending || '').trim();
  ep.usedDetails = (Array.isArray(ep.usedDetails) ? ep.usedDetails : []).map(String);
  return ep;
}

function stems(text) {
  return words.tokens(text).filter(function (tok) { return tok.length >= 3; }).map(words.stem);
}

/** Does a detail the model says it used come from the list it was given? */
function fromDetails(used, details) {
  var mine = stems(used);
  if (!mine.length) return true;
  return (details || []).some(function (detail) {
    var theirs = stems(typeof detail === 'string' ? detail : detail.text);
    var shared = mine.filter(function (stem) {
      return theirs.some(function (other) { return other === stem || words.commonPrefix(other, stem) >= 4; });
    });
    return shared.length / mine.length >= 0.5;
  });
}

/** A name (or its stem) of a real person that must not be in the text. */
function hasName(text, name) {
  var root = words.stem(name);
  if (root.length < 3) return false;
  return words.tokens(text).some(function (tok) { return tok === words.normalize(name) || (tok.length >= root.length && tok.indexOf(root) === 0 && tok.length - root.length <= 3); });
}

function hygiene(label, text, errors, forbidden) {
  if (EMOJI.test(text)) errors.push(label + ': эмодзи в тексте для слуха');
  if (LIST.test(text)) errors.push(label + ': список вместо речи');
  if (SURNAME.test(text)) errors.push(label + ': похоже на имя с фамилией — реальных фамилий быть не должно');
  if (ADDRESS.test(text)) errors.push(label + ': похоже на адрес — адресов быть не должно');
  (forbidden || []).forEach(function (name) {
    if (hasName(text, name)) errors.push(label + ': имя «' + name + '» не из разрешённых');
  });
}

/**
 * The engine's check of an episode. limits: {sceneMin, sceneMax, branchMin, branchMax, questionMax,
 * asleepMax, details: [given lines], forbidden: [names that must not appear]}. Returns error lines.
 */
function validate(raw, limits) {
  limits = limits || {};
  var ep = normalize(raw);
  var errors = [];
  var sceneMin = limits.sceneMin || 900;
  var sceneMax = limits.sceneMax || 1600;
  var branchMin = limits.branchMin || 250;
  var branchMax = limits.branchMax || 900;
  if (!ep.title) errors.push('Нет названия серии (title)');
  SCENES.forEach(function (id) {
    var text = ep.scenes[id];
    if (!text) {
      errors.push('Нет сцены ' + id);
      return;
    }
    var main = MAIN.indexOf(id) >= 0;
    var min = main ? sceneMin : branchMin;
    var max = main ? sceneMax : branchMax;
    if (text.length < min) errors.push('Сцена ' + id + ' короче ' + min + ' знаков (' + text.length + ')');
    if (text.length > max) errors.push('Сцена ' + id + ' длиннее ' + max + ' знаков (' + text.length + ')');
    hygiene('Сцена ' + id, text, errors, limits.forbidden);
  });
  Object.keys(FORKS).forEach(function (fork) {
    var c = ep.choices[fork];
    if (!c.question) errors.push('Развилка ' + fork + ': нет вопроса');
    else if (c.question.length > (limits.questionMax || 240)) errors.push('Развилка ' + fork + ': вопрос длиннее ' + (limits.questionMax || 240) + ' знаков');
    if (c.options.length !== 2) {
      errors.push('Развилка ' + fork + ': нужно ровно два варианта');
      return;
    }
    c.options.forEach(function (option, i) {
      if (!option.label) errors.push('Развилка ' + fork + ': у варианта ' + (i + 1) + ' нет названия');
      if (branch.choose(option.label, c.options) !== i) {
        errors.push('Развилка ' + fork + ': вариант «' + option.label + '» не отличить голосом от другого — дайте разные ключевые слова');
      }
    });
    hygiene('Развилка ' + fork, c.question + ' ' + c.moment, errors, limits.forbidden);
  });
  if (!ep.asleep) errors.push('Нет тихой концовки «если уснул» (asleep)');
  else {
    if (ep.asleep.length > (limits.asleepMax || 600)) errors.push('Концовка asleep длиннее ' + (limits.asleepMax || 600) + ' знаков');
    hygiene('Концовка asleep', ep.asleep, errors, limits.forbidden);
  }
  if (!ep.summary) errors.push('Нет пересказа серии (summary)');
  if (limits.details) {
    ep.usedDetails.forEach(function (used) {
      if (!fromDetails(used, limits.details)) errors.push('Деталь «' + words.clip(used, 60) + '» не из списка дня');
    });
  }
  return errors;
}

/** The node after this one: 's1' → 'A' → 's2a'/'s2b' (by the choice) → 's3' → 'B' → … → 'final' → null. */
function next(node, choices) {
  if (node === null || node === undefined) return 's1';
  if (node === 'final') return null;
  var forks = Object.keys(FORKS);
  for (var i = 0; i < forks.length; i++) {
    var spec = FORKS[forks[i]];
    if (node === spec.after) return forks[i];
    if (node === forks[i]) {
      var pick = choices && choices[forks[i]] !== undefined ? choices[forks[i]] : null;
      return pick === null ? null : spec.branches[pick];
    }
    if (spec.branches.indexOf(node) >= 0) return spec.join;
  }
  return null;
}

/** The path through the episode for the given choices: ['s1', 'A', 's2b', 's3', 'B', 's4a', 'final']. */
function walk(choices) {
  var out = [];
  var node = next(null, choices);
  while (node && out.length < 20) {
    out.push(node);
    node = next(node, choices);
  }
  return out;
}

function isFork(node) {
  return !!FORKS[node];
}

function isScene(node) {
  return SCENES.indexOf(node) >= 0;
}

/** Which fork comes right after this scene (null — none). */
function forkAfter(node) {
  var forks = Object.keys(FORKS);
  for (var i = 0; i < forks.length; i++) if (FORKS[forks[i]].after === node) return forks[i];
  return null;
}

/** The volume plan of the last `count` scenes on any path: {s4a, s4b, final: {from, to}}. */
function fade(count, to) {
  var plan = lines.fadePlan(['s1', 's2', 's3', 's4', 'final'], count, to);
  var out = {};
  Object.keys(plan).forEach(function (id) {
    if (id === 's2') { out.s2a = plan[id]; out.s2b = plan[id]; } else if (id === 's4') { out.s4a = plan[id]; out.s4b = plan[id]; } else out[id] = plan[id];
  });
  return out;
}

/** Texts to record in advance: [{node, text}] — scenes, questions, the quiet ending. */
function texts(raw) {
  var ep = normalize(raw);
  var out = [];
  SCENES.forEach(function (id) { if (ep.scenes[id]) out.push({ node: id, text: ep.scenes[id] }); });
  Object.keys(FORKS).forEach(function (fork) {
    if (ep.choices[fork].question) out.push({ node: 'q' + fork, text: ep.choices[fork].question });
  });
  if (ep.asleep) out.push({ node: 'asleep', text: ep.asleep });
  return out;
}

/** «когда смотритель протянул ключи» — for «Вчера вы уснули, …» (falls back to the question). */
function momentOf(raw, node) {
  var ep = normalize(raw);
  var fork = isFork(node) ? node : forkAfter(node);
  var c = fork ? ep.choices[fork] : null;
  if (c && c.moment) return /^когда/i.test(c.moment) ? c.moment : 'когда ' + c.moment;
  if (c && c.question) return 'на вопросе: «' + words.clip(c.question, 120) + '»';
  return 'на сцене ' + String(node || '').replace(/^s/, '');
}

/** The scene number for people: 's2a' → 2, 'B' → 3 (the scene before it), 'final' → 5. */
function sceneNumber(node) {
  if (node === 'final') return 5;
  if (isFork(node)) return Number(FORKS[node].after.replace(/\D/g, ''));
  var digits = String(node || '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

exports.FORKS = FORKS;
exports.SCENES = SCENES;
exports.MAIN = MAIN;
exports.BRANCHES = BRANCHES;
exports.normalize = normalize;
exports.validate = validate;
exports.fromDetails = fromDetails;
exports.hasName = hasName;
exports.next = next;
exports.walk = walk;
exports.isFork = isFork;
exports.isScene = isScene;
exports.forkAfter = forkAfter;
exports.fade = fade;
exports.texts = texts;
exports.momentOf = momentOf;
exports.sceneNumber = sceneNumber;
