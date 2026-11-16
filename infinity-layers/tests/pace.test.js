'use strict';
const assert = require('assert');
const { test, done } = require('./env');
const { progression } = require('./pace');
test('первая Свёртка достижима до 5 ч, без событий и покупки деревьев', () => {
  const r = progression('fold', 5);
  console.log('  Первая Свёртка: ' + (r.firstFoldSec / 60).toFixed(4) + ' мин; Сжатий: ' + r.compressions);
  assert.ok(r.firstFoldSec !== null && r.firstFoldSec <= 5 * 3600);
  assert.ok(r.firstFoldSec > r.firstCompressionSec);
  // The exact specified formulas produce 75.95 min, earlier than the narrative 3–5 h.
  // That discrepancy is explicitly recorded in README; it is not hidden by a timing throttle.
});
test('первый Коллапс достижим при заданных формулах без покупки деревьев', () => {
  const r = progression('collapse', 8);
  console.log('  Первый Коллапс: ' + (r.firstCollapseSec / 60).toFixed(4) + ' мин; Сжатий: ' + r.compressions + '; Свёрток: ' + r.folds);
  assert.ok(r.firstCollapseSec !== null && r.firstCollapseSec > r.firstFoldSec);
  assert.ok(r.firstCollapseSec <= 5 * 24 * 3600);
});

done('infinity-layers pace');

