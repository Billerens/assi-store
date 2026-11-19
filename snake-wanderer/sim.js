// Логика «Змейки-странника» для Игротеки. Сама игра идёт в реальном времени на экране; движку
// Игротеки нужны только сохранение, валюты и строка для каталога. Поэтому здесь почти пусто:
// всё состояние игры лежит одним объектом в state.meta.save, а осколки и лунные чешуйки
// продублированы в state.meta, чтобы их видели связки (ставка на день, сундук за поездку).
//
// Общее подмножество JavaScript: без class, async, f(...args), for (const …), import/export.
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js')) : make(root.Big);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big) {
  'use strict';

  function init(ctx) {
    return { run: {}, layers: {}, meta: { shards: 0, moons: 0, save: null } };
  }

  // Без игрока ничего не происходит: змейка ждёт.
  function tick(state, dt, ctx) {}

  function prestigeGain(state, layerId, cfg) { return Big.ZERO; }

  function migrate(state, fromVer) { return state; }

  function whole(v) { return typeof v === 'number' && v >= 0 && v % 1 === 0; }

  function validate(state) {
    var m = state.meta;
    if (!m) return 'нет раздела meta';
    if (!whole(m.shards)) return 'осколков не целое неотрицательное число: ' + m.shards;
    if (!whole(m.moons)) return 'лунных чешуек не целое неотрицательное число: ' + m.moons;
    if (m.save !== null && typeof m.save !== 'object') return 'сохранение забегов испорчено';
    return null;
  }

  function summary(state, cfg) {
    var m = state.meta, st = m.save && m.save.stats;
    if (!st || !st.runs) return { line: 'Змейка ждёт первого забега' };
    var parts = ['осколков ' + m.shards, 'забегов ' + st.runs];
    if (m.save.circle) parts.push('круг ' + (m.save.circle + 1));
    return { line: parts.join(' · ') };
  }

  /** Сундук «Пассажира»: осколки на постоянные улучшения. */
  function chest(state, rng, cfg) {
    var n = cfg['chest.shards'] + rng.int(cfg['chest.shards'] + 1);
    state.meta.shards += n;
    if (state.meta.save) state.meta.save.shards = state.meta.shards;
    return { title: 'Сундук странника', items: [{ title: 'Осколки', amount: n }] };
  }

  return { init: init, tick: tick, prestigeGain: prestigeGain, migrate: migrate, validate: validate, summary: summary, chest: chest };
});
