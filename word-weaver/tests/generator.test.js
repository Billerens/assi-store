// node tests/generator.test.js — the dictionary and the generator of letter sets of «Словоплёт»
// («Как проверить»): 1 000 sets with 8–40 common words each and the time a set takes; the built-in
// themes; Ё and Е; the control list of names, cities and brands.
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./env.js');
const Lex = require('../lexicon.js');
const x = T.open();
const sim = x.sim;
const Rng = x.Rng;

const text = fs.readFileSync(path.join(T.GAME_DIR, '_data', 'assets', 'dict.txt'), 'utf8');
const cfgFile = JSON.parse(fs.readFileSync(path.join(T.GAME_DIR, 'config.json'), 'utf8'));
const cfg = {};
Object.keys(cfgFile).forEach((k) => { cfg[k] = cfgFile[k].value; });
let lex;

T.test('словарь читается: размер, обычные, формы', () => {
  const t0 = process.hrtime.bigint();
  lex = Lex.parse(text);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const plural = Object.keys(lex.plural).length;
  console.log('  слов ' + lex.size + ', обычных ' + Math.min(lex.size, cfg['dict.commonTop']) + ', с мн. числом ' + plural + ', файл ' + text.length + ' знаков, разбор ' + ms.toFixed(0) + ' мс');
  if (lex.size < 25000) throw new Error('слов мало: ' + lex.size);
  if (plural < 20000) throw new Error('форм мало: ' + plural);
  for (const k of lex.keys) if (!/^[а-я]{3,12}$/.test(k) || /ё/.test(k)) throw new Error('плохой ключ ' + k);
});

T.test('контрольный список: имён, городов и брендов нет', () => {
  const list = fs.readFileSync(path.join(T.GAME_DIR, 'tools', 'control.txt'), 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  const leaked = list.filter((w) => Lex.has(lex, Lex.key(w)));
  if (leaked.length) throw new Error('в словаре: ' + leaked.join(', '));
  ['кошка', 'стол', 'ножницы', 'сани', 'деньги', 'мир', 'год', 'ёлка'].forEach((w) => {
    if (!Lex.has(lex, Lex.key(w))) throw new Error('нет слова «' + w + '»');
  });
});

T.test('Ё и Е: «лён» = «лен», показ с ё, на колесе ё нет', () => {
  if (Lex.shown(lex, Lex.key('лен')) !== 'лён') throw new Error('«лен» показывается как ' + Lex.shown(lex, 'лен'));
  if (Lex.key('лён') !== Lex.key('лен')) throw new Error('ключи разные');
  if (Lex.shown(lex, 'елка') !== 'ёлка') throw new Error('ёлка');
  // «ёж» короче трёх букв и в игру не входит: проверяем на «ёлке» и «лёне».
  const dup = lex.keys.length - new Set(lex.keys).size;
  if (dup) throw new Error('повторов ключей: ' + dup);
});

T.test('1 000 наборов: у каждого 8–40 обычных слов, есть слово из 5+ букв', () => {
  const rng = Rng.make(2026);
  const times = [];
  const tries = [];
  const avoid = {};
  const counts = [];
  const lens = { 6: 0, 7: 0, 8: 0, 9: 0 };
  for (let i = 0; i < 1000; i++) {
    const len = 6 + (i % 4);
    const o = { top: cfg['dict.commonTop'], lenMin: Math.max(6, len - 1), lenMax: len, min: cfg['sets.min'], max: cfg['sets.max'], needLong: cfg['sets.needLong'], avoid, tries: cfg['sets.tries'] };
    lex.cache = {}; // the honest time: no cache from earlier sets
    const t0 = process.hrtime.bigint();
    const s = Lex.generate(lex, rng, o);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (!s) throw new Error('набор ' + i + ' (зерно ' + o.lenMin + '–' + o.lenMax + ') не собрался');
    const w = Lex.subwords(lex, s.letters, cfg['dict.commonTop']);
    if (w.common.length < 8 || w.common.length > 40) throw new Error('набор ' + s.seed + ': обычных ' + w.common.length);
    if (!w.common.some((k) => k.length >= 5 && k !== s.seed)) throw new Error('набор ' + s.seed + ': нет слова из 5+ букв');
    if (s.letters.split('').sort().join('') !== s.seed.split('').sort().join('')) throw new Error('буквы не зерна: ' + s.letters);
    if (/ё/.test(s.letters)) throw new Error('ё на колесе');
    avoid[s.seed] = true;
    tries.push(s.tries);
    counts.push(w.common.length);
    lens[s.seed.length]++;
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  const avgWords = counts.reduce((a, b) => a + b, 0) / counts.length;
  console.log('  время на набор: в среднем ' + avg.toFixed(1) + ' мс, 95 % — до ' + p95.toFixed(1) + ' мс, худший ' + times[times.length - 1].toFixed(1) + ' мс (node, без кэша)');
  console.log('  попыток зерна: в среднем ' + (tries.reduce((a, b) => a + b, 0) / tries.length).toFixed(2) + ', не больше ' + Math.max(...tries) + '; обычных слов в среднем ' + avgWords.toFixed(1));
  console.log('  длины зёрен: ' + JSON.stringify(lens));
  if (p95 > 100) throw new Error('95 % наборов дольше 100 мс');
});

T.test('встроенные темы: каждое зерно в словаре и даёт набор', () => {
  const rng = Rng.make(7);
  const bad = [];
  sim.THEMES.forEach((t) => {
    const k = Lex.key(t.seed);
    if (!Lex.common(lex, k, cfg['dict.commonTop'])) return bad.push(t.seed + ' (не обычное)');
    const s = Lex.generate(lex, rng, { top: cfg['dict.commonTop'], lenMin: 3, lenMax: 20, min: cfg['sets.min'], max: cfg['sets.max'], needLong: cfg['sets.needLong'], seed: k, tries: 1 });
    if (!s) bad.push(t.seed);
    if (sim.validateStock('themes', t)) bad.push(t.seed + ': ' + sim.validateStock('themes', t));
  });
  if (bad.length) throw new Error('не годятся: ' + bad.join(', '));
  if (!sim.validateStock('themes', { title: 'Город', seed: 'перекрёсток' })) throw new Error('11 букв прошли проверку запаса');
});

T.done('generator');
