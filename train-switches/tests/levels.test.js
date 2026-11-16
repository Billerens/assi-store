// Every stored level of the ten chapters is checked again by the brute force of rails.js: a solution
// exists, the start position is not one, no switch is useless, the stored solution wins and the counts
// match; the share of solutions stays under the chapter's threshold; d does not fall inside a chapter
// and the chapters' means grow. Prints S/V and d of every chapter.
const fs = require('fs');
const path = require('path');
const T = require('./env.js');
const x = T.open();
const target = path.join(x.env.root, T.STORE.target);
const Rails = x.env.require(path.join(target, 'rails.js'));
const chapters = JSON.parse(fs.readFileSync(path.join(target, 'content', 'chapters.json'), 'utf8')).chapters;

function pad(n) { return n < 10 ? '0' + n : String(n); }
function levels(ch) { return JSON.parse(fs.readFileSync(path.join(target, 'content', 'levels-' + pad(ch) + '.json'), 'utf8')); }
function shareOf(c) {
  const g = [].concat(c.gen || []);
  return Math.max.apply(null, g.map((p) => (p.share === undefined ? 0.05 : p.share)).concat([0.05]));
}

const report = [];
let verified = 0;

T.test('все 150 уровней проверены перебором', () => {
  for (let ch = 1; ch <= 10; ch++) {
    const list = levels(ch);
    if (list.length !== 15) throw new Error('глава ' + ch + ': уровней ' + list.length);
    const share = shareOf(chapters[ch - 1]);
    for (const lv of list) {
      const s = Rails.solve(lv, {});
      if (s.over) throw new Error(lv.id + ': перебор не уложился');
      if (!s.S) throw new Error(lv.id + ': решения нет');
      if (s.startWin) throw new Error(lv.id + ': стартовое положение уже решение');
      if (s.useless.length) throw new Error(lv.id + ': бесполезные стрелки ' + s.useless.join(','));
      if (s.S !== lv.S || s.V !== lv.V) throw new Error(lv.id + ': S/V не совпали ' + s.S + '/' + s.V + ' против ' + lv.S + '/' + lv.V);
      if (!lv.tutorial && s.S > Math.max(1, Math.floor(share * s.V))) throw new Error(lv.id + ': решений слишком много ' + s.S + '/' + s.V);
      const r = Rails.simulate(lv, lv.sol, { trace: false, paths: false });
      if (!r.win) throw new Error(lv.id + ': сохранённое решение не выигрывает: ' + r.reason);
      if (Rails.stars(lv, lv.sol) !== 3) throw new Error(lv.id + ': сохранённое решение не на три звезды');
      if (!(lv.d > 0) || !isFinite(lv.d)) throw new Error(lv.id + ': сложность ' + lv.d);
      verified++;
    }
  }
  if (verified !== 150) throw new Error('проверено ' + verified);
});

T.test('сложность растёт внутри глав и от главы к главе', () => {
  let prevMean = 0;
  for (let ch = 1; ch <= 10; ch++) {
    const list = levels(ch);
    let sum = 0;
    let sMin = Infinity;
    let sMax = 0;
    let vMin = Infinity;
    let vMax = 0;
    for (let i = 0; i < list.length; i++) {
      if (i > 0 && list[i].d < list[i - 1].d) throw new Error(list[i].id + ': сложность меньше предыдущей');
      sum += list[i].d;
      sMin = Math.min(sMin, list[i].S);
      sMax = Math.max(sMax, list[i].S);
      vMin = Math.min(vMin, list[i].V);
      vMax = Math.max(vMax, list[i].V);
    }
    const mean = sum / list.length;
    if (mean <= prevMean) throw new Error('глава ' + ch + ': средняя сложность ' + mean.toFixed(2) + ' не больше ' + prevMean.toFixed(2));
    prevMean = mean;
    report.push('глава ' + pad(ch) + ': d ' + list[0].d + '…' + list[14].d + ' (среднее ' + mean.toFixed(2) + '), S ' + sMin + '…' + sMax + ', V ' + vMin + '…' + vMax);
  }
  console.log('  ' + report.join('\n  '));
});

T.test('в главах встречаются все виды стрелок и задержки', () => {
  const kinds = {};
  let delayed = 0;
  let long = 0;
  for (let ch = 1; ch <= 10; ch++) {
    for (const lv of levels(ch)) {
      for (const k of lv.kinds) kinds[k] = 1;
      if (lv.dpar > 0) delayed++;
      if (lv.trains.some((t) => t.l === 2)) long++;
    }
  }
  for (const k of ['m', 'f', 'c', 'n']) if (!kinds[k]) throw new Error('нет стрелок вида ' + k);
  if (delayed < 10) throw new Error('уровней, где нужна задержка, всего ' + delayed);
  if (long < 10) throw new Error('уровней с длинными составами всего ' + long);
  console.log('  уровней с нужной задержкой: ' + delayed + ', с составами в две клетки: ' + long);
});

T.done('levels');
