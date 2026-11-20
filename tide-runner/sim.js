(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; }
  else { root.GameSim = api; }
})(this, function () {
  'use strict';
  function init() { return { run: {}, layers: {}, meta: { bestDistance: 0, profile: null } }; }
  function validate(state) {
    if (!state.meta || (state.meta.profile !== null && typeof state.meta.profile !== 'object')) return 'Invalid profile';
    return null;
  }
  function summary(state) {
    var p = state.meta.profile;
    return {line: p && p.bestDistance ? '⚑ ' + p.bestDistance + ' m' : 'Гребень'};
  }
  return { init: init, tick: function () {}, offline: function () { return {events: []}; },
    migrate: function (state) { return state; }, validate: validate, summary: summary };
});
