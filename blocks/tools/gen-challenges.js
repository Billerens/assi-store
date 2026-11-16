'use strict';
require('./hub.js');
const fs = require('fs');
const path = require('path');
const L = require('../levels.js');
const schema = require('../config.json');
const cfg = Object.fromEntries(Object.entries(schema).map(([key, item]) => [key, item.value]));

// Catalogue generation is offline. Only seeds with an independently proved, exactly counted
// solution set are saved. A phone recreates each board from its recorded parameters.
const count = cfg['challenge.count'];
const poolSize = 400;
const solveLimit = cfg['challenge.solutionLimit'];
const budget = cfg['challenge.searchBudget'];
const options = L.fromConfig(cfg);
const titles = [
  'Первый просвет', 'Открытая линия', 'Ровные края', 'Короткий путь', 'Светлая полоса',
  'На перекрёстке', 'Два берега', 'Лестница', 'Свободный угол', 'Утренний узор',
  'Три поворота', 'Ключевой ряд', 'Тихая площадь', 'Наискосок', 'Ступени',
  'Узкий проход', 'Параллели', 'Соседние линии', 'Пустой центр', 'Решётка',
  'Смена стороны', 'Дальний край', 'Внутренний двор', 'Вторая дверь', 'Узор плитки',
  'Разомкнутый круг', 'Маленький мост', 'Стыки', 'Попутный ход', 'На стыке линий',
  'Точный размер', 'Четыре грани', 'Последний просвет', 'Зазоры', 'Сборка',
  'Глубокий угол', 'Выверенный шаг', 'Граница поля', 'Плотный ряд', 'Прямая мысль',
  'Замкнутая форма', 'Уходящая линия', 'Место для малого', 'Встречный ход', 'Скрытая тропа',
  'Согласие фигур', 'Тонкая работа', 'Вся плоскость', 'Порядок линий', 'Чистый контур',
  'Единственный след', 'Точный поворот', 'Без лишних клеток', 'Ритм пустоты', 'Внутренний ключ',
  'Четыре шага', 'Последний шов', 'Путь мастера', 'Полная ясность', 'Чистое поле'
];

const candidates = [];
const seen = new Set();
for (let seed = 1; candidates.length < poolSize && seed < 100000; seed++) {
  const level = L.generate(seed, options);
  if (!level) continue;
  const key = JSON.stringify([level.board, level.queue]);
  if (seen.has(key)) continue;
  const answer = L.solve(level, { limit: solveLimit, budget });
  if (!answer.complete || !answer.solutions || !L.check(level, answer.first)) continue;
  seen.add(key);
  candidates.push({ level, answer });
}
if (candidates.length < poolSize) throw new Error('Недостаточно проверенных уровней');
candidates.sort((a, b) => b.answer.solutions - a.answer.solutions || a.answer.nodes - b.answer.nodes || a.level.seed - b.level.seed);
const levels = [];
for (let index = 0; index < count; index++) {
  const candidate = candidates[Math.floor(index * (candidates.length - 1) / (count - 1))];
  const level = candidate.level;
  levels.push({
    id: index + 1,
    title: titles[index],
    description: 'Поставьте четыре фигуры по очереди и очистите всё поле. Отмена хода бесплатна.',
    seed: level.seed,
    n: level.n,
    k: level.k,
    clear: level.clear,
    two: level.two,
    plainTries: level.plainTries,
    reverseTries: level.reverseTries,
    types: level.types,
    solutions: candidate.answer.solutions,
    difficulty: L.difficulty(level.k, candidate.answer.solutions, solveLimit),
    nodes: candidate.answer.nodes
  });
}
const output = { version: 1, limits: { count, solveLimit, budget }, levels };
const content = path.join(__dirname, '..', 'content');
fs.mkdirSync(content, { recursive: true });
fs.writeFileSync(path.join(content, 'challenges.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ saved: levels.length, candidates: candidates.length, solutions: [levels[0].solutions, levels[levels.length - 1].solutions], distinctSolutionCounts: [...new Set(levels.map((l) => l.solutions))] }));
