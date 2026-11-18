// Derived upgrade strength shared by the forge, equipped weapons and their UI previews.
// Milestones never claim rewards or change owned levels, prices or save data.
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; }
  else root.MFUpgradeProgress = api;
})(this, function () {
  'use strict';
  var SUPPORTED = ['sharp', 'purse', 'hand', 'twin', 'temper', 'runePower', 'hunter', 'hourglass', 'cry', 'banner', 'caravan', 'hammer', 'stall'];
  var SOFT = { caravan: 20, hammer: 8, stall: 8 };
  function level(value) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function supported(id) { return SUPPORTED.indexOf(id) >= 0; }
  // What every 10th, 50th and 100th level adds, and what the sum of them tends to: the game's settings
  // (milestone.*), with these values when a setting is missing.
  var MILESTONE = { per10: 0.1, per50: 0.25, per100: 0.5, cap: 4 };
  function setting(cfg, name) {
    var value = Number(cfg && cfg['milestone.' + name]);
    return isFinite(value) && value >= 0 ? value : MILESTONE[name];
  }
  function milestone(n, cfg) {
    var raw = setting(cfg, 'per10') * Math.floor(n / 10) + setting(cfg, 'per50') * Math.floor(n / 50) + setting(cfg, 'per100') * Math.floor(n / 100);
    var cap = setting(cfg, 'cap');
    return cap > 0 && raw > 0 ? cap * raw / (cap + raw) : 0;
  }
  function factor(n, cfg) {
    return 1 + (n ? 0.04 / (1 + 100 / n) : 0) + milestone(n, cfg);
  }
  function strength(id, value, cfg) { return supported(id) ? factor(level(value), cfg) : 1; }
  function base(id, n, cfg) {
    if (!Object.prototype.hasOwnProperty.call(SOFT, id)) return n;
    var knee = Number(cfg && cfg['up.' + id + '.soft']);
    if (!(knee > 0) || !isFinite(knee)) knee = SOFT[id];
    return n > knee ? knee * (1 + Math.log(n) - Math.log(knee)) : n;
  }
  function effective(id, value, cfg) {
    var n = level(value);
    if (!supported(id)) return n;
    var raw = base(id, n, cfg), mult = factor(n, cfg);
    return raw > Number.MAX_VALUE / mult ? Number.MAX_VALUE : raw * mult;
  }
  function progress(id, value, cfg) {
    var n = level(value), on = supported(id);
    // Beyond exact integer precision a fictitious "next level" would equal this one.
    var next = n < 9007199254740980 ? (Math.floor(n / 10) + 1) * 10 : null;
    return {
      supported: on, level: n,
      effective: effective(id, n, cfg), nextEffective: effective(id, n + 1, cfg),
      factor: on ? factor(n, cfg) : 1, previousFactor: on ? factor(Math.max(0, n - 1), cfg) : 1, nextFactor: on ? factor(n + 1, cfg) : 1,
      milestoneBonus: on ? milestone(n, cfg) : 0,
      nextAt: on ? next : null,
      nextTier: on && next !== null ? (next % 100 === 0 ? 100 : next % 50 === 0 ? 50 : 10) : null,
      nextMilestoneJump: on && next !== null ? milestone(next, cfg) - milestone(next - 1, cfg) : 0
    };
  }
  return { supported: supported, strength: strength, effective: effective, progress: progress };
});
